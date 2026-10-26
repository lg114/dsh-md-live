/**
 * The plugin's copy, in the two languages DSH ships.
 *
 * The panel follows the app's locale: `apply` registers this namespace with
 * `ctx.locale` and every registration that renders text carries
 * `locale: NS`, so DSH re-renders those entries with a `t` seat when the
 * reader switches language in Settings — no reload. `zh` doubles as the
 * fallback for the plugin's own non-React call sites and for a shell without a
 * locale service, which is also what the verification harness exercises.
 *
 * Keys are flat and namespaced by area (`doc.`, `edit.`, `picker.`, `error.`,
 * `write.`) so a missing translation is visible at a glance. `{name}`
 * placeholders are DSH's own substitution syntax.
 */
import type { Context } from '@deepseek-ai/cordis';

/** The locale namespace this plugin owns. */
export const NS = 'md-live';

/** Shipped translations. `zh` is also the fallback dictionary. */
export const zh = {
  'guide.description': '在右侧栏预览工作区的 Markdown 文件，文件变化时自动刷新',

  'doc.back': '返回文件列表',
  'doc.openExternal': '用系统默认应用打开',
  'doc.reveal': '在文件管理器中显示',
  'doc.settings': '面板设置',
  'doc.refresh': '刷新',
  'doc.refreshTitle': '这个文件无法自动监听变化，点此重新读取',
  'doc.loading': '读取中…',
  'doc.frontmatter': 'frontmatter · {count} 行',

  'edit.start': '编辑源文件',
  'edit.label': '编辑',
  'edit.preview': '预览',
  'edit.previewTitle': '返回预览',
  'edit.save': '保存',
  'edit.saving': '保存中…',
  'edit.saveTitle': '保存 (Ctrl+S)',
  'edit.noChange': '无更改',
  'edit.discard': '有未保存的更改，确定放弃吗？',

  'settings.fontSize': '字号',
  'settings.lineHeight': '行距',
  'settings.width': '行宽',
  'settings.followApp': '跟随设置',
  'settings.followWrites': '跟随 Agent 写入',
  'settings.restore': '恢复默认',

  'picker.root': '工作区根目录',
  'picker.workspaceLabel': '工作区',
  'picker.theWorkspace': '工作区',
  'picker.where': '「{root}」',
  'picker.scanning': '扫描中…',
  'picker.count': '{visible} / {total} 个文件',
  'picker.countAll': '{total} 个文件',
  'picker.search': '搜索文件名或路径',
  'picker.searchAria': '搜索 Markdown 文件',
  'picker.scanningWhere': '正在扫描{where}…',
  'picker.emptyWhere': '{where}里没有 Markdown 文件',
  'picker.noMatch': '没有匹配「{query}」的文件',
  'picker.recent': '最近打开',
  'picker.all': '全部文件',
  'picker.rulesOpen': '过滤规则',
  'picker.rulesClose': '收起规则',
  'picker.rulesHint': '一行一个目录名，例如 node_modules',
  'picker.rulesAll': '已包含所有目录',
  'picker.rulesSkipped': '已跳过 {skipped} 个目录（{rules} 条过滤规则）',
  'picker.rulesSave': '保存',
  'picker.rulesRestore': '恢复默认',
  'picker.rulesShowAll': '全部显示',

  'toc.label': '目录',
  'toc.expand': '展开目录',
  'toc.collapse': '收起目录',

  'code.copy': '复制',
  'code.copyTitle': '复制这段代码',
  'code.copied': '已复制',
  'code.copyFailed': '复制失败',

  'truncation.depth': '目录层级超过 {depth} 层，更深的位置没有列出',
  'truncation.dirs': '目录数量超过 {dirs} 个，其余目录没有列出',
  'truncation.files': '只列出前 {files} 个文件',
  'truncation.entries': '有目录的条目过多，Host 只返回了其中一部分',

  'error.noSessionRead': '没有会话上下文，无法读取文件',
  'error.noSessionScan': '没有会话上下文，无法扫描工作区',
  'error.noSessionSave': '没有会话上下文，无法保存',
  'error.noPreviewApi': '预览接口没有注入',
  'error.noWorkspacePath': '还没有拿到会话的工作区路径',
  'error.scanNoBase': '拿不到会话的工作区路径，无法扫描目录',
  'error.scanEmpty': '目录「{dir}」里读不到任何条目',
  'error.fileMissing': '文件不存在',
  'error.saveFailed': '保存失败',
  'error.remoteFailed': '远端调用失败',
  'error.writeUnsupported': '当前 Host 不支持写入（mdLive Remote 服务未注册）',

  'stale.title': '文件已被外部修改',
  'stale.body': '其他程序或 Agent 已修改了这个文件。您可以覆盖它或重新加载。',
  'stale.reload': '重新加载',
  'stale.overwrite': '覆盖',

  'write.denied.readOnly': '沙箱是只读模式，不能写入：{path}',
  'write.denied.fileReadOnly': '文件为只读：{path}',
  'write.denied.root': '沙箱拒绝了这次写入（模式 {mode}，允许写入的根目录是 {root}）：{path}',
  'write.denied.notObserved': '写入前必须先读取这个文件：{path}',
  'write.denied.tooLarge': '内容超过上限（{bytes} > {max} 字节）',
  'write.denied.notMarkdown': '只允许写入 Markdown 文件：{path}',
  'write.denied.noSession': '找不到这个会话，无法确定沙箱策略；请刷新页面后重试',
  'write.denied.permission': '没有写入权限：{path}',
  'write.denied.notFound': '文件不存在：{path}',
  'write.denied.io': '写入失败：{message}',
} as const;

/** Every key the plugin may ask for. */
export type LocaleKey = keyof typeof zh;

/** The English dictionary; a missing key here is a type error. */
export const en: Record<LocaleKey, string> = {
  'guide.description': 'Preview a workspace Markdown file in the right sidebar, refreshed as the file changes',

  'doc.back': 'Back to the file list',
  'doc.openExternal': 'Open with the default app',
  'doc.reveal': 'Show in the file manager',
  'doc.settings': 'Panel settings',
  'doc.refresh': 'Refresh',
  'doc.refreshTitle': 'This file cannot be watched; click to read it again',
  'doc.loading': 'Loading…',
  'doc.frontmatter': 'frontmatter · {count} lines',

  'edit.start': 'Edit the source',
  'edit.label': 'Edit',
  'edit.preview': 'Preview',
  'edit.previewTitle': 'Back to the preview',
  'edit.save': 'Save',
  'edit.saving': 'Saving…',
  'edit.saveTitle': 'Save (Ctrl+S)',
  'edit.noChange': 'No changes',
  'edit.discard': 'Discard the unsaved changes?',

  'settings.fontSize': 'Text size',
  'settings.lineHeight': 'Line height',
  'settings.width': 'Measure',
  'settings.followApp': 'Follow the app',
  'settings.followWrites': "Follow the Agent's writes",
  'settings.restore': 'Restore defaults',

  'picker.root': 'Workspace root',
  'picker.workspaceLabel': 'Workspace',
  'picker.theWorkspace': 'the workspace',
  'picker.where': '“{root}”',
  'picker.scanning': 'Scanning…',
  'picker.count': '{visible} / {total} files',
  'picker.countAll': '{total} files',
  'picker.search': 'Search by file name or path',
  'picker.searchAria': 'Search Markdown files',
  'picker.scanningWhere': 'Scanning {where}…',
  'picker.emptyWhere': 'No Markdown files in {where}',
  'picker.noMatch': 'No files match “{query}”',
  'picker.recent': 'Recently opened',
  'picker.all': 'All files',
  'picker.rulesOpen': 'Filter rules',
  'picker.rulesClose': 'Hide rules',
  'picker.rulesHint': 'One directory name per line, e.g. node_modules',
  'picker.rulesAll': 'Every directory is included',
  'picker.rulesSkipped': 'Skipped {skipped} directories ({rules} rules)',
  'picker.rulesSave': 'Save',
  'picker.rulesRestore': 'Restore defaults',
  'picker.rulesShowAll': 'Show everything',

  'toc.label': 'Contents',
  'toc.expand': 'Show the table of contents',
  'toc.collapse': 'Hide the table of contents',

  'code.copy': 'Copy',
  'code.copyTitle': 'Copy this code',
  'code.copied': 'Copied',
  'code.copyFailed': 'Copy failed',

  'truncation.depth': 'Deeper than {depth} levels; anything below is not listed',
  'truncation.dirs': 'More than {dirs} directories; the rest are not listed',
  'truncation.files': 'Only the first {files} files are listed',
  'truncation.entries': 'A directory held too many entries; the Host returned only some of them',

  'error.noSessionRead': 'No session context; the file cannot be read',
  'error.noSessionScan': 'No session context; the workspace cannot be scanned',
  'error.noSessionSave': 'No session context; the file cannot be saved',
  'error.noPreviewApi': 'The preview API was not injected',
  'error.noWorkspacePath': 'The session workspace path is not known yet',
  'error.scanNoBase': 'The session workspace path is unknown; the directory cannot be scanned',
  'error.scanEmpty': 'No entries could be read from “{dir}”',
  'error.fileMissing': 'The file no longer exists',
  'error.saveFailed': 'Save failed',
  'error.remoteFailed': 'The Remote call failed',
  'error.writeUnsupported': 'This Host does not support writing (the mdLive Remote is not registered)',

  'stale.title': 'The file changed on disk',
  'stale.body': 'Another program or the Agent changed this file. Overwrite it, or reload and keep their version.',
  'stale.reload': 'Reload',
  'stale.overwrite': 'Overwrite',

  'write.denied.readOnly': 'The sandbox is read-only; cannot write {path}',
  'write.denied.fileReadOnly': 'The file is read-only: {path}',
  'write.denied.root': 'The sandbox refused this write (mode {mode}, writable root {root}): {path}',
  'write.denied.notObserved': 'Read the file before writing it: {path}',
  'write.denied.tooLarge': 'The content is over the limit ({bytes} > {max} bytes)',
  'write.denied.notMarkdown': 'Only Markdown files can be written: {path}',
  'write.denied.noSession': 'That session could not be found, so the sandbox policy is unknown; reload the page and retry',
  'write.denied.permission': 'No permission to write {path}',
  'write.denied.notFound': 'No such file: {path}',
  'write.denied.io': 'Write failed: {message}',
};

/**
 * A translate function: the shape DSH's `t` seat has, and what this module
 * hands to anything that renders outside a slot.
 */
export type Translate = (key: LocaleKey, params?: Record<string, string | number>) => string;

/**
 * Substitute `{name}` placeholders in one template.
 *
 * @param template - the dictionary string.
 * @param params - the values to substitute; unknown names are left alone.
 * @returns the filled template.
 */
function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Chinese lookup with placeholder substitution: the fallback translator. */
export const fallbackT: Translate = (key, params) => fill(zh[key] ?? key, params);

/**
 * The translator used by plugin code that runs outside a slot (the Remote
 * helpers, the guide entry). Replaced by the DSH-bound `t` once `apply` runs;
 * until then, and in a shell without a locale service, it answers in Chinese.
 */
let active: Translate = fallbackT;

/** The current translator for non-slot call sites. */
export const t: Translate = (key, params) => active(key, params);

/**
 * Point the module translator at the live locale service.
 *
 * @param next - the bound translator, or nothing to fall back to Chinese.
 */
export function useTranslator(next: Translate | undefined): void {
  active = next ?? fallbackT;
}

/**
 * Register this plugin's dictionaries with the app's locale service.
 *
 * @param ctx - client root context; `locale` may be absent in a stripped shell.
 * @returns nothing; the registration is fiber-owned through `ctx.effect`.
 */
export function installLocale(ctx: Context | any): Translate {
  const locale = (ctx as any).locale;
  if (!locale || typeof locale.register !== 'function' || typeof ctx.effect !== 'function') {
    useTranslator(undefined);
    return fallbackT;
  }
  ctx.effect(() => locale.register(NS, { zh, en }), 'md-live: dictionaries');
  const bound = typeof locale.bind === 'function' ? locale.bind(NS) : undefined;
  useTranslator(bound as Translate | undefined);
  return (bound as Translate | undefined) ?? fallbackT;
}
