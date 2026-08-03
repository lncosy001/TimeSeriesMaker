/**
 * dialogs.js — 应用内提醒 / 确认对话框
 *
 * WebView2 的 window.alert / window.confirm 标题会显示服务地址
 * （如 127.0.0.1:xxxx），这里改用应用内模态框，标题统一为「提醒」，
 * 浏览器与桌面端表现一致。
 */

import { t } from './i18n.js';

let _overlay = null;
let _titleEl = null;
let _msgEl = null;
let _okBtn = null;
let _cancelBtn = null;
let _pending = null;

function _ensureBuilt() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'dialog-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-title">提醒</div>
      <div class="dialog-body"></div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-default dialog-cancel"></button>
        <button type="button" class="btn btn-primary dialog-ok"></button>
      </div>
    </div>`;
  _titleEl = _overlay.querySelector('.dialog-title');
  _msgEl = _overlay.querySelector('.dialog-body');
  _okBtn = _overlay.querySelector('.dialog-ok');
  _cancelBtn = _overlay.querySelector('.dialog-cancel');

  _okBtn.addEventListener('click', () => _close(true));
  _cancelBtn.addEventListener('click', () => _close(false));
  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) _close(false);
  });
  document.addEventListener('keydown', e => {
    if (_overlay.hidden) return;
    if (e.key === 'Escape') _close(false);
    else if (e.key === 'Enter') _close(true);
  });

  document.body.appendChild(_overlay);
}

function _open(message, showCancel, title = '提醒') {
  _ensureBuilt();
  _titleEl.textContent = title;
  _msgEl.textContent = message;
  _okBtn.textContent = t('ok');
  _cancelBtn.textContent = t('cancel');
  _cancelBtn.hidden = !showCancel;
  _overlay.hidden = false;
  _okBtn.focus();
  return new Promise(resolve => { _pending = { resolve }; });
}

function _close(result) {
  if (_overlay) _overlay.hidden = true;
  if (_pending) {
    const { resolve } = _pending;
    _pending = null;
    resolve(result);
  }
}

/** 提醒对话框（仅「确定」），始终 resolve true */
export function alertDialog(message, title = t('dialogTitle')) {
  const p = _open(message, false, title);
  return p.then(() => true);
}

/** 确认对话框（「确定 / 取消」），resolve true=确定 false=取消 */
export function confirmDialog(message, title = t('dialogTitle')) {
  return _open(message, true, title);
}
