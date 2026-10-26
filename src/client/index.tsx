import {
  MarkdownTabBody,
  MarkdownTabTitle,
  type MdLiveApi,
  type MdLiveListing,
  type MdLiveScanBudget,
  type MdLiveScanOptions,
  type MdLiveTruncation,
  type WriteResult,
} from './components/MarkdownTab';
import {
  isFollowingEnabled,
  markdownPreviewTarget,
  markdownWriteTarget,
  resultCallId,
} from './utils/agent-writes';
import { CLIENT_DESCRIPTORS } from './descriptors.js';

/** The tab type discriminator `ctx.sidebarRight.openTab` names. */
const KIND = 'md-live';
/** This implementation's identity; the body and title register under it. */
const ID = 'dsh-md-live';

const MARKDOWN_RE = /\.(md|markdown|mdx)$/i;

/**
 * Safety caps for one workspace scan. They exist only so a pathological tree
 * (a home directory used as a workspace) cannot spin forever; a normal project
 * never reaches them, which is why the picker has no "scan more" action.
 */
const SCAN_LIMITS: MdLiveScanBudget = { depth: 12, dirs: 1500, files: 2000 };

/** Directory listings in flight at once during a scan. */
const SCAN_CONCURRENCY = 8;

/**
 * Unwrap a Typert Remote result.
 *
 * Every `ctx.remote.*` call resolves to `{ ok: true, value } | { ok: false, error }`,
 * never to the bare value. Reading fields off the envelope yields `undefined`
 * without throwing, which is exactly how an empty file list can look like an
 * empty workspace. Raw values are still accepted so a future signature change
 * degrades instead of breaking.
 *
 * @param result - the Remote result envelope.
 * @returns the decoded value.
 * @throws the Remote failure, so callers report it instead of showing nothing.
 */
function unwrapRemote<T>(result: any): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    if (!result.ok) {
      const failure = result.error;
      const message = failure?.message ?? failure?.code ?? '远端调用失败';
      const error = new Error(String(message));
      (error as any).code = failure?.code;
      throw error;
    }
    return result.value as T;
  }
  return result as T;
}

/** Normalize a workspace path the Host echoed back into a clean relative root. */
function normalizeRoot(path: unknown): string {
  const raw = typeof path === 'string' ? path : '';
  return raw.replace(/\\/g, '/').replace(/^\.\/*/, '').replace(/\/+$/, '');
}

/**
 * Unwrap one Remote stream into plain frames.
 *
 * Two rules make a Remote stream usable from a plugin: every item must be
 * acknowledged with `accept()`, or the uplink window fills and the stream goes
 * quiet without ever raising; and the frame itself travels under `item.value`,
 * not as the item. A stream that ends on its own is reported through `ended`,
 * so the caller's `for await` throws instead of finishing silently.
 *
 * @param remote - the Remote service holding `$stream`.
 * @param name - the stream's name, which is what the Host's logs show.
 * @param open - opens the underlying Remote stream for one lifetime.
 * @param signal - the caller's cancellation.
 * @param ended - the error raised when the stream ends by itself.
 * @returns frames, already unwrapped and acknowledged.
 */
function streamFrames(
  remote: any,
  name: string,
  open: (lifetime: AbortSignal) => any,
  signal: AbortSignal,
  ended: string,
): AsyncIterable<any> {
  if (typeof remote.$stream !== 'function') return open(signal);
  const stream = remote.$stream({ name, open, ended: () => new Error(ended) });
  return (async function* () {
    const abort = () => stream.dispose();
    signal.addEventListener('abort', abort, { once: true });
    try {
      for await (const item of stream) {
        if (signal.aborted) return;
        const frame = item && 'value' in item ? item.value : item;
        if (item && typeof item.accept === 'function') item.accept();
        yield frame;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      await stream.dispose();
    }
  })();
}

/**
 * Follow the Agent's writes for the Session currently on screen.
 *
 * This lives here rather than in the tab body on purpose. A closed panel has no
 * component to subscribe from, and "the Agent wrote a file, show it" is only
 * useful if it also works when nothing is open — which is exactly when the
 * reader most wants to be told. `sidebarRight.mounted` is the client's own
 * answer to "which Session is the user looking at".
 *
 * @param ctx - client root context carrying the sidebar, layout, and Remotes.
 * @returns a disposer that closes the stream and cancels any pending placement.
 */
function startFollowing(ctx: any): () => void {
  const mounted = ctx.sidebarRight?.mounted;
  if (!mounted || typeof mounted.getSnapshot !== 'function') return () => {};

  const cwdCache = new Map<string, string>();
  const timers = new Set<any>();
  let active: { sessionId: string; stop: () => void } | null = null;
  let disposed = false;

  /** The Session's workspace root, which relative tool paths resolve against. */
  const cwdOf = async (sessionId: string): Promise<string> => {
    const cached = cwdCache.get(sessionId);
    if (cached !== undefined) return cached;
    try {
      const list = unwrapRemote<any>(await ctx.remote.session.list({}));
      for (const item of Array.isArray(list?.items) ? list.items : []) {
        if (item?.sessionId === sessionId && typeof item.cwd === 'string') {
          cwdCache.set(sessionId, item.cwd);
          return item.cwd;
        }
      }
    } catch {
      /* a missing cwd costs only relative paths, never the stream */
    }
    return '';
  };

  /**
   * Put one document in front of the reader.
   *
   * Placing a tab in a Session whose store was never adopted does nothing at
   * all, and a closed pane is exactly that case. So the pane is revealed first
   * and the tab is placed again once it has had a frame or two to adopt the
   * Session. Repeating the call is safe: the type is single-instance, so the
   * later calls navigate the tab the first one created.
   */
  const show = (path: string) => {
    const place = () => {
      if (disposed) return;
      try {
        ctx.sidebarRight.openTab(KIND, { params: { path } });
      } catch (err) {
        console.error('[dsh-md-live] follow: openTab failed', err);
      }
    };
    try {
      ctx.layout?.openRightbar?.(false, false);
    } catch {
      /* an older shell without the layout action: openTab is all there is */
    }
    place();
    for (const delay of [120, 400]) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        place();
      }, delay);
      timers.add(timer);
    }
  };

  const follow = async (sessionId: string, signal: AbortSignal) => {
    const cwd = await cwdOf(sessionId);
    if (signal.aborted) return;
    const pending = new Map<string, string>();
    try {
      for await (const frame of streamFrames(
        ctx.remote,
        `md-live follow ${sessionId}`,
        (lifetime: AbortSignal) =>
          ctx.remote.session.follow({ address: { kind: 'session', sessionId } }, lifetime),
        signal,
        `Session follow ended: ${sessionId}`,
      )) {
        if (signal.aborted) return;
        if (frame?.type !== 'event') continue;
        const event = frame.event;
        if (event?.type === 'tool/call') {
          // An explicit "show me this" is honoured whether or not automatic
          // following is on: the reader asked for this one.
          const preview = markdownPreviewTarget(event.data, cwd);
          if (preview) {
            show(preview);
            continue;
          }
          const write = markdownWriteTarget(event.data, cwd);
          if (write) pending.set(write.callId, write.path);
        } else if (event?.type === 'tool/result') {
          const callId = resultCallId(event.data);
          const target = callId ? pending.get(callId) : undefined;
          if (!target) continue;
          pending.delete(callId);
          if (isFollowingEnabled()) show(target);
        }
      }
    } catch {
      /* following is a convenience; a refused stream must not break the shell */
    }
  };

  const sync = () => {
    if (disposed) return;
    const sessionId = mounted.getSnapshot();
    if (sessionId === active?.sessionId) return;
    active?.stop();
    active = null;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const ac = new AbortController();
    active = { sessionId, stop: () => ac.abort() };
    void follow(sessionId, ac.signal);
  };

  const unsubscribe = typeof mounted.subscribe === 'function' ? mounted.subscribe(sync) : null;
  sync();

  return () => {
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    unsubscribe?.();
    active?.stop();
    active = null;
  };
}

export const inject = [
  'slots',
  'sidebarRightTabs',
  'sidebarRight',
  'remote',
  'remote.workspaceFiles',
  'remote.session',
];

/**
 * Client half: contribute a right-Sidebar tab type for Markdown previews.
 *
 * The tab is a page type, so it is opened by kind rather than claimed by an
 * address: `openTab('md-live', { params: { path } })` decides which file it
 * shows. Content is read through the workspace Remote and kept fresh by a file
 * watch, so a rewrite by the Agent lands in the open tab without a reload.
 *
 * @param ctx - client root context carrying the slot, tab, and Remote services.
 */
export function apply(ctx: any) {
  // Register the write Remote manifest on the client side so the Gateway
  // creates the `ctx.remote.mdLive` namespace. The Host already registered
  // the service and manifest; this mirrors the descriptor half on the client.
  let mdLiveReady = Promise.resolve();
  if (typeof ctx.remote?.$mount === 'function') {
    try {
      console.log('[dsh-md-live] Client: 调用 $mount...');
      mdLiveReady = ctx.remote.$mount({
        package: 'dsh-md-live',
        descriptors: CLIENT_DESCRIPTORS,
      });
      console.log('[dsh-md-live] Client: $mount 返回:', mdLiveReady);
      mdLiveReady.then(() => {
        console.log('[dsh-md-live] Client: $mount 完成');
        const namespaces = ctx.remote?.namespaces;
        if (namespaces instanceof Map) {
          const ns = namespaces.get('mdLive');
          const service = ns?.service;
          console.log('[dsh-md-live] Client: service keys:', Object.keys(service || {}));
          console.log('[dsh-md-live] Client: invokeRemote type:', typeof service?.invokeRemote);
          console.log('[dsh-md-live] Client: invokeRemote:', service?.invokeRemote);
        }
      }).catch(err => {
        console.error('[dsh-md-live] Client: $mount 失败:', err);
      });
    } catch (err) {
      console.warn('[dsh-md-live] client Remote 注册失败：', err);
    }
  } else {
    console.warn('[dsh-md-live] Client: ctx.remote.$mount 不可用');
  }

  const api: MdLiveApi = {
    open: (path: string) => {
      try {
        ctx.sidebarRight.openTab(KIND, { params: { path } });
      } catch (err) {
        console.error('[dsh-md-live] openTab failed:', err);
      }
    },
    readText: async (sessionId: string, path: string, signal: AbortSignal) => {
      const bytes = unwrapRemote<any>(
        await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, signal),
      );
      const data = bytes?.data;
      const view =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data ?? []);
      return {
        content: new TextDecoder('utf-8').decode(view),
        version: typeof bytes?.version === 'string' ? bytes.version : '',
      };
    },
    listMarkdown: async (
      sessionId: string,
      root: string,
      options: MdLiveScanOptions,
      signal: AbortSignal,
      onProgress?: (files: string[]) => void,
    ): Promise<MdLiveListing> => {
      const list = async (dir: string) =>
        unwrapRemote<any>(await ctx.remote.workspaceFiles.list(sessionId, dir, signal));

      // The Host rejects an empty path ("path is required") and resolves a
      // relative one against the Session's workspace root, so the scan has to
      // start from the Session's absolute cwd — the same root the official
      // Files tab uses.
      const base = normalizeRoot(root);
      if (!base) throw new Error('拿不到会话的工作区路径，无法扫描目录');

      // The workspace is fixed for the Session's lifetime, so one pass covers
      // it: no depth limit worth speaking of, and only caps high enough to
      // survive a pathological tree.
      const limits: MdLiveScanBudget = { ...SCAN_LIMITS };

      const files: string[] = [];
      let truncatedBy: MdLiveTruncation | null = null;
      const mark = (reason: MdLiveTruncation) => {
        truncatedBy = truncatedBy ?? reason;
      };
      let dirsScanned = 0;
      let skippedDirs = 0;
      let entriesSeen = 0;
      let lastError: any = null;
      // Filtering is the user's call: the picker passes the rules it holds,
      // and an empty list means "walk everything".
      const skipDirs = new Set(
        (options?.skipDirs ?? []).map((name) => String(name).trim().toLowerCase()).filter(Boolean),
      );

      // Breadth-first, one level at a time, with a bounded fan-out: a big
      // workspace costs a handful of round trips per level instead of one per
      // directory.
      let level: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }];

      while (level.length > 0 && truncatedBy === null) {
        const next: Array<{ dir: string; depth: number }> = [];

        for (let i = 0; i < level.length; i += SCAN_CONCURRENCY) {
          if (files.length >= limits.files || dirsScanned >= limits.dirs) break;
          const chunk = level.slice(i, i + SCAN_CONCURRENCY);
          const answers = await Promise.all(
            chunk.map(async (item) => {
              if (dirsScanned >= limits.dirs) {
                mark('dirs');
                return null;
              }
              dirsScanned += 1;
              try {
                return { item, listing: await list(item.dir) };
              } catch (err) {
                lastError = err;
                return null;
              }
            }),
          );

          for (const answer of answers) {
            if (!answer) continue;
            const { item, listing } = answer;
            // The Host caps one directory's entries; say so rather than
            // pretending the directory held only what came back.
            if (listing?.truncated) mark('entries');

            const entries: any[] = Array.isArray(listing?.entries) ? listing.entries : [];
            entriesSeen += entries.length;

            for (const entry of entries) {
              const name = String(entry?.name ?? '');
              if (!name || name.startsWith('.')) continue;
              const child = `${item.dir}/${name}`;

              if (entry?.type === 'directory') {
                if (skipDirs.has(name.toLowerCase())) {
                  skippedDirs += 1;
                  continue;
                }
                if (item.depth + 1 >= limits.depth) {
                  mark('depth');
                  continue;
                }
                next.push({ dir: child, depth: item.depth + 1 });
              } else if (entry?.type === 'file' && MARKDOWN_RE.test(name)) {
                files.push(child);
                if (files.length >= limits.files) {
                  mark('files');
                  break;
                }
              }
            }
          }
        }

        level = next;
        // Hand back what this level found, so the picker can draw rows while
        // the rest of the tree is still being walked.
        if (onProgress && files.length > 0 && !signal.aborted) {
          onProgress([...files].sort((a, b) => a.localeCompare(b)));
        }
      }

      files.sort((a, b) => a.localeCompare(b));
      // Reading nothing at all is a wiring problem, not an empty workspace:
      // surface the Remote's own failure instead of "no files".
      if (files.length === 0 && entriesSeen === 0) {
        if (lastError) throw lastError;
        throw new Error(`目录「${base}」里读不到任何条目`);
      }
      return { root: base, files, truncatedBy, limits, skippedDirs };
    },
    openExternal: (url: string) => {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        console.error('[dsh-md-live] openExternal failed:', err);
      }
    },
    openPath: async (path: string, action?: 'reveal') => {
      // The Host owns the desktop: it hands the path to the OS default app, or
      // reveals it in the file manager. Nothing here touches the filesystem.
      const request: any = { path };
      if (action) request.action = action;
      unwrapRemote<any>(await ctx.remote.session.openWorkspacePath(request));
    },
    canOpenPath: async () => {
      // False when the browser is attached over the network: the Host has no
      // desktop to open anything on, and a dead button is worse than none.
      try {
        return Boolean(unwrapRemote<any>(await ctx.remote.session.canOpenWorkspacePath()));
      } catch {
        return false;
      }
    },
    writeText: async (
      sessionId: string,
      path: string,
      content: string,
      version: string,
    ): Promise<WriteResult> => {
      // No separator rewriting here: the Host normalizes the path, and the tab
      // knows the absolute spelling the workspace listing gave it.
      await mdLiveReady;
      const remote = ctx.remote;
      let ns: any;
      if (remote?.namespaces instanceof Map) {
        ns = remote.namespaces.get('mdLive');
      } else {
        ns = remote?.mdLive;
      }

      let call: ((s: string, p: string, c: string, v: string) => Promise<any>) | undefined;
      if (typeof ns?.service?.writeText === 'function') {
        call = ns.service.writeText.bind(ns.service);
      } else if (typeof ns?.writeText === 'function') {
        call = ns.writeText.bind(ns);
      }

      if (!call) {
        return { status: 'error', message: '当前 Host 不支持写入（mdLive Remote 服务未注册）' };
      }

      // The Session id is the wire's first parameter (a `session` lookup): it is
      // what the Host resolves the sandbox policy from.
      const result = unwrapRemote<WriteResult>(await call(sessionId, path, content, version));
      return result;
    },
    watch: (sessionId: string, path: string, signal: AbortSignal) =>
      streamFrames(
        ctx.remote,
        `md-live file ${path}`,
        (lifetime: AbortSignal) => ctx.remote.workspaceFiles.changes(sessionId, path, lifetime),
        signal,
        `Markdown watch ended: ${path}`,
      ),
  };

  // Stage one: what the type is. A guide entry is what makes it reachable from
  // the pane's add control; without one the type could only be opened by code.
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: ID,
        kind: KIND,
        multiple: false,
        priority: 'extension',
        title: () => 'md-live',
        guide: [
          {
            id: 'md-live-preview',
            order: 40,
            title: () => 'md-live',
            description: () => '在右侧栏预览工作区的 Markdown 文件，文件变化时自动刷新',
          },
        ],
      }),
    'md-live: tab type',
  );

  // Stage two: the body and the chip title, both keyed by the type's id.
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: ID, inject: () => ({ api }) },
          MarkdownTabBody,
        ),
      ),
    'md-live: tab body',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, MarkdownTabTitle),
      ),
    'md-live: tab title',
  );

  // Following is a plugin-level subscription, not a tab-level one: the point is
  // that a write opens the panel even when no panel is open to hear about it.
  ctx.effect(() => startFollowing(ctx), 'md-live: follow agent writes');

  console.log('[dsh-md-live] client ready: tab type "%s" registered', KIND);
}
