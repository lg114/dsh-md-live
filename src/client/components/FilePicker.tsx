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

function fileBadge() {
  return (
    <span className="md-live-picker-badge" aria-hidden="true">MD</span>
  );
}

function renderRow(abs: string, name: string, keyPrefix: string, onPick: (path: string) => void) {
  return (
    <button
      key={keyPrefix + abs}
      className="md-live-picker-item"
      onClick={() => onPick(abs)}
      title={name}
    >
      {fileBadge()}
      <span className="md-live-picker-name">{name}</span>
    </button>
  );
}

interface FileGroup {
  dir: string;
  files: { abs: string; name: string }[];
}

function groupByDir(
  items: { abs: string; shown: string }[],
): FileGroup[] {
  const groups: FileGroup[] = [];
  for (const { abs, shown } of items) {
    const dir = dirname(shown);
    const name = basename(shown);
    const last = groups[groups.length - 1];
    if (last && last.dir === dir) {
      last.files.push({ abs, name });
    } else {
      groups.push({ dir, files: [{ abs, name }] });
    }
  }
  return groups;
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
                  <span className="md-live-picker-root-path">{basename(list.root)}</span>
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
                  : t('picker.fileCount', { total: list.files.length })}
            </span>
            <div className="md-live-picker-actions">
              <button
                className="md-live-btn md-live-icon-btn"
                title={rulesOpen ? t('picker.rulesClose') : t('picker.rulesOpen')}
                onClick={() => {
                  onSetDraft(skipDirs.join('\n'));
                  onSetRulesOpen(!rulesOpen);
                }}
                aria-label={t('picker.rulesOpen')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 3h10M2 7h10M2 11h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                className="md-live-btn md-live-icon-btn"
                title={t('picker.refreshTitle')}
                disabled={scanning}
                onClick={onScan}
                aria-label={t('picker.refresh')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M12 7a5 5 0 1 1-1.5-3.5L12 2v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <div className="md-live-search-wrap">
            <svg className="md-live-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9.5 9.5 12.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              className="md-live-search"
              value={query}
              spellCheck={false}
              placeholder={t('picker.search')}
              aria-label={t('picker.searchAria')}
              onChange={(e) => onSetQuery(e.target.value)}
            />
          </div>
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
                const root = list.root || '';
                const toShown = (abs: string) => ({ abs, shown: relativeTo(root, abs) });
                const recentGroups = showRecent ? groupByDir(recentVisible.map(toShown)) : [];
                const allGroups = groupByDir(allForRender.map(toShown));
                return (
                  <>
                    {showRecent ? (
                      <>
                        <div className="md-live-picker-section md-live-picker-section-recent" role="heading" aria-level={2}>
                          {t('picker.recent')}
                        </div>
                        {recentGroups.map((group) => (
                          <div key={'rg:' + group.dir} className="md-live-picker-group">
                            {group.dir ? (
                              <div className="md-live-picker-group-dir">{group.dir}</div>
                            ) : null}
                            {group.files.map((f) => renderRow(f.abs, f.name, 'recent:', onPick))}
                          </div>
                        ))}
                        {allGroups.length > 0 ? (
                          <div className="md-live-picker-section md-live-picker-section-all" role="heading" aria-level={2}>
                            {t('picker.all')}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {allGroups.map((group) => (
                      <div key={'ag:' + group.dir} className="md-live-picker-group">
                        {group.dir ? (
                          <div className="md-live-picker-group-dir">{group.dir}</div>
                        ) : null}
                        {group.files.map((f) => renderRow(f.abs, f.name, 'all:', onPick))}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
          {!scanning && (list.truncatedBy || skipDirs.length > 0) ? (
            <div className="md-live-picker-note">
              {list.truncatedBy
                ? truncationNote(list.truncatedBy, list.limits, t)
                : skipDirs.length === 0
                  ? t('picker.rulesAll')
                  : t('picker.rulesSkipped', { skipped: list.skippedDirs, rules: skipDirs.length })}
            </div>
          ) : null}
          {rulesOpen ? (
            <div className="md-live-dialog-overlay" onClick={() => onSetRulesOpen(false)}>
              <div className="md-live-rules-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="md-live-rules-dialog-header">
                  <span className="md-live-rules-dialog-title">{t('picker.rulesOpen')}</span>
                  <button
                    className="md-live-btn md-live-icon-btn"
                    onClick={() => onSetRulesOpen(false)}
                    aria-label={t('picker.rulesClose')}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
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
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
