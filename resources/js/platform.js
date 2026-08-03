/**
 * platform.js — 桌面 / 浏览器平台适配层
 *
 * 职责：
 *   - 检测当前是否运行在 Neutralino 桌面壳中
 *   - 统一文件保存能力：
 *       桌面端 → 原生「另存为」对话框 + 直接写入文件
 *       浏览器 → Blob + <a download> 下载
 *
 * 判定依据：Neutralino 主进程在页面加载时会注入
 * window.NL_TOKEN / window.NL_PORT 等全局变量；浏览器里没有。
 */

/** 是否运行在 Neutralino 桌面壳中 */
export function isDesktop() {
  return typeof window !== 'undefined'
    && !!window.Neutralino
    && !!window.NL_TOKEN
    && !!window.NL_PORT;
}

/**
 * 初始化桌面壳连接（浏览器环境直接跳过）
 *
 * 注意：Neutralino.init() 是同步函数且不返回 Promise，
 *       这里用 async 包装，保证调用方可以 await / .catch。
 */
export async function initPlatform() {
  if (isDesktop()) {
    await window.Neutralino.init();
  }
}

/**
 * 将文本内容保存为文件
 * @param {string} defaultName — 默认文件名（含扩展名）
 * @param {string} content     — 文本内容
 * @param {string} mimeType    — MIME 类型
 * @returns {Promise<string|null>} 保存路径（用户取消时为 null）
 */
export async function saveTextFile(defaultName, content, mimeType) {
  if (isDesktop()) {
    const ext = defaultName.includes('.') ? defaultName.split('.').pop() : '';
    const filterName = ext === 'json' ? 'JSON 文件' : 'CSV 文件';
    const path = await window.Neutralino.os.showSaveDialog('保存文件', {
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (!path) return null;
    await window.Neutralino.filesystem.writeFile(path, content);
    return path;
  }

  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}
