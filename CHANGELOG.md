# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-23

### Added

- **独立右侧面板** - 通过 DSH 原生 slot 系统注册，不依赖 better-sidebar
- **实时预览** - 编辑时 200ms 防抖自动渲染
- **分栏模式** - 左源码 / 右渲染，或带 TOC 的纯预览
- **目录导航** - 自动提取标题生成 TOC，点击跳转
- **文件热更新** - 监听工作区 `.md` 文件变化，Agent 修改后自动刷新
- **选区发送** - 选中内容可一键发送到对话继续编辑
- **GFM 支持** - 表格、任务列表、删除线等 GitHub 风格 Markdown
- **代码高亮** - 基于 highlight.js 的语法高亮
- **主题跟随** - 自动适配 DSH 明暗主题
- **导出功能** - 支持导出为 HTML
- **Agent 工具** - `preview_md` 和 `export_md` 工具供 Agent 调用

### Technical Details

- Host: Node.js + chokidar 文件监听 + RPC 网关
- Client: React + marked + highlight.js
- Build: TypeScript + esbuild
- 兼容 DSH >= 0.2.0

[0.1.0]: https://github.com/yourusername/dsh-md-live/releases/tag/v0.1.0
