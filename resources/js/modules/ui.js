/**
 * ui.js — 工作台界面交互模块
 *
 * 职责：
 *   - 深色 / 浅色主题切换（localStorage 持久化）
 *   - 问号帮助按钮 → 共享悬浮框（点击定位，Esc / 点击外部关闭）
 *   - 侧栏分区折叠 / 展开
 */

const THEME_KEY = 'tsm-theme';

/** 初始化主题切换按钮 */
export function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const root = document.documentElement;

  const apply = theme => {
    root.setAttribute('data-theme', theme);
    btn.innerHTML = theme === 'dark'
      ? '<i class="fa fa-sun-o"></i>'
      : '<i class="fa fa-moon-o"></i>';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) { /* 忽略存储异常 */ }
  };

  // 同步图标到当前主题
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
  });
}

/** 初始化问号帮助悬浮框 */
export function initHelpPopovers() {
  const popover = document.getElementById('helpPopover');
  if (!popover) return;

  let activeBtn = null;

  function close() {
    popover.hidden = true;
    activeBtn = null;
  }

  function open(btn) {
    const ref = btn.getAttribute('data-help-html');
    const tpl = ref ? document.getElementById(ref) : null;
    popover.innerHTML = tpl ? tpl.innerHTML : (btn.getAttribute('data-help') || '');
    popover.hidden = false;

    const rect = btn.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;

    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));

    let top = rect.bottom + 8;
    if (top + ph > window.innerHeight - 8) {
      top = rect.top - ph - 8;
    }

    popover.style.left = left + 'px';
    popover.style.top  = top + 'px';
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.help-btn');
    if (btn) {
      if (activeBtn === btn) close();
      else { open(btn); activeBtn = btn; }
      return;
    }
    if (!popover.hidden && !popover.contains(e.target)) close();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  ['scroll', 'resize'].forEach(ev => {
    window.addEventListener(ev, close, { passive: true });
  });
}

/** 初始化侧栏分区折叠 / 展开 */
export function initSidebarCollapse() {
  document.querySelectorAll('.section-title[data-collapse]').forEach(btn => {
    const toggle = () => {
      const sec = document.getElementById(btn.getAttribute('data-collapse'));
      if (sec) sec.classList.toggle('collapsed');
    };
    btn.addEventListener('click', e => {
      // 点击问号帮助按钮时只打开悬浮框，不折叠分区
      if (e.target.closest('.help-btn')) return;
      toggle();
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  const collapseAll = document.getElementById('collapseAllBtn');
  if (collapseAll) {
    collapseAll.addEventListener('click', () => {
      const sections = [...document.querySelectorAll('.sidebar .section')];
      const anyOpen = sections.some(s => !s.classList.contains('collapsed'));
      sections.forEach(s => s.classList.toggle('collapsed', anyOpen));
    });
  }
}

/** 初始化快捷键汇总悬浮窗（右上角键盘图标） */
export function initShortcutHelp() {
  const btn = document.getElementById('shortcutBtn');
  const panel = document.getElementById('shortcutPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });

  document.addEventListener('click', e => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') panel.hidden = true;
  });
}
