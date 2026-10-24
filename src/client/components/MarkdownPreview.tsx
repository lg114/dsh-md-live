import React, { useState, useEffect, useCallback, useRef } from 'react';
import { renderMarkdown, extractTOC, sanitizeHtml, TOCItem } from '../utils/markdown';
import { TOC } from './TOC';

interface MarkdownPreviewPanelProps {
  onClose?: () => void;
  ctx?: any;
}

export const MarkdownPreviewPanel: React.FC<MarkdownPreviewPanelProps> = ({ onClose, ctx }) => {
  const [content, setContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Load file content (from event data, not RPC)
  const loadFile = useCallback((path: string, fileContent?: string) => {
    if (fileContent) {
      setContent(fileContent);
      setEditContent(fileContent);
      setFilePath(path);
      setToc(extractTOC(fileContent));
    } else {
      // No content provided, just update path
      setFilePath(path);
      setContent('');
      setEditContent('');
      setToc([]);
    }
  }, []);

  // Listen for file open events
  useEffect(() => {
    if (!ctx?.on) return;

    const handler = (data: { path: string; content?: string }) => {
      loadFile(data.path, data.content);
    };

    ctx.on('md-live:client-open-file', handler);
    return () => ctx.off?.('md-live:client-open-file', handler);
  }, [ctx, loadFile]);

  // Listen for file change events from host
  useEffect(() => {
    if (!ctx?.on) return;

    const handler = (event: any) => {
      if (event.path === filePath && event.content) {
        setContent(event.content);
        setEditContent(event.content);
        setToc(extractTOC(event.content));
      }
    };

    ctx.on('md-live:file-changed', handler);
    return () => ctx.off?.('md-live:file-changed', handler);
  }, [ctx, filePath]);

  // Handle edit with debounce
  const handleEdit = useCallback((value: string) => {
    setEditContent(value);
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setContent(value);
      setToc(extractTOC(value));
    }, 200);

    setDebounceTimer(timer);
  }, [debounceTimer]);

  // Handle text selection and send to chat
  const handleSendSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !ctx) return;

    const selectedText = selection.toString();
    if (!selectedText.trim()) return;

    // Send to chat via RPC
    ctx.rpc?.call('session.prompt', {
      content: `关于这段内容：\n\n${selectedText}\n\n请帮我`,
      source: { kind: 'plugin', plugin: 'dsh-md-live' },
    });
  }, [ctx]);

  // Handle export
  const handleExport = useCallback(async (format: 'html' | 'pdf') => {
    if (!ctx) return;
    
    try {
      await ctx.rpc?.call('md-live:export', { path: filePath, format });
    } catch (err) {
      console.error('[dsh-md-live] Export error:', err);
    }
  }, [ctx, filePath]);

  // Handle close with dismiss tracking
  const handleClose = useCallback(() => {
    // Notify host that user dismissed the preview (for auto-open cooldown)
    if (filePath) {
      ctx?.emit?.('md-live:user-dismiss', { path: filePath });
    }
    onClose?.();
  }, [ctx, filePath, onClose]);

  // Scroll to heading
  const scrollToHeading = useCallback((id: string) => {
    if (!previewRef.current) return;
    
    const element = previewRef.current.querySelector(`#${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const renderedHtml = sanitizeHtml(renderMarkdown(content));

  return (
    <div className="md-live-panel">
      <div className="md-live-header">
        <div className="md-live-title">
          <span className="md-live-icon">📄</span>
          <span>{filePath || 'Markdown Preview'}</span>
        </div>
        <div className="md-live-actions">
          <button
            className="md-live-btn"
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'Preview only' : 'Edit mode'}
          >
            {isEditing ? '👁' : '✏️'}
          </button>
          <button
            className="md-live-btn"
            onClick={() => handleExport('html')}
            title="Export as HTML"
          >
            📤
          </button>
          {onClose && (
            <button className="md-live-btn" onClick={handleClose} title="Close preview">
              
            </button>
          )}
        </div>
      </div>

      <div className="md-live-content">
        {isEditing ? (
          <div className="md-live-split">
            <div className="md-live-editor">
              <textarea
                value={editContent}
                onChange={(e) => handleEdit(e.target.value)}
                placeholder="Start typing markdown..."
                className="md-live-textarea"
              />
            </div>
            <div className="md-live-preview" ref={previewRef}>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          </div>
        ) : (
          <div className="md-live-split">
            {toc.length > 0 && (
              <div className="md-live-toc">
                <TOC items={toc} onHeadingClick={scrollToHeading} />
              </div>
            )}
            <div className="md-live-preview" ref={previewRef}>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                onMouseUp={handleSendSelection}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
