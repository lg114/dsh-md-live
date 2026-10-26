# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Writing from the panel, fenced by the right policy.

### Fixed

- Saving a file in the Session workspace no longer fails with "文件不在工作区内，
  无法写入". `mdLive/writeText` takes the Session id as its first wire parameter
  (a `session` lookup, resolved by the Host to the live Session), asks
  `ctx.sandboxPolicy` for that Session's mode and workspace root, and passes the
  result to `fs.writeText` as the per-call fence. Without it the backend fell
  back to the deployment default — `workspace-write` rooted at the Host
  process's cwd — so every file outside the directory `dsh web` was launched
  from was refused, the Session's own workspace included. Starting the server
  from the workspace directory only ever hid that by accident.
- A refusal no longer claims the file is outside the workspace. The message now
  names the sandbox mode and the root it allows, and a read-only mode reads as
  a read-only refusal instead of a containment failure — the two used to be
  indistinguishable because both arrive as "access denied".

### Changed

- `writeText` takes four positional arguments: `sessionId`, `path`, `content`,
  `version`. The panel passes the tab's own Session id and reports "没有会话
  上下文，无法保存" rather than writing with no policy at all.
- The client no longer rewrites path separators before the call: the Host
  normalizes the path, and the tab already holds the absolute spelling the
  workspace listing used.
- `verify:host` gained the policy-forwarding check and the denial-message
  check; the client suite now asserts the Session id rides along with a save.

### Documentation

- Both READMEs describe the editor and document the write path: the four wire
  parameters, the `session` lookup, how the policy is resolved and applied, and
  what the fallbacks deliberately refuse to do. The Roadmap's write-API and
  editor items are ticked, and the stale "KaTeX is still missing" and "renders
  as plain text" notes are gone.

## [0.8.0] - 2026-10-26

Math, at a price the next reader should know about.

### Added

- `$inline$` and `$$display$$` render through KaTeX. They are marked
  extensions rather than a text pass, so an expression inside a code span or a
  fence is left alone — those are tokenised first. The extensions emit a
  placeholder carrying the TeX, and the expression is drawn on the live DOM
  after sanitising: the sanitiser's job stays exactly what it was, and KaTeX's
  markup never passes through the HTML string at all.
- `verify:client` grew from 65 to 69 checks: inline math, display math, math
  inside a fence staying literal, and an unparseable expression neither throwing
  nor disappearing.

### Changed

- Output is MathML rather than KaTeX's HTML. The HTML rendering depends on
  KaTeX's own web fonts — several hundred kilobytes the plugin has no way to
  serve — and without them the metrics are wrong and glyphs collide. The browser
  draws MathML itself, so it needs neither the fonts nor the stylesheet.
- KaTeX's minified build is imported directly. The client bundle is deliberately
  not minified, so importing the package entry expanded to 620 KB; the minified
  file costs about 380 KB instead.

### Notes

- The bundle is now about 877 KB, most of the growth being KaTeX. That is what
  math costs without code splitting, and this module format — one file per id,
  loaded by `__ModuleLoader__` — has no way to split.

## [0.7.0] - 2026-10-26

The Agent can now ask for a document instead of only producing one.

### Added

- `preview_md`, an Agent tool registered by the Host half: "show me the notes"
  now puts that file in the panel, with nothing written first. The Client reacts
  to the `tool/call` frame, so the tool's own body only carries the request. It
  is honoured even when automatic following is switched off — that checkbox
  governs what happens on its own, not what was asked for.
- `npm run verify:host`, nine checks that run the built Host half against a fake
  cordis context: what it injects, the tool's schema, the arguments it refuses,
  and that a registry which throws costs the tool rather than the plugin.

### Changed

- The Host half is no longer an empty `apply()`. It registers the tool through
  `ctx.inject(['tools'], …)`, so a composition without a tool registry still
  loads the plugin, and the `@deepseek-ai/dsh-tools` import is dynamic and
  guarded: a missing or mismatched package warns and skips.
- `npm run verify` now runs both halves.

### Notes

- The tool resolves no paths. The panel already answers that question, and a
  second answer here could disagree with the one the panel then uses.

## [0.6.0] - 2026-10-26

The tab stops waiting to be opened and starts following the Agent.

### Added

- The panel follows the Agent's writes — and opens itself to do it. When a
  `write`, `edit` or `str_replace_editor` call finishes on a `.md` inside the
  workspace, the right Sidebar is revealed and the tab lands on that file. The
  subscription lives in the plugin rather than in the tab body, fed by
  `remote.session.follow` for whichever Session `sidebarRight.mounted` names, so
  a write is followed whether or not a panel was open. The switch is armed by
  `tool/call` and fired by the matching `tool/result`, so the file is read after
  the write landed — opening on the call would show the previous contents and
  make a working feature look broken. `str_replace_editor`'s `view` command is a
  read and is ignored, as is any call naming a non-Markdown path.
- A "follow the Agent's writes" checkbox in the panel settings, on by default
  and remembered per browser. It is read at the moment of each write, so
  flipping it takes effect without a reload.

### Changed

- Both Remote streams — the file watch and the Session follow — now share one
  wrapper that unwraps `item.value` and acknowledges every frame. The two
  call sites had been carrying the same twenty lines twice.
- The header's settings button is "panel settings" rather than "reading
  settings", because following the Agent is not a reading preference.
- Placing a tab in a Session whose store was never adopted does nothing at all,
  and a closed pane is exactly that case. So the pane is revealed first and the
  tab is placed again a frame later, twice; repeating is safe because the type
  is single-instance.
- `verify:client` grew from 56 to 64 checks. The jsdom `$stream` double now owns
  a lifetime and cancels it on `dispose()`; without that, an unmounted
  component's generator kept draining the fake queue and eating the frames meant
  for the live one — which is exactly how the first run of these tests failed.

## [0.5.0] - 2026-10-26

This release was planned as "swap in the official `MarkdownText` renderer".
Reading its implementation killed that plan: it renders from an mdast tree that
emits raw HTML verbatim with no sanitiser, gives headings no `id`, and does no
syntax highlighting — the three things this tab cannot give up on arbitrary
files from a workspace. The parts worth taking from it were rebuilt on the
existing renderer instead.

### Added

- A code-block toolbar: the language the fence declared, and a copy control,
  revealed on hover. The copy strips the trailing newline `marked` leaves before
  `</code>`, so a pasted shell command does not run itself.
- Front matter is separated from the prose and shown in a collapsed box, so a
  document opens with its content instead of a stray horizontal rule and a
  `title: …` paragraph.

### Changed

- `verify:client` grew from 53 to 56 checks.

## [0.4.0] - 2026-10-26

The document became something you read rather than something you look at:
its own images resolve, its links navigate, and the panel can hand the file
back to the desktop.

### Added

- Relative images resolve against the document's own directory and are served
  through the Host's `api/file` endpoint — the same address the official
  document preview uses. Remote and absolute URLs are left untouched.
- Links inside the document are handled by the tab: another `.md` opens in this
  tab, `#anchor` scrolls in place, `https://` and `mailto:` go to the browser,
  and a relative link to anything else is handed to the Host's default
  application.
- Header actions that hand the file to the OS: open with the default
  application, or reveal it in the file manager
  (`remote.session.openWorkspacePath`). Both hide themselves when
  `canOpenWorkspacePath` reports that the Host has no desktop.
- Search over the workspace list by path fragment, and the last eight documents
  opened as a shortcut section above the full list.
- The outline marks the heading currently in view while scrolling, and folds to
  a 28px rail; the fold state is remembered per browser.
- Reading settings — body size, leading and measure — in a header popover,
  remembered per browser. Every default is "follow the app", so the Markdown
  tokens stay in charge until the reader chooses otherwise.

### Changed

- The picker counts matches while a search is active (`3 / 12 个文件`) instead of
  showing only the total.
- `verify:client` grew from 35 to 53 checks, covering the new paths.

## [0.3.0] - 2026-10-24

Reworked into a native right-Sidebar tab. The 0.1.0 shape — a `main` panel
opened by a sidebar icon, driven by Host-side events — never worked: DSH has no
Host → Client event bridge, and the panel had no entry point.

### Added

- Right-Sidebar tab type (`sidebarRightTabs` + `sidebar.right.pane.tab`) with a
  guide entry, so the preview is reachable from the pane's add control.
- Workspace file list: one full scan from the Session's cwd, parallel by level,
  rendered progressively as each level lands.
- Editable filter rules for build/dependency directories, persisted in
  `localStorage`, with "restore defaults" and "show everything".
- Live refresh through `remote.workspaceFiles.changes`.
- Working TOC anchors: heading ids are injected at render time and de-duplicated.
- Header shows `directory/filename` relative to the workspace, with the
  absolute path in the tooltip.
- `npm run verify:client`: 35 end-to-end checks in jsdom against the built bundle.

### Changed

- Styling reads the app's `--dsw-*` design tokens, so the panel follows the
  appearance setting, the text/code font sizes, the font families, and any
  registered third-party theme.
- Sanitising moved from a hand-written regex to DOMPurify (HTML profile).
- Code highlighting moved to the rendered DOM with 27 registered languages;
  the bundle dropped from 1.95 MB to 0.46 MB.

### Fixed

- Client bundle lost its `window.__ModuleLoader__.load({ id, factory })` wrapper
  and called `require` at script scope: `ReferenceError: require is not defined`
  left the entry permanently inactive.
- Remote calls were read as bare values, but they resolve to
  `{ ok, value } | { ok, error }` envelopes — every listing came back empty
  without an error.
- `list`/`readBytes` were called with an empty path, which the Host rejects with
  `path is required`; the scan now starts from the Session's absolute cwd.
- The file watch was iterated raw instead of through `remote.$stream`, so frames
  were never acknowledged and live updates could stall.
- marked v9 no longer honours the `highlight` option, so code blocks had never
  actually been highlighted.
- `ctx.layout.selectPanel` was not a real API, so auto-open could never switch
  panels.

### Removed

- The Host-side chokidar watcher and the `md-live:*` events it emitted: with no
  Host → Client bridge they reached nothing and only cost I/O. `chokidar` is no
  longer a dependency, and the Host half is now an empty `apply()`.
- The `preview_md` / `export_md` Agent tools documented in 0.1.0. They were
  never implemented.

## [0.1.0] - 2026-10-23

### Added

- Initial plugin scaffold: a `main`-slot Markdown preview panel with edit /
  preview modes, TOC, theme overrides and a Host-side file watcher.

[0.8.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.8.0
[0.7.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.7.0
[0.6.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.6.0
[0.5.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.5.0
[0.4.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.4.0
[0.3.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.3.0
[0.1.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.1.0
