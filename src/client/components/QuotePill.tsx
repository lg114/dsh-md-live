import React from 'react';
import type { Translate } from '../locales';

interface QuotePillProps {
  quote: { text: string; top: number; left: number } | null;
  notice: string;
  onAddQuote: () => void;
  t: Translate;
}

export function QuotePill({ quote, notice, onAddQuote, t }: QuotePillProps) {
  return (
    <>
      {quote ? (
        <button
          type="button"
          className="md-live-quote-btn"
          style={{ top: `${quote.top}px`, left: `${quote.left}px` }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void onAddQuote()}
        >
          {t('quote.action')}
        </button>
      ) : null}
      {notice ? (
        <div className="md-live-quote-notice" role="status">
          {notice}
        </div>
      ) : null}
    </>
  );
}
