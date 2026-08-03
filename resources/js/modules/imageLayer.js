/**
 * imageLayer.js — 背景图片临摹功能
 *
 * 功能流程：
 *   1. 用户选择本地图片 → loadImage() 读取为 base64
 *   2. 图片以 <image> 插入 layer-bg-image（最底层），默认居中铺满绘图区
 *   3. 显示 8 个控制手柄（四角 + 四边中点）和边框虚线框
 *      - 拖动图片本身  → 平移
 *      - 拖动手柄      → 对应方向拉伸（保持对边不动）
 *   4. lockImage()  → 隐藏手柄/边框，图片不再可拖动，进入临摹模式
 *   5. removeImage() → 清除图片及所有控制元素
 *
 * 对外 API：
 *   initImageLayer(bgLayer, controlsLayer, dims)
 *   loadImage(file)          → Promise<void>
 *   lockImage()
 *   unlockImage()
 *   removeImage()
 *   hasImage()               → boolean
 *   isLocked()               → boolean
 *   setOpacity(value)        0~1
 */

// ── 模块状态 ──────────────────────────────────────────────────
let _bgLayer       = null;   // layer-bg-image <g>
let _ctrlLayer     = null;   // layer-controls <g>
let _dims          = null;   // { width, height }

// 图片当前几何状态（像素，相对于绘图区原点）
let _imgState = {
  x: 0, y: 0,
  w: 0, h: 0,
};

// D3 selections
let _imgEl     = null;   // <image>
let _borderEl  = null;   // 边框虚线矩形
let _handles   = [];     // 8 个手柄 <rect> selection 数组

let _locked = false;
let _loaded = false;

// 手柄定义：id、计算位置的函数、拖动时更新几何的函数
// anchor: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'
const HANDLE_DEFS = [
  { id: 'nw', pos: s => [s.x,           s.y          ], resize: (s, dx, dy) => ({ x: s.x+dx, y: s.y+dy, w: s.w-dx, h: s.h-dy }), cursor: 'nwse-resize' },
  { id: 'n',  pos: s => [s.x+s.w/2,     s.y          ], resize: (s, dx, dy) => ({ y: s.y+dy, h: s.h-dy }), cursor: 'ns-resize'   },
  { id: 'ne', pos: s => [s.x+s.w,       s.y          ], resize: (s, dx, dy) => ({ y: s.y+dy, w: s.w+dx, h: s.h-dy }), cursor: 'nesw-resize' },
  { id: 'e',  pos: s => [s.x+s.w,       s.y+s.h/2   ], resize: (s, dx, dy) => ({ w: s.w+dx }), cursor: 'ew-resize'   },
  { id: 'se', pos: s => [s.x+s.w,       s.y+s.h     ], resize: (s, dx, dy) => ({ w: s.w+dx, h: s.h+dy }), cursor: 'nwse-resize' },
  { id: 's',  pos: s => [s.x+s.w/2,     s.y+s.h     ], resize: (s, dx, dy) => ({ h: s.h+dy }), cursor: 'ns-resize'   },
  { id: 'sw', pos: s => [s.x,           s.y+s.h     ], resize: (s, dx, dy) => ({ x: s.x+dx, w: s.w-dx, h: s.h+dy }), cursor: 'nesw-resize' },
  { id: 'w',  pos: s => [s.x,           s.y+s.h/2   ], resize: (s, dx, dy) => ({ x: s.x+dx, w: s.w-dx }), cursor: 'ew-resize'   },
];

const HANDLE_SIZE = 8;   // 手柄正方形边长（px）
const MIN_SIZE    = 20;  // 图片最小尺寸（px）

// ── 公开：初始化 ────────────────────────────────────────────
export function initImageLayer(bgLayer, controlsLayer, dims) {
  _bgLayer   = bgLayer;
  _ctrlLayer = controlsLayer;
  _dims      = dims;
}

// ── 公开：加载图片 ───────────────────────────────────────────
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件（PNG / JPG / GIF 等）'));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      _buildImage(e.target.result);
      resolve();
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

// ── 公开：锁定（进入临摹模式）──────────────────────────────
export function lockImage() {
  if (!_loaded) return;
  _locked = true;
  _setControlsVisible(false);
  // 让图片不再接收鼠标事件，绘制层可以正常响应
  _imgEl && _imgEl.style('pointer-events', 'none');
}

// ── 公开：解锁（重新调整）──────────────────────────────────
export function unlockImage() {
  if (!_loaded) return;
  _locked = false;
  _setControlsVisible(true);
  _imgEl && _imgEl.style('pointer-events', 'all');
}

// ── 公开：移除图片 ───────────────────────────────────────────
export function removeImage() {
  _bgLayer   && _bgLayer.selectAll('*').remove();
  _ctrlLayer && _ctrlLayer.selectAll('*').remove();
  _imgEl    = null;
  _borderEl = null;
  _handles  = [];
  _locked   = false;
  _loaded   = false;
}

// ── 公开：查询 ──────────────────────────────────────────────
export function hasImage()  { return _loaded; }
export function isLocked()  { return _locked; }

// ── 公开：透明度 ────────────────────────────────────────────
export function setOpacity(val) {
  _imgEl && _imgEl.attr('opacity', Math.max(0, Math.min(1, val)));
}

/** 窗口尺寸变化时，按比例缩放图片与控件（保持相对位置不变） */
export function rescale(newDims) {
  if (_loaded && _dims && _dims.width && _dims.height) {
    const kx = newDims.width / _dims.width;
    const ky = newDims.height / _dims.height;
    _imgState = {
      x: _imgState.x * kx,
      y: _imgState.y * ky,
      w: _imgState.w * kx,
      h: _imgState.h * ky,
    };
  }
  _dims = newDims;
  if (_loaded) _updateAll();
}

// ── 私有：构建图片与控件 ────────────────────────────────────
function _buildImage(dataUrl) {
  // 清除旧内容
  removeImage();
  _loaded = true;

  // 默认：填满绘图区，留少量内边距
  const pad = 10;
  _imgState = {
    x: pad,
    y: pad,
    w: _dims.width  - pad * 2,
    h: _dims.height - pad * 2,
  };

  // ── <image> 元素 ──
  _imgEl = _bgLayer.append('image')
    .attr('href', dataUrl)
    .attr('preserveAspectRatio', 'none')   // 允许自由拉伸
    .attr('opacity', 0.5)
    .style('cursor', 'move')
    .style('user-select', 'none');

  _applyGeometry();

  // 拖动图片本身 → 平移
  _imgEl.call(
    d3.drag()
      .on('start', _dragImgStart)
      .on('drag',  _dragImgMove)
  );

  // ── 边框 ──
  _borderEl = _ctrlLayer.append('rect')
    .attr('class', 'image-border');
  _updateBorder();

  // ── 8 个手柄 ──
  HANDLE_DEFS.forEach(def => {
    const hEl = _ctrlLayer.append('rect')
      .attr('class', 'image-handle')
      .attr('width',  HANDLE_SIZE)
      .attr('height', HANDLE_SIZE)
      .style('cursor', def.cursor)
      .datum(def);   // 把定义绑定到元素，drag handler 中使用

    hEl.call(
      d3.drag()
        .on('start', _dragHandleStart)
        .on('drag',  _dragHandleMove)
    );

    _handles.push(hEl);
  });

  _updateHandles();
}

// ── 私有：将 _imgState 应用到 <image> 属性 ──────────────────
function _applyGeometry() {
  if (!_imgEl) return;
  _imgEl
    .attr('x',      _imgState.x)
    .attr('y',      _imgState.y)
    .attr('width',  _imgState.w)
    .attr('height', _imgState.h);
}

function _updateBorder() {
  if (!_borderEl) return;
  _borderEl
    .attr('x',      _imgState.x)
    .attr('y',      _imgState.y)
    .attr('width',  _imgState.w)
    .attr('height', _imgState.h);
}

function _updateHandles() {
  _handles.forEach((hEl, i) => {
    const [hx, hy] = HANDLE_DEFS[i].pos(_imgState);
    hEl
      .attr('x', hx - HANDLE_SIZE / 2)
      .attr('y', hy - HANDLE_SIZE / 2);
  });
}

function _updateAll() {
  _applyGeometry();
  _updateBorder();
  _updateHandles();
}

function _setControlsVisible(visible) {
  _ctrlLayer && _ctrlLayer.style('display', visible ? null : 'none');
}

// ── 私有：拖动图片（平移）────────────────────────────────────
let _dragStartState = null;
let _dragStartMouse = null;

function _dragImgStart(event) {
  if (_locked) return;
  _dragStartState = { ..._imgState };
  _dragStartMouse = { x: event.x, y: event.y };
}

function _dragImgMove(event) {
  if (_locked || !_dragStartState) return;
  const dx = event.x - _dragStartMouse.x;
  const dy = event.y - _dragStartMouse.y;
  _imgState.x = _dragStartState.x + dx;
  _imgState.y = _dragStartState.y + dy;
  _updateAll();
}

// ── 私有：拖动手柄（缩放）────────────────────────────────────
let _hdlStartState = null;
let _hdlStartMouse = null;

function _dragHandleStart(event, def) {
  if (_locked) return;
  _hdlStartState = { ..._imgState };
  _hdlStartMouse = { x: event.x, y: event.y };
}

function _dragHandleMove(event, def) {
  if (_locked || !_hdlStartState) return;
  const dx = event.x - _hdlStartMouse.x;
  const dy = event.y - _hdlStartMouse.y;

  // 把 resize 函数产生的增量合并到起始状态
  const delta = def.resize(_hdlStartState, dx, dy);
  const next  = { ..._hdlStartState, ...delta };

  // 强制最小尺寸
  if (next.w < MIN_SIZE) {
    if (delta.x !== undefined) next.x = _hdlStartState.x + _hdlStartState.w - MIN_SIZE;
    next.w = MIN_SIZE;
  }
  if (next.h < MIN_SIZE) {
    if (delta.y !== undefined) next.y = _hdlStartState.y + _hdlStartState.h - MIN_SIZE;
    next.h = MIN_SIZE;
  }

  _imgState = next;
  _updateAll();
}
