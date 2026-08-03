/**
 * reflines.js — 参考线模块
 *
 * 职责：
 *   - 绘制水平参考线（H）和垂直参考线（V1、V2）
 *   - 坐标轴更新后用新比例尺重绘
 *   - 清除所有参考线
 *
 * 参考线以数据坐标存储，渲染时换算为像素。
 */

let _layer  = null;   // reflines 图层
let _scales = null;   // { x, y }
let _dims   = null;   // { width, height }

// 当前参考线数据坐标（null 表示未设置）
let _current = { h: null, v1: null, v2: null };

/** 初始化模块 */
export function initRefLines(layer, scales, dims) {
  _layer  = layer;
  _scales = scales;
  _dims   = dims;
}

/** 坐标轴更新时同步新比例尺并重绘 */
export function updateRefLineScales(scales, dims) {
  _scales = scales;
  _dims   = dims;
  _redraw();
}

/**
 * 绘制参考线（以数据坐标为输入）
 * @param {number|null} h   — 水平线 Y 数据值
 * @param {number|null} v1  — 垂直线 1 X 数据值
 * @param {number|null} v2  — 垂直线 2 X 数据值
 */
export function drawRefLines(h, v1, v2) {
  _current = { h, v1, v2 };
  _redraw();
}

/** 清除所有参考线 */
export function clearRefLines() {
  _current = { h: null, v1: null, v2: null };
  _layer.selectAll('.refLine').remove();
}

/** 用当前比例尺重绘已保存的参考线 */
function _redraw() {
  _layer.selectAll('.refLine').remove();

  const { h, v1, v2 } = _current;

  if (h !== null && !isNaN(h)) {
    const yPx = _scales.y(h);
    _layer.append('line')
      .attr('class', 'refLine hLine')
      .attr('x1', 0).attr('y1', yPx)
      .attr('x2', _dims.width).attr('y2', yPx)
      .style('stroke', 'red')
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', '6,4');
  }

  [v1, v2].forEach((v, i) => {
    if (v !== null && !isNaN(v)) {
      const xPx = _scales.x(v);
      _layer.append('line')
        .attr('class', `refLine vLine${i + 1}`)
        .attr('x1', xPx).attr('y1', 0)
        .attr('x2', xPx).attr('y2', _dims.height)
        .style('stroke', 'red')
        .style('stroke-width', 1.5)
        .style('stroke-dasharray', '6,4');
    }
  });
}
