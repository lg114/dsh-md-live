import React from 'react';
import { TOCItem } from '../utils/markdown';

interface TOCProps {
  items: TOCItem[];
  onHeadingClick: (id: string) => void;
}

export const TOC: React.FC<TOCProps> = ({ items, onHeadingClick }) => {
  return (
    <div className="md-live-toc-container">
      <div className="md-live-toc-title">目录</div>
      <nav className="md-live-toc-nav">
        {items.map((item, index) => (
          <a
            key={index}
            href={`#${item.id}`}
            className="md-live-toc-item"
            style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
            onClick={(e) => {
              e.preventDefault();
              onHeadingClick(item.id);
            }}
            title={item.text}
          >
            {item.text}
          </a>
        ))}
      </nav>
    </div>
  );
};
