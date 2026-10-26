# dsh-md-live

English | [中文](README.zh.md)

A native Markdown preview tab for the DSH Web right Sidebar.

Click `+` in the right Sidebar → pick `md-live` → choose a `.md` from the workspace. When the Agent or an external editor changes that file, the panel refreshes itself — no manual reload, no reopening.

## Features

- **A real right-Sidebar tab** — registered through `ctx.sidebarRightTabs` + `sidebar.right.pane.tab`, the same mechanism as the Files and Terminal tabs. It is not a panel shoved into the main column.
- **Whole-workspace scan** — walks the entire tree from the Session's workspace root, eight listings in flight per level, drawing results level by level: the first level shows up while the rest is still being walked.
- **Editable filter rules** — `node_modules`, `.git`, `dist` and friends are skipped by default; the rules are edited in the panel, remembered per browser, and can be cleared to scan everything.
- **Live refresh** — driven by `remote.workspaceFiles.changes`. A manual refresh button only appears when watching turns out to be unavailable.
- **Follows the Agent, even with the panel closed** — when the Agent finishes writing a `.md` inside the workspace, the panel opens on that file. The subscription is plugin-level and fed by `remote.session.follow` for whichever Session is on screen, so it works whether or not a tab was already open. The switch waits for `tool/result` rather than `tool/call`, so the file is read after the write landed instead of before it. One checkbox in the panel settings turns it off.
- **The path is visible** — the header shows `directory/filename` relative to the workspace, with the absolute path in the tooltip. In a narrow panel the directory gives way first; the filename never truncates.
- **Images beside the document** — a relative `![](...)` path is resolved against the file's own directory and served by the Host's file endpoint, so a screenshot sitting next to the `.md` actually shows up.
- **Links do what they look like** — a link to another `.md` opens it in this tab, `#anchor` scrolls inside the document, and an `https://` link goes to the browser instead of navigating the app away.
- **Open it elsewhere** — hand the file to the OS default application, or reveal it in the file manager, straight from the header.
- **Search and recents** — filter the workspace list by any fragment of the path; the documents you opened last sit at the top.
- **Table of contents** — headings are extracted and their ids injected at render time, so the entries actually scroll. The heading you are reading is marked as you scroll, and the column folds to a rail when the panel is narrow.
- **Reading settings** — body size, leading and measure, remembered per browser. Every default is "follow the app", so the panel still obeys the app's own Markdown tokens until you say otherwise.
- **Safe rendering** — sanitised by DOMPurify (HTML profile): scripts, iframes, event attributes and `javascript:` URLs are stripped.
- **Syntax highlighting** — highlight.js with 27 languages registered on demand.
- **Code blocks you can act on** — every block shows its language and a copy control on hover. The copy drops the trailing newline, so a pasted command does not run itself.
- **Front matter stays metadata** — a leading `---` block is lifted out of the prose and shown in a collapsed box, instead of turning into a stray horizontal rule and a `title: …` paragraph.
- **Follows the app's settings** — colours, font sizes and font families all read DSH's `--dsw-*` design tokens, so the light/dark appearance, the font-size stepper and any registered third-party theme carry over.

## Install

```bash
git clone https://github.com/lg114/dsh-md-live.git
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
├── live updates    remote.workspaceFiles.changes → $stream + accept()
└── following       remote.session.follow → tool/result → openRightbar + openTab  (plugin-level)

Host (lib/index.js)
└── an empty apply(): it registers the package, nothing else
```

Six constraints worth knowing, each learned the hard way:

1. **`ctx.remote.*` returns a Result envelope**, not a bare value: `{ ok: true, value } | { ok: false, error }`. Reading fields off it yields `undefined` *without throwing* — which is exactly how an empty file list looks like an empty workspace.
2. **`list` / `readBytes` reject an empty path** with `path is required`. The scan must start from the Session's absolute cwd (the slot's standard prop `useSessions` → `byId[sessionId].cwd`).
3. **`changes` is a Remote stream**: wrap it in `remote.$stream({ name, open, ended })` and `accept()` every frame, or the uplink window fills and live updates stop silently.
4. **There is no Host → Client event bridge — but there is a Session stream.** `ctx.emit` on the Host never reaches the browser. What a Client *can* observe is `remote.session.follow`: a Remote stream carrying the Session's own events, `tool/call` and `tool/result` among them. That stream is the only reason "follow what the Agent writes" works at all, and it is why the Host half can stay empty.
5. **A client bundle must be `window.__ModuleLoader__.load({ id, factory })`**: executing the script only registers a factory, and the loader supplies `require` at materialization. Drop that wrapper and the bundle's `require("react")` runs at script scope, failing with `ReferenceError`.
6. **The official `MarkdownText` primitive is deliberately not reused.** It is in the browser module table and would save about 480 KB of bundle, but it renders from an mdast tree that emits raw HTML verbatim with no sanitiser, gives headings no `id`, and does no syntax highlighting — the three things this tab has to get right on arbitrary files from a workspace. Its KaTeX support and code-block toolbar are real; the toolbar was rebuilt here on top of the existing renderer instead, and KaTeX is still missing.

## Development

```bash
npm run build          # host (tsc) + client (esbuild)
npm run build:client   # client only
npm run verify:client  # mount the built bundle in jsdom and run 64 end-to-end checks
npm run clean
```

`verify:client` simulates DSH's module loader (register → materialize → `apply`), then mounts the tab body in jsdom. It covers registration and slot keys, unwrapping the Remote envelope, directory recursion, filter rules and their persistence, progressive rendering, live refresh, unmount cleanup, TOC anchors, sanitisation, highlighting, image and link resolution, the Host opener calls, search, recents, outline folding, reading settings, the code toolbar, front matter, and following the Agent's writes. Run it after changing client code — it is far faster than clicking through the browser.

## Known limitations

- **Read-only**: `workspaceFiles` has no write API, so there is no editor and no saving.
- **Following reads tool arguments, not the filesystem**: a `.md` the Agent rewrites through `bash` (`cat > x.md`, a heredoc) is not followed, because that call carries no path. `write`, `edit` and `str_replace_editor` are.
- **Following only watches the Session on screen**: a write in a background Session opens nothing, because that is not the conversation the reader is in.
- **Filter rules match directory names only**: any depth, case-insensitive. No path globs such as `docs/archive`.
- **No Mermaid or KaTeX**: `$$...$$` and ```mermaid render as plain text.
- **Bundle size**: about 497 KB (marked + DOMPurify + 27 highlight.js language definitions).

## Roadmap

- [ ] Lazy-load highlight.js languages to shrink the first payload further
- [ ] Mermaid / KaTeX
- [ ] Edit and save (needs a write API)
- [ ] A `preview_md` Agent tool, so the Agent can show a file deliberately rather than only after writing one (needs a Host-side tool registration; the client half already listens)

## Compatibility

- DSH >= 0.2.0 (requires `sidebarRightTabs`, `sidebar.right.pane.tab`, `remote.workspaceFiles`)
- `remote.session.openWorkspacePath` / `canOpenWorkspacePath` for the "open elsewhere" actions; the buttons hide themselves when the Host has no desktop to open them on
- Node.js >= 18 (build time)
- React >= 18 (supplied by DSH's browser module table, not bundled)

## License

MIT
