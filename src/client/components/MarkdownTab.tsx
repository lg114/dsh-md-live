import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractTOC, renderMarkdown, sanitizeHtml, withHeadingIds, type TOCItem } from '../utils/markdown';
import { TOC } from './TOC';

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

/** Read the saved rules; a missing or broken value falls back to the defaults. */
export function loadSkipDirs(): string[] {
  try {
    const raw = window.localStorage.getItem(SKIP_DIRS_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_SKIP_DIRS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_SKIP_DIRS];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [...DEFAULT_SKIP_DIRS];
  }
}

/** Persist the rules; a blocked storage write must not break the panel. */
export function saveSkipDirs(rules: string[]): void {
  try {
    window.localStorage.setItem(SKIP_DIRS_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* private mode or a full quota: the session keeps the in-memory value */
  }
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
 * Host-side capabilities the tab body needs, supplied through the slot
 * registration's `inject`. Everything here is a plain async call on the
 * Client's Remote face — the body never touches `ctx` directly.
 */
export interface MdLiveApi {
  /** Re-open this tab with another file (empty string goes back to the picker). */
  open: (path: string) => void;
  /** Read a workspace file as UTF-8 text. */
  readText: (sessionId: string, path: string, signal: AbortSignal) => Promise<string>;
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
function truncationNote(by: MdLiveTruncation, limits: MdLiveScanBudget): string {
  switch (by) {
    case 'depth':
      return `目录层级超过 ${limits.depth} 层，更深的位置没有列出`;
    case 'dirs':
      return `目录数量超过 ${limits.dirs} 个，其余目录没有列出`;
    case 'files':
      return `只列出前 ${limits.files} 个文件`;
    case 'entries':
      return '有目录的条目过多，Host 只返回了其中一部分';
    default:
      return '';
  }
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
  const { useTabInfo, useSessions, sessionId, api } = props as {
    useTabInfo?: () => any;
    useSessions?: (selector: (sessions: any) => any) => any;
    sessionId?: string;
    api?: MdLiveApi;
  };

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
  const [status, setStatus] = useState<Status>(path ? 'loading' : 'idle');
  const [error, setError] = useState('');
  /** Whether the open file is being watched, so the header can stay silent. */
  const [live, setLive] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const [list, setList] = useState<ListState>(EMPTY_LIST);
  const [includeNoisy, setIncludeNoisy] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!path || !api) return;
      if (!sessionId) {
        setStatus('error');
        setError('没有会话上下文，无法读取文件');
        return;
      }
      const own = signal ?? new AbortController().signal;
      setStatus('loading');
      try {
        const text = await api.readText(sessionId, path, own);
        if (own.aborted) return;
        setContent(text);
        setError('');
        setStatus('ready');
      } catch (err: any) {
        if (own.aborted || err?.name === 'AbortError') return;
        setError(String(err?.message ?? err));
        setStatus('error');
      }
    },
    [api, sessionId, path],
  );

  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [path, load]);

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
          if (frame && frame.kind === 'change') void load(ac.signal);
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
      setList({ ...EMPTY_LIST, status: 'error', error: '预览接口没有注入' });
      return;
    }
    if (!sessionId) {
      setList({ ...EMPTY_LIST, status: 'error', error: '没有会话上下文，无法扫描工作区' });
      return;
    }
    if (!root) {
      setList({ ...EMPTY_LIST, status: 'error', error: '还没有拿到会话的工作区路径' });
      return;
    }
    const ac = new AbortController();
    setList({ ...EMPTY_LIST, status: 'loading' });
    (async () => {
      try {
        const found = await api.listMarkdown(
          sessionId,
          root,
          { includeNoisy },
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
  }, [path, api, sessionId, root, includeNoisy]);

  const toc = useMemo<TOCItem[]>(() => (content ? extractTOC(content) : []), [content]);
  const html = useMemo(
    () => (content ? sanitizeHtml(withHeadingIds(renderMarkdown(content), toc)) : ''),
    [content, toc],
  );

  const scrollToHeading = useCallback((id: string) => {
    const root = previewRef.current;
    if (!root) return;
    const el = root.querySelector(`[id="${id}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const pick = useCallback(
    (name: string) => {
      api?.open(name);
    },
    [api],
  );

  const scannedRoot = list.root ? list.root : '工作区根目录';
  const where = list.root ? `「${list.root}」` : '工作区';
  const scanning = list.status === 'loading' || list.status === 'idle';
  // The header names the file and where it sits, relative to the workspace; the
  // absolute path stays in the tooltip.
  const shownPath = path ? relativeTo(list.root || root, path) : '';
  const shownDir = dirname(shownPath);

  return (
    <div className="md-live-panel">
      <div className="md-live-header">
        {path ? (
          <button
            className="md-live-back"
            onClick={() => pick('')}
            title="返回文件列表"
            aria-label="返回文件列表"
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
            'Markdown 预览'
          )}
        </div>
        {path && live === 'unavailable' ? (
          <div className="md-live-actions">
            <button
              className="md-live-btn"
              onClick={() => void load()}
              title="这个文件无法自动监听变化，点此重新读取"
            >
              刷新
            </button>
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
                  <span>{scannedRoot}</span>
                  <span className="md-live-picker-count">
                    {scanning ? '扫描中…' : `${list.files.length} 个文件`}
                  </span>
                </div>
                {list.files.length === 0 ? (
                  <div className="md-live-status">
                    {scanning ? `正在扫描${where}…` : `${where}里没有 Markdown 文件`}
                  </div>
                ) : (
                  <div className="md-live-picker-list">
                    {list.files.map((abs) => {
                      // Files are absolute for the Remote; the list shows the part
                      // below the workspace root, which is what a user recognizes.
                      const shown = relativeTo(list.root || root, abs);
                      const dir = dirname(shown);
                      return (
                        <button
                          key={abs}
                          className="md-live-picker-item"
                          onClick={() => pick(abs)}
                          title={shown}
                        >
                          {dir ? <span className="md-live-picker-dir">{dir}/</span> : null}
                          <span className="md-live-picker-name">{basename(shown)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!scanning && list.truncatedBy ? (
                  <div className="md-live-picker-note">
                    <span>{truncationNote(list.truncatedBy, list.limits)}</span>
                  </div>
                ) : null}
                {!scanning && (list.skippedDirs > 0 || includeNoisy) ? (
                  <div className="md-live-picker-note">
                    <span>
                      {includeNoisy
                        ? '已包含 node_modules、dist 等构建与依赖目录'
                        : `已跳过 ${list.skippedDirs} 个构建与依赖目录（node_modules、dist 等）`}
                    </span>
                    <button className="md-live-btn" onClick={() => setIncludeNoisy((v) => !v)}>
                      {includeNoisy ? '只看源码' : '显示全部'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : status === 'error' ? (
          <div className="md-live-status md-live-status-error">{error}</div>
        ) : status !== 'ready' ? (
          <div className="md-live-status">读取中…</div>
        ) : (
          <div className="md-live-split">
            {toc.length > 0 && (
              <div className="md-live-toc">
                <TOC items={toc} onHeadingClick={scrollToHeading} />
              </div>
            )}
            <div className="md-live-preview" ref={previewRef}>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The tab chip: the file's name instead of the type's static label. */
export function MarkdownTabTitle(props: any) {
  const { useTabInfo } = props as { useTabInfo?: () => any };
  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const path: string = info?.tab?.navigation?.params?.path ?? '';
  return <span>{basename(path) || 'Markdown'}</span>;
}
