# dsh-md-live

[English](README.md) | 中文

DSH Web 右侧栏的原生 Markdown 预览**与编辑**标签页。

在右侧栏点 `+` → 选 `md-live` → 挑一个工作区里的 `.md`。之后 Agent 或外部编辑器改动这个文件，面板会自己刷新，不需要手动刷新或重开。点**编辑**就能就地改，**保存**经 Host 写回，走的是当前会话自己的沙箱策略。

## 特性

- **原生右侧 tab** —— 走 `ctx.sidebarRightTabs` + `sidebar.right.pane.tab` 注册，和 Files / Terminal 那些标签页同一套机制，不是往主区域塞面板。
- **全工作区扫描** —— 从会话的工作区根目录开始遍历整棵树，并行（每层 8 个并发）、逐层出结果：第一层扫完就先画出来，不等整棵树。
- **过滤规则可编辑** —— 默认跳过 `node_modules`、`.git`、`dist` 等目录；规则在界面上直接改、存在浏览器里，也可以一键全量扫描。
- **实时刷新** —— 基于 `remote.workspaceFiles.changes` 的文件监听，保存即更新；只有监听不可用时才出现手动刷新按钮。
- **就地编辑与保存** —— **编辑**把正文换成 textarea，背后还是同一个文件；**保存**（或 `Ctrl/Cmd+S`）写回去。保存是乐观并发：请求带着「打开编辑时的 version」，文件在底下被改过就弹「覆盖 / 重新加载」，而不是悄悄丢掉某一方。草稿在插件发起的每一次导航上都会被拦一下：返回、从列表换文件、跟随 Agent 切换，以及浏览器卸载，都会先问；热更新也不会覆盖脏草稿。
- **跟随 Agent（面板没开也会弹出来）** —— Agent 在工作区里写完一个 `.md`，面板直接打开那个文件。订阅是插件级的，靠 `remote.session.follow` 跟着当前在屏的会话，所以不管之前有没有开着 tab 都生效。切换等的是 `tool/result` 而不是 `tool/call`，读到的是写完之后的内容而不是写之前的。面板设置里一个复选框可以关掉。
- **Agent 可以主动「拿给你看」** —— 注册了一个 `preview_md` 工具，Agent 被要求「打开/看看某个 md」时可以直接把文件推到面板上。它不受上面那个复选框影响：这一次是用户明确要求的。
- **路径可见** —— 头部显示 `目录/文件名`（相对工作区），窄面板时目录先省略，文件名始终完整；悬停看绝对路径。
- **文档旁边的图能显示** —— 相对路径的 `![](...)` 会按文件自身所在目录解析，再由 Host 的文件端点提供，和 `.md` 放在一起的截图真的能显示出来。
- **链接点得动** —— 指向另一个 `.md` 的链接在当前 tab 打开它，`#锚点` 在文档内滚动，`https://` 链接交给浏览器而不是把整个应用导航走。
- **交给别处打开** —— 头部两个按钮：用系统默认应用打开、在文件管理器中显示。
- **搜索与最近打开** —— 按路径片段过滤列表；最近打开过的文档排在最上面。
- **TOC** —— 自动提取标题，锚点由渲染阶段注入，点击真的能跳转；滚动时高亮当前所在章节，面板窄时目录可折叠成一条窄栏。
- **阅读设置** —— 正文字号、行距、行宽，按浏览器记住。所有默认值都是「跟随设置」，也就是说在你明确改之前，排版仍然由 DSH 自己的 Markdown token 决定。
- **安全渲染** —— DOMPurify（HTML profile）净化，脚本、iframe、事件属性、`javascript:` 链接都会被剥掉。
- **代码高亮** —— highlight.js，按需注册 27 种常用语言。
- **数学公式** —— `$行内$` 和 `$$块级$$` 走 KaTeX。输出用 MathML 而不是 KaTeX 自己的 HTML：后者依赖 KaTeX 的 web 字体，那几百 KB 插件没办法提供，所以交给浏览器自己排版。
- **代码块可操作** —— 每块代码悬停时显示语言名和复制按钮；复制会去掉结尾换行，粘进终端不会自己执行。
- **frontmatter 不混进正文** —— 开头的 `---` 块被单独拎出来折叠显示，而不是变成一条多余的分隔线加一段 `title: …` 正文。
- **跟随设置** —— 颜色、字号、字体全部读 DSH 的 `--dsw-*` 设计 token，明暗主题、字号步进器、第三方主题都会跟着变。

## 安装

```bash
git clone https://github.com/lg114/dsh-md-live.git
cd dsh-md-live
npm install
npm run build

# 装进 web profile
dsh plugin --profile web add .
```

重启 harness 后刷新页面。`package.json` 里的 `dsh.client` 声明会让 Host 自动把 `lib/client.cjs` 挂成这个包的客户端半身，不需要额外的 patch 行。

## 使用

1. 右侧栏顶部点 `+`，在指南里选 **md-live**
2. 在文件列表里点一个 `.md`
3. 想换文件：点标题左侧的 `←` 回到列表

列表底部那行 `已跳过 N 个目录（M 条过滤规则）` 点开就是规则编辑器：一行一个目录名，保存后立刻重新扫描；「恢复默认」回到内置列表，「全部显示」清空规则（`node_modules` 里的 md 也会列出来）。

规则存在 `localStorage` 的 `dsh-md-live.skip-dirs.v1`，按浏览器保存，不写回 profile 配置。

## 工作原理

```
Client（全部能力都在这里）
├── 注册 tab 类型   sidebarRightTabs.register({ id, kind, title, guide })
├── 注册 body/title slots（key = id）
├── 文件列表        remote.workspaceFiles.list   逐层 BFS + 并发 + 渐进渲染
├── 文件内容        remote.workspaceFiles.readBytes → TextDecoder（返回 content + version）
├── 热更新          remote.workspaceFiles.changes → $stream + accept()
├── 跟随写入        remote.session.follow → tool/result → openRightbar + openTab（插件级）
└── 写入            remote.mdLive.writeText(sessionId, path, content, version) → Host fs + 会话沙箱策略

Host（lib/index.js）
├── preview_md 工具（可选）：Agent 唯一能「请求面板打开文件」的通道
└── mdLive Remote  （可选）：MdLiveRemote 服务 — 会话查找 → 沙箱策略 → resolve → stat → 版本校验 → writeText
```

八个必须知道的约束，都是踩过的坑：

1. **`ctx.remote.*` 返回的是 Result 信封**，不是裸数据：`{ ok: true, value } | { ok: false, error }`。直接取字段会得到 `undefined` 而且不报错——空文件列表看起来就像"工作区里没有文件"。
2. **`list`/`readBytes` 的 path 不能为空**，Host 会抛 `path is required`。起点必须是会话的绝对 cwd（slot 的标准 prop `useSessions` → `byId[sessionId].cwd`）。
3. **`changes` 是 Remote 流**，要用 `remote.$stream({ name, open, ended })` 包一层并逐帧 `accept()`，否则上行窗口满了就静默停更。
4. **没有 host → client 的事件桥，但有会话流**。Host 侧 `ctx.emit` 的事件不会到达浏览器。客户端**能**观察的是 `remote.session.follow` —— 一条携带会话自身事件（包括 `tool/call`、`tool/result`）的 Remote 流。「跟随 Agent 写入」全靠它，也正因为如此 Host 半身可以保持为空。
5. **client bundle 必须是 `window.__ModuleLoader__.load({ id, factory })` 格式**：脚本执行时只注册工厂，`require` 由 loader 在物化时传入。丢掉这层包装，产物里的 `require("react")` 会在浏览器全局作用域执行，直接 `ReferenceError`。
6. **故意没有复用官方的 `MarkdownText`**。它在浏览器模块表里，用它能省约 480 KB 产物，但它从 mdast 树渲染：原始 HTML 原样注入、不做净化，标题不带 `id`，也不做语法高亮 —— 而这三件正是这个面板在「任意工作区文件」上必须做对的。它的 KaTeX 支持和代码工具栏是真实的；工具栏这里在现有渲染器上重做了，公式则用 MathML 交给浏览器排版，而不是 KaTeX 的 HTML（见特性）。
7. **自定义 Typert Remote 可以手写，不需要 codegen。** `mdLive/writeText` 的 manifest 是手写的，形状与 `dsh-typert-generator` 生成的完全一致。Host 服务继承 `TypertRemoteService`，手动在 prototype 上放 Remote 方法标记（`@Remote` 装饰器需要构建管线支持 Stage 3 装饰器）。Gateway 通过 descriptor 的 `namespace/method` 与 prototype 标记的 `method` 名匹配来连接两端。注册方式是 `new MdLiveRemote(ctx)`（`Service` 基类构造器调 `ctx.reflect.provide`）加 `ctx.typert.register({ package, descriptors })`。
8. **客户端的 Typert descriptors 与 Host manifest 分开手写。** 把 Host 的 `TYPERT` 常量导入客户端产物会拉进 `zod` 和 `createTypertRemoteInfo`（约 550 KB），但 Gateway 在客户端只需要 descriptor 元数据和 `invoke` 调度器 —— 两者都不碰 zod。所以 `src/client/descriptors.ts` 手写了同样的 descriptor 形状，省掉了导入成本。Host 新增 Remote 方法时，这里也要加对应的 descriptor；两个文件故意解耦。

### 写入链路

`workspaceFiles` 没有修改接口，所以写入是自己手写的 Typert Remote：`writeText(sessionId, path, content, version)` 四个位置参数。第一个不是普通字段，而是 `session` **lookup**——Gateway 用 `dsh-session` 注册的条目把这个 id 解析成活跃会话，Host 方法拿到的是会话对象本身。也就是说浏览器说不了「用什么 mode、写哪个根」，只能选「按谁的规矩来」。

1. `ctx.sandboxPolicy.resolve({ session })` 给出 mode（会话的 `sandbox/mode` 事件，没有就用部署默认 `DSH_PERMISSION_MODE ?? workspace-write`）和可写根（`session.header.cwd`）。
2. 这份策略作为 `fs.writeText` 的第五个参数传下去。`SandboxedFileSystem` 会重新 canonicalize 目标并做包含判定——`read-only` 直接拒，`danger-full-access` 不设栅栏。
3. 不传这个参数，就是之前那个 bug：后端退回部署策略，而部署策略的根是 Host 进程的 **cwd**，于是 `dsh web` 启动目录之外的文件全被拒，连会话自己的工作区也不例外。

兜底一律往「拒绝」一侧倒：lookup 没解析出对象就用裸 id 走 `ctx.get('sessions')` 再查一次；会话已经不在了就明确拒绝而不是猜一个策略；组合里没有 `sandboxPolicy`（纯 `fs-local`）就传 `undefined`，保持后端原有行为；认不出的 I/O 错误原样透出。它**不会**做的是自己放宽权限——不换根重试、不升格成 `danger-full-access`、不接受客户端传来的 mode 或 root。

## 开发

```bash
npm run build          # host (tsc) + client (esbuild)
npm run build:client   # 只构建 client
npm run verify         # 两端都跑
npm run verify:client  # 用 jsdom 挂载真实产物跑 81 项端到端检查
npm run verify:host    # 用假 ctx 跑 Host 半身：28 项检查
npm run clean
```

`verify:client` 会模拟 DSH 的模块加载器（注册 → 物化 → apply），再在 jsdom 里挂载 tab body，覆盖：注册与 slot key、Remote 信封解包、目录递归、过滤规则与持久化、渐进渲染、热更新、卸载清理、TOC 锚点、净化、代码高亮、图片与链接解析、外部打开调用、搜索、最近打开、目录折叠、阅读设置、代码工具栏、frontmatter、跟随 Agent 写入、数学公式，以及编辑器：脏标记、保存、版本冲突弹窗。改完 client 代码先跑它，比在浏览器里点快得多。

`verify:host` 直接 import 构建好的 Host 半身、用一个假 cordis ctx 调 `apply`：注入了什么、工具的 schema、会拒绝哪些参数、descriptor 的 wire 参数、透传下去的每调用沙箱策略、拒绝信息怎么措辞，以及「注册抛错时只损失工具、不损失插件」。它跑不了真实的 Agent 轮次——那仍然要在浏览器里点。

## 已知限制

- **写入走自定义 Remote，不是 `workspaceFiles`**：`workspaceFiles` 没有修改接口，所以由 `mdLive/writeText` 提供（见[写入链路](#写入链路)）。保存需要**活跃**会话——mode 和可写根都是从它解析出来的；会话不活跃就明确拒绝，而不是拿猜的 mode 去写。Session id 由客户端提供，它只是选择器、不是授权：mode 和根由 Host 决定。这同时也是官方模型的现状：`workspaceFileScope` 就是对一个客户端提供的 id 做 lookup，DSH 认证的是**调用方**（Host/Origin 围栏之后的 owner Peer，加进程 token），而不是「这次调用属于哪个会话」。Remote 处理函数拿不到 Peer，所以插件自己没办法收紧这一层。
- **跟随靠的是工具参数，不是文件系统**：Agent 用 `bash`（`cat > x.md`、heredoc）改的 `.md` 不会被跟随，因为那次调用里没有路径。`write`、`edit`、`str_replace_editor` 会。
- **草稿扛不住用 `×` 关掉标签页**：右侧栏没有 per-tab 的关闭否决（`canCloseTab` 只拒绝「guide 是唯一固定页」这一种），关掉就卸载，草稿一起没了。守卫覆盖的是插件发起的导航（返回、列表、跟随）和浏览器 `beforeunload`，不包括应用内关闭。
- **只跟随在屏的会话**：后台会话里的写入不会弹面板，因为那不是读者正在进行的对话。
- **`preview_md` 不校验路径**：工具只负责把请求带过去，解析和读取由面板做，所以路径错了会在面板里报出来而不是在工具结果里。两边都解析等于对同一个问题给两个答案，而实际生效的是面板那个。
- **过滤规则只匹配目录名**：任意层级、忽略大小写，不支持 `docs/archive` 这类路径通配。
- **没有 Mermaid**：```mermaid 保持为带复制按钮的高亮代码块，不是图——测量数据见路线图。
- **公式是 MathML，不是 KaTeX 的 HTML**：交给浏览器自带的排版引擎，所以不需要字体和样式表，但个别结构的观感比 KaTeX 的排版朴素一些。
- **体积**：client bundle 约 861 KB（marked + DOMPurify + KaTeX + 27 种语言的高亮定义），其中 KaTeX 占约 380 KB。

## 路线图

- [x] 写入 API（自定义 Typert Remote `mdLive/writeText`，带版本校验，受会话沙箱策略约束）
- [x] 编辑器（textarea + 脏标记 + 保存 + 版本冲突弹窗）

有两项故意不在列表里，原因相同：成本由每个读者承担，收益只落在少数用到它的文档上。

- **高亮语言按需懒加载**在这里做不了。客户端产物一个 module id 只对应一个文件，经 `__ModuleLoader__.load({ id, factory })` 加载，没有地方放第二个 chunk。改成精简语言表也量过——27 种砍到 15 种省 133 KB，代价是丢掉 c、cpp、csharp、php、ruby、swift、kotlin、lua、perl、r、ini、scss。
- **Mermaid** 是量出来的，不是猜的：打包后增加 11.2 MB（未压缩）、5.0 MB（压缩）。它的 ESM 入口只有 54 KB，是因为内部拆成了动态 import，而这种模块格式必须把它们全部内联。所以 ```mermaid 围栏保持为带复制按钮的高亮代码块——对一个 5 MB 的引擎来说，这个交换是划算的。

## 兼容性

- DSH >= 0.2.0（依赖 `sidebarRightTabs`、`sidebar.right.pane.tab`、`remote.workspaceFiles`；写入 Remote 依赖 `typert`）
- 写入链路在组合里有 `sessions`、`sandboxPolicy` 时会读它们；没有 `sandboxPolicy`（纯 `fs-local`）时不传策略，保持后端原有行为
- 「交给别处打开」依赖 `remote.session.openWorkspacePath` / `canOpenWorkspacePath`；Host 没有桌面可打开时按钮会自动隐藏
- `preview_md` 依赖 `@deepseek-ai/dsh-tools`（锁定到 Host 自带的 `0.2.1-rc.2`）；加载不到时只警告并跳过这个工具，不影响插件
- 数学公式依赖 `katex` 0.16，直接引它的压缩版——客户端产物故意不压缩，引未压缩入口体积会翻倍
- Node.js >= 18（构建期）
- React >= 18（由 DSH 的浏览器模块表提供，不打包进产物）

## 许可证

MIT
