import { isMarkdownPath, resolvePath } from './markdown';

/**
 * Tools that rewrite a file whenever they succeed.
 *
 * The names come from the Host's own registrations: `write` (create or replace
 * a file) and `edit` (replace literal text). Anything else — `read`, `glob`,
 * `grep` — leaves the file alone.
 */
const WRITE_TOOLS = new Set(['write', 'edit']);

/** `str_replace_editor` is a read for `view` and a write for everything else. */
const EDITOR_TOOL = 'str_replace_editor';
const EDITOR_WRITE_COMMANDS = new Set(['create', 'str_replace', 'insert']);

/** Where the reader's "follow the Agent's writes" choice is remembered. */
export const FOLLOW_STORAGE_KEY = 'dsh-md-live.follow-writes.v1';

/**
 * Whether the panel should switch to whatever the Agent writes.
 *
 * Read at the moment of a write rather than cached at startup, so flipping the
 * checkbox takes effect without reloading the page. A missing value follows:
 * the behaviour is the point of the feature, so it is on until refused.
 *
 * @returns the current preference.
 */
export function isFollowingEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(FOLLOW_STORAGE_KEY);
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

/** One Agent tool call that is about to rewrite a Markdown file. */
export interface AgentWrite {
  /** The Host's call identity, so the result frame can be matched back. */
  callId: string;
  /** The file, as an absolute path inside the workspace. */
  path: string;
}

/** Read a tool call's arguments, which travel as JSON text. */
function parseArguments(raw: unknown): Record<string, any> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A streamed call can be observed mid-write; a half-written payload simply
    // is not a target yet.
    return null;
  }
}

/**
 * Decide whether one `tool/call` event is about to write a Markdown file.
 *
 * The call arrives before the write lands, so this only names the target — the
 * caller waits for the matching `tool/result` before opening anything, which
 * keeps the tab from showing the file's previous contents.
 *
 * @param data - the event's `data` payload: `{ callId, name, arguments }`.
 * @param cwd - the Session's workspace root, which relative paths resolve
 *   against (the Host's filesystem backend does the same).
 * @returns the target, or `null` for any call that does not write Markdown.
 */
export function markdownWriteTarget(data: any, cwd: string): AgentWrite | null {
  const name = typeof data?.name === 'string' ? data.name : '';
  const isEditor = name === EDITOR_TOOL;
  if (!WRITE_TOOLS.has(name) && !isEditor) return null;

  const args = parseArguments(data?.arguments);
  if (!args) return null;
  if (isEditor && !EDITOR_WRITE_COMMANDS.has(String(args.command))) return null;

  const declared = typeof args.file_path === 'string' ? args.file_path : args.path;
  if (typeof declared !== 'string' || declared.trim() === '') return null;

  const resolved = resolvePath(cwd, declared);
  if (!resolved || !isMarkdownPath(resolved)) return null;

  const callId = data?.callId === undefined ? '' : String(data.callId);
  if (callId === '') return null;
  return { callId, path: resolved };
}

/**
 * Read the call a `tool/result` event answers.
 *
 * @param data - the event's `data` payload: `{ message: { source: { callId } } }`.
 * @returns the call identity, or `''` when the frame carries none.
 */
export function resultCallId(data: any): string {
  const id = data?.message?.source?.callId;
  return id === undefined ? '' : String(id);
}
