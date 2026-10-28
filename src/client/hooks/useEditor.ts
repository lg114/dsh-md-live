import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translate } from '../locales';
import {
  type MdLiveApi,
  denialText,
} from '../types';

export function useEditor(opts: {
  api: MdLiveApi | undefined;
  sessionId: string | undefined;
  path: string;
  t: Translate;
  content: string;
  version: string;
  onSaved: (content: string, version: string) => void;
  onError: (error: string) => void;
  onReload: () => void;
}) {
  const { api, sessionId, path, t, content, version, onSaved, onError, onReload } = opts;

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const dirtyRef = useRef(false);
  const reloadBtnRef = useRef<HTMLButtonElement | null>(null);

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
      onError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const result = await api.writeText(sessionId, path, editDraft, editVersion);
      if (result.status === 'saved') {
        onSaved(editDraft, result.version);
        setEditVersion(result.version);
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
  }, [api, path, editDraft, editVersion, saving, sessionId, t, onSaved, onError]);

  const forceSave = useCallback(async () => {
    setShowStale(false);
    if (!api?.writeText) return;
    if (!sessionId) {
      onError(t('error.noSessionSave'));
      return;
    }
    setSaving(true);
    try {
      const result = await api.writeText(sessionId, path, editDraft, '');
      if (result.status === 'saved') {
        onSaved(editDraft, result.version);
        setEditVersion(result.version);
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
  }, [api, path, editDraft, saving, sessionId, t, onSaved, onError]);

  const reloadFromDisk = useCallback(() => {
    setShowStale(false);
    setEditMode(false);
    setEditDraft('');
    setEditVersion('');
    onReload();
  }, [onReload]);

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
