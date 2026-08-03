# Time Series Maker

用鼠标手绘时序曲线，并导出为 CSV / JSON 的轻量桌面应用。

## 功能

- 鼠标手绘时序曲线，坐标轴范围可调，画布随窗口自适应缩放（Ctrl+滚轮缩放、Shift+滚轮平移）
- 历史曲线列表：保存、勾选多条、一起导出；撤销/重做（Ctrl+Z / Ctrl+Y）
- 背景图片临摹、参考线、高斯/均匀/椒盐噪声、导入参考数据
- 可选时间映射（导出附带 datetime 列）
- 多语言界面：简体中文、English、Русский、繁體中文、日本語、한국어
- 桌面端原生菜单、关闭前未保存提醒、单实例运行
- 便携版：解压即用，无需安装

## 技术栈

- 桌面壳：[Neutralino.js](https://neutralino.js.org/) v6（复用系统 WebView2，无 Chromium 捆绑，安装包约 4MB）
- 前端：原生 ES Modules + [D3](https://d3js.org/) v7 + 自定义样式（无构建框架）
- 原项目为纯 Web 应用（[mbonvini/TimeSeriesMaker](https://github.com/mbonvini/TimeSeriesMaker)，MIT），本仓库在其基础上迁移为桌面应用并扩展功能。

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

> 说明：`bin/` 目录包含 Neutralino 运行时二进制，已随仓库提交，因此构建时无需联网下载框架。
> 如需刷新到新版本可执行 `npm run update`（需要网络）。

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

## License

MIT License，详见 [LICENSE](LICENSE)。
