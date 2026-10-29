import type { Translate } from './locales';

export interface MdLiveScanBudget {
  depth: number;
  dirs: number;
  files: number;
}

export type MdLiveTruncation = 'depth' | 'dirs' | 'files' | 'entries';

export interface MdLiveListing {
  root: string;
  files: string[];
  truncatedBy: MdLiveTruncation | null;
  limits: MdLiveScanBudget;
  skippedDirs: number;
}

export interface MdLiveScanOptions {
  skipDirs: string[];
}

export const DEFAULT_SKIP_DIRS: readonly string[] = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  'vendor', '__pycache__', '.venv', 'venv', 'env', 'coverage', '.next', '.nuxt',
  '.cache', '.turbo', '.idea', '.gradle', '.terraform', 'bin', 'obj',
];

export const SKIP_DIRS_STORAGE_KEY = 'dsh-md-live.skip-dirs.v1';
export const RECENT_STORAGE_KEY = 'dsh-md-live.recent.v1';
export const READING_STORAGE_KEY = 'dsh-md-live.reading.v1';
export const TOC_STORAGE_KEY = 'dsh-md-live.toc-collapsed.v1';

export const MAX_RECENT = 8;

export interface DenialDetail {
  path?: string;
  mode?: string;
  root?: string;
  bytes?: number;
  maxBytes?: number;
}

export type QuoteOutcome =
  | { status: 'inserted' }
  | { status: 'conflict' }
  | { status: 'no-session' }
  | { status: 'unavailable' }
  | { status: 'chips' };

export type WriteResult =
  | { status: 'saved'; version: string; bytes: number }
  | { status: 'stale'; currentVersion: string }
  | { status: 'denied'; code?: string; reason: string; detail?: DenialDetail }
  | { status: 'missing' }
  | { status: 'bad-request'; reason: string }
  | { status: 'error'; message: string };

export interface ReadingSettings {
  fontSize: number | null;
  lineHeight: number | null;
  width: number | null;
}

export const DEFAULT_READING: ReadingSettings = { fontSize: null, lineHeight: null, width: null };

export interface WatchFrame {
  kind?: string;
  change?: { version?: string };
}

export interface MdLiveApi {
  open: (path: string) => void;
  setDiscardGuard?: (guard: (() => boolean) | null) => void;
  readText: (sessionId: string, path: string, signal: AbortSignal) => Promise<{
    content: string;
    version: string;
    eol: 'crlf' | 'lf';
    encoding: 'utf-8' | 'unknown';
  }>;
  listMarkdown: (
    sessionId: string,
    root: string,
    options: MdLiveScanOptions,
    signal: AbortSignal,
    onProgress?: (files: string[]) => void,
  ) => Promise<MdLiveListing>;
  watch: (sessionId: string, path: string, signal: AbortSignal) => AsyncIterable<WatchFrame>;
  openExternal: (url: string) => void;
  openPath: (path: string, action?: 'reveal') => Promise<void>;
  canOpenPath: () => Promise<boolean>;
  writeText?: (sessionId: string, path: string, content: string, version: string) => Promise<WriteResult>;
  addToConversation?: (sessionId: string, excerpt: string, source: string) => Promise<QuoteOutcome>;
}

export function denialText(result: { code?: string; reason?: string; detail?: DenialDetail }, t: Translate): string {
  const detail = result.detail ?? {};
  const path = String(detail.path ?? '');
  switch (result.code) {
    case 'read-only':
      return t('write.denied.readOnly', { path });
    case 'read-only-file':
      return t('write.denied.fileReadOnly', { path });
    case 'sandbox-root':
      return t('write.denied.root', {
        mode: String(detail.mode ?? ''),
        root: String(detail.root ?? ''),
        path,
      });
    case 'not-observed':
      return t('write.denied.notObserved', { path });
    case 'too-large':
      return t('write.denied.tooLarge', {
        bytes: Number(detail.bytes ?? 0),
        max: Number(detail.maxBytes ?? 0),
      });
    case 'not-markdown':
      return t('write.denied.notMarkdown', { path });
    case 'no-session':
      return t('write.denied.noSession');
    case 'permission':
      return t('write.denied.permission', { path });
    case 'not-found':
      return t('write.denied.notFound', { path });
    case 'io':
      return t('write.denied.io', { message: String(result.reason ?? '') });
    default:
      return result.reason ?? t('error.saveFailed');
  }
}

export function readStored<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or a full quota: the session keeps the in-memory value */
  }
}

export function loadSkipDirs(): string[] {
  const parsed = readStored<unknown>(SKIP_DIRS_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [...DEFAULT_SKIP_DIRS];
  return parsed.filter((item): item is string => typeof item === 'string');
}

export function saveSkipDirs(rules: string[]): void {
  writeStored(SKIP_DIRS_STORAGE_KEY, rules);
}

export function loadRecent(): string[] {
  const parsed = readStored<unknown>(RECENT_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT);
}

export function parseRules(text: string): string[] {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const line of text.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(name);
  }
  return rules;
}

export function loadReading(): ReadingSettings {
  const parsed = readStored<unknown>(READING_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_READING };
  const rec = parsed as Record<string, unknown>;
  const number = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    fontSize: number(rec.fontSize),
    lineHeight: number(rec.lineHeight),
    width: number(rec.width),
  };
}

export const basename = (p?: string): string => (p ? p.split(/[\\/]/).pop() || p : '');
export const escapeAttr = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
export const dirname = (p?: string): string => {
  if (!p) return '';
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
};

export const relativeTo = (root: string, p: string): string => {
  if (!root) return p;
  const normalized = p.replace(/\\/g, '/');
  const prefix = root.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.toLowerCase().startsWith(prefix.toLowerCase() + '/')
    ? normalized.slice(prefix.length + 1)
    : normalized;
};

export type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface ListState {
  status: Status;
  root: string;
  files: string[];
  truncatedBy: MdLiveTruncation | null;
  limits: MdLiveScanBudget;
  skippedDirs: number;
  error: string;
}

export const EMPTY_LIST: ListState = {
  status: 'idle',
  root: '',
  files: [],
  truncatedBy: null,
  limits: { depth: 0, dirs: 0, files: 0 },
  skippedDirs: 0,
  error: '',
};

export function truncationNote(by: MdLiveTruncation, limits: MdLiveScanBudget, t: Translate): string {
  switch (by) {
    case 'depth':
      return t('truncation.depth', { depth: limits.depth });
    case 'dirs':
      return t('truncation.dirs', { dirs: limits.dirs });
    case 'files':
      return t('truncation.files', { files: limits.files });
    case 'entries':
      return t('truncation.entries');
    default:
      return '';
  }
}

export function readingVars(reading: ReadingSettings): React.CSSProperties {
  const style: Record<string, string> = {};
  if (reading.fontSize !== null) style['--md-live-font-size'] = `${reading.fontSize}px`;
  if (reading.lineHeight !== null) style['--md-live-line-height'] = String(reading.lineHeight);
  if (reading.width !== null) style['--md-live-width'] = `${reading.width}px`;
  return style as React.CSSProperties;
}
