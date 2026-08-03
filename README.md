# Time Series Maker

A lightweight desktop app for drawing time series curves by hand and exporting them as **CSV / JSON** — built with [Neutralino.js](https://neutralino.js.org/) (reuses the system WebView2, no bundled Chromium, ~4 MB package) and vanilla ES Modules + [D3](https://d3js.org/) v7.

## Features

- Hand-draw curves with the mouse; the canvas resizes with the window (Ctrl+wheel to zoom, Shift+wheel to pan)
- History curve list: save curves, select several, export them together; undo/redo (Ctrl+Z / Ctrl+Y)
- Background image tracing, reference lines, noise (Gaussian / uniform / salt & pepper), import reference data
- Optional time mapping (adds a datetime column on export)
- Multi-language UI: 简体中文, English, Русский, 繁體中文, 日本語, 한국어
- Native desktop menu, unsaved-changes confirmation on close, single-instance guard
- Portable build: unzip and run, no installation required

This repository is a desktop migration and extension of the original web app [mbonvini/TimeSeriesMaker](https://github.com/mbonvini/TimeSeriesMaker) (MIT).

## Building from source

### Requirements

- Windows 10/11 (WebView2 runtime required; usually pre-installed)
- Node.js 18 or later (with npm)

### Steps

```bash
# 1. Install dependencies (once)
npm install

# 2. Development mode (opens a desktop window, hot-reloads changes)
npm run dev

# 3. Build the distributable (output: dist/timeseriesmaker/)
npm run build

# 4. (Optional) Build the portable ZIP (output: dist/)
npm run pack
```

### Testing

```bash
npm test        # unit tests (export / import / single-instance)
npm run e2e     # browser end-to-end test (needs a local HTTP server + headless Edge/Chrome)
```

> Note: the `bin/` directory contains the Neutralino runtime binaries and is committed to the repo, so building does not require downloading the framework. Run `npm run update` (requires network) to refresh them.

## Directory structure

```
resources/            Frontend source (index.html + js + css, shared by desktop & browser)
  js/modules/         Feature modules (canvas/draw/export/curves/noise/...)
  js/platform.js      Desktop / browser platform adapter
  js/i18n.js          Translations
  img/                Static assets such as sponsor QR codes
bin/                  Neutralino runtime binaries (needed to build)
scripts/pack.ps1      Portable ZIP packaging script
tests/                Unit and end-to-end tests
```

## License

MIT License — see [LICENSE](LICENSE).

---

# Time Series Maker（中文）

用鼠标手绘时序曲线，并导出为 CSV / JSON 的轻量桌面应用。基于 [Neutralino.js](https://neutralino.js.org/)（复用系统 WebView2，无 Chromium 捆绑，安装包约 4MB）+ 原生 ES Modules + [D3](https://d3js.org/) v7 构建。

## 功能

- 鼠标手绘时序曲线，坐标轴范围可调，画布随窗口自适应缩放（Ctrl+滚轮缩放、Shift+滚轮平移）
- 历史曲线列表：保存、勾选多条、一起导出；撤销/重做（Ctrl+Z / Ctrl+Y）
- 背景图片临摹、参考线、高斯/均匀/椒盐噪声、导入参考数据
- 可选时间映射（导出附带 datetime 列）
- 多语言界面：简体中文、English、Русский、繁體中文、日本語、한국어
- 桌面端原生菜单、关闭前未保存提醒、单实例运行
- 便携版：解压即用，无需安装

本仓库是原 Web 应用 [mbonvini/TimeSeriesMaker](https://github.com/mbonvini/TimeSeriesMaker)（MIT）的桌面化迁移与功能扩展版本。

## 自行构建

### 环境要求

- Windows 10/11（需已安装 WebView2 运行时，系统通常自带）
- Node.js 18 及以上（含 npm）

### 步骤

```bash
# 1. 安装依赖（只需一次）
npm install

# 2. 开发模式（打开桌面窗口，改动即时生效）
npm run dev

# 3. 打包发行版（输出到 dist/timeseriesmaker/）
npm run build

# 4. （可选）打包便携版 ZIP（输出到 dist/）
npm run pack
```

### 测试

```bash
npm test        # 单元测试（导出 / 导入 / 单实例）
npm run e2e     # 浏览器端到端测试（需本地 HTTP 服务 + 无头 Edge/Chrome）
```

> 说明：`bin/` 目录包含 Neutralino 运行时二进制，已随仓库提交，因此构建时无需联网下载框架。如需刷新到新版本可执行 `npm run update`（需要网络）。

## 目录结构

```
resources/            前端源码（index.html + js + css，桌面与浏览器共用）
  js/modules/         功能模块（canvas/draw/export/curves/noise/...）
  js/platform.js      桌面 / 浏览器平台适配层
  js/i18n.js          多语言翻译
  img/                赞助收款码等静态资源
bin/                  Neutralino 运行时二进制（构建需要）
scripts/pack.ps1      便携版打包脚本
tests/                单元测试与端到端测试
```

## 赞助支持

如果你喜欢这个工具，欢迎扫码支持一下，感谢你的支持，我会更有动力持续完善它！

<p align="center">
  <img src="resources/img/qr1.png" width="200" alt="收款码 1">
  <img src="resources/img/qr2.jpg" width="200" alt="收款码 2">
</p>

## License

MIT License，详见 [LICENSE](LICENSE)。
