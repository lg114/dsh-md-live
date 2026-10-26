// Mount the built client bundle in jsdom and exercise the tab body end to end:
// module registration, the Remote reads, the file watch, and the rendered DOM.
// Run `npm run build:client` first, then `npm run verify:client`.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const React = require('react');
const { createRoot } = require('react-dom/client');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.cjs'), 'utf-8');
const registered = [];
const sandbox = {
  console: { log() {}, error: (...a) => console.error('[bundle]', ...a), warn() {} },
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  TextDecoder,
  TextEncoder,
  AbortController,
  AbortSignal,
  Uint8Array,
  ArrayBuffer,
  URL: dom.window.URL,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setTimeout,
  clearTimeout,
};
sandbox.window = dom.window;
sandbox.globalThis = sandbox;
dom.window.__ModuleLoader__ = { load: (row) => registered.push(row) };
sandbox.__ModuleLoader__ = dom.window.__ModuleLoader__;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

const row = registered[0];
if (!row || row.id !== 'dsh-md-live') throw new Error('module id wrong');
const exportsObj = row.factory((id) => {
  if (id === 'react' || id === 'react/jsx-runtime') return require(id);
  throw new Error('unexpected require: ' + id);
});

let fileText = '# 标题一\n\n正文段落\n\n## 小节\n\n- a\n- b\n';
let watchController = null;
let disposed = 0;
let listFailure = null;
let watchFails = false;
let listDelay = 0;

// A tiny workspace tree: a root file, a nested project, a skipped directory,
// a non-Markdown file, and a dotfile.
const ROOT = 'C:/w';
const WORKSPACE = {
  [ROOT]: {
    path: '',
    entries: [
      { name: 'A', type: 'directory' },
      { name: 'GitHub', type: 'directory' },
      { name: 'node_modules', type: 'directory' },
      { name: 'test.md', type: 'file' },
      { name: 'x.txt', type: 'file' },
      { name: '.hidden.md', type: 'file' },
    ],
  },
  [ROOT + '/node_modules']: { path: 'node_modules', entries: [{ name: 'pkg', type: 'directory' }] },
  [ROOT + '/node_modules/pkg']: { path: 'node_modules/pkg', entries: [{ name: 'README.md', type: 'file' }] },
  [ROOT + '/A']: { path: 'A', entries: [{ name: 'B', type: 'directory' }] },
  [ROOT + '/A/B']: { path: 'A/B', entries: [{ name: 'C', type: 'directory' }] },
  [ROOT + '/A/B/C']: { path: 'A/B/C', entries: [{ name: 'deep.md', type: 'file' }] },
  [ROOT + '/GitHub']: { path: 'GitHub', entries: [{ name: 'dsh-md-live', type: 'directory' }] },
  [ROOT + '/GitHub/dsh-md-live']: {
    path: 'GitHub/dsh-md-live',
    entries: [{ name: 'README.md', type: 'file' }],
  },
};
const tree = (dir) => WORKSPACE[dir] ?? { path: dir, entries: [] };

// The framework hands session-scoped slots a store hook; the Session's cwd is
// the absolute workspace root the Remote requires.
const sessionsHook = (selector) => selector({ byId: { s1: { cwd: 'C:\\w' } } });

const captured = { tabType: null, body: null, title: null, opens: [], external: [], paths: [] };
dom.window.open = (url) => {
  captured.external.push(url);
  return null;
};
const fakeCtx = {
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
  sidebarRightTabs: { register(def) { captured.tabType = def; return () => {}; } },
  sidebarRight: { openTab(kind, opts) { captured.opens.push([kind, opts]); } },
  slots: {
    inject(name, cb) { cb(); return () => {}; },
    register(opts, Comp) {
      if (opts.name.endsWith('.title')) captured.title = { opts, Comp };
      else captured.body = { opts, Comp };
      return () => {};
    },
  },
  remote: {
    $stream: ({ open }) => {
      const src = open(new AbortController().signal);
      return {
        [Symbol.asyncIterator]: async function* () {
          for await (const value of src) yield { value, accept() {} };
        },
        dispose() {
          disposed += 1;
        },
      };
    },
    session: {
      canOpenWorkspacePath: async () => ({ ok: true, value: true }),
      openWorkspacePath: async (request) => {
        captured.paths.push(request);
        return { ok: true, value: { opened: true } };
      },
    },
    workspaceFiles: {
      readBytes: async () => ({ ok: true, value: { data: new TextEncoder().encode(fileText) } }),
      list: async (_s, dir) => {
        if (listDelay) await new Promise((r) => setTimeout(r, listDelay));
        if (listFailure) return { ok: false, error: { message: listFailure, code: 'workspace-file/not-found' } };
        return { ok: true, value: tree(dir) };
      },
      changes: async function* (_s, _p, signal) {
        if (watchFails) throw new Error('watch unsupported');
        watchController = signal;
        yield { kind: 'ready' };
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 30));
          if (signal.aborted) return;
          yield { kind: 'change', change: { absolutePath: 'x', version: 'v' + Date.now() } };
        }
      },
    },
  },
};
exportsObj.apply(fakeCtx);

const api = captured.body.opts.inject().api;
const root = createRoot(document.getElementById('root'));
const info = { tab: { id: 't1', navigation: { params: { path: 'test.md' }, revision: 1 }, signal: new AbortController().signal } };
root.render(React.createElement(captured.body.Comp, { useTabInfo: () => info, sessionId: 's1', useSessions: sessionsHook, api }));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(60);
  const rootEl = document.getElementById('root');
  const html = rootEl.innerHTML;
  console.log('1) header shows file:', html.includes('test.md'));
  console.log('2) rendered h1:', /<h1 id="[^"]*">标题一<\/h1>/.test(html));
  console.log('3) toc rendered:', html.includes('md-live-toc'));
  console.log('4) toc item count:', (html.match(/md-live-toc-item/g) || []).length);
  console.log('5) list rendered:', /<ul>/.test(html));
  console.log('6) watch subscribed:', watchController !== null);

  const back = rootEl.querySelector('button[aria-label="返回文件列表"]');
  console.log('6b) back control present:', Boolean(back), '| label:', back && back.getAttribute('title'));
  if (back) {
    back.click();
    await wait(20);
    const last = captured.opens[captured.opens.length - 1];
    console.log('6c) back reopens the picker:', last && last[0] === 'md-live' && last[1]?.params?.path === '');
  }

  const fileViewButtons = [...rootEl.querySelectorAll('.md-live-actions button')].map((b) => b.textContent);
  console.log('6d) no manual refresh while live:', !fileViewButtons.includes('刷新'), JSON.stringify(fileViewButtons));

  fileText = '# 标题一\n\n改写后的正文\n\n## 小节\n\n- a\n';
  await wait(200);
  const after = rootEl.innerHTML;
  console.log('7) live refresh applied:', after.includes('改写后的正文'));

  root.unmount();
  await wait(20);
  console.log('8) watch stream disposed on unmount:', disposed > 0);

  const emptyRoot = createRoot(document.createElement('div'));
  const emptyEl = document.createElement('div');
  document.body.appendChild(emptyEl);
  const r2 = createRoot(emptyEl);
  r2.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't2', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
    sessionId: 's1', useSessions: sessionsHook,
    api,
  }));

  await wait(5);
  console.log('9) shows scanning state first:', emptyEl.innerHTML.includes('正在扫描'));

  await wait(80);
  const pickerHtml = emptyEl.innerHTML;
  console.log('10) picker items:', (pickerHtml.match(/md-live-picker-item/g) || []).length);
  console.log('11) recursion finds nested file:', pickerHtml.includes('README.md'));
  console.log('12) dir prefix shown:', pickerHtml.includes('GitHub/dsh-md-live/'));
  console.log('13) filters non-md and dotfiles:', !pickerHtml.includes('x.txt') && !pickerHtml.includes('.hidden.md'));
  console.log('14) default filter keeps node_modules out of the list:', !pickerHtml.includes('node_modules/pkg/README.md'));
  console.log('15) count line:', /3 个文件/.test(pickerHtml));
  console.log('18) deep file listed in one pass:', pickerHtml.includes('deep.md'));
  console.log('19) no truncation note:', !/目录层级超过|目录数量超过|只列出前|条目过多/.test(pickerHtml));
  console.log('20) no manual rescan in the picker:', emptyEl.querySelectorAll('.md-live-actions button').length === 0 && !pickerHtml.includes('继续扫描'));
  console.log('28) says how many directories it left out:', pickerHtml.includes('已跳过 1 个目录'));

  const rulesButton = [...emptyEl.querySelectorAll('button')].find((b) => b.textContent === '过滤规则');
  console.log('29) offers editable rules:', Boolean(rulesButton));
  if (rulesButton) {
    rulesButton.click();
    await wait(30);
    const area = emptyEl.querySelector('.md-live-rules-input');
    console.log('30) editor is prefilled with the current rules:', Boolean(area) && area.value.split('\n').length === 23 && area.value.includes('node_modules'));

    if (area) {
      area.value = '';
      area.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await wait(20);
      const showAll = [...emptyEl.querySelectorAll('button')].find((b) => b.textContent === '全部显示');
      showAll.click();
      await wait(200);
      const all = emptyEl.innerHTML;
      console.log('31) clearing the rules includes everything:', all.includes('node_modules/pkg/README.md') && /4 个文件/.test(all));
      console.log('32) cleared rules persist to storage:', dom.window.localStorage.getItem('dsh-md-live.skip-dirs.v1') === '[]');

      const againEl = document.createElement('div');
      document.body.appendChild(againEl);
      const r8 = createRoot(againEl);
      r8.render(React.createElement(captured.body.Comp, {
        useTabInfo: () => ({ tab: { id: 't8', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
        sessionId: 's1', useSessions: sessionsHook, api,
      }));
      await wait(150);
      console.log('33) a fresh mount honours the saved rules:', againEl.innerHTML.includes('node_modules/pkg/README.md'));
      r8.unmount();

      dom.window.localStorage.removeItem('dsh-md-live.skip-dirs.v1');
    }
  }

  const missingEl = document.createElement('div');
  document.body.appendChild(missingEl);
  const r3 = createRoot(missingEl);
  r3.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't3', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
    sessionId: undefined, useSessions: sessionsHook,
    api,
  }));
  await wait(40);
  console.log('16) missing session reported, not "no files":', missingEl.innerHTML.includes('没有会话上下文'));

  listFailure = '工作区不可读（示例）';
  const failEl = document.createElement('div');
  document.body.appendChild(failEl);
  const r4 = createRoot(failEl);
  r4.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't4', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
    sessionId: 's1', useSessions: sessionsHook,
    api,
  }));
  await wait(40);
  console.log('17) remote failure surfaced:', failEl.innerHTML.includes('工作区不可读'));
  listFailure = null;

  watchFails = true;
  const noWatchEl = document.createElement('div');
  document.body.appendChild(noWatchEl);
  const r5 = createRoot(noWatchEl);
  r5.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't5', navigation: { params: { path: 'test.md' }, revision: 1 }, signal: new AbortController().signal } }),
    sessionId: 's1',
    useSessions: sessionsHook,
    api,
  }));
  await wait(80);
  const fallbackButtons = [...noWatchEl.querySelectorAll('.md-live-actions button')].map((b) => b.textContent);
  console.log('22) refresh appears only when watching is unavailable:', fallbackButtons.includes('刷新'), JSON.stringify(fallbackButtons));
  watchFails = false;
  r5.unmount();

  const nestedEl = document.createElement('div');
  document.body.appendChild(nestedEl);
  const r6 = createRoot(nestedEl);
  r6.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't6', navigation: { params: { path: ROOT + '/GitHub/dsh-md-live/README.md' }, revision: 1 }, signal: new AbortController().signal } }),
    sessionId: 's1',
    useSessions: sessionsHook,
    api,
  }));
  await wait(80);
  const titleHtml = nestedEl.querySelector('.md-live-title').innerHTML;
  console.log('23) header shows the directory:', titleHtml.includes('GitHub/dsh-md-live/'));
  console.log('24) header shows the file name:', titleHtml.includes('README.md'));
  console.log('25) header keeps the absolute path in the tooltip:', nestedEl.querySelector('.md-live-title').getAttribute('title') === ROOT + '/GitHub/dsh-md-live/README.md');
  r6.unmount();

  // A slow scan must still show rows as each level lands, not one blank wait.
  listDelay = 25;
  const progEl = document.createElement('div');
  document.body.appendChild(progEl);
  const r7 = createRoot(progEl);
  r7.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't7', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
    sessionId: 's1',
    useSessions: sessionsHook,
    api,
  }));
  await wait(45);
  const partial = progEl.innerHTML;
  console.log('26) rows appear before the scan finishes:', partial.includes('test.md') && partial.includes('扫描中'));
  await wait(400);
  console.log('27) final result replaces the partials:', /3 个文件/.test(progEl.innerHTML) && !progEl.innerHTML.includes('扫描中'));
  listDelay = 0;
  r7.unmount();

  // Sanitising and highlighting run on the rendered HTML/DOM.
  fileText = [
    '# 安全',
    '',
    '<script>window.__pwned = 1</script>',
    '<iframe src="https://example.com"></iframe>',
    '<img src="x" onerror="window.__pwned = 2">',
    '',
    '```ts',
    'const answer: number = 42;',
    '```',
  ].join('\n');
  const safeEl = document.createElement('div');
  document.body.appendChild(safeEl);
  const r9 = createRoot(safeEl);
  r9.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't9', navigation: { params: { path: 'test.md' }, revision: 1 }, signal: new AbortController().signal } }),
    sessionId: 's1',
    useSessions: sessionsHook,
    api,
  }));
  await wait(150);
  const safeHtml = safeEl.innerHTML;
  console.log('34) sanitizer strips scripts and frames:', !/<script/i.test(safeHtml) && !/<iframe/i.test(safeHtml) && !/onerror/i.test(safeHtml));
  console.log('35) code blocks get highlighted:', /data-highlighted="yes"|class="[^"]*hljs/.test(safeHtml));
  r9.unmount();

  // Relative images, in-document navigation, and the Host's own opener.
  const DOC = ROOT + '/GitHub/dsh-md-live/README.md';
  fileText = [
    '# 图与链接',
    '',
    '![本地](./img/p.png)',
    '',
    '![远程](https://e.com/r.png)',
    '',
    '[另一篇](./other.md)',
    '',
    '[外链](https://example.com/x)',
    '',
    '[锚点](#图与链接)',
  ].join('\n');
  const docEl = document.createElement('div');
  document.body.appendChild(docEl);
  const r10 = createRoot(docEl);
  r10.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't10', navigation: { params: { path: DOC }, revision: 1 }, signal: new AbortController().signal } }),
    sessionId: 's1', useSessions: sessionsHook, api,
  }));
  await wait(180);
  const docHtml = docEl.innerHTML;
  const media = 'http://localhost/api/file?path=' + encodeURIComponent(ROOT + '/GitHub/dsh-md-live/img/p.png');
  console.log('36) relative image rewritten to the file endpoint:', docHtml.includes(media));
  console.log('37) remote image left alone:', docHtml.includes('src="https://e.com/r.png"'));

  const anchors = [...docEl.querySelectorAll('.markdown-body a')];
  const opensBefore = captured.opens.length;
  const externalBefore = captured.external.length;
  anchors[0].click();
  await wait(20);
  const linkOpen = captured.opens[captured.opens.length - 1];
  console.log('38) internal .md link opens the tab:',
    captured.opens.length === opensBefore + 1 &&
    linkOpen[1]?.params?.path === ROOT + '/GitHub/dsh-md-live/other.md');
  anchors[1].click();
  await wait(20);
  console.log('39) external link handed to the browser:',
    captured.external.length === externalBefore + 1 &&
    captured.external[captured.external.length - 1] === 'https://example.com/x');
  const opensBeforeAnchor = captured.opens.length;
  anchors[2].click();
  await wait(20);
  console.log('40) in-page anchor stays in the tab:', captured.opens.length === opensBeforeAnchor);

  const headerButtons = [...docEl.querySelectorAll('.md-live-actions button')];
  const openBtn = headerButtons.find((b) => b.getAttribute('title') === '用系统默认应用打开');
  const revealBtn = headerButtons.find((b) => b.getAttribute('title') === '在文件管理器中显示');
  console.log('41) header offers the Host opener:', Boolean(openBtn) && Boolean(revealBtn));
  if (openBtn) {
    openBtn.click();
    await wait(30);
  }
  console.log('41b) opener passes the absolute path:',
    captured.paths.some((p) => p.path === DOC && p.action === undefined));
  if (revealBtn) {
    revealBtn.click();
    await wait(30);
  }
  console.log('42) reveal asks for the file manager:',
    captured.paths.some((p) => p.path === DOC && p.action === 'reveal'));

  console.log('43) outline marks the heading in view:', Boolean(docEl.querySelector('.md-live-toc-item.is-active')));
  const tocToggle = docEl.querySelector('.md-live-toc-toggle');
  if (tocToggle) {
    tocToggle.click();
    await wait(40);
  }
  console.log('43b) folding hides the list and is remembered:',
    Boolean(docEl.querySelector('.md-live-toc.is-collapsed')) &&
    !docEl.querySelector('.md-live-toc-nav') &&
    dom.window.localStorage.getItem('dsh-md-live.toc-collapsed.v1') === 'true');
  const tocToggleAgain = docEl.querySelector('.md-live-toc-toggle');
  if (tocToggleAgain) {
    tocToggleAgain.click();
    await wait(40);
  }
  dom.window.localStorage.removeItem('dsh-md-live.toc-collapsed.v1');

  const settingsBtn = headerButtons.find((b) => b.getAttribute('title') === '阅读设置');
  if (settingsBtn) {
    settingsBtn.click();
    await wait(40);
  }
  const popover = docEl.querySelector('.md-live-settings');
  console.log('44) reading settings open:', Boolean(popover));
  if (popover) {
    const sizeSelect = popover.querySelectorAll('select')[0];
    sizeSelect.value = '16';
    sizeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await wait(60);
    const preview = docEl.querySelector('.md-live-preview');
    console.log('44b) size applies to the document:',
      preview.className.includes('has-reading') && (preview.getAttribute('style') || '').includes('16px'));
    const stored = JSON.parse(dom.window.localStorage.getItem('dsh-md-live.reading.v1'));
    console.log('44c) choice is remembered:', stored.fontSize === 16);
  }
  r10.unmount();
  dom.window.localStorage.removeItem('dsh-md-live.reading.v1');

  // The picker: search narrows it, and the last document opened is a shortcut.
  dom.window.localStorage.removeItem('dsh-md-live.skip-dirs.v1');
  const listEl = document.createElement('div');
  document.body.appendChild(listEl);
  const r11 = createRoot(listEl);
  r11.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't11', navigation: { params: {}, revision: 0 }, signal: new AbortController().signal } }),
    sessionId: 's1', useSessions: sessionsHook, api,
  }));
  await wait(200);
  const rows = () => [...listEl.querySelectorAll('.md-live-picker-item')].map((b) => b.getAttribute('title'));
  console.log('45) recent document listed first:',
    listEl.innerHTML.includes('最近打开') && rows()[0] === 'GitHub/dsh-md-live/README.md');
  const search = listEl.querySelector('.md-live-search');
  if (search) {
    // React tracks the DOM value, so a plain assignment is invisible to it;
    // going through the prototype setter is what a real keystroke looks like.
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setValue.call(search, 'deep');
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await wait(60);
  }
  console.log('45b) search narrows the list:', JSON.stringify(rows()) === JSON.stringify(['A/B/C/deep.md']), JSON.stringify(rows()));
  r11.unmount();
  dom.window.localStorage.removeItem('dsh-md-live.recent.v1');

  // The desktop shell serves the app from a custom scheme; a rewritten image
  // address has to survive both the URL build and the sanitiser there.
  const baseTag = document.createElement('base');
  baseTag.setAttribute('href', 'dsh-app://app/');
  document.head.appendChild(baseTag);
  fileText = '# 桌面壳\n\n![本地](./img/p.png)\n';
  const shellEl = document.createElement('div');
  document.body.appendChild(shellEl);
  const r12 = createRoot(shellEl);
  r12.render(React.createElement(captured.body.Comp, {
    useTabInfo: () => ({ tab: { id: 't12', navigation: { params: { path: DOC }, revision: 1 }, signal: new AbortController().signal } }),
    sessionId: 's1', useSessions: sessionsHook, api,
  }));
  await wait(150);
  console.log('46) desktop-shell image addresses survive sanitising:',
    shellEl.innerHTML.includes('dsh-app://app/api/file?path='));
  r12.unmount();
  baseTag.remove();

  r2.unmount();
  r3.unmount();
  r4.unmount();
  emptyRoot.unmount();
  process.exit(0);
})();
