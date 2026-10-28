import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assignHeadingIdsAndExtractTOC,
  decorateCodeBlocks,
  isMarkdownPath,
  renderMarkdown,
  renderMathWithin,
  resolveDocPath,
  resolveImageUrls,
  sanitizeHtml,
  splitFrontmatter,
  highlightWithin,
  type TOCItem,
} from '../utils/markdown';
import { TOC } from './TOC';
import { fallbackT, type Translate } from '../locales';
import {
  DEFAULT_READING,
  type MdLiveApi,
  type Status,
  escapeAttr,
  readingVars,
  relativeTo,
  dirname,
} from '../types';
import { useEditor } from '../hooks/useEditor';
import { useFilePicker } from '../hooks/useFilePicker';
import { useQuote } from '../hooks/useQuote';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { SettingsPopover } from './SettingsPopover';
import { StaleDialog } from './StaleDialog';
import { ZoomOverlay } from './ZoomOverlay';
import { QuotePill } from './QuotePill';
import { FilePicker } from './FilePicker';

export type { MdLiveApi, MdLiveListing, WriteResult, QuoteOutcome, ReadingSettings, DenialDetail } from '../types';
export type { MdLiveScanBudget, MdLiveTruncation, MdLiveScanOptions } from '../types';
export { DEFAULT_SKIP_DIRS, loadSkipDirs, saveSkipDirs } from '../types';

export function MarkdownTabBody(props: any) {
  const { useTabInfo, useSessions, sessionId, api, t: injectedT } = props as {
    useTabInfo?: () => any;
    useSessions?: (selector: (sessions: any) => any) => any;
    sessionId?: string;
    api?: MdLiveApi;
    t?: Translate;
  };

  const t: Translate = injectedT ?? fallbackT;

  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const tab = info?.tab;
  const path: string = tab?.navigation?.params?.path ?? '';

  const cwd: string | undefined =
    typeof useSessions === 'function'
      ? useSessions((sessions: any) => sessions?.byId?.[sessionId ?? '']?.cwd)
      : undefined;
  const root = useMemo(() => (cwd ? String(cwd).replace(/\\/g, '/').replace(/\/+$/, '') : ''), [cwd]);

  const [content, setContent] = useState('');
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<Status>(path ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [live, setLive] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [canOpen, setCanOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [diskChanged, setDiskChanged] = useState(false);
  const [eol, setEol] = useState<'crlf' | 'lf'>('lf');
  const [encoding, setEncoding] = useState<'utf-8' | 'unknown'>('utf-8');

  const previewRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const readTokenRef = useRef(0);
  const versionRef = useRef(version);
  versionRef.current = version;

  const load = useCallback(
    async (opts?: { signal?: AbortSignal; isRefresh?: boolean }) => {
      const { signal, isRefresh } = opts ?? {};
      if (!path || !api) return;
      if (!sessionId) {
        setStatus('error');
        setError(t('error.noSessionRead'));
        return;
      }
      const own = signal ?? new AbortController().signal;
      const token = ++readTokenRef.current;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setStatus('loading');
      }
      try {
        const result = await api.readText(sessionId, path, own);
        if (own.aborted || token !== readTokenRef.current) return;
        if (dirtyRef.current) {
          setVersion(result.version);
        } else {
          setContent((prev) => (prev === result.content ? prev : result.content));
          setVersion(result.version);
        }
        setEol(result.eol);
        setEncoding(result.encoding);
        setError('');
        setStatus('ready');
      } catch (err: any) {
        if (own.aborted || err?.name === 'AbortError' || token !== readTokenRef.current) return;
        setError(String(err?.message ?? err));
        setStatus('error');
      } finally {
        if (token === readTokenRef.current) setRefreshing(false);
      }
    },
    [api, sessionId, path, t],
  );

  const {
    reading,
    settingsOpen,
    setSettingsOpen,
    tocCollapsed,
    followWrites,
    setFollowWrites,
    updateReading,
    toggleToc,
  } = useReadingSettings(t);

  const editor = useEditor({
    api,
    sessionId,
    path,
    t,
    content,
    version,
    eol,
    encoding,
    onSaved: (newContent, newVersion) => {
      setContent(newContent);
      setVersion(newVersion);
      setDiskChanged(false);
    },
    onError: setError,
    onReload: () => {
      setDiskChanged(false);
      void load({ isRefresh: true });
    },
  });

  dirtyRef.current = editor.isDirty;

  useEffect(() => {
    if (editor.editMode) editor.setEditDraft(content);
    editor.setEditVersion(version);
  }, [content, version]);

  const picker = useFilePicker({
    api,
    sessionId,
    path,
    root,
    t,
    tabVisible: tab?.visible,
  });

  const shownPath = path ? relativeTo(picker.list.root || root, path) : '';

  const doc = useMemo(() => splitFrontmatter(content), [content]);
  const base = typeof document !== 'undefined' ? document.baseURI : '';
  const rendered = useMemo(() => {
    if (!doc.body) return { html: '', toc: [] as TOCItem[] };
    const raw = renderMarkdown(doc.body);
    const withUrls = resolveImageUrls(raw, path, base);
    const clean = sanitizeHtml(withUrls);
    return assignHeadingIdsAndExtractTOC(clean);
  }, [doc.body, path, base]);
  const { html, toc } = rendered;

  const quote = useQuote({
    api,
    sessionId,
    path,
    shownPath,
    editMode: editor.editMode,
    previewRef,
    html,
    t,
  });

  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    void load({ signal: ac.signal });
    return () => ac.abort();
  }, [path, load]);

  useEffect(() => {
    editor.setEditMode(false);
    editor.setEditDraft('');
    editor.setEditVersion('');
    editor.setShowStale(false);
    setDiskChanged(false);
  }, [path]);

  useEffect(() => {
    if (!path) return;
    if (!api?.watch || !sessionId) {
      setLive('unavailable');
      return;
    }
    const ac = new AbortController();
    setLive('connecting');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        for await (const frame of api.watch(sessionId, path, ac.signal)) {
          if (ac.signal.aborted) return;
          setLive('live');
          if (!frame || frame.kind !== 'change') continue;
          const frameVersion = frame.change?.version;
          if (frameVersion && frameVersion === versionRef.current) continue;
          if (dirtyRef.current) {
            setDiskChanged(true);
            continue;
          }
          if (!debounceTimer) {
            debounceTimer = setTimeout(() => {
              debounceTimer = null;
              void load({ signal: ac.signal, isRefresh: true });
            }, 120);
          }
        }
        if (!ac.signal.aborted) setLive('unavailable');
      } catch {
        if (!ac.signal.aborted) setLive('unavailable');
      }
    })();
    return () => {
      ac.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [api, sessionId, path, load]);

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

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      decorateCodeBlocks(previewRef.current, t);
      void highlightWithin(previewRef.current);
      void renderMathWithin(previewRef.current);
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [html, status, t]);

  const scrollToHeading = useCallback((id: string) => {
    const preview = previewRef.current;
    if (!preview) return;
    const el = preview.querySelector(`[id="${escapeAttr(id)}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      (el as HTMLElement).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready' || toc.length === 0) return;
    const preview = previewRef.current;
    if (!preview) return;
    const headings = Array.from(
      preview.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'),
    ) as HTMLElement[];
    if (headings.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') {
      let frame = 0;
      const measure = () => {
        frame = 0;
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
    }
    const visibleIds = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visibleIds.add(id);
          else visibleIds.delete(id);
        }
        if (visibleIds.size === 0) return;
        let topmost = headings[0].id;
        for (const heading of headings) {
          if (visibleIds.has(heading.id)) {
            topmost = heading.id;
            break;
          }
        }
        setActiveId((prev) => (prev === topmost ? prev : topmost));
      },
      {
        root: preview,
        rootMargin: '-8px 0px -80% 0px',
        threshold: 0,
      },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [status, toc, html]);

  useEffect(() => {
    setActiveId('');
  }, [path]);

  const pick = useCallback(
    (name: string) => {
      api?.open(name);
    },
    [api],
  );

  const onPreviewClick = useCallback(
    (event: any) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const img = target.closest?.('img') as HTMLImageElement | null;
      if (img && img.src) {
        event.preventDefault();
        setZoomedImage(img.src);
        return;
      }
      const anchor = target.closest?.('a');
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
      if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return;
      event.preventDefault();
      const docTarget = resolveDocPath(path, href);
      if (!docTarget) return;
      if (isMarkdownPath(docTarget)) pick(docTarget);
      else void api?.openPath?.(docTarget);
    },
    [api, path, pick, scrollToHeading],
  );

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (event: any) => {
      const node = actionsRef.current;
      if (node && event.target && node.contains(event.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [settingsOpen, setSettingsOpen]);

  const hasReading = reading.fontSize !== null || reading.lineHeight !== null;
  const shownDir = dirname(shownPath);

  return (
    <div className="md-live-panel">
      <div className="md-live-header">
        {refreshing ? (
          <div className="md-live-progress" aria-hidden="true">
            <div className="md-live-progress-bar" />
          </div>
        ) : null}
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
              <span className="md-live-title-name">{shownPath.split('/').pop() || shownPath}</span>
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
                onClick={() => void load({ isRefresh: true })}
                title={t('doc.refreshTitle')}
              >
                {t('doc.refresh')}
              </button>
            ) : null}
            {api?.writeText && status === 'ready' && encoding === 'utf-8' ? (
              editor.editMode ? (
                <>
                  <button
                    className="md-live-btn"
                    onClick={editor.handleSave}
                    disabled={editor.saving || !editor.isDirty}
                    title={editor.saving ? t('edit.saving') : editor.isDirty ? t('edit.saveTitle') : t('edit.noChange')}
                  >
                    {editor.saving ? t('edit.saving') : t('edit.save')}
                  </button>
                  <button
                    className="md-live-btn"
                    onClick={editor.exitEdit}
                    title={t('edit.previewTitle')}
                  >
                    {t('edit.preview')}
                  </button>
                </>
              ) : (
                <button
                  className="md-live-btn"
                  onClick={editor.enterEdit}
                  title={t('edit.start')}
                >
                  {t('edit.label')}
                </button>
              )
            ) : null}
            {settingsOpen ? (
              <SettingsPopover
                reading={reading}
                followWrites={followWrites}
                onUpdateReading={updateReading}
                onToggleFollowWrites={setFollowWrites}
                onRestoreDefaults={() => updateReading(DEFAULT_READING)}
                t={t}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="md-live-content">
        {!path ? (
          <FilePicker
            list={{ ...picker.list, status: picker.list.status, error: picker.list.error } as any}
            skipDirs={picker.skipDirs}
            rulesOpen={picker.rulesOpen}
            draft={picker.draft}
            query={picker.query}
            visible={picker.visible}
            recentVisible={picker.recentVisible}
            scanning={picker.scanning}
            where={picker.where}
            root={root}
            onScan={picker.scan}
            onPick={pick}
            onSetSkipDirs={picker.setSkipDirs}
            onSetRulesOpen={picker.setRulesOpen}
            onSetDraft={picker.setDraft}
            onSetQuery={picker.setQuery}
            t={t}
          />
        ) : status === 'error' ? (
          <div className="md-live-status md-live-status-error">{error}</div>
        ) : status !== 'ready' ? (
          <div className="md-live-status">{t('doc.loading')}</div>
        ) : editor.editMode ? (
          <div className="md-live-editor-wrap">
            {diskChanged ? (
              <div className="md-live-disk-banner">
                <span>{t('edit.diskChanged')}</span>
                <button
                  className="md-live-btn md-live-btn-primary"
                  onClick={() => { setDiskChanged(false); void load({ isRefresh: true }); }}
                >
                  {t('stale.reload')}
                </button>
              </div>
            ) : null}
            {editor.showRestore ? (
              <div className="md-live-disk-banner">
                <span>{t('edit.restoreDraft')}</span>
                <div className="md-live-disk-banner-actions">
                  <button
                    className="md-live-btn md-live-btn-primary"
                    onClick={editor.restoreDraft}
                  >
                    {t('edit.restore')}
                  </button>
                  <button
                    className="md-live-btn"
                    onClick={editor.discardDraft}
                  >
                    {t('edit.discardDraft')}
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="md-live-editor-error">{error}</div>
            ) : null}
            <textarea
              className="md-live-editor"
              value={editor.editDraft}
              onChange={(e) => { editor.setEditDraft(e.target.value); if (error) setError(''); }}
              spellCheck={false}
              aria-label={t('edit.textareaLabel')}
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
              {encoding !== 'utf-8' ? (
                <div className="md-live-encoding-notice">{t('edit.notUtf8')}</div>
              ) : null}
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
      <StaleDialog
        show={editor.showStale}
        onClose={() => editor.setShowStale(false)}
        onReload={editor.reloadFromDisk}
        onOverwrite={editor.forceSave}
        t={t}
      />
      <ZoomOverlay src={zoomedImage} onClose={() => setZoomedImage(null)} t={t} />
      <QuotePill
        quote={quote.quote}
        notice={quote.quoteNotice}
        onAddQuote={quote.addQuote}
        t={t}
      />
    </div>
  );
}

export function MarkdownTabTitle(props: any) {
  const { useTabInfo } = props as { useTabInfo?: () => any };
  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const path: string = info?.tab?.navigation?.params?.path ?? '';
  return <span>{path.split(/[\\/]/).pop() || 'md-live'}</span>;
}
