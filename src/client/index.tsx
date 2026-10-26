import {
  MarkdownTabBody,
  MarkdownTabTitle,
  type MdLiveApi,
  type MdLiveListing,
  type MdLiveScanBudget,
  type MdLiveScanOptions,
  type MdLiveTruncation,
} from './components/MarkdownTab';

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
      return new TextDecoder('utf-8').decode(view);
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
    watch: (sessionId: string, path: string, signal: AbortSignal) => {
      // `changes` is a Remote stream: items must be acknowledged with accept(),
      // or the uplink window fills and the watch goes quiet.
      const remote = ctx.remote;
      if (typeof remote.$stream !== 'function') {
        return remote.workspaceFiles.changes(sessionId, path, signal);
      }
      const stream = remote.$stream({
        name: `md-live ${path}`,
        open: (lifetime: AbortSignal) => remote.workspaceFiles.changes(sessionId, path, lifetime),
        ended: () => new Error(`Markdown watch ended: ${path}`),
      });
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
    },
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

  console.log('[dsh-md-live] client ready: tab type "%s" registered', KIND);
}
