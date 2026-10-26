/**
 * Host half of dsh-md-live.
 *
 * The plugin's surface is the browser tab: it lists the workspace and reads
 * files through the Client's Remote face (`ctx.remote.workspaceFiles`), and
 * keeps the open file fresh with that face's own file watch. Nothing about
 * *showing* a document needs to run in Node.
 *
 * One thing does: the Agent has no way to ask the panel for anything, because
 * the Client only ever observes the Session. A tool call is the one thing it
 * can emit that the Client can see, so `preview_md` exists here for no other
 * reason than to be that signal — the Client reacts to the `tool/call` frame and
 * opens the file.
 *
 * An earlier revision watched the workspace with chokidar and emitted
 * `md-live:*` events for the Client to consume. That path was dead: DSH has no
 * Host → Client event bridge, so those events never left the process, and the
 * watcher only cost I/O. Do not reintroduce a watcher here.
 */

export const name = 'dsh-md-live';

/**
 * No Host service is required to register this package.
 *
 * The tool registry is optional: a composition without one still gets the tab,
 * and `apply` simply never registers the tool.
 */
export const inject: string[] = [];

/**
 * Register the Agent-facing `preview_md` tool when a tool registry exists.
 *
 * `ctx.inject` scopes the work to compositions that actually have one, so this
 * plugin keeps loading in a Host that does not run an Agent at all.
 *
 * @param ctx - Host context.
 */
export function apply(ctx: any): void {
  ctx.inject(['tools'], (toolsCtx: any) => {
    void registerPreviewTool(toolsCtx);
  });
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
