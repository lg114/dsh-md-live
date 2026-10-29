import { useCallback, useEffect, useState } from 'react';
import type { Translate } from '../locales';
import type { MdLiveApi } from '../types';

export function useQuote(opts: {
  api: MdLiveApi | undefined;
  sessionId: string | undefined;
  path: string;
  shownPath: string;
  editMode: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  html: string;
  t: Translate;
}) {
  const { api, sessionId, path, shownPath, editMode, previewRef, html, t } = opts;

  const [quote, setQuote] = useState<{ text: string; top: number; left: number } | null>(null);
  const [quoteNotice, setQuoteNotice] = useState('');

  useEffect(() => {
    if (editMode) {
      setQuote(null);
      return;
    }
    const onUp = () => {
      const host = previewRef.current;
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
      if (!host || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setQuote(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const inside = (node: Node | null) => Boolean(node && host.contains(node));
      if (!inside(range.startContainer) || !inside(range.endContainer)) {
        setQuote(null);
        return;
      }
      const text = selection.toString().replace(/\s+$/, '');
      if (!text.trim()) {
        setQuote(null);
        return;
      }
      const rect =
        typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : { left: 0, width: 0, bottom: 0 };
      const margin = 64;
      const left = Math.min(Math.max(rect.left + rect.width / 2, margin), window.innerWidth - margin);
      setQuote({ text, top: rect.bottom + 6, left });
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [editMode, previewRef]);

  useEffect(() => {
    if (!quote) return;
    const drop = () => setQuote(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuote(null);
    };
    const host = previewRef.current;
    host?.addEventListener('scroll', drop, true);
    window.addEventListener('resize', drop);
    document.addEventListener('keydown', onKey);
    return () => {
      host?.removeEventListener('scroll', drop, true);
      window.removeEventListener('resize', drop);
      document.removeEventListener('keydown', onKey);
    };
  }, [quote, previewRef]);

  useEffect(() => {
    setQuote(null);
  }, [html]);

  useEffect(() => {
    if (!quoteNotice) return;
    const timer = setTimeout(() => setQuoteNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [quoteNotice]);

  const addQuote = useCallback(async () => {
    const current = quote;
    if (!current || !api?.addToConversation) return;
    setQuote(null);
    if (!sessionId) {
      setQuoteNotice(t('quote.noSession'));
      return;
    }
    try {
      const outcome = await api.addToConversation(sessionId, current.text, shownPath || path);
      if (outcome.status === 'inserted') {
        setQuoteNotice('');
        return;
      }
      const message =
        outcome.status === 'conflict'
          ? t('quote.conflict')
          : outcome.status === 'no-session'
            ? t('quote.noSession')
            : outcome.status === 'chips'
              ? t('quote.chips')
              : t('quote.unavailable');
      setQuoteNotice(message);
      if (outcome.status === 'conflict') setQuote(current);
    } catch (err: unknown) {
      setQuoteNotice(err instanceof Error ? err.message : String(err));
    }
  }, [api, quote, sessionId, shownPath, path, t]);

  return {
    quote,
    setQuote,
    quoteNotice,
    addQuote,
  };
}
