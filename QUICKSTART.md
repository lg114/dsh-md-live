# dsh-md-live 快速开始

## 项目结构

```
dsh-md-live/
├── src/
│   ├── index.ts                    # Host 端入口（文件监听、RPC、工具）
│   └── client/
│       ├── index.tsx               # Client 端入口（面板注册）
│       ├── components/
│       │   ├── MarkdownPreview.tsx # 主面板组件
│       │   └── TOC.tsx             # 目录组件
│       ├── utils/
│       │   └── markdown.ts       # Markdown 渲染工具
│       └── styles/
│           └── panel.css           # 样式（含明暗主题）
├── lib/                            # 构建输出（已生成）
│   ├── index.js                    # Host 编译产物
│   ├── index.d.ts                  # 类型声明
│   ├── client.js                   # Client 打包产物
│   └── client.css                  # 样式产物
├── package.json                    # 插件配置
├── cordis.patch.yml                # Cordis 加载器配置
├── tsconfig.json                   # TypeScript 配置
└── esbuild.config.js               # esbuild 配置
```

## 已实现功能

### ✅ 核心功能

1. **独立右侧面板**
   - 通过 `main` slot 注册面板内容
   - 通过 `sidebar.panellist` slot 注册侧边栏图标
   - 不依赖 better-sidebar，完全独立

2. **实时预览**
   - 编辑模式：左源码 / 右渲染
   - 200ms 防抖自动渲染
   - 预览模式：TOC + 渲染结果

3. **文件热更新**
   - chokidar 监听工作区 `.md` 文件
   - 文件变化自动推送到客户端
   - Agent 修改文件后预览自动刷新

4. **目录导航 (TOC)**
   - 自动提取 Markdown 标题
   - 生成层级目录
   - 点击跳转到对应位置

5. **选区发送到对话**
   - 在预览模式下选中文本
   - 松开鼠标自动发送到当前对话
   - 适合「改这一段」的场景

6. **GFM + 代码高亮**
   - 支持 GitHub Flavored Markdown
   - highlight.js 语法高亮
   - 表格、任务列表、删除线等

7. **主题跟随**
   - 自动适配 DSH 明暗主题
   - CSS variables 实现
   - 支持 `prefers-color-scheme` 和 `.dsh-theme-dark`

8. **Agent 工具**
   - `preview_md`: 打开文件到预览面板
   - `export_md`: 导出为 HTML（PDF 计划中）

## 安装到 DSH

### 方法 1：本地安装（开发）

```bash
# 1. 进入 DSH 项目目录
cd /path/to/deepseek-harness

# 2. 安装插件
dsh plugin --profile web add /path/to/dsh-md-live

# 3. 启动 DSH
dsh web
```

### 方法 2：发布到 npm 后安装

```bash
# 1. 发布插件到 npm
cd /path/to/dsh-md-live
npm publish

# 2. 在 DSH 中安装
dsh plugin --profile web add dsh-md-live
```

## 使用流程

### 1. 打开面板

- 启动 DSH 后，在右侧边栏找到 **📄 Markdown Preview** 图标
- 点击打开面板

### 2. 加载文件

**方式 A：通过 Agent 工具**
```
用户：帮我打开 README.md
Agent：[调用 preview_md 工具]
→ 文件自动在预览面板中打开
```

**方式 B：手动选择**（需要添加文件选择器 UI）
```
→ 在面板中添加文件选择功能
```

### 3. 编辑和预览

- 点击 ✏️ 进入编辑模式
- 左侧编辑，右侧实时预览
- 点击 👁 切换纯预览模式

### 4. 选区发送

- 在预览模式下选中文本
- 松开鼠标，内容自动发送到对话
- 对话中会收到：「关于这段内容：... 请帮我」

### 5. 文件热更新

- 在外部编辑器修改 `.md` 文件
- 或使用 Agent 修改文件
- 预览面板自动刷新

## 技术要点

### Host 端（Node.js）

```typescript
// 文件监听
chokidar.watch(['**/*.md'], { cwd: workspacePath })

// RPC 方法
ctx.rpc.register('md-live:read-file', async (path) => {...})
ctx.rpc.register('md-live:list-files', async (dir) => {...})

// 事件推送
ctx.emit('md-live:file-changed', event)

// 工具注册
ctx.tools.register('preview_md', {...})
```

### Client 端（React）

```typescript
// 面板注册
ctx.slots.inject('main', () => {...})
ctx.slots.inject('sidebar.panellist', () => {...})

// 事件监听
ctx.on('md-live:file-changed', handler)
ctx.on('md-live:client-open-file', handler)

// RPC 调用
ctx.rpc.call('md-live:read-file', path)
ctx.rpc.call('session.prompt', content)
```

### 构建配置

**Host**: TypeScript 编译
```bash
tsc -p tsconfig.json
```

**Client**: esbuild 打包为 CJS
```bash
esbuild --format=cjs --external:react --external:@deepseek-ai/cordis
```

**关键点**：
- Client 必须打包为 CJS（DSH 要求）
- React 和 DSH 模块必须 external（由运行时提供）
- 不能有裸 ESM 语法

## 下一步开发

### 立即可做

1. **添加文件选择器 UI**
   - 在面板顶部添加下拉选择
   - 调用 `md-live:list-files` 获取文件列表

2. **优化选区发送**
   - 添加确认对话框
   - 支持自定义前缀（如「请解释：」「请修改：」）

3. **添加文件新建功能**
   - 工具栏添加「新建」按钮
   - 创建新的 `.md` 文件

### 中期计划

1. **流式预览**
   - 订阅会话流式输出
   - 模型生成 Markdown 时实时渲染

2. **PDF 导出**
   - 使用 puppeteer 或 jsPDF
   - 支持自定义样式

3. **Mermaid 支持**
   - 集成 mermaid.js
   - 渲染流程图、时序图等

4. **KaTeX 支持**
   - 集成 KaTeX
   - 渲染数学公式

### 长期优化

1. **性能优化**
   - 大文件虚拟滚动
   - 增量渲染（只更新变化部分）

2. **多标签页**
   - 同时打开多个文件
   - 标签页切换

3. **协同编辑**
   - 集成 Yjs 或类似库
   - 多人实时编辑

## 调试技巧

### Host 端调试

```typescript
// 在 src/index.ts 中启用日志
const config = { debug: true };

// 查看 DSH 日志
dsh web --verbose
```

### Client 端调试

```javascript
// 浏览器控制台
// 打开 DSH Web 后，F12 打开开发者工具
// 查看 Console、Network、Elements 等
```

### 热重载开发

```bash
# 终端 1：监听文件变化并重新构建
pnpm run dev

# 终端 2：重启 DSH 加载新代码
dsh web
```

## 常见问题

### Q: 面板不显示？

A: 检查：
1. `cordis.patch.yml` 配置正确
2. Client bundle 已构建（`lib/client.js` 存在）
3. 浏览器控制台无报错

### Q: 文件监听不工作？

A: 检查：
1. `workspacePath` 配置正确
2. chokidar 权限（某些系统需要额外配置）
3. Host 日志是否有错误

### Q: 样式不生效？

A: 检查：
1. CSS 已打包到 `lib/client.css`
2. Client 组件正确引入样式文件
3. DSH 主题变量是否正确设置

### Q: 选区发送失败？

A: 检查：
1. `session.prompt` RPC 方法是否可用
2. 当前是否有活跃会话
3. 浏览器控制台是否有错误

## 参考资源

- [DSH 插件开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [DSH Client Modules](https://dsh-plugin.org/tutorials/dsh-client-modules-explained)
- [dsh-ai-news 插件](https://github.com/KeynoWu/dsh-ai-news) - 独立面板参考
- [dsh-annotation 插件](https://github.com/omdsh-dev/dsh-annotation) - 选区发送参考
- [marked 文档](https://marked.js.org/) - Markdown 解析
- [highlight.js 文档](https://highlightjs.org/) - 代码高亮
