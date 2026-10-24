# dsh-md-live

English | [中文](README.zh.md)

A native Markdown preview tab for the DSH Web right Sidebar.

Click `+` in the right Sidebar → pick `md-live` → choose a `.md` from the workspace. When the Agent or an external editor changes that file, the panel refreshes itself — no manual reload, no reopening.

## Features

- **A real right-Sidebar tab** — registered through `ctx.sidebarRightTabs` + `sidebar.right.pane.tab`, the same mechanism as the Files and Terminal tabs. It is not a panel shoved into the main column.
- **Whole-workspace scan** — walks the entire tree from the Session's workspace root, eight listings in flight per level, drawing results level by level: the first level shows up while the rest is still being walked.
- **Editable filter rules** — `node_modules`, `.git`, `dist` and friends are skipped by default; the rules are edited in the panel, remembered per browser, and can be cleared to scan everything.
- **Live refresh** — driven by `remote.workspaceFiles.changes`. A manual refresh button only appears when watching turns out to be unavailable.
- **The path is visible** — the header shows `directory/filename` relative to the workspace, with the absolute path in the tooltip. In a narrow panel the directory gives way first; the filename never truncates.
- **Table of contents** — headings are extracted and their ids injected at render time, so the entries actually scroll.
- **Safe rendering** — sanitised by DOMPurify (HTML profile): scripts, iframes, event attributes and `javascript:` URLs are stripped.
- **Syntax highlighting** — highlight.js with 27 languages registered on demand.
- **Follows the app's settings** — colours, font sizes and font families all read DSH's `--dsw-*` design tokens, so the light/dark appearance, the font-size stepper and any registered third-party theme carry over.

## Install

```bash
git clone <your-repo-url>
cd dsh-md-live
npm install
npm run build

# install into the web profile
dsh plugin --profile web add .
```

Restart the harness and reload the page. The `dsh.client` declaration in `package.json` makes the Host serve `lib/client.cjs` as this package's Client half automatically — no extra patch row is needed.

## Usage

1. Click `+` at the top of the right Sidebar and pick **md-live** from the guide.
2. Pick a `.md` from the file list.
3. To switch files, click the `←` to the left of the title.

The `N directories skipped (M rules)` line at the bottom of the list opens the rule editor: one directory name per line. Saving rescans immediately; "restore defaults" brings back the built-in list; "show everything" clears the rules so `.md` files inside `node_modules` are listed too.

Rules live in `localStorage` under `dsh-md-live.skip-dirs.v1` — per browser, never written back to the profile config.

## How it works

```
Client (everything happens here)
├── tab type        sidebarRightTabs.register({ id, kind, title, guide })
├── body/title      keyed slots, key = id
├── file list       remote.workspaceFiles.list   BFS by level + concurrency + progressive
├── file content    remote.workspaceFiles.readBytes → TextDecoder
└── live updates    remote.workspaceFiles.changes → $stream + accept()

Host (lib/index.js)
└── an empty apply(): it registers the package, nothing else
```

Five constraints worth knowing, each learned the hard way:

1. **`ctx.remote.*` returns a Result envelope**, not a bare value: `{ ok: true, value } | { ok: false, error }`. Reading fields off it yields `undefined` *without throwing* — which is exactly how an empty file list looks like an empty workspace.
2. **`list` / `readBytes` reject an empty path** with `path is required`. The scan must start from the Session's absolute cwd (the slot's standard prop `useSessions` → `byId[sessionId].cwd`).
3. **`changes` is a Remote stream**: wrap it in `remote.$stream({ name, open, ended })` and `accept()` every frame, or the uplink window fills and live updates stop silently.
4. **There is no Host → Client event bridge.** Client plugins can only use `ctx.remote.*` request/response and streams; `ctx.emit` on the Host never reaches the browser. That is why this plugin's Host half is empty.
5. **A client bundle must be `window.__ModuleLoader__.load({ id, factory })`**: executing the script only registers a factory, and the loader supplies `require` at materialization. Drop that wrapper and the bundle's `require("react")` runs at script scope, failing with `ReferenceError`.

## Development

```bash
npm run build          # host (tsc) + client (esbuild)
npm run build:client   # client only
npm run verify:client  # mount the built bundle in jsdom and run 35 end-to-end checks
npm run clean
```

`verify:client` simulates DSH's module loader (register → materialize → `apply`), then mounts the tab body in jsdom. It covers registration and slot keys, unwrapping the Remote envelope, directory recursion, filter rules and their persistence, progressive rendering, live refresh, unmount cleanup, TOC anchors, sanitisation and highlighting. Run it after changing client code — it is far faster than clicking through the browser.

## Known limitations

- **Read-only**: `workspaceFiles` has no write API, so there is no editor and no saving.
- **No auto-open**: with no Host → Client push channel, "open the panel when the Agent writes a `.md`" needs a custom Remote or a session-stream subscription. Not implemented.
- **Relative images do not resolve**: `![](...)` paths are not rewritten to `dsh-resource://` addresses, so they render broken.
- **Filter rules match directory names only**: any depth, case-insensitive. No path globs such as `docs/archive`.
- **No Mermaid or KaTeX**: `$$...$$` and ```mermaid render as plain text.
- **Bundle size**: about 460 KB (marked + DOMPurify + 27 highlight.js language definitions).

## Roadmap

- [ ] Lazy-load highlight.js languages to shrink the first payload further
- [ ] Relative-path images (rewrite to `dsh-resource://`)
- [ ] Mermaid / KaTeX
- [ ] Edit and save (needs a write API)
- [ ] Auto-open when the Agent writes (needs a real Host → Client channel)

## Compatibility

- DSH >= 0.2.0 (requires `sidebarRightTabs`, `sidebar.right.pane.tab`, `remote.workspaceFiles`)
- Node.js >= 18 (build time)
- React >= 18 (supplied by DSH's browser module table, not bundled)

## License

MIT
