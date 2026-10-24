/**
 * Host half of dsh-md-live.
 *
 * The bundle needs a Host entry to be registered at all, but this plugin's
 * whole surface is the browser tab: it lists the workspace and reads files
 * through the Client's Remote face (`ctx.remote.workspaceFiles`), and keeps the
 * open file fresh with that face's own file watch. Nothing here needs to run in
 * Node.
 *
 * An earlier revision watched the workspace with chokidar and emitted
 * `md-live:*` events for the Client to consume. That path was dead: DSH has no
 * Host → Client event bridge, so those events never left the process, and the
 * watcher only cost I/O. Do not reintroduce a watcher here — extend the Client
 * half instead, or add a real Remote endpoint if a Host push ever becomes
 * necessary.
 */

export const name = 'dsh-md-live';

/** No Host services are required; the Client half declares its own. */
export const inject: string[] = [];

/** No-op: registering this package is the whole Host-side job. */
export function apply(): void {}
