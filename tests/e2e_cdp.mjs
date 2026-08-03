/**
 * 端到端冒烟测试：通过 CDP 控制无头 Edge/Chrome
 *
 * 前提：本地 HTTP 服务已启动（python -m http.server 8765 --directory resources），
 *       浏览器已用 --remote-debugging-port=9223 启动。
 *
 * 覆盖：
 *   - 页面加载无 JS 异常
 *   - 平台徽标（浏览器版）
 *   - 模拟鼠标绘制曲线 → 保存到历史 → 列表渲染 → 导出按钮可用
 *   - 绘制第二条 → 全选/取消全选/删除/清空
 */

const DEBUG_URL = process.env.CDP_DEBUG_URL || 'http://127.0.0.1:9223';
const APP_URL   = process.env.APP_URL || 'http://127.0.0.1:8765/index.html';

const targets = await (await fetch(`${DEBUG_URL}/json`)).json();
const page = targets.find(t => t.type === 'page');
if (!page) throw new Error('没有可用的 page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const issues = [];

function handleMessage(m) {
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    issues.push('exception: ' + (d?.exception?.description || d?.text || JSON.stringify(d)));
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    if (m.params.type === 'error') issues.push(`console.error: ${text}`);
  }
}

const loadWaiters = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Page.loadEventFired') {
    for (const fn of loadWaiters.splice(0)) fn();
  }
  handleMessage(m);
};
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evalJs = async expression => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error('evaluate 异常: ' + res.exceptionDetails.text);
  return res.result?.value;
};

// ---------- 加载页面 ----------
await send('Page.enable');
await send('Runtime.enable');
const waitLoad = () => new Promise(resolve => loadWaiters.push(resolve));
await send('Page.navigate', { url: APP_URL });
await waitLoad();
await new Promise(r => setTimeout(r, 600));

// ---------- 基础状态 ----------
const badgeRemoved = await evalJs(`document.getElementById('platformBadge') === null`);
console.log('platformBadge 已删除:', badgeRemoved);

const status0 = await evalJs(`document.getElementById('curveStatus').textContent`);
console.log('初始状态:', status0);

const emptyMsg = await evalJs(`document.querySelector('.history-empty')?.textContent || ''`);
console.log('历史列表初始:', emptyMsg.trim());

// ---------- 应用内提醒框（标题应为「提醒」） ----------
await evalJs(`document.getElementById('restoreOriginal').click(); true`);
const alertTitle = await evalJs(`document.querySelector('.dialog-title')?.textContent || ''`);
const alertText = await evalJs(`document.querySelector('.dialog-body')?.textContent || ''`);
await evalJs(`document.querySelector('.dialog-ok').click(); true`);
console.log('提醒框: 标题=', alertTitle, '| 内容=', alertText);

// ---------- 新 UI 组件检查 ----------
const themeBefore = await evalJs(`document.documentElement.getAttribute('data-theme')`);
await evalJs(`document.getElementById('themeToggle').click(); true`);
const themeAfter = await evalJs(`document.documentElement.getAttribute('data-theme')`);
console.log('主题切换:', themeBefore, '→', themeAfter);

await evalJs(`document.querySelector('#sec-axis .help-btn').click(); true`);
const helpVisible = await evalJs(`!document.getElementById('helpPopover').hidden`);
const helpText = await evalJs(`document.getElementById('helpPopover').textContent.trim().slice(0, 16)`);
console.log('帮助悬浮框打开:', helpVisible, '| 内容:', helpText);

await evalJs(`document.querySelector('#sec-axis .section-title').click(); true`);
const collapsed = await evalJs(`document.getElementById('sec-axis').classList.contains('collapsed')`);
console.log('分区折叠:', collapsed);

await evalJs(`document.querySelector('#sec-history .help-btn').click(); true`);
const histCollapsed = await evalJs(`document.getElementById('sec-history').classList.contains('collapsed')`);
const popupOpen = await evalJs(`!document.getElementById('helpPopover').hidden`);
console.log('标题内问号不折叠:', histCollapsed === false, '| 悬浮框打开:', popupOpen);

// ---------- 快捷键面板 ----------
await evalJs(`document.getElementById('shortcutBtn').click(); true`);
const shortcutVisible = await evalJs(`!document.getElementById('shortcutPanel').hidden`);
const shortcutText = await evalJs(`document.getElementById('shortcutPanel').textContent`);
await evalJs(`document.getElementById('shortcutBtn').click(); true`);
const shortcutClosed = await evalJs(`document.getElementById('shortcutPanel').hidden`);
console.log('快捷键面板: 打开=', shortcutVisible, '| 再点关闭=', shortcutClosed,
            '| 无Ctrl+Q=', !shortcutText.includes('Ctrl + Q'));

// ---------- 语言切换 ----------
await evalJs(`document.getElementById('langBtn').click(); true`);
const langPanelOpen = await evalJs(`!document.getElementById('langPanel').hidden`);
await evalJs(`document.querySelector('#langPanel .lang-item[data-lang="en"]').click(); true`);
const enBtnText = await evalJs(`document.getElementById('updateAxis').textContent`);
const enStatus = await evalJs(`document.getElementById('curveStatus').textContent`);
console.log('语言切换: 面板打开=', langPanelOpen, '| 英文按钮=', enBtnText, '| 状态=', enStatus);
await evalJs(`document.getElementById('langBtn').click(); true`);
await evalJs(`document.querySelector('#langPanel .lang-item[data-lang="zh-CN"]').click(); true`);
const zhBtnText = await evalJs(`document.getElementById('updateAxis').textContent`);
console.log('切回简体中文:', zhBtnText);

// ---------- 赞助弹窗 ----------
await evalJs(`document.getElementById('sponsorBtn').click(); true`);
const sponsorOpen = await evalJs(`!document.querySelector('.sponsor-dialog').closest('.dialog-overlay').hidden`);
const qrCount = await evalJs(`document.querySelectorAll('.sponsor-slot img').length`);
const emptySlot = await evalJs(`!!document.querySelector('.sponsor-empty')`);
await new Promise(r => setTimeout(r, 400));   // 等待本地图片加载
const qrLoaded = await evalJs(`[...document.querySelectorAll('.sponsor-slot img')].every(i => i.naturalWidth > 0)`);
const sponsorTitle = await evalJs(`document.querySelector('.sponsor-title').textContent`);
await evalJs(`document.querySelector('.sponsor-close').click(); true`);
const sponsorClosed = await evalJs(`document.querySelector('.sponsor-dialog').closest('.dialog-overlay').hidden`);
console.log('赞助弹窗: 打开=', sponsorOpen, '| 图片数=', qrCount, '| 空位=', emptySlot,
            '| 图片加载=', qrLoaded, '| 标题=', sponsorTitle, '| 关闭=', sponsorClosed);

// ---------- 模拟绘制第一条曲线 ----------
const drawScript = `
  (() => {
    const r = document.querySelector('#rect');
    const box = r.getBoundingClientRect();
    const W = box.width, H = box.height;
    const fire = (type, x, y) => r.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: box.left + x, clientY: box.top + y, button: 0,
    }));
    fire('mousedown', 10, H * 0.8);
    for (let i = 1; i <= 20; i++) {
      fire('mousemove', 10 + (W - 30) * i / 20, H * (0.8 - 0.5 * Math.sin(i / 3)));
    }
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return document.querySelectorAll('.currentPath').length;
  })()
`;
const pathCount = await evalJs(drawScript);
console.log('绘制后 .currentPath 数量:', pathCount);
const status1 = await evalJs(`document.getElementById('curveStatus').textContent`);
console.log('绘制后状态:', status1);

const undoEnabledAfterDraw = await evalJs(`!document.getElementById('undoBtn').disabled`);
console.log('绘制后可撤销:', undoEnabledAfterDraw);

// ---------- 断续两段绘制：撤销只去掉第二段 ----------
const dSeg1 = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
const drawScript2 = `
  (() => {
    const r = document.querySelector('#rect');
    const box = r.getBoundingClientRect();
    const W = box.width, H = box.height;
    const fire = (type, x, y) => r.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: box.left + x, clientY: box.top + y, button: 0,
    }));
    fire('mousedown', W - 15, H * 0.6);
    for (let i = 1; i <= 5; i++) {
      fire('mousemove', W - 15 + i, H * (0.6 - 0.08 * i));
    }
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
  })()
`;
await evalJs(drawScript2);
const dSeg2 = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
await evalJs(`document.getElementById('undoBtn').click(); true`);
const dAfterSegUndo = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
console.log('分段撤销: 第二段有新增=', dSeg1 !== dSeg2, '| 撤销后回到第一段=', dAfterSegUndo === dSeg1);

// ---------- 噪声撤销 ----------
const dBefore = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
await evalJs(`document.getElementById('applyNoise').click(); true`);
const dNoisy = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
await evalJs(`document.getElementById('undoBtn').click(); true`);
const dAfterUndo = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
console.log('噪声撤销恢复:', dBefore === dAfterUndo, '| 加噪前后不同:', dBefore !== dNoisy);

// ---------- 保存到历史 ----------
await evalJs(`document.getElementById('preserveCurveBtn').click(); true`);
const hist1 = await evalJs(`(() => {
  const items = [...document.querySelectorAll('.history-item')];
  return {
    count: items.length,
    name: items[0]?.querySelector('.history-name')?.value,
    checked: items[0]?.querySelector('input[data-action="select"]')?.checked,
    paths: document.querySelectorAll('.historyPath').length,
  };
})()`);
console.log('保存后历史:', JSON.stringify(hist1));

const exportEnabled = await evalJs(
  `!document.getElementById('exportCsv').classList.contains('disabled')`);
console.log('导出按钮可用:', exportEnabled);

// ---------- 绘制第二条并保存 ----------
await evalJs(drawScript);
await evalJs(`document.getElementById('preserveCurveBtn').click(); true`);
const hist2 = await evalJs(`document.querySelectorAll('.history-item').length`);
console.log('第二条保存后历史条数:', hist2);

// ---------- 取消全选 → 导出禁用 ----------
await evalJs(`document.getElementById('selectNoneBtn').click(); true`);
const afterNone = await evalJs(
  `!document.getElementById('exportCsv').classList.contains('disabled')`);
console.log('取消全选后导出按钮仍可用:', afterNone);

// ---------- 全选 → 导出启用 ----------
await evalJs(`document.getElementById('selectAllBtn').click(); true`);
const afterAll = await evalJs(
  `!document.getElementById('exportCsv').classList.contains('disabled')`);
console.log('全选后导出按钮可用:', afterAll);

// ---------- 删除一条（应用内确认框） ----------
await evalJs(`document.querySelector('.history-item button[data-action="remove"]').click(); true`);
const deleteTitle = await evalJs(`document.querySelector('.dialog-title')?.textContent || ''`);
await evalJs(`document.querySelector('.dialog-ok').click(); true`);
const afterDelete = await evalJs(`document.querySelectorAll('.history-item').length`);
console.log('删除后历史条数:', afterDelete, '| 确认框标题:', deleteTitle);

// ---------- 清空历史 ----------
await evalJs(`document.getElementById('clearHistoryBtn').click(); true`);
await evalJs(`document.querySelector('.dialog-ok').click(); true`);
const afterClear = await evalJs(`document.querySelectorAll('.history-item').length`);
console.log('清空后历史条数:', afterClear);

// ---------- 历史操作撤销 / 重做 ----------
await evalJs(`document.getElementById('undoBtn').click(); true`);
const undo1 = await evalJs(`document.querySelectorAll('.history-item').length`);
await evalJs(`document.getElementById('undoBtn').click(); true`);
const undo2 = await evalJs(`document.querySelectorAll('.history-item').length`);
await evalJs(`document.getElementById('redoBtn').click(); true`);
const redo1 = await evalJs(`document.querySelectorAll('.history-item').length`);
await evalJs(`document.getElementById('redoBtn').click(); true`);
const redo2 = await evalJs(`document.querySelectorAll('.history-item').length`);
console.log('历史撤销/重做序列:', [undo1, undo2, redo1, redo2].join(','));

// ---------- 画布随窗口缩放（侧栏不缩放） ----------
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 500));

await evalJs(drawScript);
await evalJs(`document.getElementById('preserveCurveBtn').click(); true`);
const dHistBefore = await evalJs(`document.querySelector('.historyPath')?.getAttribute('d') || ''`);
const svgBefore = await evalJs(`(() => {
  const s = document.querySelector('#canvas svg');
  return s ? [s.getAttribute('width'), s.getAttribute('height')] : null;
})()`);
const sideWBefore = await evalJs(`document.querySelector('.sidebar-left').getBoundingClientRect().width`);

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 600));

const svgAfter = await evalJs(`(() => {
  const s = document.querySelector('#canvas svg');
  return s ? [s.getAttribute('width'), s.getAttribute('height')] : null;
})()`);
const sideWAfter = await evalJs(`document.querySelector('.sidebar-left').getBoundingClientRect().width`);
const dHistAfter = await evalJs(`document.querySelector('.historyPath')?.getAttribute('d') || ''`);
console.log('窗口缩放: svg', JSON.stringify(svgBefore), '→', JSON.stringify(svgAfter),
            '| 侧栏宽不变:', sideWBefore === sideWAfter,
            '| 历史曲线重绘:', dHistBefore !== dHistAfter);

// 坐标轴位置与网格线长度应随新尺寸更新（辅助线排版）
const xAxisTransform = await evalJs(`document.querySelector('.x.axis')?.getAttribute('transform') || ''`);
const svgH = await evalJs(`parseFloat(document.querySelector('#canvas svg').getAttribute('height'))`);
const gridY2 = await evalJs(`parseFloat(document.querySelector('.x.axis .tick line')?.getAttribute('y2') || 'NaN')`);
// SVG 高度 = 绘图区高度 + 上边距(20) + 下边距(50)
const expectedY2 = -(svgH - 70);
const xAxisY = parseFloat((xAxisTransform.match(/translate\(0,([-\d.]+)\)/) || [])[1] || 'NaN');
console.log('辅助线排版: X轴=', xAxisTransform,
            '| 网格线 y2=', gridY2, '期望=', expectedY2,
            '| 正确=', Math.abs(xAxisY - (svgH - 70)) < 0.01 && Math.abs(gridY2 - expectedY2) < 0.01);

// ---------- Ctrl+滚轮：只缩放画布，侧栏不缩放 ----------
const zoom0 = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
await evalJs(`document.querySelector('#canvas').dispatchEvent(
  new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })); true`);
const zoom1 = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
await evalJs(`document.querySelector('.sidebar-left').dispatchEvent(
  new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })); true`);
const zoom2 = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
console.log('画布缩放:', zoom0, '→', zoom1, '| 侧栏滚轮不影响画布:', zoom1 === zoom2);

await evalJs(`document.dispatchEvent(
  new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })); true`);
const zoomReset = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
console.log('Ctrl+0 复位:', zoomReset);

// ---------- Shift+滚轮：左右平移画布 ----------
const panBefore = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
await evalJs(`document.querySelector('#canvas').dispatchEvent(
  new WheelEvent('wheel', { shiftKey: true, deltaY: 120, bubbles: true, cancelable: true })); true`);
const panAfter = await evalJs(`document.querySelector('#canvas svg').style.transform || ''`);
console.log('Shift+滚轮平移:', panBefore, '→', panAfter);

// ---------- 缩放状态下绘制仍精确 ----------
await evalJs(`document.querySelector('#canvas').dispatchEvent(
  new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })); true`);
const drawUnderZoom = await evalJs(drawScript);
const pathUnderZoom = await evalJs(`document.querySelector('.currentPath')?.getAttribute('d') || ''`);
console.log('缩放状态下绘制: 路径数量=', drawUnderZoom, '| 路径非空:', pathUnderZoom.length > 0);

// ---------- 桌面模式模拟（回归：NL_TOKEN 注入时画布必须渲染） ----------
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  Object.defineProperty(window, 'NL_TOKEN', { value: 'test-token', configurable: true });
  Object.defineProperty(window, 'NL_PORT', { value: '1', configurable: true });
  Object.defineProperty(window, 'Neutralino', {
    value: {
      init() {},
      os: {
        showSaveDialog: async () => null,
        showMessageBox: async (title, content, choice) => {
          window.__nlMsg = { title, content, choice };
          return { button: (typeof window.__nlMsgChoice === 'number') ? window.__nlMsgChoice : 0 };
        },
        showNotification: async () => {},
        getPath: async () => 'C:/fake/appdata',
        execCommand: async () => ({ stdOut: '' }),
      },
      filesystem: {
        writeFile: async p => { window.__nlFs = window.__nlFs || {}; window.__nlFs[p] = 1; },
        readFile: async () => { throw new Error('no lock'); },
        remove: async p => { if (window.__nlFs) delete window.__nlFs[p]; },
        getJoinedPath: async (b, n) => b + '/' + n,
      },
      window: {
        setMainMenu: async () => {},
        show: async () => { window.__nlShown = (window.__nlShown || 0) + 1; },
      },
      events: {
        on: async (name, cb) => {
          window.__nlHandlers = window.__nlHandlers || {};
          window.__nlHandlers[name] = cb;
        },
      },
      app: {
        exit: () => { window.__nlExits = (window.__nlExits || 0) + 1; },
        getProcessId: async () => 12345,
      },
    },
    configurable: true,
  });
` });

await send('Page.navigate', { url: APP_URL });
await waitLoad();
await new Promise(r => setTimeout(r, 600));

const desktopSvg = await evalJs(`document.querySelectorAll('#canvas svg').length`);
console.log('桌面模式 #canvas svg 数量:', desktopSvg);

const desktopBadgeRemoved = await evalJs(`document.getElementById('platformBadge') === null`);
console.log('桌面模式 platformBadge 已删除:', desktopBadgeRemoved);

const deskDraw = await evalJs(drawScript);
console.log('桌面模式绘制 .currentPath 数量:', deskDraw);

await evalJs(`document.getElementById('preserveCurveBtn').click(); true`);
const deskHist = await evalJs(`document.querySelectorAll('.history-item').length`);
console.log('桌面模式保存后历史条数:', deskHist);

const desktopStatus = await evalJs(`document.getElementById('curveStatus').textContent`);
console.log('桌面模式状态栏:', desktopStatus);

// ---------- 关闭确认（桌面模拟） ----------
// 当前有历史曲线 → 关闭应弹确认框；选择退出则退出
await evalJs(`window.__nlExits = 0; window.__nlShown = 0; window.__nlMsgChoice = 0; window.__nlMsg = null; true`);
await evalJs(`(async () => { await window.__nlHandlers['windowClose'](); return true; })()`);
const exitOk = await evalJs(`window.__nlExits`);
const msgShown = await evalJs(`!!window.__nlMsg`);
console.log('关闭确认(选择退出): exits =', exitOk, '| 弹确认框:', msgShown);

// 选择取消 → 不退出，并恢复窗口
await evalJs(`window.__nlExits = 0; window.__nlShown = 0; window.__nlMsgChoice = 1; window.__nlMsg = null; true`);
await evalJs(`(async () => { await window.__nlHandlers['windowClose'](); return true; })()`);
await new Promise(r => setTimeout(r, 350));
const exitCancel = await evalJs(`window.__nlExits`);
const shownCancel = await evalJs(`window.__nlShown`);
console.log('关闭确认(取消): exits =', exitCancel, '| 恢复窗口 show =', shownCancel);

// 干净状态（清空历史后）→ 不弹确认直接退出
await evalJs(`document.getElementById('clearHistoryBtn').click(); true`);
await evalJs(`document.querySelector('.dialog-ok').click(); true`);
await evalJs(`window.__nlExits = 0; window.__nlMsg = null; true`);
await evalJs(`(async () => { await window.__nlHandlers['windowClose'](); return true; })()`);
const exitClean = await evalJs(`window.__nlExits`);
const noMsgClean = await evalJs(`window.__nlMsg === null`);
console.log('干净关闭: exits =', exitClean, '| 未弹确认框:', noMsgClean);

// ---------- 截图 ----------
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
const os = await import('node:os');
const out = process.env.SHOT_PATH || `${os.tmpdir()}/tsm_e2e.png`;
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('screenshot saved:', out);

console.log('--- 运行时问题 ---');
console.log(issues.length ? issues.join('\n') : '无 JS 异常 / console.error');

ws.close();
