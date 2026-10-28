import React, { useEffect, useRef } from 'react';
import type { Translate } from '../locales';

interface StaleDialogProps {
  show: boolean;
  onClose: () => void;
  onReload: () => void;
  onOverwrite: () => void;
  t: Translate;
}

export function StaleDialog({ show, onClose, onReload, onOverwrite, t }: StaleDialogProps) {
  const reloadBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => reloadBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="md-live-dialog-overlay">
      <div className="md-live-dialog" role="alertdialog" aria-label={t('stale.title')}>
        <p className="md-live-dialog-title">{t('stale.title')}</p>
        <p className="md-live-dialog-body">{t('stale.body')}</p>
        <div className="md-live-dialog-actions">
          <button ref={reloadBtnRef} className="md-live-btn" onClick={onReload}>
            {t('stale.reload')}
          </button>
          <button className="md-live-btn md-live-btn-primary" onClick={onOverwrite}>
            {t('stale.overwrite')}
          </button>
        </div>
      </div>
    </div>
  );
}
