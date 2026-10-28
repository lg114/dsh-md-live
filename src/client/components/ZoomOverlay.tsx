import React, { useEffect, useRef } from 'react';
import type { Translate } from '../locales';

interface ZoomOverlayProps {
  src: string | null;
  onClose: () => void;
  t?: Translate;
}

export function ZoomOverlay({ src, onClose, t }: ZoomOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    overlayRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;

  const label = t ? t('zoom.label') : 'Image zoom';

  return (
    <div
      ref={overlayRef}
      className="md-live-zoom-overlay"
      onClick={onClose}
      role="dialog"
      aria-label={label}
      aria-modal="true"
      tabIndex={-1}
    >
      <img
        className="md-live-zoom-image"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
