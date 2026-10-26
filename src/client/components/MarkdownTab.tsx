import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decorateCodeBlocks,
  extractTOC,
  isMarkdownPath,
  renderMarkdown,
  renderMathWithin,
  resolveDocPath,
  resolveImageUrls,
  sanitizeHtml,
  splitFrontmatter,
  withHeadingIds,
  highlightWithin,
  type TOCItem,
} from '../utils/markdown';
import { TOC } from './TOC';
import { FOLLOW_STORAGE_KEY } from '../utils/agent-writes';
import { fallbackT, type Translate } from '../locales';

/** How far a scan may go. Only a safety net: the workspace is scanned whole. */
export interface MdLiveScanBudget {
  /** Directory nesting levels to descend from the workspace root. */
  depth: number;
  /** How many directories may be listed in total. */
  dirs: number;
  /** How many Markdown files may be collected. */
  files: number;
}

/** The cap that stopped a scan, so the picker can say why the list is short. */
export type MdLiveTruncation = 'depth' | 'dirs' | 'files' | 'entries';

/** What a workspace scan found. */
export interface MdLiveListing {
  /** The scanned directory, as an absolute path with `/` separators. */
  root: string;
  /** Markdown files as absolute paths, sorted. */
  files: string[];
  /** The cap that stopped the scan, or `null` when it covered everything. */
  truncatedBy: MdLiveTruncation | null;
  /** The limits the scan ran with, for the note's wording. */
  limits: MdLiveScanBudget;
  /** How many build/dependency directories the default filter left out. */
  skippedDirs: number;
}

/** How one scan should treat build and dependency directories. */
export interface MdLiveScanOptions {
  /** Directory names to leave out of the walk, matched case-insensitively. */
  skipDirs: string[];
}

/**
 * The filter a fresh install starts with. It is a default, not a rule: the
 * picker lets the user edit it, clear it, or restore it, and the choice is
 * remembered per browser.
 */
export const DEFAULT_SKIP_DIRS: readonly string[] = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  'vendor', '__pycache__', '.venv', 'venv', 'env', 'coverage', '.next', '.nuxt',
  '.cache', '.turbo', '.idea', '.gradle', '.terraform', 'bin', 'obj',
];

const SKIP_DIRS_STORAGE_KEY = 'dsh-md-live.skip-dirs.v1';
const RECENT_STORAGE_KEY = 'dsh-md-live.recent.v1';
const READING_STORAGE_KEY = 'dsh-md-live.reading.v1';
const TOC_STORAGE_KEY = 'dsh-md-live.toc-collapsed.v1';

/** How many recently opened documents the picker keeps. */
const MAX_RECENT = 8;

/** Values a translated refusal interpolates, as the Host reports them. */
export interface DenialDetail {
  path?: string;
  mode?: string;
  root?: string;
  bytes?: number;
  maxBytes?: number;
}

/** Structured write outcome returned by the Host. */
export type WriteResult =
  | { status: 'saved'; version: string; bytes: number }
  | { status: 'stale'; currentVersion: string }
  | { status: 'denied'; code?: string; reason: string; detail?: DenialDetail }
  | { status: 'missing' }
  | { status: 'bad-request'; reason: string }
  | { status: 'error'; message: string };

/**
 * Phrase a refused write in the reader's language.
 *
 * The Host sends a `code` beside its own sentence so the panel can say the same
 * thing in either language; an unknown code (an older Host, or a refusal this
 * build has not learned yet) falls back to that sentence unchanged.
 *
 * @param result - the `denied` result.
 * @param t - the locale seat.
 * @returns the message to show under the editor.
 */
function denialText(result: { code?: string; reason?: string; detail?: DenialDetail }, t: Translate): string {
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

/** Read one JSON value; a missing or broken entry yields `undefined`. */
function readStored<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Write one JSON value; a blocked write must never break the panel. */
function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or a full quota: the session keeps the in-memory value */
  }
}

/** Read the saved rules; a missing or broken value falls back to the defaults. */
export function loadSkipDirs(): string[] {
  const parsed = readStored<unknown>(SKIP_DIRS_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [...DEFAULT_SKIP_DIRS];
  return parsed.filter((item): item is string => typeof item === 'string');
}

/** Persist the rules; a blocked storage write must not break the panel. */
export function saveSkipDirs(rules: string[]): void {
  writeStored(SKIP_DIRS_STORAGE_KEY, rules);
}

/** The documents opened most recently, newest first. */
function loadRecent(): string[] {
  const parsed = readStored<unknown>(RECENT_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT);
}

/** One rule per line, trimmed, empty lines dropped, duplicates collapsed. */
function parseRules(text: string): string[] {
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

/**
 * How the reader wants the document laid out.
 *
 * Every field is nullable, and `null` means "whatever the app's own Markdown
 * tokens say" — the default is to inherit, not to impose a house style.
 */
export interface ReadingSettings {
  /** Body font size in px, or `null` to follow the app's content size. */
  fontSize: number | null;
  /** Body line height as a multiple, or `null` to follow the app. */
  lineHeight: number | null;
  /** Measure in px, or `null` for the full panel width. */
  width: number | null;
}

const DEFAULT_READING: ReadingSettings = { fontSize: null, lineHeight: null, width: null };

/** Read the saved layout, ignoring anything that is not a known field. */
function loadReading(): ReadingSettings {
  const parsed = readStored<any>(READING_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_READING };
  const number = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    fontSize: number(parsed.fontSize),
    lineHeight: number(parsed.lineHeight),
    width: number(parsed.width),
  };
}

/**
 * Host-side capabilities the tab body needs, supplied through the slot
 * registration's `inject`. Everything here is a plain async call on the
 * Client's Remote face — the body never touches `ctx` directly.
 */
export interface MdLiveApi {
  /** Re-open this tab with another file (empty string goes back to the picker). */
  open: (path: string) => void;
  /**
   * Register the mounted body's "discard the draft?" question, so a navigation
   * the plugin owns — the back arrow, another file from the picker, an
   * Agent-follow switch — asks before it resets the editor. Pass `null` when
   * the body unmounts.
   */
  setDiscardGuard?: (guard: (() => boolean) | null) => void;
  /** Read a workspace file as UTF-8 text, returning the content and its version token. */
  readText: (sessionId: string, path: string, signal: AbortSignal) => Promise<{ content: string; version: string }>;
  /** Scan the whole workspace tree for Markdown files, reporting each level as it lands. */
  listMarkdown: (
    sessionId: string,
    root: string,
    options: MdLiveScanOptions,
    signal: AbortSignal,
    onProgress?: (files: string[]) => void,
  ) => Promise<MdLiveListing>;
  /** Watch one file; yields a frame per filesystem invalidation. */
  watch: (sessionId: string, path: string, signal: AbortSignal) => AsyncIterable<any>;
  /** Hand a URL to the browser. */
  openExternal: (url: string) => void;
  /** Hand a workspace path to the Host: its default app, or its file manager. */
  openPath: (path: string, action?: 'reveal') => Promise<void>;
  /** Whether the Host can open workspace paths at all (it cannot when remote). */
  canOpenPath: () => Promise<boolean>;
  /**
   * Write UTF-8 text to one workspace file. Returns a structured status.
   * Pass an empty `version` to skip the concurrency check (force overwrite).
   *
   * The session id rides along because the Host fences the write with that
   * Session's sandbox policy; without it the backend would fall back to the
   * deployment default root (the directory `dsh web` was launched from).
   */
  writeText?: (sessionId: string, path: string, content: string, version: string) => Promise<WriteResult>;
}

const basename = (p?: string): string => (p ? p.split(/[\\/]/).pop() || p : '');
const dirname = (p?: string): string => {
  if (!p) return '';
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
};
/** Drop the workspace root from an absolute path, for display only. */
const relativeTo = (root: string, p: string): string => {
  if (!root) return p;
  const normalized = p.replace(/\\/g, '/');
  const prefix = root.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.toLowerCase().startsWith(prefix.toLowerCase() + '/')
    ? normalized.slice(prefix.length + 1)
    : normalized;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface ListState {
  status: Status;
  root: string;
  files: string[];
  truncatedBy: MdLiveTruncation | null;
  limits: MdLiveScanBudget;
  skippedDirs: number;
  error: string;
}

const EMPTY_LIST: ListState = {
  status: 'idle',
  root: '',
  files: [],
  truncatedBy: null,
  limits: { depth: 0, dirs: 0, files: 0 },
  skippedDirs: 0,
  error: '',
};

/** One line explaining why the list is shorter than the workspace. */
function truncationNote(by: MdLiveTruncation, limits: MdLiveScanBudget, t: Translate): string {
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

/** The reading-layout variables, or nothing when the reader kept the defaults. */
function readingVars(reading: ReadingSettings): React.CSSProperties {
  const style: Record<string, string> = {};
  if (reading.fontSize !== null) style['--md-live-font-size'] = `${reading.fontSize}px`;
  if (reading.lineHeight !== null) style['--md-live-line-height'] = String(reading.lineHeight);
  if (reading.width !== null) style['--md-live-width'] = `${reading.width}px`;
  return style as React.CSSProperties;
}

/**
 * The Markdown preview tab's body.
 *
 * It is a page-type tab: the file it shows travels in the tab's own navigation
 * params, so one tab follows whichever file was opened last, and every open is
 * idempotent. Content comes from the workspace Remote and is refreshed by a
 * file watch, which is what makes an Agent rewrite show up without a reload.
 */
export function MarkdownTabBody(props: any) {
  const { useTabInfo, useSessions, sessionId, api, t: injectedT } = props as {
    useTabInfo?: () => any;
    useSessions?: (selector: (sessions: any) => any) => any;
    sessionId?: string;
    api?: MdLiveApi;
    /** DSH's locale seat: present because the registration names a `locale`. */
    t?: Translate;
  };

  // The slot renderer re-renders this body when the reader switches language,
  // handing over a `t` bound to the new locale. Without that seat (the
  // verification harness, a shell without a locale service) Chinese is the
  // fallback, which is also what the plugin's own defaults say.
  const t: Translate = injectedT ?? fallbackT;

  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const tab = info?.tab;
  const path: string = tab?.navigation?.params?.path ?? '';

  // The Session's workspace root, from the same store the Files tab reads. It
  // is the absolute path the Remote needs: an empty path is rejected outright.
  const cwd: string | undefined =
    typeof useSessions === 'function'
      ? useSessions((sessions: any) => sessions?.byId?.[sessionId ?? '']?.cwd)
      : undefined;
  const root = useMemo(() => (cwd ? String(cwd).replace(/\\/g, '/').replace(/\/+$/, '') : ''), [cwd]);

  const [content, setContent] = useState('');
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<Status>(path ? 'loading' : 'idle');
  const [error, setError] = useState('');
  /** Whether the open file is being watched, so the header can stay silent. */
  const [live, setLive] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const [list, setList] = useState<ListState>(EMPTY_LIST);
  const [skipDirs, setSkipDirs] = useState<string[]>(() => loadSkipDirs());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [reading, setReading] = useState<ReadingSettings>(() => loadReading());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState<boolean>(
    () => readStored<unknown>(TOC_STORAGE_KEY) === true,
  );
  /** The heading the reader is at, so the outline can follow along. */
  const [activeId, setActiveId] = useState('');
  /** Whether the tab switches to a document the Agent just wrote. */
  const [followWrites, setFollowWrites] = useState<boolean>(
    () => readStored<unknown>(FOLLOW_STORAGE_KEY) !== false,
  );
  /** `null` until the Host has answered whether it can open paths. */
  const [canOpen, setCanOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const isDirty = editMode && editDraft !== content;
  dirtyRef.current = isDirty;

  // The plugin starts every navigation, but the draft is here: hand it the
  // question while this body is mounted. The closure reads `dirtyRef`, so it
  // answers for the current draft rather than the one at mount time.
  useEffect(() => {
    api?.setDiscardGuard?.(() =>
      !dirtyRef.current || window.confirm(t('edit.discard')),
    );
    return () => api?.setDiscardGuard?.(null);
  }, [api, t]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!path || !api) return;
      if (!sessionId) {
        setStatus('error');
        setError(t('error.noSessionRead'));
        return;
      }
      const own = signal ?? new AbortController().signal;
      setStatus('loading');
      try {
        const result = await api.readText(sessionId, path, own);
        if (own.aborted) return;
        if (dirtyRef.current) {
          setVersion(result.version);
        } else {
          setContent(result.content);
          setVersion(result.version);
          if (editMode) setEditDraft(result.content);
          setEditVersion(result.version);
        }
        setError('');
        setStatus('ready');
      } catch (err: any) {
        if (own.aborted || err?.name === 'AbortError') return;
        setError(String(err?.message ?? err));
        setStatus('error');
      }
    },
    [api, sessionId, path, t],
  );

  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [path, load]);

  useEffect(() => {
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
    setShowStale(false);
  }, [path]);

  // Live updates come from the file watch, not from a button: the first frame
  // (`ready`) means the Host is watching, and every `change` frame re-reads the
  // file. Only when watching turns out to be unavailable does the header offer
  // a manual refresh.
  useEffect(() => {
    if (!path) return;
    if (!api?.watch || !sessionId) {
      setLive('unavailable');
      return;
    }
    const ac = new AbortController();
    setLive('connecting');
    (async () => {
      try {
        for await (const frame of api.watch(sessionId, path, ac.signal)) {
          if (ac.signal.aborted) return;
          setLive('live');
          if (frame && frame.kind === 'change' && !dirtyRef.current) {
            void load(ac.signal);
          }
        }
        // The stream ended on its own: no more live updates for this file.
        if (!ac.signal.aborted) setLive('unavailable');
      } catch {
        // Watching can be unsupported for a path; fall back to a manual refresh.
        if (!ac.signal.aborted) setLive('unavailable');
      }
    })();
    return () => ac.abort();
  }, [api, sessionId, path, load]);

  // Scan the workspace whenever the picker is on screen. Every failure is
  // reported as a failure, never as "no files" — an empty list means the scan
  // really finished and found nothing.
  useEffect(() => {
    if (path) return;
    if (!api) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noPreviewApi') });
      return;
    }
    if (!sessionId) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noSessionScan') });
      return;
    }
    if (!root) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noWorkspacePath') });
      return;
    }
    const ac = new AbortController();
    setList({ ...EMPTY_LIST, status: 'loading' });
    (async () => {
      try {
        const found = await api.listMarkdown(
          sessionId,
          root,
          { skipDirs },
          ac.signal,
          (partial) => {
            if (ac.signal.aborted) return;
            // Draw what has been found so far; the final result replaces it.
            setList({ ...EMPTY_LIST, status: 'loading', root, files: partial });
          },
        );
        if (ac.signal.aborted) return;
        setList({ status: 'ready', ...found });
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        setList({ ...EMPTY_LIST, status: 'error', error: String(err?.message ?? err) });
      }
    })();
    return () => ac.abort();
  }, [path, api, sessionId, root, skipDirs, t]);

  // Ask once per Session whether the Host can hand a path to the OS. It cannot
  // when the browser is attached over the network, and offering a dead button
  // would be worse than offering none.
  useEffect(() => {
    let alive = true;
    if (!api?.canOpenPath) {
      setCanOpen(false);
      return;
    }
    void api
      .canOpenPath()
      .then((answer) => {
        if (alive) setCanOpen(Boolean(answer));
      })
      .catch(() => {
        if (alive) setCanOpen(false);
      });
    return () => {
      alive = false;
    };
  }, [api]);

  // Opening a document is what makes it recent, whether it came from the
  // picker, a link inside another document, or another part of the app.
  useEffect(() => {
    if (!path) return;
    setRecent((prev) => {
      if (prev[0] === path) return prev;
      const next = [path, ...prev.filter((item) => item !== path)].slice(0, MAX_RECENT);
      writeStored(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, [path]);

  // Front matter is metadata, not prose: rendered as Markdown it would open the
  // document with a stray rule and a `title: …` paragraph.
  const doc = useMemo(() => splitFrontmatter(content), [content]);
  const toc = useMemo<TOCItem[]>(() => (doc.body ? extractTOC(doc.body) : []), [doc.body]);
  const base = typeof document !== 'undefined' ? document.baseURI : '';
  const html = useMemo(
    () =>
      doc.body
        ? sanitizeHtml(resolveImageUrls(withHeadingIds(renderMarkdown(doc.body), toc), path, base))
        : '',
    [doc.body, toc, path, base],
  );

  // Highlighting, math and the code toolbar all run on the rendered DOM, after
  // the HTML lands, and are rebuilt from scratch on every re-render.
  useEffect(() => {
    if (status !== 'ready') return;
    highlightWithin(previewRef.current);
    renderMathWithin(previewRef.current);
    decorateCodeBlocks(previewRef.current, t);
  }, [html, status]);

  const scrollToHeading = useCallback((id: string) => {
    const preview = previewRef.current;
    if (!preview) return;
    const el = preview.querySelector(`[id="${id}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Follow the reader: the outline marks whichever heading is at the top of the
  // viewport, so a long document still says where you are.
  useEffect(() => {
    if (status !== 'ready' || toc.length === 0) return;
    const preview = previewRef.current;
    if (!preview) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const headings = Array.from(
        preview.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'),
      ) as HTMLElement[];
      if (headings.length === 0) return;
      const edge = preview.getBoundingClientRect().top + 8;
      let current = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= edge) current = heading.id;
        else break;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (frame !== 0) return;
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(measure);
      else measure();
    };
    preview.addEventListener('scroll', onScroll, { passive: true });
    measure();
    return () => {
      preview.removeEventListener('scroll', onScroll);
      if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, [status, toc, html]);

  // Reset the outline marker when the document changes under it.
  useEffect(() => {
    setActiveId('');
  }, [path]);

  const pick = useCallback(
    (name: string) => {
      api?.open(name);
    },
    [api],
  );

  const toggleToc = useCallback(() => {
    setTocCollapsed((prev) => {
      const next = !prev;
      writeStored(TOC_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const updateReading = useCallback((patch: Partial<ReadingSettings>) => {
    setReading((prev) => {
      const next = { ...prev, ...patch };
      writeStored(READING_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const enterEdit = useCallback(() => {
    setEditDraft(content);
    setEditVersion(version);
    setEditMode(true);
  }, [content, version]);

  const exitEdit = useCallback(() => {
    if (dirtyRef.current) {
      if (!window.confirm(t('edit.discard'))) return;
    }
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!api?.writeText || saving) return;
    if (!sessionId) {
      setError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const result = await api.writeText(sessionId, path, editDraft, editVersion);
      if (result.status === 'saved') {
        setContent(editDraft);
        setVersion(result.version);
        setEditVersion(result.version);
        setError('');
      } else if (result.status === 'stale') {
        setShowStale(true);
      } else {
        const msg = result.status === 'denied' ? denialText(result, t)
          : result.status === 'missing' ? t('error.fileMissing')
          : result.status === 'bad-request' ? result.reason
          : result.status === 'error' ? result.message
          : t('error.saveFailed');
        setError(msg);
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [api, path, editDraft, editVersion, saving, sessionId, t]);

  const forceSave = useCallback(async () => {
    setShowStale(false);
    if (!api?.writeText) return;
    if (!sessionId) {
      setError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const result = await api.writeText(sessionId, path, editDraft, '');
      if (result.status === 'saved') {
        setContent(editDraft);
        setVersion(result.version);
        setEditVersion(result.version);
        setError('');
      } else {
        const msg = result.status === 'error'
          ? result.message
          : result.status === 'denied'
            ? denialText(result, t)
            : t('error.saveFailed');
        setError(msg);
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [api, path, editDraft, saving, sessionId, t]);

  const reloadFromDisk = useCallback(() => {
    setShowStale(false);
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
    void load();
  }, [load]);

  // Ctrl/Cmd+S saves the editor.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirtyRef.current && !saving) void handleSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editMode, saving, handleSave]);

  // Warn before closing the tab while edits are unsaved.
  useEffect(() => {
    if (!editMode) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editMode]);

  // A click inside the document is a navigation the tab owns: the browser would
  // otherwise resolve a relative link against the app's own URL and leave the
  // page, or open a bare `#anchor` in a new tab.
  const onPreviewClick = useCallback(
    (event: any) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;
      if (href.startsWith('#')) {
        event.preventDefault();
        try {
          scrollToHeading(decodeURIComponent(href.slice(1)));
        } catch {
          scrollToHeading(href.slice(1));
        }
        return;
      }
      if (/^(https?:|mailto:)/i.test(href)) {
        event.preventDefault();
        api?.openExternal?.(href);
        return;
      }
      // A scheme we do not own (and not a Windows drive): leave it alone.
      if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return;
      event.preventDefault();
      const target = resolveDocPath(path, href);
      if (!target) return;
      if (isMarkdownPath(target)) pick(target);
      else void api?.openPath?.(target);
    },
    [api, path, pick, scrollToHeading],
  );

  // The settings popover closes on a click outside it, like any other menu.
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (event: any) => {
      const node = actionsRef.current;
      if (node && event.target && node.contains(event.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list.files;
    return list.files.filter((abs) =>
      relativeTo(list.root || root, abs).toLowerCase().includes(needle),
    );
  }, [query, list.files, list.root, root]);

  // Recent entries point at files that may have been deleted since; while the
  // scan is still running there is nothing to check them against, so they show.
  const recentVisible = useMemo(() => {
    if (list.status !== 'ready') return recent;
    const known = new Set(list.files);
    return recent.filter((item) => known.has(item));
  }, [recent, list.status, list.files]);

  const where = list.root ? t('picker.where', { root: list.root }) : t('picker.theWorkspace');
  const scanning = list.status === 'loading' || list.status === 'idle';
  // The header names the file and where it sits, relative to the workspace; the
  // absolute path stays in the tooltip.
  const shownPath = path ? relativeTo(list.root || root, path) : '';
  const shownDir = dirname(shownPath);
  const hasReading = reading.fontSize !== null || reading.lineHeight !== null;

  const renderRow = (abs: string, shown: string, keyPrefix: string) => {
    const dir = dirname(shown);
    return (
      <button
        key={keyPrefix + abs}
        className="md-live-picker-item"
        onClick={() => pick(abs)}
        title={shown}
      >
        {dir ? <span className="md-live-picker-dir">{dir}/</span> : null}
        <span className="md-live-picker-name">{basename(shown)}</span>
      </button>
    );
  };

  return (
    <div className="md-live-panel">
      <div className="md-live-header">
        {path ? (
          <button
            className="md-live-back"
            onClick={() => pick('')}
            title={t('doc.back')}
            aria-label={t('doc.back')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path
                d="M10 3.5 5.5 8l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <div className="md-live-title" title={path || undefined}>
          {path ? (
            <>
              {shownDir ? <span className="md-live-title-dir">{shownDir}/</span> : null}
              <span className="md-live-title-name">{basename(shownPath)}</span>
            </>
          ) : (
            'md-live'
          )}
        </div>
        {path ? (
          <div className="md-live-actions" ref={actionsRef}>
            {canOpen ? (
              <>
                <button
                  className="md-live-btn md-live-icon-btn"
                  onClick={() => void api?.openPath(path)}
                  title={t('doc.openExternal')}
                  aria-label={t('doc.openExternal')}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path
                      d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 9.5v3A1.5 1.5 0 0 1 10.5 14h-7A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4h3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="md-live-btn md-live-icon-btn"
                  onClick={() => void api?.openPath(path, 'reveal')}
                  title={t('doc.reveal')}
                  aria-label={t('doc.reveal')}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path
                      d="M2 5.5A1.5 1.5 0 0 1 3.5 4h2.6l1.4 1.8h5A1.5 1.5 0 0 1 14 7.3v5.2A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </>
            ) : null}
            <button
              className="md-live-btn md-live-icon-btn"
              onClick={() => setSettingsOpen((open) => !open)}
              title={t('doc.settings')}
              aria-label={t('doc.settings')}
              aria-expanded={settingsOpen}
            >
              Aa
            </button>
            {live === 'unavailable' ? (
              <button
                className="md-live-btn"
                onClick={() => void load()}
                title={t('doc.refreshTitle')}
              >
                {t('doc.refresh')}
              </button>
            ) : null}
            {api?.writeText && status === 'ready' ? (
              editMode ? (
                <>
                  <button
                    className="md-live-btn"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    title={saving ? t('edit.saving') : isDirty ? t('edit.saveTitle') : t('edit.noChange')}
                  >
                    {saving ? t('edit.saving') : t('edit.save')}
                  </button>
                  <button
                    className="md-live-btn"
                    onClick={exitEdit}
                    title={t('edit.previewTitle')}
                  >
                    {t('edit.preview')}
                  </button>
                </>
              ) : (
                <button
                  className="md-live-btn"
                  onClick={enterEdit}
                  title={t('edit.start')}
                >
                  {t('edit.label')}
                </button>
              )
            ) : null}
            {settingsOpen ? (
              <div className="md-live-settings" role="dialog" aria-label={t('doc.settings')}>
                <label className="md-live-settings-row">
                  <span>{t('settings.fontSize')}</span>
                  <select
                    value={reading.fontSize === null ? '' : String(reading.fontSize)}
                    onChange={(e) =>
                      updateReading({ fontSize: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">{t('settings.followApp')}</option>
                    <option value="13">13px</option>
                    <option value="14">14px</option>
                    <option value="15">15px</option>
                    <option value="16">16px</option>
                    <option value="18">18px</option>
                  </select>
                </label>
                <label className="md-live-settings-row">
                  <span>{t('settings.lineHeight')}</span>
                  <select
                    value={reading.lineHeight === null ? '' : String(reading.lineHeight)}
                    onChange={(e) =>
                      updateReading({ lineHeight: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">{t('settings.followApp')}</option>
                    <option value="1.5">1.5</option>
                    <option value="1.6">1.6</option>
                    <option value="1.7">1.7</option>
                    <option value="1.8">1.8</option>
                    <option value="2">2.0</option>
                  </select>
                </label>
                <label className="md-live-settings-row">
                  <span>{t('settings.width')}</span>
                  <select
                    value={reading.width === null ? '' : String(reading.width)}
                    onChange={(e) =>
                      updateReading({ width: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">{t('settings.followApp')}</option>
                    <option value="640">640px</option>
                    <option value="760">760px</option>
                    <option value="900">900px</option>
                  </select>
                </label>
                <label className="md-live-settings-row md-live-settings-check">
                  <input
                    type="checkbox"
                    checked={followWrites}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setFollowWrites(next);
                      writeStored(FOLLOW_STORAGE_KEY, next);
                    }}
                  />
                  <span>{t('settings.followWrites')}</span>
                </label>
                <div className="md-live-settings-actions">
                  <button className="md-live-btn" onClick={() => updateReading(DEFAULT_READING)}>
                    {t('settings.restore')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="md-live-content">
        {!path ? (
          <div className="md-live-picker">
            {list.status === 'error' ? (
              <div className="md-live-status md-live-status-error">{list.error}</div>
            ) : (
              <>
                <div className="md-live-picker-head">
                  <span className="md-live-picker-root" title={list.root || undefined}>
                    {list.root ? (
                      <>
                        <span className="md-live-picker-root-label">{t('picker.workspaceLabel')}</span>
                        <span className="md-live-picker-root-path">{list.root}</span>
                      </>
                    ) : (
                      <span className="md-live-picker-root-path">{t('picker.root')}</span>
                    )}
                  </span>
                  <span className="md-live-picker-count">
                    {scanning
                      ? t('picker.scanning')
                      : query.trim()
                        ? t('picker.count', { visible: visible.length, total: list.files.length })
                        : t('picker.countAll', { total: list.files.length })}
                  </span>
                </div>
                <input
                  className="md-live-search"
                  value={query}
                  spellCheck={false}
                  placeholder={t('picker.search')}
                  aria-label={t('picker.searchAria')}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {list.files.length === 0 ? (
                  <div className="md-live-status">
                    {scanning ? t('picker.scanningWhere', { where }) : t('picker.emptyWhere', { where })}
                  </div>
                ) : visible.length === 0 ? (
                  <div className="md-live-status">{t('picker.noMatch', { query: query.trim() })}</div>
                ) : (
                  <div className="md-live-picker-list">
                    {!query.trim() && recentVisible.length > 0 ? (
                      <>
                        <div className="md-live-picker-section" role="heading" aria-level={2}>
                          {t('picker.recent')}
                        </div>
                        {recentVisible.map((abs) =>
                          renderRow(abs, relativeTo(list.root || root, abs), 'recent:'),
                        )}
                        <div className="md-live-picker-section" role="heading" aria-level={2}>
                          {t('picker.all')}
                        </div>
                      </>
                    ) : null}
                    {visible.map((abs) =>
                      renderRow(abs, relativeTo(list.root || root, abs), 'all:'),
                    )}
                  </div>
                )}
                {!scanning && (list.truncatedBy || skipDirs.length > 0) ? (
                  <div className="md-live-picker-note">
                    <span>
                      {list.truncatedBy
                        ? truncationNote(list.truncatedBy, list.limits, t)
                        : skipDirs.length === 0
                          ? t('picker.rulesAll')
                          : t('picker.rulesSkipped', { skipped: list.skippedDirs, rules: skipDirs.length })}
                    </span>
                    <button
                      className="md-live-btn"
                      onClick={() => {
                        setDraft(skipDirs.join('\n'));
                        setRulesOpen((open) => !open);
                      }}
                    >
                      {rulesOpen ? t('picker.rulesClose') : t('picker.rulesOpen')}
                    </button>
                  </div>
                ) : null}
                {rulesOpen ? (
                  <div className="md-live-rules">
                    <textarea
                      className="md-live-rules-input"
                      value={draft}
                      spellCheck={false}
                      placeholder={t('picker.rulesHint')}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="md-live-rules-actions">
                      <button
                        className="md-live-btn"
                        onClick={() => {
                          const next = parseRules(draft);
                          setSkipDirs(next);
                          saveSkipDirs(next);
                          setRulesOpen(false);
                        }}
                      >
                        {t('picker.rulesSave')}
                      </button>
                      <button
                        className="md-live-btn"
                        onClick={() => {
                          const next = [...DEFAULT_SKIP_DIRS];
                          setDraft(next.join('\n'));
                          setSkipDirs(next);
                          saveSkipDirs(next);
                        }}
                      >
                        {t('picker.rulesRestore')}
                      </button>
                      <button
                        className="md-live-btn"
                        onClick={() => {
                          setDraft('');
                          setSkipDirs([]);
                          saveSkipDirs([]);
                        }}
                      >
                        {t('picker.rulesShowAll')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : status === 'error' ? (
          <div className="md-live-status md-live-status-error">{error}</div>
        ) : status !== 'ready' ? (
          <div className="md-live-status">{t('doc.loading')}</div>
        ) : editMode ? (
          <div className="md-live-editor-wrap">
            {error ? (
              <div className="md-live-editor-error">{error}</div>
            ) : null}
            <textarea
              className="md-live-editor"
              value={editDraft}
              onChange={(e) => { setEditDraft(e.target.value); if (error) setError(''); }}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="md-live-split">
            {toc.length > 0 && (
              <div className={`md-live-toc${tocCollapsed ? ' is-collapsed' : ''}`}>
                <TOC
                  items={toc}
                  activeId={activeId}
                  collapsed={tocCollapsed}
                  onToggle={toggleToc}
                  onHeadingClick={scrollToHeading}
                  t={t}
                />
              </div>
            )}
            <div
              className={`md-live-preview${hasReading ? ' has-reading' : ''}`}
              ref={previewRef}
              style={readingVars(reading)}
            >
              {doc.meta ? (
                <details className="md-live-frontmatter">
                  <summary>
                    {t('doc.frontmatter', { count: doc.meta.split('\n').length })}
                  </summary>
                  <pre>{doc.meta}</pre>
                </details>
              ) : null}
              <div
                className="markdown-body"
                onClick={onPreviewClick}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        )}
      </div>
      {showStale ? (
        <div className="md-live-dialog-overlay">
          <div className="md-live-dialog" role="alertdialog" aria-label={t('stale.title')}>
            <p className="md-live-dialog-title">{t('stale.title')}</p>
            <p className="md-live-dialog-body">{t('stale.body')}</p>
            <div className="md-live-dialog-actions">
              <button className="md-live-btn" onClick={reloadFromDisk}>{t('stale.reload')}</button>
              <button className="md-live-btn md-live-btn-primary" onClick={forceSave}>{t('stale.overwrite')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The tab chip: the file's name instead of the type's static label. */
export function MarkdownTabTitle(props: any) {
  const { useTabInfo } = props as { useTabInfo?: () => any };
  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const path: string = info?.tab?.navigation?.params?.path ?? '';
  return <span>{basename(path) || 'md-live'}</span>;
}
