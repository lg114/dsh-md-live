import React from 'react';
import type { Translate } from '../locales';
import {
  DEFAULT_SKIP_DIRS,
  type MdLiveListing,
  type MdLiveScanBudget,
  type MdLiveTruncation,
  basename,
  dirname,
  parseRules,
  relativeTo,
  saveSkipDirs,
  truncationNote,
} from '../types';

interface FilePickerProps {
  list: MdLiveListing & { status: string; error: string };
  skipDirs: string[];
  rulesOpen: boolean;
  draft: string;
  query: string;
  visible: string[];
  recentVisible: string[];
  scanning: boolean;
  where: string;
  root: string;
  onScan: () => void;
  onPick: (path: string) => void;
  onSetSkipDirs: (dirs: string[]) => void;
  onSetRulesOpen: (open: boolean) => void;
  onSetDraft: (draft: string) => void;
  onSetQuery: (query: string) => void;
  t: Translate;
}

function renderRow(abs: string, shown: string, keyPrefix: string, onPick: (path: string) => void) {
  const dir = dirname(shown);
  return (
    <button
      key={keyPrefix + abs}
      className="md-live-picker-item"
      onClick={() => onPick(abs)}
      title={shown}
    >
      {dir ? <span className="md-live-picker-dir">{dir}/</span> : null}
      <span className="md-live-picker-name">{basename(shown)}</span>
    </button>
  );
}

export function FilePicker({
  list,
  skipDirs,
  rulesOpen,
  draft,
  query,
  visible,
  recentVisible,
  scanning,
  where,
  root,
  onScan,
  onPick,
  onSetSkipDirs,
  onSetRulesOpen,
  onSetDraft,
  onSetQuery,
  t,
}: FilePickerProps) {
  return (
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
            <button
              className="md-live-btn md-live-picker-refresh"
              title={t('picker.refreshTitle')}
              disabled={scanning}
              onClick={onScan}
              aria-label={t('picker.refresh')}
            >
              {t('picker.refresh')}
            </button>
          </div>
          <input
            className="md-live-search"
            value={query}
            spellCheck={false}
            placeholder={t('picker.search')}
            aria-label={t('picker.searchAria')}
            onChange={(e) => onSetQuery(e.target.value)}
          />
          {list.files.length === 0 ? (
            <div className="md-live-status">
              {scanning ? t('picker.scanningWhere', { where }) : t('picker.emptyWhere', { where })}
            </div>
          ) : visible.length === 0 ? (
            <div className="md-live-status">{t('picker.noMatch', { query: query.trim() })}</div>
          ) : (
            <div className="md-live-picker-list">
              {(() => {
                const showRecent = !query.trim() && recentVisible.length > 0;
                const recentSet = showRecent ? new Set(recentVisible) : null;
                const allForRender = recentSet
                  ? visible.filter((abs) => !recentSet.has(abs))
                  : visible;
                return (
                  <>
                    {showRecent ? (
                      <>
                        <div className="md-live-picker-section" role="heading" aria-level={2}>
                          {t('picker.recent')}
                        </div>
                        {recentVisible.map((abs) =>
                          renderRow(abs, relativeTo(list.root || root, abs), 'recent:', onPick),
                        )}
                        {allForRender.length > 0 ? (
                          <div className="md-live-picker-section" role="heading" aria-level={2}>
                            {t('picker.all')}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {allForRender.map((abs) =>
                      renderRow(abs, relativeTo(list.root || root, abs), 'all:', onPick),
                    )}
                  </>
                );
              })()}
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
                  onSetDraft(skipDirs.join('\n'));
                  onSetRulesOpen(!rulesOpen);
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
                onChange={(e) => onSetDraft(e.target.value)}
              />
              <div className="md-live-rules-actions">
                <button
                  className="md-live-btn"
                  onClick={() => {
                    const next = parseRules(draft);
                    onSetSkipDirs(next);
                    saveSkipDirs(next);
                    onSetRulesOpen(false);
                  }}
                >
                  {t('picker.rulesSave')}
                </button>
                <button
                  className="md-live-btn"
                  onClick={() => {
                    const next = [...DEFAULT_SKIP_DIRS];
                    onSetDraft(next.join('\n'));
                    onSetSkipDirs(next);
                    saveSkipDirs(next);
                  }}
                >
                  {t('picker.rulesRestore')}
                </button>
                <button
                  className="md-live-btn"
                  onClick={() => {
                    onSetDraft('');
                    onSetSkipDirs([]);
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
  );
}
