# dsh-md-live

**DSH 独立右侧面板 Markdown 实时预览插件**

边写边渲染，文件被 Agent 改了自动刷新，选中一段可丢回对话继续改。

## 特性

- ✅ **独立右侧面板** - 不依赖 better-sidebar，通过 DSH 原生 slot 系统注册
- ✅ **实时预览** - 编辑时 200ms 防抖自动渲染
- ✅ **分栏模式** - 左源码 / 右渲染，或带 TOC 的纯预览
- ✅ **目录导航** - 自动提取标题生成 TOC，点击跳转
- ✅ **文件热更新** - 监听工作区 `.md` 文件变化，Agent 修改后自动刷新
- ✅ **选区发送** - 选中内容可一键发送到对话继续编辑
- ✅ **GFM 支持** - 表格、任务列表、删除线等 GitHub 风格 Markdown
- ✅ **代码高亮** - 基于 highlight.js 的语法高亮
- ✅ **主题跟随** - 自动适配 DSH 明暗主题
- ✅ **导出功能** - 支持导出为 HTML（PDF 计划中）

## 安装

### 从本地安装

```bash
# 1. 克隆并构建
git clone <your-repo-url>
cd dsh-md-live
pnpm install
pnpm run build

# 2. 在 DSH 中安装
dsh plugin --profile web add .
```

### 从 npm 安装（发布后）

```bash
dsh plugin --profile web add dsh-md-live
```

## 使用

1. 启动 DSH Web 或桌面端
2. 在右侧边栏找到 **Markdown Preview** 图标（📄）
3. 点击打开面板
4. 通过 Agent 工具 `preview_md` 打开文件，或在面板中手动选择

### 编辑模式

- 点击工具栏 ✏️ 按钮进入编辑模式
- 左侧编辑源码，右侧实时预览
- 编辑时 200ms 防抖自动渲染

### 预览模式

- 点击工具栏 👁 按钮切换纯预览
- 左侧显示 TOC（如果有标题）
- 右侧显示渲染后的 Markdown

### 选区发送

- 在预览模式下选中文本
- 松开鼠标后自动发送到当前对话
- 适合「改这一段」的场景，比整文件重写省 token

### 文件热更新

- 插件自动监听工作区的 `.md` 文件
- Agent 或外部编辑器修改文件后，预览自动刷新
- 无需手动点击或重新打开

## Agent 工具

插件注册了两个工具供 Agent 调用：

### `preview_md`

在预览面板中打开 Markdown 文件。

```typescript
{
  filePath: string  // 相对于工作区的路径
}
```

### `export_md`

导出 Markdown 文件为 HTML 或 PDF。

```typescript
{
  filePath: string,
  format: 'html' | 'pdf'
}
```

## 配置

在 `cordis.patch.yml` 或 DSH 配置文件中：

```yaml
md-live-host:
  workspacePath: /path/to/workspace  # 监听的工作区路径
  extensions: ['.md', '.markdown']   # 监听的文件扩展名
  debug: false                        # 启用调试日志
```

## 开发

```bash
# 安装依赖
pnpm install

# 构建 host 端
pnpm run build:host

# 构建 client 端
pnpm run build:client

# 完整构建
pnpm run build

# 清理
pnpm run clean
```

## 架构

```
dsh-md-live
├── Host (Node.js)
│   ├── 文件监听 (chokidar)
│   ├── RPC 网关 (md-live:read-file, md-live:list-files)
│   └── 工具注册 (preview_md, export_md)
├── Client (React)
│   ├── 面板注册 (main + sidebar.panellist slots)
│   ├── Markdown 渲染 (marked + highlight.js)
│   ├── TOC 生成
│   └── 选区处理
└── 样式 (CSS variables, 明暗主题)
```

## 兼容性

- DSH >= 0.2.0
- Node.js >= 18.0.0
- React >= 18.0.0

## 路线图

- [ ] 流式预览（订阅会话流式输出）
- [ ] PDF 导出
- [ ] Mermaid 图表支持
- [ ] KaTeX 数学公式支持
- [ ] 相对路径图片预览
- [ ] 文件树浏览器
- [ ] 多标签页支持

## 许可证

MIT

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH 插件开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [DSH 插件市场](https://dsh-plugin.org/zh)
