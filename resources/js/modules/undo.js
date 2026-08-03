/**
 * undo.js — 撤销 / 重做管理器
 *
 * 职责：
 *   - 维护 undo / redo 两个动作栈
 *   - 每个动作包含 undo() / redo() 两个函数
 *   - 栈容量上限 50 条；新动作会清空 redo 栈
 *   - 栈变化时通知 UI 刷新按钮状态
 */

const MAX_ENTRIES = 50;

let _undoStack = [];
let _redoStack = [];
let _listener = null;

/**
 * 压入一个可撤销动作
 * @param {object} action — { label, undo(), redo() }
 */
export function push(action) {
  if (!action || typeof action.undo !== 'function' || typeof action.redo !== 'function') return;
  _undoStack.push(action);
  if (_undoStack.length > MAX_ENTRIES) _undoStack.shift();
  _redoStack.length = 0;
  _notify();
}

/** 撤销最近一个动作；无可撤销时返回 false */
export function undo() {
  const action = _undoStack.pop();
  if (!action) return false;
  action.undo();
  _redoStack.push(action);
  _notify();
  return true;
}

/** 重做最近一个被撤销的动作；无重做时返回 false */
export function redo() {
  const action = _redoStack.pop();
  if (!action) return false;
  action.redo();
  _undoStack.push(action);
  _notify();
  return true;
}

export function canUndo() { return _undoStack.length > 0; }
export function canRedo() { return _redoStack.length > 0; }

/** 清空撤销 / 重做栈（窗口尺寸变化后像素坐标快照失效时调用） */
export function reset() {
  _undoStack.length = 0;
  _redoStack.length = 0;
  _notify();
}

/** 注册栈变化监听（用于刷新按钮状态） */
export function onChange(listener) {
  _listener = listener;
}

function _notify() {
  _listener && _listener();
}
