/**
 * app.js — 主入口，串联所有模块
 *
 * 职责：
 *   - 初始化画布与各模块
 *   - 绑定所有 DOM 事件
 *   - 协调跨模块交互（坐标轴更新 → 通知各模块）
 *   - 管理 UI 状态（导出按钮启用/禁用、状态栏文字、历史曲线列表）
 *
 * 注意：所有初始化代码放在 window 'load' 事件内，
 *       确保页面布局完成后再读取 #canvas 的 clientWidth。
 */

import { initCanvas }                          from './modules/canvas.js';
import { initDraw, clearDrawing, redrawPath,
         restoreStroke, getDrawState,
         updateScales, rescaleDrawing }        from './modules/draw.js';
import { applyNoise }                          from './modules/noise.js';
import { exportToCSV, exportToJSON }           from './modules/export.js';
import { importFromFile }                      from './modules/import.js';
import { initCurves, addHistoryCurve,
         getHistoryCurves, getSelectedCurves,
         setCurveSelected, toggleCurveVisibility,
         renameCurve, removeCurve,
         restoreCurve, setAllSelected, clearHistory,
         getHistoryCount,
         addImported, clearImported,
         getImportedCount,
         updateCurveScales }                   from './modules/curves.js';
import { initRefLines, drawRefLines,
         clearRefLines, updateRefLineScales }  from './modules/reflines.js';
import { initImageLayer, loadImage, lockImage,
         unlockImage, removeImage,
         hasImage, isLocked, setOpacity,
         rescale as rescaleImage }             from './modules/imageLayer.js';
import { initThemeToggle, initHelpPopovers,
         initSidebarCollapse, initShortcutHelp } from './modules/ui.js';
import { push, undo, redo, canUndo,
         canRedo, onChange, reset as resetUndo } from './modules/undo.js';
import { alertDialog, confirmDialog }           from './modules/dialogs.js';
import { initPlatform, isDesktop }             from './platform.js';
import { acquireSingleInstance,
         releaseSingleInstance }               from './modules/singleInstance.js';
import { t, initI18n, initLanguageMenu,
         onLangChange }                        from './modules/i18n.js';
import { initSponsorModal }                    from './modules/sponsor.js';

// ============================================================
// 辅助：UI 状态管理（声明提升，模块初始化时即可调用）
// ============================================================
function setStatus(msg) {
  document.getElementById('curveStatus').textContent = msg;
}

function setExportEnabled(enabled) {
  ['exportCsv', 'exportJSON'].forEach(id => {
    document.getElementById(id).classList.toggle('disabled', !enabled);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function _syncImageButtons() {
  const has    = hasImage();
  const locked = isLocked();
  document.getElementById('removeImageBtn').disabled  = !has;
  document.getElementById('lockImageBtn').disabled    = !has || locked;
  document.getElementById('unlockImageBtn').disabled  = !has || !locked;
  document.getElementById('imageLockBadge').hidden = !(has && locked);
}

/** 根据历史曲线选中状态刷新导出按钮 */
function updateExportButtons() {
  setExportEnabled(getSelectedCurves().length > 0);
}

/** 刷新撤销 / 重做按钮状态 */
function updateUndoButtons() {
  document.getElementById('undoBtn').disabled = !canUndo();
  document.getElementById('redoBtn').disabled = !canRedo();
}

/** 是否有未保存的数据（当前笔迹或历史曲线） */
function isDirty() {
  return getHistoryCount() > 0 || getDrawState().dataPoints.length > 0;
}

/**
 * 请求退出：桌面端先确认未保存数据，确认后才真正退出；
 * 用户取消时恢复被隐藏的窗口继续使用。
 */
async function requestExit() {
  if (isDesktop()) {
    try {
      if (isDirty()) {
        const res = await window.Neutralino.os.showMessageBox(
          t('requestExitTitle'),
          t('requestExitMsg'),
          [t('continueExit'), t('cancel')],
          'WARN',
        );
        const confirmed = res && (res.button === 0 || res === 0);
        if (!confirmed) {
          // 恢复被关闭/隐藏的窗口
          setTimeout(() => window.Neutralino.window.show(), 120);
          return;
        }
      }
    } catch (err) {
      console.warn('关闭确认异常，直接退出：', err);
    }
    await releaseSingleInstance().catch(() => {});
    window.Neutralino.app.exit();
  } else {
    window.close();
  }
}

// 上一笔完成时的累积点集（用于实现"撤销单次绘制"）
let _strokeBaseline = [];

/** 撤销 / 重做快捷键（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z） */
function initUndoShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });
}

/** 顶部撤销 / 重做按钮 */
function initUndoButtons() {
  document.getElementById('undoBtn').addEventListener('click', () => undo());
  document.getElementById('redoBtn').addEventListener('click', () => redo());
}

/** 渲染历史曲线列表 */
function renderHistoryList() {
  const listEl = document.getElementById('historyList');
  const curves = getHistoryCurves();

  if (curves.length === 0) {
    listEl.innerHTML =
      `<div class="history-empty">${t('historyEmpty')}</div>`;
  } else {
    listEl.innerHTML = curves.map(c => `
      <div class="history-item" data-id="${c.id}">
        <label class="history-check" title="${t('selectHint')}">
          <input type="checkbox" data-action="select" ${c.selected ? 'checked' : ''}>
        </label>
        <span class="history-color" style="background:${c.color}"></span>
        <input type="text" class="history-name" data-action="rename"
               value="${escapeHtml(c.name)}" title="${t('renameHint')}">
        <button type="button" class="history-btn" data-action="visible"
                title="${c.visible ? t('hideRef') : t('showRef')}">
          <i class="fa ${c.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
        <button type="button" class="history-btn" data-action="remove" title="${t('deleteHint')}">
          <i class="fa fa-trash"></i>
        </button>
      </div>`).join('');
  }
  updateExportButtons();
}

/** 绘制完成回调（draw 模块调用） */
function _onDrawComplete(dataPoints) {
  const prev = _strokeBaseline;            // 这一笔之前的累积点集
  const next = structuredClone(dataPoints); // 这一笔完成后的累积点集
  push({
    label: '绘制曲线',
    undo: () => {
      if (prev.length) restoreStroke(structuredClone(prev));
      else clearDrawing();
      _strokeBaseline = prev.length ? structuredClone(prev) : [];
    },
    redo: () => {
      restoreStroke(structuredClone(next));
      _strokeBaseline = structuredClone(next);
    },
  });
  _strokeBaseline = next;
  setStatus(t('drawComplete'));
}

/** 构建并设置原生菜单（随语言切换重建） */
function buildNativeMenu() {
  if (!isDesktop() || !window.Neutralino?.window?.setMainMenu) return;
  const menu = [
    {
      text: t('menuFile'),
      submenu: [
        { id: 'menuExportCsv', text: t('menuExportCsv') },
        { id: 'menuExportJson', text: t('menuExportJson') },
        { id: 'menuExit', text: t('menuExit') },
      ],
    },
  ];
  window.Neutralino.window.setMainMenu(JSON.stringify(menu))
    .catch(err => console.warn('原生菜单设置失败：', err));
}

// ============================================================
// 等待页面完全加载（含 CSS 布局），再初始化画布
// ============================================================
window.addEventListener('load', async () => {
  try {

  // ----------------------------------------------------------
  // 0. 平台初始化 + 单实例检测（桌面端）
  // ----------------------------------------------------------
  await initPlatform().catch(err => {
    console.warn('Neutralino 初始化失败：', err);
  });

  if (isDesktop()) {
    let acquired = true;
    try {
      acquired = await acquireSingleInstance();
    } catch (err) {
      console.warn('单实例检测异常，继续启动：', err);
    }
    if (!acquired) {
      // 已有实例在运行：提示后自动退出，不初始化界面
      window.Neutralino.os.showNotification(
        t('singleInstanceTitle'),
        t('singleInstanceMsg')
      ).catch(() => {});
      setTimeout(() => window.Neutralino.app.exit(), 1500);
      return;
    }
  }

  initI18n();
  initLanguageMenu();
  onLangChange(() => {
    buildNativeMenu();
    renderHistoryList();
  });

  initThemeToggle();
  initHelpPopovers();
  initSidebarCollapse();
  initShortcutHelp();
  initSponsorModal();

  // ----------------------------------------------------------
  // 1. 读取初始坐标轴配置
  // ----------------------------------------------------------
  const axisConfig = {
    xMin: parseFloat(document.getElementById('xMin').value) || 0,
    xMax: parseFloat(document.getElementById('xMax').value) || 24,
    yMin: parseFloat(document.getElementById('yMin').value) || 0,
    yMax: parseFloat(document.getElementById('yMax').value) || 100,
  };

  // ----------------------------------------------------------
  // 2. 初始化画布（此时 #canvas clientWidth 已有正确值）
  // ----------------------------------------------------------
  const canvasInst = initCanvas('canvas', axisConfig);
  const { svg, layers, getScales, getDimensions, updateAxes } = canvasInst;
  let scales = getScales();
  let dims   = getDimensions();

  // ----------------------------------------------------------
  // 3. 初始化各功能模块
  // ----------------------------------------------------------
  initDraw(svg, layers.draw, scales, dims, _onDrawComplete);
  initCurves(layers.preserved, layers.imported, scales, renderHistoryList);
  initRefLines(layers.reflines, scales, dims);
  initImageLayer(layers.bgImage, layers.controls, dims);

  // ----------------------------------------------------------
  // 3.5 画布响应式：窗口 / 容器尺寸变化时重绘画布
  // ----------------------------------------------------------
  let _resizeTimer = null;

  function handleResize() {
    const oldScales = scales;
    const res = canvasInst.resize();
    scales = res.scales;
    dims   = res.dims;

    updateScales(scales, dims);
    rescaleDrawing(oldScales, scales, dims);
    updateCurveScales(scales);
    updateRefLineScales(scales, dims);
    rescaleImage(dims);

    // 像素坐标快照随尺寸失效：撤销历史整体重置
    resetUndo();
    _strokeBaseline = _strokeBaseline.map(([px, py]) => [
      scales.x(oldScales.x.invert(px)),
      scales.y(oldScales.y.invert(py)),
    ]);
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(handleResize, 120);
    });
    ro.observe(document.getElementById('canvas'));
  } else {
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(handleResize, 120);
    });
  }

  // Ctrl + 滚轮：仅缩放画布内容；Shift + 滚轮：左右平移画布
  // 左右两栏不受任何影响
  let _zoom = 1;
  let _pan = 0;
  function applyCanvasTransform() {
    const svgEl = document.querySelector('#canvas svg');
    if (!svgEl) return;
    svgEl.style.transform       = `translateX(${_pan}px) scale(${_zoom})`;
    svgEl.style.transformOrigin = '50% 50%';
  }

  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.shiftKey) return;
    e.preventDefault();   // 阻止整页缩放 / 页面滚动
    if (!document.getElementById('canvas').contains(e.target)) return;

    if (e.shiftKey) {
      // 左右平移画布（滚轮向前 = 内容右移的通常方向）
      const delta = e.deltaX || e.deltaY;
      const svgEl = document.querySelector('#canvas svg');
      const maxPan = svgEl ? svgEl.getBoundingClientRect().width : 800;
      _pan = Math.max(-maxPan, Math.min(maxPan, _pan - delta));
      applyCanvasTransform();
    } else {
      _zoom = Math.min(4, Math.max(0.5, _zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      applyCanvasTransform();
    }
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      _zoom = 1;
      _pan = 0;
      applyCanvasTransform();
    }
  });

  // ----------------------------------------------------------
  // 4. 初始状态
  // ----------------------------------------------------------
  setStatus(t('ready'));
  renderHistoryList();
  updateUndoButtons();
  onChange(updateUndoButtons);
  initUndoShortcuts();
  initUndoButtons();
  _syncImageButtons();

  // ----------------------------------------------------------
  // 5. DOM 事件绑定
  // ----------------------------------------------------------

  // ---- 5.1 坐标轴更新 ----
  document.getElementById('updateAxis').addEventListener('click', () => {
    const newXMin = parseFloat(document.getElementById('xMin').value);
    const newXMax = parseFloat(document.getElementById('xMax').value);
    const newYMin = parseFloat(document.getElementById('yMin').value);
    const newYMax = parseFloat(document.getElementById('yMax').value);

    if ([newXMin, newXMax, newYMin, newYMax].some(isNaN)) {
      alertDialog(t('axisInvalid'));
      return;
    }
    if (newXMax <= newXMin || newYMax <= newYMin) {
      alertDialog(t('axisMaxErr'));
      return;
    }

    Object.assign(axisConfig, { xMin: newXMin, xMax: newXMax, yMin: newYMin, yMax: newYMax });
    updateAxes(axisConfig);
    scales = getScales();
    dims   = getDimensions();

    updateScales(scales, dims);
    updateCurveScales(scales);
    updateRefLineScales(scales, dims);

    clearDrawing();
    _strokeBaseline = [];
    setStatus(t('axisUpdated'));
  });

  // ---- 5.2 噪声 ----
  document.getElementById('applyNoise').addEventListener('click', () => {
    const ds = getDrawState();
    if (ds.originalDataPoints.length === 0) {
      alertDialog(t('drawFirst'));
      return;
    }
    const noiseType  = document.getElementById('noiseType').value;
    const noiseLevel = parseFloat(document.getElementById('noiseLevel').value);
    if (noiseLevel < 0 || noiseLevel > 100) {
      alertDialog(t('noiseRangeErr'));
      return;
    }
    const noisy = applyNoise(ds.originalDataPoints, noiseType, noiseLevel, dims.height);
    const original = structuredClone(ds.originalDataPoints);
    redrawPath(noisy);
    _strokeBaseline = structuredClone(ds.dataPoints);
    push({
      label: '添加噪声',
      undo: () => {
        redrawPath(structuredClone(original));
        _strokeBaseline = structuredClone(original);
      },
      redo: () => {
        redrawPath(structuredClone(noisy));
        _strokeBaseline = structuredClone(noisy);
      },
    });
    setStatus(t('noiseApplied'));
  });

  document.getElementById('restoreOriginal').addEventListener('click', () => {
    const ds = getDrawState();
    if (ds.originalDataPoints.length === 0) {
      alertDialog(t('noOriginal'));
      return;
    }
    const original = structuredClone(ds.originalDataPoints);
    const noisy = structuredClone(ds.dataPoints);
    redrawPath(original);
    _strokeBaseline = structuredClone(ds.dataPoints);
    push({
      label: '还原原始',
      undo: () => {
        redrawPath(structuredClone(noisy));
        _strokeBaseline = structuredClone(noisy);
      },
      redo: () => {
        redrawPath(structuredClone(original));
        _strokeBaseline = structuredClone(original);
      },
    });
    setStatus(t('noiseRestored'));
  });

  // ---- 5.3 参考线 ----
  document.getElementById('updateRefLines').addEventListener('click', () => {
    const h  = parseFloat(document.getElementById('hLine').value);
    const v1 = parseFloat(document.getElementById('vLine1').value);
    const v2 = parseFloat(document.getElementById('vLine2').value);
    drawRefLines(
      isNaN(h)  ? null : h,
      isNaN(v1) ? null : v1,
      isNaN(v2) ? null : v2,
    );
  });

  document.getElementById('clearRefLines').addEventListener('click', () => {
    clearRefLines();
    ['hLine', 'vLine1', 'vLine2'].forEach(id => {
      document.getElementById(id).value = '';
    });
  });

  // ---- 5.4 导入数据（参考显示） ----
  const importFileInput = document.getElementById('importFile');

  document.getElementById('importDataBtn').addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files[0];
    if (!file) return;
    try {
      const points = await importFromFile(file);
      addImported(points);
      setStatus(t('importedCount', { n: getImportedCount() }));
    } catch (err) {
      alertDialog(t('importFail', { msg: err.message }));
    }
    importFileInput.value = '';
  });

  // ---- 5.5 历史曲线 ----
  document.getElementById('preserveCurveBtn').addEventListener('click', () => {
    const ds = getDrawState();
    if (ds.dataPoints.length === 0) {
      alertDialog(t('saveFirst'));
      return;
    }
    const index = getHistoryCount();
    const rec = addHistoryCurve(ds.dataPoints);
    clearDrawing();
    _strokeBaseline = [];
    push({
      label: '保存到历史',
      undo: () => removeCurve(rec.id),
      redo: () => restoreCurve(rec, index),
    });
    setStatus(t('savedToHistory', { name: rec.name, n: getHistoryCount() }));
  });

  document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (getHistoryCount() === 0) return;
    if (await confirmDialog(t('confirmClearHistory'))) {
      const records = clearHistory();
      push({
        label: '清空历史',
        undo: () => records.forEach((r, i) => restoreCurve(r, i)),
        redo: () => clearHistory(),
      });
      setStatus(t('historyCleared'));
    }
  });

  document.getElementById('selectAllBtn').addEventListener('click', () => {
    setAllSelected(true);
    setStatus(t('allSelected', { n: getHistoryCount() }));
  });

  document.getElementById('selectNoneBtn').addEventListener('click', () => {
    setAllSelected(false);
    setStatus(t('noneSelected'));
  });

  // 历史列表：勾选 / 重命名（change 事件，避免输入时重绘丢焦点）
  document.getElementById('historyList').addEventListener('change', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;
    const id = parseInt(item.dataset.id, 10);
    if (e.target.matches('input[data-action="select"]')) {
      setCurveSelected(id, e.target.checked);
      setStatus(e.target.checked ? t('curveSelected') : t('curveDeselected'));
    } else if (e.target.matches('input[data-action="rename"]')) {
      const oldName = getHistoryCurves().find(c => c.id === id)?.name || '';
      const newName = e.target.value.trim() || oldName;
      if (newName === oldName) return;
      renameCurve(id, newName);
      push({
        label: '重命名',
        undo: () => renameCurve(id, oldName),
        redo: () => renameCurve(id, newName),
      });
      setStatus(t('curveRenamed'));
    }
  });

  // 历史列表：显示/隐藏、删除
  document.getElementById('historyList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = btn.closest('.history-item');
    const id = parseInt(item.dataset.id, 10);
    const action = btn.dataset.action;

    if (action === 'visible') {
      toggleCurveVisibility(id);
      push({
        label: '显示/隐藏曲线',
        undo: () => toggleCurveVisibility(id),
        redo: () => toggleCurveVisibility(id),
      });
    } else if (action === 'remove') {
      if (await confirmDialog(t('confirmDeleteCurve'))) {
        const removed = removeCurve(id);
        if (removed) {
          push({
            label: '删除曲线',
            undo: () => restoreCurve(removed.record, removed.index),
            redo: () => removeCurve(removed.record.id),
          });
        }
        setStatus(t('curveDeleted'));
      }
    }
  });

  // ---- 5.6 导出（导出所选历史曲线） ----
  function _exportConfig() {
    return {
      numPoints: document.getElementById('numPoints').value,
      fileName:  document.getElementById('fileName').value || 'data',
      startTime: document.getElementById('startTime').value,
      endTime:   document.getElementById('endTime').value,
      xMin: axisConfig.xMin,
      xMax: axisConfig.xMax,
    };
  }

  async function _exportCurves(kind) {
    const selected = getSelectedCurves();
    if (selected.length === 0) {
      alertDialog(t('selectFirst'));
      return;
    }
    const curves = selected.map(c => ({ name: c.name, points: c.dataPoints }));
    const config = _exportConfig();
    try {
      if (kind === 'csv') await exportToCSV(curves, config);
      else await exportToJSON(curves, config);
      setStatus(t('exportedN', { n: selected.length }));
    } catch (err) {
      alertDialog(t('exportFail', { msg: err.message }));
    }
  }

  document.getElementById('exportCsv').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled')) return;
    _exportCurves('csv');
  });

  document.getElementById('exportJSON').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled')) return;
    _exportCurves('json');
  });

  // ---- 5.7 图片临摹 ----
  const bgImageFile = document.getElementById('bgImageFile');

  document.getElementById('loadImageBtn').addEventListener('click', () => bgImageFile.click());

  bgImageFile.addEventListener('change', async () => {
    const file = bgImageFile.files[0];
    if (!file) return;
    try {
      await loadImage(file);
      setOpacity(parseFloat(document.getElementById('imgOpacity').value));
      _syncImageButtons();
      setStatus(t('imageLoaded'));
    } catch (err) {
      alertDialog(t('imageLoadFail', { msg: err.message }));
    }
    bgImageFile.value = '';
  });

  document.getElementById('imgOpacity').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    setOpacity(v);
    document.getElementById('imgOpacityVal').textContent = Math.round(v * 100) + '%';
  });

  document.getElementById('lockImageBtn').addEventListener('click', () => {
    lockImage();
    _syncImageButtons();
    setStatus(t('imageLocked'));
  });

  document.getElementById('unlockImageBtn').addEventListener('click', () => {
    unlockImage();
    _syncImageButtons();
    setStatus(t('imageUnlocked'));
  });

  document.getElementById('removeImageBtn').addEventListener('click', () => {
    removeImage();
    _syncImageButtons();
    setStatus(t('imageRemoved'));
  });

  // ---- 5.8 桌面端：原生菜单与退出保障 ----
  if (isDesktop()) {
    buildNativeMenu();

    // 双击保障：即使配置被覆盖，关窗也确保进程退出
    if (window.Neutralino.events?.on) {
      window.Neutralino.events.on('windowClose', () => { requestExit(); });

      window.Neutralino.events.on('menuItemClicked', async ({ detail }) => {
        const id = detail && detail.id;
        if (id === 'menuExit') {
          requestExit();
        } else if (id === 'menuExportCsv') {
          await _exportCurves('csv');
        } else if (id === 'menuExportJson') {
          await _exportCurves('json');
        }
      });
    }
  }

  } catch (err) {
    // 任何初始化异常都必须可见，避免"画布静默消失"
    console.error('页面初始化失败：', err);
    const st = document.getElementById('curveStatus');
    if (st) st.textContent = '初始化失败：' + (err && err.message ? err.message : String(err));
  }
}); // end window load
