import React from 'react';
import { MarkdownPreviewPanel } from './components/MarkdownPreview';

const PANEL_ID = 'md-live-preview';

export const inject = ['slots'] as const;

export function apply(ctx: any) {
  // Register the panel content in the 'main' slot
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: PANEL_ID, locale: 'md-live' },
      (props: any) => (
        <MarkdownPreviewPanel
          {...props}
          onClose={() => ctx.layout?.selectPanel?.(null)}
          ctx={ctx}
        />
      )
    )
  );

  // Register the sidebar icon in 'sidebar.panellist'
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 40,
        label: () => 'Markdown Preview',
      },
      () => (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3h14a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1zm1 2v10h12V5H4zm2 2h8v1H6V7zm0 3h8v1H6v-1zm0 3h5v1H6v-1z" />
        </svg>
      )
    )
  );

  // Listen for file open events from host
  ctx.on?.('md-live:open-file', (data: { path: string }) => {
    ctx.layout?.selectPanel?.(PANEL_ID);
    ctx.emit?.('md-live:client-open-file', data);
  });
}
