import React from 'react';

interface ZoomOverlayProps {
  src: string | null;
  onClose: () => void;
}

export function ZoomOverlay({ src, onClose }: ZoomOverlayProps) {
  if (!src) return null;

  return (
    <div
      className="md-live-zoom-overlay"
      onClick={onClose}
      role="dialog"
      aria-label="Image zoom"
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
