/**
 * sponsor.js — 赞助弹窗
 *
 * 右上角爱心图标 → 窗口中央弹窗：
 *   - 3 个收款码空位（前两个为已提供的收款码图片，第三个留空占位）
 *   - 一小段感谢文字
 * 点击关闭按钮、遮罩或按 Esc 关闭。
 */

import { t } from './i18n.js';

let _overlay = null;

/** 初始化赞助入口按钮 */
export function initSponsorModal() {
  const btn = document.getElementById('sponsorBtn');
  if (!btn) return;
  btn.addEventListener('click', open);
}

function open() {
  _ensureBuilt();
  // 打开时按当前语言刷新文案
  _overlay.querySelector('.sponsor-title').textContent  = t('sponsorTitle');
  _overlay.querySelector('.sponsor-thanks').textContent = t('sponsorThanks');
  _overlay.querySelector('.sponsor-empty').textContent  = t('sponsorEmpty');
  _overlay.querySelector('.sponsor-close').title        = t('sponsorClose');
  _overlay.hidden = false;
  document.addEventListener('keydown', _onKey);
}

function close() {
  if (_overlay) _overlay.hidden = true;
  document.removeEventListener('keydown', _onKey);
}

function _onKey(e) {
  if (e.key === 'Escape') close();
}

function _ensureBuilt() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'dialog-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.innerHTML = `
    <div class="sponsor-dialog">
      <button type="button" class="sponsor-close" aria-label="close">&times;</button>
      <div class="sponsor-title"></div>
      <div class="sponsor-thanks"></div>
      <div class="sponsor-grid">
        <div class="sponsor-slot">
          <img src="img/qr1.png" alt="QR 1">
        </div>
        <div class="sponsor-slot">
          <img src="img/qr2.jpg" alt="QR 2">
        </div>
        <div class="sponsor-slot sponsor-empty"></div>
      </div>
    </div>`;
  _overlay.querySelector('.sponsor-close').addEventListener('click', close);
  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) close();
  });
  document.body.appendChild(_overlay);
}
