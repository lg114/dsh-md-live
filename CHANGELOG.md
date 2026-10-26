# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.5.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.5.0
[0.4.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.4.0
[0.3.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.3.0
[0.1.0]: https://github.com/lg114/dsh-md-live/releases/tag/v0.1.0
