import React from 'react';
import { TOCItem } from '../utils/markdown';
import { fallbackT, type Translate } from '../locales';

interface TOCProps {
  items: TOCItem[];
  /** The heading the reader is currently at, highlighted in the list. */
  activeId?: string;
  /** Whether the list is folded away, leaving only the rail. */
  collapsed?: boolean;
  onToggle?: () => void;
  onHeadingClick: (id: string) => void;
  /** The locale seat; Chinese when the caller has no locale service. */
  t?: Translate;
}

/**
 * The document outline.
 *
 * It folds to a narrow rail rather than disappearing: on a narrow Sidebar the
 * 220px column is a real cost, but an outline with no way back would be a trap.
 */
export const TOC: React.FC<TOCProps> = ({
  items,
  activeId,
  collapsed = false,
  onToggle,
  onHeadingClick,
  t = fallbackT,
}) => {
  const label = collapsed ? t('toc.collapse') : t('toc.expand');
  return (
    <div className={`md-live-toc-container${collapsed ? ' is-collapsed' : ''}`}>
      <div className="md-live-toc-title">
        {collapsed ? null : <span>{t('toc.label')}</span>}
        <button
          type="button"
          className="md-live-toc-toggle"
          onClick={onToggle}
          title={label}
          aria-label={label}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
            <path
              d={collapsed ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8l4.5 4.5'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {collapsed ? null : (
        <nav className="md-live-toc-nav">
          {items.map((item, index) => (
            <a
              key={index}
              href={`#${item.id}`}
              className={`md-live-toc-item${item.id === activeId ? ' is-active' : ''}`}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              onClick={(e) => {
                e.preventDefault();
                onHeadingClick(item.id);
              }}
              title={item.text}
              aria-current={item.id === activeId ? 'location' : undefined}
            >
              {item.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
};
