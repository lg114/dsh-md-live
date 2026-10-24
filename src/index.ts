import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';

export interface Config {
  workspacePath?: string;
  extensions?: string[];
  debug?: boolean;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  content?: string;
  timestamp: number;
}

export const name = 'dsh-md-live';
export const inject: string[] = [];

const recentToolWrites = new Map<string, number>();
const DEDUP_WINDOW_MS = 500;
const userDismissals = new Map<string, number>();
const USER_DISMISS_TIMEOUT_MS = 30 * 60 * 1000;

const WRITE_TOOL_NAMES = new Set([
  'write', 'edit', 'file_write', 'file_edit',
  'create_file', 'search_replace', 'write_file',
]);

export function apply(ctx: any, config: Config = {}) {
  const {
    workspacePath = process.cwd(),
    extensions = ['.md', '.markdown'],
    debug = true,
  } = config;

  const log = (...args: any[]) => {
    if (debug) console.log('[dsh-md-live HOST]', ...args);
  };

  log('=== HOST START ===');
  log('ctx keys:', Object.keys(ctx));
  log('workspacePath:', workspacePath);

  const watchers = new Map<string, chokidar.FSWatcher>();
  const fileCache = new Map<string, { content: string; mtime: number }>();

  // File watcher
  const startWatching = () => {
    const watchPatterns = extensions.map(ext => `**/*${ext}`);
    log('Starting file watcher at:', workspacePath);

    const watcher = chokidar.watch(watchPatterns, {
      cwd: workspacePath,
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    watcher
      .on('add', (filePath) => { log('File added:', filePath); handleFileEvent('add', filePath); })
      .on('change', (filePath) => { log('File changed:', filePath); handleFileEvent('change', filePath); })
      .on('unlink', (filePath) => { log('File unlinked:', filePath); handleFileEvent('unlink', filePath); });

    watchers.set('main', watcher);
  };

  const handleFileEvent = async (type: 'add' | 'change' | 'unlink', filePath: string) => {
    const event: FileChangeEvent = { type, path: filePath, timestamp: Date.now() };

    if (type !== 'unlink') {
      try {
        const absolutePath = path.resolve(workspacePath, filePath);
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        event.content = content;
        fileCache.set(filePath, { content, mtime: event.timestamp });
      } catch (err: any) {
        log('Error reading file for event:', err.message);
      }
    } else {
      fileCache.delete(filePath);
    }

    log('Emitting md-live:file-changed:', event.path);
    ctx.emit?.('md-live:file-changed', event);
  };

  startWatching();

  // Listen for Agent tool completions
  if (ctx.on) {
    ctx.on('tools/result', async (exec: any, result: any) => {
      const toolName = (exec?.name || '').toLowerCase();
      const args = exec?.arguments || {};
      const filePath = args.path || args.file_path || args.file || args.target || args.uri || '';
      
      const isWriteTool = WRITE_TOOL_NAMES.has(toolName);
      
      if (isWriteTool && filePath && (filePath.endsWith('.md') || filePath.endsWith('.markdown'))) {
        const now = Date.now();
        recentToolWrites.set(filePath, now);
        
        log('✓ Agent wrote .md file:', filePath, 'via tool:', toolName);
        await handleFileEvent('change', filePath);
        
        const lastDismiss = userDismissals.get(filePath) || 0;
        if (now - lastDismiss > USER_DISMISS_TIMEOUT_MS) {
          log('→ Emitting md-live:auto-open for:', filePath);
          const cachedFile = fileCache.get(filePath);
          ctx.emit?.('md-live:auto-open', { 
            path: filePath,
            content: cachedFile?.content 
          });
        } else {
          log(' Skipping auto-open (user dismissed recently)');
        }
      }
    });
    log('✓ tools/result listener registered');

    ctx.on('fs/observed', (target: string) => {
      if (target && (target.endsWith('.md') || target.endsWith('.markdown'))) {
        const lastToolWrite = recentToolWrites.get(target) || 0;
        if (Date.now() - lastToolWrite > DEDUP_WINDOW_MS) {
          log('File observed:', target);
          handleFileEvent('change', target);
        }
      }
    });
    log('✓ fs/observed listener registered');

    ctx.on('md-live:user-dismiss', (data: { path: string }) => {
      if (data?.path) {
        userDismissals.set(data.path, Date.now());
        log('User dismissed preview for:', data.path);
      }
    });
    log('✓ user-dismiss listener registered');
  } else {
    log(' ctx.on not available');
  }

  // Cleanup
  ctx.effect?.(() => {
    log('Cleaning up watchers');
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    fileCache.clear();
    recentToolWrites.clear();
    userDismissals.clear();
  });

  log('=== HOST READY ===');
}
