/**
 * curves.js — 历史绘制曲线 & 导入参考曲线管理
 *
 * 职责：
 *   - 维护 historyCurves（历史绘制曲线）
 *     · 每条曲线含 id / name / dataPoints（数据坐标）/ visible / selected / color
 *   - 维护 importedDatasets（导入参考数据集）
 *   - 坐标轴更新后用新比例尺重绘所有曲线
 *   - 数据变化时通过 onChange 回调通知 UI 刷新列表
 */

import { t } from './i18n.js';

// 数据坐标存储（不随坐标轴变化，重绘时动态换算为像素）
let _history = [];   // [{ id, name, dataPoints, visible, selected, color }]
let _imported = [];  // [[dataX, dataY], ...][]

let _historyLayer = null;
let _importedLayer = null;
let _scales = null;   // { x, y }
let _onChange = null; // 列表变化回调

let _nextId = 1;

const _lineFn = d3.line()
  .x(d => d[0])
  .y(d => d[1]);

/** 曲线颜色调色板（循环使用） */
const PALETTE = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

const colorFor = idx => PALETTE[idx % PALETTE.length];

/** 初始化模块 */
export function initCurves(historyLayer, importedLayer, scales, onChange) {
  _historyLayer = historyLayer;
  _importedLayer = importedLayer;
  _scales = scales;
  _onChange = onChange || null;
}

/** 坐标轴更新时同步新比例尺并重绘 */
export function updateCurveScales(scales) {
  _scales = scales;
  redrawHistory();
  redrawImported();
}

/** 内部：数据变化后通知 UI */
function _emitChange() {
  _onChange && _onChange();
}

// ---------- 历史曲线 ----------

/**
 * 将当前像素坐标曲线转为数据坐标后加入历史
 * @param {Array} pixelPoints — [[px, py], ...]
 * @param {string} [name]     — 可选曲线名，缺省自动编号
 * @returns {object|null} 新曲线记录
 */
export function addHistoryCurve(pixelPoints, name) {
  if (!pixelPoints || pixelPoints.length === 0) return null;
  const dataPoints = pixelPoints.map(([px, py]) => [
    _scales.x.invert(px),
    _scales.y.invert(py),
  ]);
  const record = {
    id: _nextId++,
    name: name && name.trim() ? name.trim() : t('curveDefaultName', { n: _nextId - 1 }),
    dataPoints,
    visible: true,   // 默认在画布上显示为参考
    selected: true,  // 默认选中，便于直接导出
    color: colorFor(_history.length),
  };
  _history.push(record);
  redrawHistory();
  _emitChange();
  return record;
}

/** 获取全部历史曲线（引用） */
export function getHistoryCurves() {
  return _history;
}

/** 获取已选中的历史曲线 */
export function getSelectedCurves() {
  return _history.filter(c => c.selected);
}

/** 设置某条曲线的选中状态 */
export function setCurveSelected(id, selected) {
  const c = _history.find(c => c.id === id);
  if (!c) return;
  c.selected = !!selected;
  _emitChange();
}

/** 切换某条曲线的可见性（是否在画布上显示参考） */
export function toggleCurveVisibility(id) {
  const c = _history.find(c => c.id === id);
  if (!c) return;
  c.visible = !c.visible;
  redrawHistory();
  _emitChange();
}

/** 重命名曲线 */
export function renameCurve(id, name) {
  const c = _history.find(c => c.id === id);
  if (!c) return;
  const trimmed = (name || '').trim();
  if (trimmed) c.name = trimmed;
  _emitChange();
}

/** 删除一条历史曲线，返回被删记录与位置（供撤销恢复） */
export function removeCurve(id) {
  const index = _history.findIndex(c => c.id === id);
  if (index === -1) return null;
  const [record] = _history.splice(index, 1);
  redrawHistory();
  _emitChange();
  return { record, index };
}

/** 全选 / 取消全选 */
export function setAllSelected(selected) {
  _history.forEach(c => { c.selected = !!selected; });
  _emitChange();
}

/** 清空全部历史曲线，返回被清空的记录列表（供撤销恢复） */
export function clearHistory() {
  const records = _history.slice();
  _history = [];
  _historyLayer.selectAll('.historyPath').remove();
  _emitChange();
  return records;
}

/** 恢复一条历史曲线到指定位置（撤销/重做用） */
export function restoreCurve(record, index) {
  if (!record) return;
  const idx = (index !== undefined && index !== null)
    ? Math.min(index, _history.length)
    : _history.length;
  _history.splice(idx, 0, record);
  if (record.id >= _nextId) _nextId = record.id + 1;
  redrawHistory();
  _emitChange();
}

/** 用当前比例尺重绘所有可见历史曲线（虚线参考） */
export function redrawHistory() {
  _historyLayer.selectAll('.historyPath').remove();
  _history.forEach(c => {
    if (!c.visible) return;
    const px = c.dataPoints.map(([dx, dy]) => [_scales.x(dx), _scales.y(dy)]);
    _historyLayer.append('path')
      .attr('class', 'historyPath')
      .attr('data-id', c.id)
      .style('stroke', c.color)
      .style('stroke-width', 2)
      .style('stroke-opacity', 0.55)
      .style('fill', 'none')
      .style('stroke-dasharray', '6,3')
      .datum(px)
      .attr('d', _lineFn);
  });
}

export function getHistoryCount() { return _history.length; }

// ---------- 导入参考曲线 ----------

/**
 * 添加一组数据坐标并重绘
 * @param {Array} dataPoints — [[dataX, dataY], ...]
 */
export function addImported(dataPoints) {
  _imported.push(dataPoints);
  redrawImported();
}

/** 清除所有导入曲线 */
export function clearImported() {
  _imported = [];
  _importedLayer.selectAll('.importedPath').remove();
}

/** 用当前比例尺重绘所有导入曲线 */
export function redrawImported() {
  _importedLayer.selectAll('.importedPath').remove();
  _imported.forEach((dataPts, idx) => {
    const px = dataPts.map(([dx, dy]) => [_scales.x(dx), _scales.y(dy)]);
    _importedLayer.append('path')
      .attr('class', 'importedPath')
      .attr('data-index', idx)
      .style('stroke', '#3498db')
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', '5,5')
      .style('fill', 'none')
      .datum(px)
      .attr('d', _lineFn);
  });
}

export function getImportedCount() { return _imported.length; }
