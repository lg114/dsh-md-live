# dsh-md-live

English | [中文](README.zh.md)

A native Markdown preview **and editor** tab for the DSH Web right Sidebar.

Click `+` in the right Sidebar → pick `md-live` → choose a `.md` from the workspace. When the Agent or an external editor changes that file, the panel refreshes itself — no manual reload, no reopening. Press **编辑** to change the file in place; **保存** writes it back through the Host, inside the Session's own sandbox policy.

## Features

- **A real right-Sidebar tab** — registered through `ctx.sidebarRightTabs` + `sidebar.right.pane.tab`, the same mechanism as the Files and Terminal tabs. It is not a panel shoved into the main column.
- **Whole-workspace scan** — walks the entire tree from the Session's workspace root, eight listings in flight per level, drawing results level by level: the first level shows up while the rest is still being walked.
- **Editable filter rules** — `node_modules`, `.git`, `dist` and friends are skipped by default; the rules are edited in the panel, remembered per browser, and can be cleared to scan everything.
- **Live refresh** — driven by `remote.workspaceFiles.changes`. A manual refresh button only appears when watching turns out to be unavailable.
- **Edit and save in place** — **编辑** turns the document into a textarea over the same file; **保存** (or `Ctrl/Cmd+S`) writes it back. Saving is optimistic: the request carries the version the editor started from, and a file that changed underneath raises a dialog with **覆盖** and **重新加载** instead of quietly losing one side. A draft is guarded wherever the plugin navigates: the back arrow, another file from the picker, an Agent-follow switch and a browser unload all ask before they drop it, and a live update never overwrites a dirty draft.
- **Follows the Agent, even with the panel closed** — when the Agent finishes writing a `.md` inside the workspace, the panel opens on that file. The subscription is plugin-level and fed by `remote.session.follow` for whichever Session is on screen, so it works whether or not a tab was already open. The switch waits for `tool/result` rather than `tool/call`, so the file is read after the write landed instead of before it. One checkbox in the panel settings turns it off.
- **The Agent can ask, not just write** — a `preview_md` tool lets it put a document on screen on request ("show me the notes"). It is honoured even when automatic following is off, because that one was asked for.
- **The path is visible** — the header shows `directory/filename` relative to the workspace, with the absolute path in the tooltip. In a narrow panel the directory gives way first; the filename never truncates.
- **Images beside the document** — a relative `![](...)` path is resolved against the file's own directory and served by the Host's file endpoint, so a screenshot sitting next to the `.md` actually shows up.
- **Links do what they look like** — a link to another `.md` opens it in this tab, `#anchor` scrolls inside the document, and an `https://` link goes to the browser instead of navigating the app away.
- **Open it elsewhere** — hand the file to the OS default application, or reveal it in the file manager, straight from the header.
- **Search and recents** — filter the workspace list by any fragment of the path; the documents you opened last sit at the top.
- **Table of contents** — headings are extracted and their ids injected at render time, so the entries actually scroll. The heading you are reading is marked as you scroll, and the column folds to a rail when the panel is narrow.
- **Reading settings** — body size, leading and measure, remembered per browser. Every default is "follow the app", so the panel still obeys the app's own Markdown tokens until you say otherwise.
- **Safe rendering** — sanitised by DOMPurify (HTML profile): scripts, iframes, event attributes and `javascript:` URLs are stripped.
- **Syntax highlighting** — highlight.js with 27 languages registered on demand.
- **Math** — `$inline$` and `$$display$$` go through KaTeX. The output is MathML rather than KaTeX's own HTML: the HTML rendering needs KaTeX's web fonts, several hundred kilobytes the plugin has no way to serve, so the browser draws the maths itself.
- **Code blocks you can act on** — every block shows its language and a copy control on hover. The copy drops the trailing newline, so a pasted command does not run itself.
- **Front matter stays metadata** — a leading `---` block is lifted out of the prose and shown in a collapsed box, instead of turning into a stray horizontal rule and a `title: …` paragraph.
- **Follows the app's settings** — colours, font sizes and font families all read DSH's `--dsw-*` design tokens, so the light/dark appearance, the font-size stepper and any registered third-party theme carry over.
- **Speaks the app's language** — the panel's copy is one `md-live` locale namespace with `zh` and `en` dictionaries, so it follows the language picked in Settings → General and switches live: the slot renderer re-renders the body and the chip with a new `t` seat, no reload. Refusals travel as codes from the Host, so even a sandbox denial is phrased in the reader's language instead of arriving in the Host's Chinese.

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
├── file content    remote.workspaceFiles.readBytes → TextDecoder  (returns content + version)
├── live updates    remote.workspaceFiles.changes → $stream + accept()
├── following       remote.session.follow → tool/result → openRightbar + openTab  (plugin-level)
└── write          remote.mdLive.writeText(sessionId, path, content, version) → Host fs + session policy

Host (lib/index.js)
├── preview_md tool (optional): the Agent's only way to ask the panel for a file
└── mdLive Remote   (optional): MdLiveRemote service — session lookup → sandbox policy → resolve → stat → version check → writeText
```

Eight constraints worth knowing, each learned the hard way:

1. **`ctx.remote.*` returns a Result envelope**, not a bare value: `{ ok: true, value } | { ok: false, error }`. Reading fields off it yields `undefined` *without throwing* — which is exactly how an empty file list looks like an empty workspace.
2. **`list` / `readBytes` reject an empty path** with `path is required`. The scan must start from the Session's absolute cwd (the slot's standard prop `useSessions` → `byId[sessionId].cwd`).
3. **`changes` is a Remote stream**: wrap it in `remote.$stream({ name, open, ended })` and `accept()` every frame, or the uplink window fills and live updates stop silently.
4. **There is no Host → Client event bridge — but there is a Session stream.** `ctx.emit` on the Host never reaches the browser. What a Client *can* observe is `remote.session.follow`: a Remote stream carrying the Session's own events, `tool/call` and `tool/result` among them. That stream is the only reason "follow what the Agent writes" works at all, and it is why the Host half can stay empty.
5. **A client bundle must be `window.__ModuleLoader__.load({ id, factory })`**: executing the script only registers a factory, and the loader supplies `require` at materialization. Drop that wrapper and the bundle's `require("react")` runs at script scope, failing with `ReferenceError`.
6. **The official `MarkdownText` primitive is deliberately not reused.** It is in the browser module table and would save about 480 KB of bundle, but it renders from an mdast tree that emits raw HTML verbatim with no sanitiser, gives headings no `id`, and does no syntax highlighting — the three things this tab has to get right on arbitrary files from a workspace. Its KaTeX support and code-block toolbar are real; the toolbar was rebuilt here on top of the existing renderer, and maths is drawn as MathML rather than KaTeX's HTML (see Features).
7. **A custom Typert Remote can be hand-written without codegen.** The `mdLive/writeText` manifest is written by hand to match the shape `dsh-typert-generator` would emit. The Host service extends `TypertRemoteService` and places the Remote method marker on the prototype manually (the `@Remote` decorator needs Stage 3 decorator support in the build pipeline). The Gateway connects the descriptor's `namespace/method` to the prototype marker's `method` name. Registration is `new MdLiveRemote(ctx)` (the `Service` base constructor calls `ctx.reflect.provide`) plus `ctx.typert.register({ package, descriptors })`.
8. **The client-side Typert descriptors are hand-written separately from the Host manifest.** Importing the Host's `TYPERT` constant into the client bundle pulls in `zod` and `createTypertRemoteInfo` (~550 KB), but the Gateway only needs the descriptor metadata and `invoke` dispatcher on the client side — neither touches zod. So `src/client/descriptors.ts` hand-writes the same descriptor shape without the import cost. If the Host adds a new Remote method, the matching descriptor must be added there too; the two files are decoupled on purpose.

### Write path

`mdLive/writeText` is a custom Typert Remote because `workspaceFiles` exposes no mutation. Its wire signature is four positional parameters — `writeText(sessionId, path, content, version)` — and the first one is a `session` **lookup**, not a payload field: the Gateway resolves the id to the live Session through the registry entry `dsh-session` owns, so the Host method receives the Session itself. The browser cannot name a mode or a root; it only selects whose rules apply.

1. `ctx.sandboxPolicy.resolve({ session })` supplies the mode (the Session's `sandbox/mode` event, else the deployment default `DSH_PERMISSION_MODE ?? workspace-write`) and the writable root (`session.header.cwd`).
2. That policy is passed as `fs.writeText`'s fifth argument. `SandboxedFileSystem` re-canonicalises the target and checks containment against it — or refuses outright in `read-only`, or skips the fence in `danger-full-access`.
3. Omitting the argument is the bug this replaced: the backend then falls back to the deployment policy, whose root is the Host process's **cwd**, so every file outside the directory `dsh web` was launched from is refused — including the Session's own workspace.

Every fallback errs toward refusing: an unresolved lookup is retried as a plain id through `ctx.get('sessions')`; a Session that is gone is refused instead of guessed at; a composition without a `sandboxPolicy` service (plain `fs-local`) passes `undefined` and keeps the backend's behaviour; unrecognised I/O failures surface verbatim. What the write path deliberately does not do is widen its own authority — no retry against another root, no promotion to `danger-full-access`, no mode or root accepted from the client.

## Development

```bash
npm run build          # host (tsc) + client (esbuild)
npm run build:client   # client only
npm run verify         # both halves
npm run verify:client  # mount the built bundle in jsdom and run 85 end-to-end checks
npm run verify:host    # run the built Host half against a fake context: 28 checks
npm run clean
```

`verify:client` simulates DSH's module loader (register → materialize → `apply`), then mounts the tab body in jsdom. It covers registration and slot keys, unwrapping the Remote envelope, directory recursion, filter rules and their persistence, progressive rendering, live refresh, unmount cleanup, TOC anchors, sanitisation, highlighting, image and link resolution, the Host opener calls, search, recents, outline folding, reading settings, the code toolbar, front matter, following the Agent's writes, math, and the editor: dirty tracking, save, and the stale-version dialog. Run it after changing client code — it is far faster than clicking through the browser.

`verify:host` imports the built Host half and calls `apply` with a fake cordis context: what it injects, the tool's schema, the arguments it refuses, the descriptor's wire parameters, the per-call sandbox policy it forwards, how a denial is worded, and that a registry which throws costs the tool rather than the plugin. It cannot exercise a real Agent turn — that still needs the browser.

## Known limitations

- **Writes go through a custom Remote, not `workspaceFiles`**: `workspaceFiles` has no mutation API, so `mdLive/writeText` supplies one (see [Write path](#write-path)). Saving needs a *live* Session, because the mode and the root are both resolved from it; a Session that is not live is refused rather than written with a guessed mode. The Session id is client-supplied — a selector, not an authorization, since the Host alone decides the mode and root. That is also the official model: `workspaceFileScope` is a lookup over a client-supplied id, and DSH authenticates the *caller* (an owner Peer behind the Host/Origin fence, plus a process token), not which Session a call belongs to. A Remote handler never sees the Peer, so a plugin cannot tighten this by itself.
- **Following reads tool arguments, not the filesystem**: a `.md` the Agent rewrites through `bash` (`cat > x.md`, a heredoc) is not followed, because that call carries no path. `write`, `edit` and `str_replace_editor` are.
- **A draft cannot survive the tab being closed with its `×`**: the right Sidebar offers no per-tab close veto (`canCloseTab` only refuses the guide standing alone), so the body is unmounted and its draft with it. The guard covers every navigation the plugin starts — back, picker, follow — and the browser-level `beforeunload`, not an in-app close.
- **Following only watches the Session on screen**: a write in a background Session opens nothing, because that is not the conversation the reader is in.
- **`preview_md` does not verify the path**: the tool carries the request, and the panel resolves and reads it, so a wrong path surfaces in the panel rather than in the tool result. Resolving in both places would be two answers to one question, and the panel's is the one that gets used.
- **Filter rules match directory names only**: any depth, case-insensitive. No path globs such as `docs/archive`.
- **No Mermaid**: ```mermaid stays a highlighted code block with a copy control, not a diagram — see Roadmap for the measured cost.
- **A refusal code this build has not learned yet is shown verbatim**, in the Host's Chinese: the panel translates the codes it knows and falls back to the Host's own sentence otherwise.
- **Math is MathML, not KaTeX's HTML**: the browser's own renderer draws it, so no fonts or stylesheet are needed, but a few constructs look plainer than KaTeX's typesetting would.
- **Bundle size**: about 861 KB (marked + DOMPurify + KaTeX + 27 highlight.js language definitions). KaTeX alone is roughly 380 KB of that.

## Roadmap

- [x] Write API (custom Typert Remote `mdLive/writeText`, version-checked, fenced by the Session's sandbox policy)
- [x] Editor (textarea with dirty tracking, save, and a stale-version dialog)

Two items are deliberately absent, both for the same reason: every reader pays
for them, and only the few documents that use them benefit.

- **Lazy-loading the highlight.js languages** cannot work here. A Client bundle
  is one file per module id, loaded through `__ModuleLoader__.load({ id,
  factory })`, so there is nowhere to put a second chunk. Trimming the list was
  measured too — 27 languages down to 15 saves 133 KB and costs c, cpp, csharp,
  php, ruby, swift, kotlin, lua, perl, r, ini and scss.
- **Mermaid** was measured rather than guessed: bundling it adds 11.2 MB
  unminified and 5.0 MB minified. Its ESM entry is only 54 KB because it splits
  itself into dynamic imports, and this module format has to inline every one of
  them. A ```mermaid fence therefore stays a highlighted code block with a copy
  control, which is a fair trade for a 5 MB engine.

## Compatibility

- DSH >= 0.2.0 (requires `sidebarRightTabs`, `sidebar.right.pane.tab`, `remote.workspaceFiles`; `typert` for the write Remote; `locale` for the copy)
- The write path reads `sessions` and `sandboxPolicy` when the composition has them; without `sandboxPolicy` (plain `fs-local`) it passes no policy and keeps the backend's own behaviour
- `remote.session.openWorkspacePath` / `canOpenWorkspacePath` for the "open elsewhere" actions; the buttons hide themselves when the Host has no desktop to open them on
- `@deepseek-ai/dsh-tools` (pinned to the Host's own `0.2.1-rc.2`) for `preview_md`; the tool is skipped with a warning when the package cannot be loaded
- `katex` 0.16 for math; its minified build is imported directly, because the client bundle is deliberately not minified and the unminified entry is twice the size
- Node.js >= 18 (build time)
- React >= 18 (supplied by DSH's browser module table, not bundled)

## License

MIT
