/**
 * Host-side Remote service for md-live write operations.
 *
 * Extends an inlined `TypertRemoteService` so the Gateway discovers it through
 * the same mechanism as the official `workspaceFiles` service. The base class
 * is inlined to avoid a pinned dependency on `@deepseek-ai/dsh-typert-protocol`
 * that would duplicate in the profile when DSH upgrades.
 *
 * The `@Remote` decorator is replaced by a manually placed marker on the
 * prototype — the decorator requires TC39 Stage 3 decorator support in the
 * build pipeline, and the Host half is compiled with plain `tsc` targeting
 * ES2022 / NodeNext.
 *
 * The marker key and shape match what `addMarkerInitializer` + `mark` produce
 * in `dsh-typert-protocol`: a frozen `{ version: 1, methods: [...] }` object
 * stored under the string key `'@deepseek-ai/dsh-typert-protocol/remote-methods'`
 * on the class prototype.
 *
 * The first wire parameter is a `session` lookup, not a plain string: the
 * Gateway resolves the client's `sessionId` through the registry entry that
 * `dsh-session` owns, so this method receives the live Session and can ask
 * `ctx.sandboxPolicy` for THAT session's mode and workspace root. Passing the
 * policy through to `fs.writeText` is the whole point: without it the backend
 * falls back to the deployment default (`workspace-write` rooted at the Host
 * process's cwd), which denies every file outside the directory `dsh web` was
 * launched from — including files in the Session's own workspace whenever the
 * server was started elsewhere.
 */
import * as nodePath from 'path';

const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

/**
 * Inlined base class for Typert Remote services.
 *
 * The original lives in `@deepseek-ai/dsh-typert-protocol`, but pinning that
 * package causes a duplicate copy in the profile when DSH upgrades. The base
 * class is simple enough to inline: it just registers the service instance
 * with the context under the given namespace.
 */
class TypertRemoteService {
  constructor(ctx: any, protected namespace: string) {
    if (ctx && typeof ctx.reflect?.provide === 'function') {
      ctx.reflect.provide(namespace, this);
    }
  }
}

const MARKDOWN_EXT_RE = /\.(md|markdown|mdx)$/i;

/** 3 MB — matches the read side's content size expectation. */
const MAX_CONTENT_BYTES = 3 * 1024 * 1024;

/**
 * Why a write was refused, as a value the panel can translate.
 *
 * `reason` stays alongside every code: it is the Host's own sentence, useful in
 * a log and the fallback for a client that predates a code. The client prefers
 * `code` and phrases the refusal in the reader's language.
 */
export type DenialCode =
  | 'read-only'
  | 'read-only-file'
  | 'sandbox-root'
  | 'not-observed'
  | 'too-large'
  | 'not-markdown'
  | 'no-session'
  | 'permission'
  | 'not-found'
  | 'io';

/** The values a translated denial interpolates. */
export interface DenialDetail {
  path?: string;
  mode?: string;
  root?: string;
  bytes?: number;
  maxBytes?: number;
}

/** One refusal: the code, the Host's sentence, and the values behind it. */
interface Denial {
  code: DenialCode;
  reason: string;
  detail?: DenialDetail;
}

export type WriteResult =
  | { status: 'saved'; version: string; bytes: number }
  | { status: 'stale'; currentVersion: string }
  | { status: 'denied'; code?: DenialCode; reason: string; detail?: DenialDetail }
  | { status: 'missing' }
  | { status: 'bad-request'; reason: string }
  | { status: 'error'; message: string };

/** The slice of `ctx.sandboxPolicy.resolve()` this service needs to report a denial. */
interface SandboxPolicy {
  mode?: string;
  workspaceRoot?: string;
}

export class MdLiveRemote extends TypertRemoteService {
  private readonly hostCtx: any;

  constructor(ctx: any) {
    super(ctx, 'mdLive');
    this.hostCtx = ctx;
  }

  /**
   * Write a full UTF-8 text to one workspace file.
   *
   * Returns a structured status instead of throwing, so the client can
   * distinguish conflict, validation, and I/O failures without parsing
   * error messages.
   *
   * When `version` is empty the concurrency check is skipped: the caller is
   * saying "overwrite regardless" — used by the stale-dialog's force path.
   *
   * The Gateway calls this with positional arguments decoded from the wire
   * format defined in `md-live-typert.ts`: `sessionId`, `path`, `content`,
   * `version`. The lookup turns the id into the Session itself.
   *
   * @param sessionOrId - the Session whose sandbox policy fences this write;
   *   a bare id is also accepted and looked up, so the method still works if
   *   the wire hands over the unresolved value.
   * @param path - absolute path of the file to write.
   * @param content - the full new text.
   * @param version - the version the editor started from; empty skips the check.
   */
  async writeText(sessionOrId: any, path: string, content: string, version: string): Promise<WriteResult> {
    const sessions = this.hostCtx.get('sessions');
    const session = typeof sessionOrId === 'string'
      ? (typeof sessions?.get === 'function' ? sessions.get(sessionOrId) : undefined)
      : sessionOrId;
    if (session === undefined || session === null) {
      return deny('no-session', '找不到这个会话，无法确定沙箱策略；请刷新页面后重试', { path });
    }
    if (typeof path !== 'string' || !path.trim()) {
      return { status: 'bad-request', reason: '路径不能为空' };
    }
    if (typeof content !== 'string') {
      return { status: 'bad-request', reason: '内容必须为文本' };
    }

    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_CONTENT_BYTES) {
      return deny('too-large', `内容超过上限（${bytes} > ${MAX_CONTENT_BYTES} 字节）`, { bytes, maxBytes: MAX_CONTENT_BYTES });
    }

    if (!MARKDOWN_EXT_RE.test(path)) {
      return deny('not-markdown', `只允许写入 Markdown 文件：${path}`, { path });
    }

    const ctx = this.hostCtx;
    const fs = ctx.get('fs');
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.writeText !== 'function') {
      return { status: 'error', message: '文件系统服务不可用' };
    }

    // THIS session's policy, not the deployment fallback: the mode the user
    // picked (read-only / workspace-write / danger-full-access) and the
    // Session's own cwd as the writable root.
    const policy = this.policyOf(session);

    // `path` arrives with the browser's separators already normalized, but a
    // caller may still hand us mixed ones.
    const normalizedPath = nodePath.normalize(path);

    let target: { targetKey: string; displayPath: string };
    try {
      target = await fs.resolve(normalizedPath);
    } catch (err: any) {
      if (err?.code === 'FS_NOT_FOUND') return { status: 'missing' };
      return denialOf(describeFailure(err, normalizedPath, policy));
    }

    if (!MARKDOWN_EXT_RE.test(target.displayPath)) {
      return deny('not-markdown', `解析后的路径不是 Markdown：${target.displayPath}`, { path: target.displayPath });
    }

    const info = await fs.stat(target);
    if (!info) {
      return { status: 'missing' };
    }

    if (version && info.version !== version) {
      return { status: 'stale', currentVersion: info.version };
    }

    try {
      const intent = version
        ? { kind: 'replaceIfVersion' as const, version }
        : { kind: 'replaceIfVersion' as const, version: info.version };
      // The fifth argument is the per-call policy. Omitting it is what made a
      // workspace file look like it was "outside the workspace": the backend
      // then fences against `process.cwd()` instead of the Session's cwd.
      const outcome = await fs.writeText(target, content, intent, undefined, policy);
      return { status: 'saved', version: outcome.version, bytes };
    } catch (err: any) {
      if (err?.code === 'FS_STALE_VERSION') {
        return { status: 'stale', currentVersion: String(err?.version ?? '') };
      }
      const denial = describeFailure(err, path, policy);
      if (isSandboxDenial(err) || err?.code === 'FS_NOT_OBSERVED') {
        return denialOf(denial);
      }
      return { status: 'error', message: denial.reason };
    }
  }

  /**
   * Resolve the sandbox policy for one Session.
   *
   * Returns `undefined` when the composition has no `sandboxPolicy` service
   * (e.g. a plain `fs-local` deployment): there is no fence to describe, and
   * passing `undefined` to the backend keeps its own behavior.
   *
   * @param session - the Session the write belongs to.
   * @returns the resolved policy, or `undefined` without a policy service.
   */
  private policyOf(session: any): SandboxPolicy | undefined {
    const sandboxPolicy = this.hostCtx.get('sandboxPolicy');
    if (typeof sandboxPolicy?.resolve !== 'function') return undefined;
    return sandboxPolicy.resolve({ session });
  }
}

/**
 * Whether the backend refused on POLICY grounds rather than on I/O.
 *
 * Matched by code first, then by the message the two sandbox modes produce:
 * a plain `fs-local` backend has no codes, but a message-shape check keeps the
 * panel's "denied" wording for the same refusal.
 *
 * @param err - what the backend threw.
 * @returns whether the failure is a sandbox refusal.
 */
function isSandboxDenial(err: any): boolean {
  if (String(err?.code ?? '') === 'FS_SANDBOX_DENIED') return true;
  const lower = String(err?.message ?? err).toLowerCase();
  return /access denied under (?:read-only|workspace-write) mode/.test(lower) || lower.includes('sandbox');
}

/**
 * Turn a filesystem failure into a code plus the Host's own sentence.
 *
 * The old mapping collapsed every "access denied" into "文件不在工作区内",
 * which was wrong in both directions: a read-only mode is not a containment
 * failure, and a containment failure is about the writable root, which the
 * message never named. A sandbox denial now reports the mode and the root the
 * policy allows, and carries a `code` so the panel can say it in either
 * language instead of shipping the Host's Chinese to an English reader.
 *
 * @param err - what the backend threw.
 * @param path - the path the caller asked to write, for the message.
 * @param policy - the policy that fenced the write, when one was resolved.
 * @returns the refusal code, the reason, and the values a translation needs.
 */
function describeFailure(err: any, path: string, policy: SandboxPolicy | undefined): Denial {
  const message = String(err?.message ?? err);
  const lower = message.toLowerCase();

  if (isSandboxDenial(err)) {
    if (lower.includes('read-only')) {
      return {
        code: 'read-only',
        reason: `沙箱是只读模式，不能写入：${path}`,
        detail: { path, mode: 'read-only' },
      };
    }
    const mode = typeof policy?.mode === 'string' ? policy.mode : 'workspace-write';
    const root = typeof policy?.workspaceRoot === 'string' ? policy.workspaceRoot : '';
    return {
      code: 'sandbox-root',
      reason: root
        ? `沙箱拒绝了这次写入（模式 ${mode}，允许写入的根目录是 ${root}）：${path}`
        : `沙箱拒绝了这次写入（模式 ${mode}）：${path}`,
      detail: root ? { path, mode, root } : { path, mode },
    };
  }

  if (lower.includes('without reading it first')) {
    return { code: 'not-observed', reason: `写入前必须先读取这个文件：${path}`, detail: { path } };
  }
  if (lower.includes('permission') || lower.includes('eperm') || lower.includes('eacces')) {
    return { code: 'permission', reason: `没有写入权限：${path}`, detail: { path } };
  }
  if (lower.includes('no such file') || lower.includes('enoent') || lower.includes('not found')) {
    return { code: 'not-found', reason: `文件不存在：${path}`, detail: { path } };
  }
  if (lower.includes('readonly') || lower.includes('read-only') || lower.includes('erofs')) {
    return { code: 'read-only-file', reason: `文件为只读：${path}`, detail: { path } };
  }
  return { code: 'io', reason: `写入失败：${message}`, detail: { path } };
}

/**
 * Build a denial result without a backend error behind it.
 *
 * @param code - the refusal reason, as a value.
 * @param reason - the Host's own sentence, kept for logs and old clients.
 * @param detail - values a translated message interpolates.
 * @returns the `denied` result.
 */
function deny(code: DenialCode, reason: string, detail?: DenialDetail): WriteResult {
  return { status: 'denied', code, reason, detail };
}

/**
 * Wrap a described refusal as the wire result.
 *
 * @param denial - the code, sentence, and detail.
 * @returns the `denied` result.
 */
function denialOf(denial: Denial): WriteResult {
  return { status: 'denied', ...denial };
}

// Place the Remote method marker that the Gateway's `remoteMethods()` reads.
// This is what `@Remote` would produce via `addMarkerInitializer` + `mark()`.
Object.defineProperty(MdLiveRemote.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({
        method: 'writeText',
        invocation: Object.freeze({ kind: 'direct' }),
      }),
    ]),
  }),
});
