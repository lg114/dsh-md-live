import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Translate } from '../locales';
import {
  DEFAULT_SKIP_DIRS,
  EMPTY_LIST,
  MAX_RECENT,
  RECENT_STORAGE_KEY,
  SKIP_DIRS_STORAGE_KEY,
  type ListState,
  type MdLiveApi,
  type MdLiveListing,
  loadRecent,
  loadSkipDirs,
  parseRules,
  relativeTo,
  saveSkipDirs,
  writeStored,
} from '../types';

/** TTL for cached scan results: 30 seconds. */
const SCAN_CACHE_TTL = 30_000;

interface ScanCacheEntry {
  result: MdLiveListing;
  timestamp: number;
}

const scanCache = new Map<string, ScanCacheEntry>();

function scanCacheKey(sessionId: string, root: string, skipDirs: string[]): string {
  return `${sessionId}\0${root}\0${skipDirs.join(',')}`;
}

export function useFilePicker(opts: {
  api: MdLiveApi | undefined;
  sessionId: string | undefined;
  path: string;
  root: string;
  t: Translate;
  tabVisible?: boolean;
}) {
  const { api, sessionId, path, root, t, tabVisible } = opts;

  const [list, setList] = useState<ListState>(EMPTY_LIST);
  const [skipDirs, setSkipDirs] = useState<string[]>(() => loadSkipDirs());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  const scan = useCallback(() => {
    if (path) return;
    if (!api) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noPreviewApi') });
      return () => {};
    }
    if (!sessionId) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noSessionScan') });
      return () => {};
    }
    if (!root) {
      setList({ ...EMPTY_LIST, status: 'error', error: t('error.noWorkspacePath') });
      return () => {};
    }
    const cacheKey = scanCacheKey(sessionId, root, skipDirs);
    const cached = scanCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SCAN_CACHE_TTL) {
      setList({ status: 'ready', ...cached.result });
      return () => {};
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
            setList({ ...EMPTY_LIST, status: 'loading', root, files: partial });
          },
        );
        if (ac.signal.aborted) return;
        scanCache.set(cacheKey, { result: found, timestamp: Date.now() });
        setList({ status: 'ready', ...found });
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        setList({ ...EMPTY_LIST, status: 'error', error: String(err?.message ?? err) });
      }
    })();
    return () => ac.abort();
  }, [path, api, sessionId, root, skipDirs, t]);

  const wasVisible = useRef(false);
  const hasScanned = useRef(false);
  useEffect(() => {
    const isVisible = tabVisible === true;
    const shouldScan = !path && (isVisible || !hasScanned.current);
    if (shouldScan) {
      const cleanup = scan();
      hasScanned.current = true;
      wasVisible.current = isVisible;
      return cleanup;
    }
    wasVisible.current = isVisible;
  }, [tabVisible, path, scan]);

  useEffect(() => {
    if (!path) return;
    setRecent((prev) => {
      if (prev[0] === path) return prev;
      const next = [path, ...prev.filter((item) => item !== path)].slice(0, MAX_RECENT);
      writeStored(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, [path]);

  const sorted = useMemo(() => {
    const base = list.root || root;
    return [...list.files].sort((a, b) => relativeTo(base, a).localeCompare(relativeTo(base, b)));
  }, [list.files, list.root, root]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? sorted.filter((abs) => relativeTo(list.root || root, abs).toLowerCase().includes(needle))
      : sorted;
  }, [query, sorted, list.root, root]);

  const recentVisible = useMemo(() => {
    if (list.status !== 'ready') return recent;
    const known = new Set(list.files);
    return recent.filter((item) => known.has(item));
  }, [recent, list.status, list.files]);

  const scanning = list.status === 'loading' || list.status === 'idle';
  const where = list.root ? t('picker.where', { root: list.root }) : t('picker.theWorkspace');

  return {
    list,
    skipDirs,
    setSkipDirs,
    rulesOpen,
    setRulesOpen,
    draft,
    setDraft,
    query,
    setQuery,
    recent,
    scan,
    visible,
    recentVisible,
    scanning,
    where,
    parseRules,
    saveSkipDirs,
    DEFAULT_SKIP_DIRS,
  };
}
