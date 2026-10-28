import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translate } from '../locales';
import {
  type MdLiveApi,
  denialText,
} from '../types';

const DRAFT_STORAGE_PREFIX = 'dsh-md-live.draft.v1.';
const DRAFT_DEBOUNCE_MS = 300;

interface StoredDraft {
  draft: string;
  version: string;
  timestamp: number;
}

function draftStorageKey(sessionId: string, path: string): string {
  return `${DRAFT_STORAGE_PREFIX}${sessionId}.${path}`;
}

function loadDraft(sessionId: string, path: string): StoredDraft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(sessionId, path));
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft;
  } catch {
    return null;
  }
}

function saveDraft(sessionId: string, path: string, draft: string, version: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const entry: StoredDraft = { draft, version, timestamp: Date.now() };
    localStorage.setItem(draftStorageKey(sessionId, path), JSON.stringify(entry));
  } catch {
    /* storage full or unavailable */
  }
}

function clearDraft(sessionId: string, path: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(draftStorageKey(sessionId, path));
  } catch {
    /* ignore */
  }
}

export function useEditor(opts: {
  api: MdLiveApi | undefined;
  sessionId: string | undefined;
  path: string;
  t: Translate;
  content: string;
  version: string;
  eol: 'crlf' | 'lf';
  encoding: 'utf-8' | 'unknown';
  onSaved: (content: string, version: string) => void;
  onError: (error: string) => void;
  onReload: () => void;
}) {
  const { api, sessionId, path, t, content, version, eol, encoding, onSaved, onError, onReload } = opts;

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const dirtyRef = useRef(false);
  const reloadBtnRef = useRef<HTMLButtonElement | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<StoredDraft | null>(null);

  const isDirty = editMode && editDraft !== content;
  dirtyRef.current = isDirty;

  useEffect(() => {
    api?.setDiscardGuard?.(() =>
      !dirtyRef.current || window.confirm(t('edit.discard')),
    );
    return () => api?.setDiscardGuard?.(null);
  }, [api, t]);

  const enterEdit = useCallback(() => {
    setEditDraft(content);
    setEditVersion(version);
    setEditMode(true);
    if (sessionId && path) {
      const stored = loadDraft(sessionId, path);
      if (stored && stored.version === version && stored.draft !== content) {
        pendingDraftRef.current = stored;
        setShowRestore(true);
      }
    }
  }, [content, version, sessionId, path]);

  const restoreDraft = useCallback(() => {
    if (pendingDraftRef.current) {
      setEditDraft(pendingDraftRef.current.draft);
      pendingDraftRef.current = null;
    }
    setShowRestore(false);
  }, []);

  const discardDraft = useCallback(() => {
    pendingDraftRef.current = null;
    setShowRestore(false);
    if (sessionId && path) clearDraft(sessionId, path);
  }, [sessionId, path]);

  const exitEdit = useCallback(() => {
    if (dirtyRef.current) {
      if (!window.confirm(t('edit.discard'))) return;
    }
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
    if (sessionId && path) clearDraft(sessionId, path);
  }, [t, sessionId, path]);

  const toDiskEol = useCallback(
    (text: string) => (eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text),
    [eol],
  );

  const handleSave = useCallback(async() => {
    if (!api?.writeText || saving) return;
    if (!sessionId) {
      onError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const diskContent = toDiskEol(editDraft);
      const result = await api.writeText(sessionId, path, diskContent, editVersion);
      if (result.status === 'saved') {
        onSaved(editDraft, result.version);
        setEditVersion(result.version);
        clearDraft(sessionId, path);
        onError('');
      } else if (result.status === 'stale') {
        setShowStale(true);
      } else {
        const msg = result.status === 'denied' ? denialText(result, t)
          : result.status === 'missing' ? t('error.fileMissing')
          : result.status === 'bad-request' ? result.reason
          : result.status === 'error' ? result.message
          : t('error.saveFailed');
        onError(msg);
      }
    } catch (err: any) {
      onError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [api, path, editDraft, editVersion, saving, sessionId, t, onSaved, onError, toDiskEol]);

  const forceSave = useCallback(async () => {
    setShowStale(false);
    if (!api?.writeText) return;
    if (!sessionId) {
      onError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const diskContent = toDiskEol(editDraft);
      const result = await api.writeText(sessionId, path, diskContent, '');
      if (result.status === 'saved') {
        onSaved(editDraft, result.version);
        setEditVersion(result.version);
        clearDraft(sessionId, path);
        onError('');
      } else {
        const msg = result.status === 'error'
          ? result.message
          : result.status === 'denied'
            ? denialText(result, t)
            : t('error.saveFailed');
        onError(msg);
      }
    } catch (err: any) {
      onError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [api, path, editDraft, saving, sessionId, t, onSaved, onError, toDiskEol]);

  const reloadFromDisk = useCallback(() => {
    setShowStale(false);
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
    if (sessionId && path) clearDraft(sessionId, path);
    onReload();
  }, [onReload, sessionId, path]);

  useEffect(() => {
    if (!showStale) return;
    const timer = setTimeout(() => reloadBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowStale(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showStale]);

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

  useEffect(() => {
    if (!editMode || !sessionId || !path) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      if (dirtyRef.current) {
        saveDraft(sessionId, path, editDraft, editVersion);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [editMode, editDraft, editVersion, sessionId, path]);

  return {
    editMode,
    setEditMode,
    editDraft,
    setEditDraft,
    editVersion,
    setEditVersion,
    saving,
    showStale,
    setShowStale,
    showRestore,
    restoreDraft,
    discardDraft,
    isDirty,
    dirtyRef,
    enterEdit,
    exitEdit,
    handleSave,
    forceSave,
    reloadFromDisk,
    reloadBtnRef,
  };
}
