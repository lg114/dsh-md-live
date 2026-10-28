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
  loadRecent,
  loadSkipDirs,
  parseRules,
  relativeTo,
  saveSkipDirs,
  writeStored,
} from '../types';

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
        setList({ status: 'ready', ...found });
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        setList({ ...EMPTY_LIST, status: 'error', error: String(err?.message ?? err) });
      }
    })();
    return () => ac.abort();
  }, [path, api, sessionId, root, skipDirs, t]);

  useEffect(() => scan(), [scan]);

  const wasVisible = useRef(false);
  useEffect(() => {
    const isVisible = tabVisible === true;
    if (isVisible && !wasVisible.current && !path) {
      scan();
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
