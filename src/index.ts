/**
 * Host half of dsh-md-live.
 *
 * The plugin's surface is the browser tab: it lists the workspace and reads
 * files through the Client's Remote face (`ctx.remote.workspaceFiles`), and
 * keeps the open file fresh with that face's own file watch.
 *
 * Two things run in Node:
 *
 * 1. The Agent has no way to ask the panel for anything, because the Client
 *    only ever observes the Session. A tool call is the one thing it can emit
 *    that the Client can see, so `preview_md` exists here for no other reason
 *    than to be that signal — the Client reacts to the `tool/call` frame and
 *    opens the file.
 *
 * 2. `workspaceFiles` has no write API, so saving edits from the panel needs a
 *    custom Typert Remote (`mdLive/writeText`). The `MdLiveRemote` service is
 *    registered here when the composition has a `typert` service, and its
 *    manifest is committed to the Typert registry so the Gateway can route
 *    client calls to it.
 *
 * An earlier revision watched the workspace with chokidar and emitted
 * `md-live:*` events for the Client to consume. That path was dead: DSH has no
 * Host → Client event bridge, so those events never left the process, and the
 * watcher only cost I/O. Do not reintroduce a watcher here.
 */
import { MdLiveRemote } from './host/md-live-remote.js';
import { TYPERT } from './host/md-live-typert.js';

export const name = 'dsh-md-live';

/**
 * No Host service is required to register this package.
 *
 * The tool registry and the typert registry are both optional: a composition
 * without them still gets the tab, and `apply` simply skips the corresponding
 * registration.
 */
export const inject: string[] = [];

/**
 * Register the Remote write service and the Agent-facing `preview_md` tool.
 *
 * Both are guarded by `ctx.inject` so the plugin keeps loading in compositions
 * that lack `typert` or `tools` — the tab works for reading either way.
 *
 * @param ctx - Host context.
 */
export function apply(ctx: any): void {
  ctx.inject(['typert'], (typertCtx: any) => {
    void registerRemoteService(typertCtx);
  });

  ctx.inject(['tools'], (toolsCtx: any) => {
    void registerPreviewTool(toolsCtx);
  });
}

/**
 * Instantiate the write Remote and commit its manifest to the Typert registry.
 *
 * The `new MdLiveRemote(ctx)` call triggers the Cordis `Service` base
 * constructor, which registers the instance as `ctx.mdLive`. The manifest
 * registration tells the Gateway how to decode wire-level calls into the
 * method's positional parameters.
 *
 * A failure here costs the write capability and nothing else — the tab still
 * opens, reads, and watches files through `workspaceFiles`.
 *
 * @param ctx - Host context scoped to include `typert`.
 */
function registerRemoteService(ctx: any): void {
  try {
    new MdLiveRemote(ctx);
    ctx.typert.register({
      package: 'dsh-md-live',
      face: 'host' as const,
      schemas: [],
      invocations: TYPERT.invocations,
    });
  } catch (err) {
    console.warn('[dsh-md-live] Remote 写入服务未注册：', err);
  }
}

/**
 * Build and register the tool.
 *
 * The package is imported dynamically and every failure is swallowed: a plugin
 * whose Host half throws does not load, and losing the tab because an optional
 * tool could not be built would be a bad trade. A missing or mismatched
 * `@deepseek-ai/dsh-tools` therefore costs the tool and nothing else.
 *
 * The tool resolves nothing. The panel already knows the Session's workspace
 * root and the Host's view of it, and a second resolution here would be a
 * second source of truth for the same path — one that could disagree with the
 * one the panel then uses.
 *
 * @param ctx - Host context whose `tools` service receives the definition.
 */
async function registerPreviewTool(ctx: any): Promise<void> {
  try {
    const { defineTool } = await import('@deepseek-ai/dsh-tools');
    ctx.tools.register(
      defineTool({
        name: 'preview_md',
        description:
          'Open a Markdown file in the md-live panel on the right, so the user can read it. ' +
          'Use it when the user asks to see, open, or show a Markdown document. ' +
          'Read-only: it never modifies the file.',
        parameters: {
          path: {
            type: 'string',
            required: true,
            description: 'Markdown file to show. A relative path is resolved against the Session workspace.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: {
                type: 'string',
                required: true,
                description: 'The path handed to the panel, unchanged.',
              },
            },
          },
          render: (_args: any, value: any) => [
            { type: 'text', text: `已请求在 md-live 面板中打开 ${value.path}` },
          ],
        },
        async execute(args: any) {
          const path = typeof args?.path === 'string' ? args.path.trim() : '';
          if (!path) throw new Error('preview_md 需要一个文件路径');
          if (!/\.(md|markdown|mdx)$/i.test(path)) {
            throw new Error(`preview_md 只能打开 Markdown 文件：${path}`);
          }
          // The panel resolves and reads it; the tool only carries the request.
          return { path };
        },
      }),
    );
  } catch (err) {
    console.warn('[dsh-md-live] preview_md 未注册：', err);
  }
}
