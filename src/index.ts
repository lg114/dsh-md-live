import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';

export interface Config {
  /** Workspace root path to watch */
  workspacePath?: string;
  /** File extensions to watch (default: ['.md', '.markdown']) */
  extensions?: string[];
  /** Enable debug logging */
  debug?: boolean;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  content?: string;
  timestamp: number;
}

export const name = 'dsh-md-live';

export function apply(ctx: any, config: Config = {}) {
  const {
    workspacePath = process.cwd(),
    extensions = ['.md', '.markdown'],
    debug = false,
  } = config;

  const log = (...args: any[]) => {
    if (debug) console.log('[dsh-md-live]', ...args);
  };

  // Store active watchers
  const watchers = new Map<string, chokidar.FSWatcher>();
  
  // Store file contents cache
  const fileCache = new Map<string, { content: string; mtime: number }>();

  // Register RPC methods for client communication
  ctx.rpc?.register('md-live:read-file', async (filePath: string) => {
    try {
      const absolutePath = path.resolve(workspacePath, filePath);
      
      // Security check: ensure path is within workspace
      if (!absolutePath.startsWith(path.resolve(workspacePath))) {
        throw new Error('Access denied: path outside workspace');
      }
      
      const content = await fs.promises.readFile(absolutePath, 'utf-8');
      const stat = await fs.promises.stat(absolutePath);
      
      fileCache.set(filePath, { content, mtime: stat.mtimeMs });
      
      return { content, mtime: stat.mtimeMs };
    } catch (err: any) {
      log('Error reading file:', err.message);
      throw err;
    }
  });

  ctx.rpc?.register('md-live:list-files', async (subdir: string = '') => {
    try {
      const targetPath = path.resolve(workspacePath, subdir);
      
      // Security check
      if (!targetPath.startsWith(path.resolve(workspacePath))) {
        throw new Error('Access denied: path outside workspace');
      }
      
      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && extensions.some(ext => entry.name.endsWith(ext)))
        .map(entry => ({
          name: entry.name,
          path: path.join(subdir, entry.name),
        }));
      
      return files;
    } catch (err: any) {
      log('Error listing files:', err.message);
      throw err;
    }
  });

  // Watch workspace for file changes
  const startWatching = () => {
    const watchPatterns = extensions.map(ext => `**/*${ext}`);
    
    log('Starting file watcher at:', workspacePath);
    log('Watching patterns:', watchPatterns);

    const watcher = chokidar.watch(watchPatterns, {
      cwd: workspacePath,
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    watcher
      .on('add', (filePath) => {
        log('File added:', filePath);
        handleFileEvent('add', filePath);
      })
      .on('change', (filePath) => {
        log('File changed:', filePath);
        handleFileEvent('change', filePath);
      })
      .on('unlink', (filePath) => {
        log('File unlinked:', filePath);
        handleFileEvent('unlink', filePath);
      });

    watchers.set('main', watcher);
  };

  const handleFileEvent = async (type: 'add' | 'change' | 'unlink', filePath: string) => {
    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: Date.now(),
    };

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

    // Emit event to client
    ctx.emit?.('md-live:file-changed', event);
  };

  // Start watching
  startWatching();

  // Cleanup on dispose
  ctx.effect?.(() => {
    log('Cleaning up watchers');
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    fileCache.clear();
  });

  // Optional: Register tools for agent use
  ctx.tools?.register('preview_md', {
    description: 'Preview a markdown file in the live preview panel',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the markdown file relative to workspace',
        },
      },
      required: ['filePath'],
    },
    execute: async ({ filePath }: { filePath: string }) => {
      ctx.emit?.('md-live:open-file', { path: filePath });
      return { success: true, message: `Opening ${filePath} in preview panel` };
    },
  });

  ctx.tools?.register('export_md', {
    description: 'Export markdown to HTML or PDF',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the markdown file',
        },
        format: {
          type: 'string',
          enum: ['html', 'pdf'],
          description: 'Export format',
        },
      },
      required: ['filePath', 'format'],
    },
    execute: async ({ filePath, format }: { filePath: string; format: 'html' | 'pdf' }) => {
      ctx.emit?.('md-live:export', { path: filePath, format });
      return { success: true, message: `Exporting ${filePath} as ${format}` };
    },
  });

  log('Plugin initialized successfully');
}
