/**
 * draw.js — 鼠标手绘交互模块
 *
 * 职责：
 *   - 监听 SVG <g> 上的 mousedown / mousemove 事件
 *   - 监听 document 上的 mouseup 事件
 *   - 维护当前绘制状态（drawState）
 *   - 绘制完成时调用 onDrawComplete 回调
 *   - 对外暴露 clearDrawing / redrawPath / getDrawState / updateScales
 *
 * 坐标系说明：
 *   所有坐标均为相对于 SVG <g>（已含 margin 偏移）的像素坐标，
 *   使用 d3.pointer(event, svgNode) 获取，与绘图区原点一致。
 */

const drawState = {
  isDown:             false,
  dataPoints:         [],   // 像素坐标 [[px, py], ...]
  originalDataPoints: [],   // 噪声前的原始备份
  currentPath:        null, // D3 path selection
  lastCompletedCount: 0,    // 上次完成绘制时的点数（避免空点击重复触发）
};

let _svgNode    = null; // SVG <g> DOM 节点（用于 d3.pointer）
let _layer      = null;
let _scales     = null;
let _dims       = null;
let _lineFn     = null;
let _onComplete = null;

export function initDraw(svg, drawLayer, scales, dims, onDrawComplete) {
  _svgNode    = svg.node();
  _layer      = drawLayer;
  _scales     = scales;
  _dims       = dims;
  _onComplete = onDrawComplete;

  _lineFn = d3.line()
    .x(d => d[0])
    .y(d => d[1]);

  const rect = svg.select('#rect');

  // ---- mousedown：开始绘制 ----
  rect.on('mousedown', function (event) {
    const [px] = d3.pointer(event, _svgNode);
    if (px < 0) return;
    drawState.isDown = true;
    event.preventDefault();
  });

  // ---- mousemove：追加点并重绘 ----
  rect.on('mousemove', function (event) {
    if (!drawState.isDown) return;

    let [px, py] = d3.pointer(event, _svgNode);
    // 约束在绘图区内
    px = Math.max(0, Math.min(px, _dims.width));
    py = Math.max(0, Math.min(py, _dims.height));

    const pts = drawState.dataPoints;
    // 保证 x 单调递增
    if (pts.length > 0 && px <= pts[pts.length - 1][0]) return;

    pts.push([px, py]);
    _renderPath();

    // 到达右边界 → 自动完成
    if (px >= _dims.width - 1.0) {
      _finishDrawing();
    }

    event.preventDefault();
  });

  // ---- mouseup：在 document 上监听（防止鼠标拖出 SVG 外松开丢失事件）----
  document.addEventListener('mouseup', () => {
    if (drawState.isDown) {
      _finishDrawing();
    }
  });
}

function _renderPath() {
  if (!drawState.currentPath) {
    drawState.currentPath = _layer.append('path')
      .attr('class', 'currentPath')
      .style('stroke', '#26A65B')
      .style('stroke-width', 2)
      .style('fill', 'none');
  }
  drawState.currentPath
    .datum(drawState.dataPoints)
    .attr('d', _lineFn);
}

function _finishDrawing() {
  drawState.isDown = false;
  if (drawState.dataPoints.length > 0
      && drawState.dataPoints.length !== drawState.lastCompletedCount) {
    drawState.originalDataPoints = structuredClone(drawState.dataPoints);
    drawState.lastCompletedCount = drawState.dataPoints.length;
    _onComplete && _onComplete(drawState.dataPoints);
  }
}

export function clearDrawing() {
  drawState.dataPoints         = [];
  drawState.originalDataPoints = [];
  drawState.currentPath        = null;
  drawState.isDown             = false;
  drawState.lastCompletedCount = 0;
  _layer && _layer.selectAll('.currentPath').remove();
}

export function redrawPath(pixelPoints) {
  _layer.selectAll('.currentPath').remove();
  drawState.currentPath = null;
  if (!pixelPoints || pixelPoints.length === 0) return;
  drawState.dataPoints = pixelPoints;
  _renderPath();
}

/** 恢复一条完整笔迹（含原始备份，撤销/重做用） */
export function restoreStroke(pixelPoints) {
  _layer.selectAll('.currentPath').remove();
  drawState.currentPath = null;
  drawState.dataPoints = pixelPoints;
  drawState.originalDataPoints = structuredClone(pixelPoints);
  drawState.lastCompletedCount = pixelPoints.length;
  _renderPath();
}

export function getDrawState() {
  return drawState;
}

export function updateScales(scales, dims) {
  _scales = scales;
  if (dims) _dims = dims;
}

/**
 * 窗口尺寸变化时，把当前笔迹从旧像素坐标换算到新像素坐标
 * @param {object} oldScales — 变化前的 { x, y }
 * @param {object} newScales — 变化后的 { x, y }
 * @param {object} newDims   — 变化后的 { width, height, margin }
 */
export function rescaleDrawing(oldScales, newScales, newDims) {
  _dims = newDims;
  const conv = pts => pts.map(([px, py]) => [
    newScales.x(oldScales.x.invert(px)),
    newScales.y(oldScales.y.invert(py)),
  ]);
  drawState.dataPoints = conv(drawState.dataPoints);
  drawState.originalDataPoints = conv(drawState.originalDataPoints);
  _layer.selectAll('.currentPath').remove();
  drawState.currentPath = null;
  if (drawState.dataPoints.length) _renderPath();
}
