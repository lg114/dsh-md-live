# dsh-md-live

[English](README.md) | 中文

DSH Web 右侧栏的原生 Markdown 预览标签页。

在右侧栏点 `+` → 选 `md-live` → 挑一个工作区里的 `.md`。之后 Agent 或外部编辑器改动这个文件，面板会自己刷新，不需要手动刷新或重开。

## 特性

- **原生右侧 tab** —— 走 `ctx.sidebarRightTabs` + `sidebar.right.pane.tab` 注册，和 Files / Terminal 那些标签页同一套机制，不是往主区域塞面板。
- **全工作区扫描** —— 从会话的工作区根目录开始遍历整棵树，并行（每层 8 个并发）、逐层出结果：第一层扫完就先画出来，不等整棵树。
- **过滤规则可编辑** —— 默认跳过 `node_modules`、`.git`、`dist` 等目录；规则在界面上直接改、存在浏览器里，也可以一键全量扫描。
- **实时刷新** —— 基于 `remote.workspaceFiles.changes` 的文件监听，保存即更新；只有监听不可用时才出现手动刷新按钮。
- **路径可见** —— 头部显示 `目录/文件名`（相对工作区），窄面板时目录先省略，文件名始终完整；悬停看绝对路径。
- **TOC** —— 自动提取标题，锚点由渲染阶段注入，点击真的能跳转。
- **安全渲染** —— DOMPurify（HTML profile）净化，脚本、iframe、事件属性、`javascript:` 链接都会被剥掉。
- **代码高亮** —— highlight.js，按需注册 27 种常用语言。
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
├── 文件内容        remote.workspaceFiles.readBytes → TextDecoder
└── 热更新          remote.workspaceFiles.changes → $stream + accept()

Host（lib/index.js）
└── 空的 apply()：注册这个包本身，没有运行时逻辑
```

几个必须知道的约束，都是踩过的坑：

1. **`ctx.remote.*` 返回的是 Result 信封**，不是裸数据：`{ ok: true, value } | { ok: false, error }`。直接取字段会得到 `undefined` 而且不报错——空文件列表看起来就像"工作区里没有文件"。
2. **`list`/`readBytes` 的 path 不能为空**，Host 会抛 `path is required`。起点必须是会话的绝对 cwd（slot 的标准 prop `useSessions` → `byId[sessionId].cwd`）。
3. **`changes` 是 Remote 流**，要用 `remote.$stream({ name, open, ended })` 包一层并逐帧 `accept()`，否则上行窗口满了就静默停更。
4. **没有 host → client 的事件桥**。客户端插件能用的只有 `ctx.remote.*` 的请求/响应与流；Host 侧 `ctx.emit` 的事件不会到达浏览器。所以这个插件的 Host 半身是空的。
5. **client bundle 必须是 `window.__ModuleLoader__.load({ id, factory })` 格式**：脚本执行时只注册工厂，`require` 由 loader 在物化时传入。丢掉这层包装，产物里的 `require("react")` 会在浏览器全局作用域执行，直接 `ReferenceError`。

## 开发

```bash
npm run build          # host (tsc) + client (esbuild)
npm run build:client   # 只构建 client
npm run verify:client  # 用 jsdom 挂载真实产物跑 35 项端到端检查
npm run clean
```

`verify:client` 会模拟 DSH 的模块加载器（注册 → 物化 → apply），再在 jsdom 里挂载 tab body，覆盖：注册与 slot key、Remote 信封解包、目录递归、过滤规则与持久化、渐进渲染、热更新、卸载清理、TOC 锚点、净化、代码高亮。改完 client 代码先跑它，比在浏览器里点快得多。

## 已知限制

- **只读**：`workspaceFiles` 没有写入接口，所以没有编辑器，也不能保存修改。
- **不会自动打开**：没有 host → client 推送通道，"Agent 写完自动弹面板"需要自定义 Remote 或订阅会话流，目前未实现。
- **图片路径不解析**：相对路径的 `![](...)` 不会转成 `dsh-resource://` 地址，显示为破图。
- **过滤规则只匹配目录名**：任意层级、忽略大小写，不支持 `docs/archive` 这类路径通配。
- **没有 Mermaid / KaTeX**：`$$...$$` 和 ```mermaid 会当普通文本渲染。
- **体积**：client bundle 约 460 KB（marked + DOMPurify + 27 种语言的高亮定义）。

## 路线图

- [ ] 代码高亮语言按需懒加载，进一步减小首包
- [ ] 相对路径图片（转 `dsh-resource://` 地址）
- [ ] Mermaid / KaTeX
- [ ] 编辑并保存（需要写入 API）
- [ ] Agent 写完自动打开（需要一条真正的 host → client 通道）

## 兼容性

- DSH >= 0.2.0（依赖 `sidebarRightTabs`、`sidebar.right.pane.tab`、`remote.workspaceFiles`）
- Node.js >= 18（构建期）
- React >= 18（由 DSH 的浏览器模块表提供，不打包进产物）

## 许可证

MIT
