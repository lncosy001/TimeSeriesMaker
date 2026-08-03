/**
 * singleInstance.js — 单实例检测（桌面端）
 *
 * 原理：在应用数据目录放置 PID 锁文件。
 *   - 启动时读取锁文件：若其中 PID 对应进程仍存活 → 判定已有实例在运行
 *   - 否则写入自己的 PID（覆盖失效锁）继续启动
 *   - 正常退出时删除锁文件；崩溃遗留的失效锁会被下次启动自动覆盖
 */

import { isDesktop } from '../platform.js';
import { t } from './i18n.js';

const LOCK_FILE = 'timeseriesmaker.lock';

let _lockPath = null;

/** 检查指定 PID 是否存活（Windows tasklist） */
async function _isProcessAlive(pid) {
  try {
    const res = await window.Neutralino.os.execCommand(
      `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
    );
    const out = (res && res.stdOut) || '';
    return out.includes(String(pid));
  } catch (err) {
    // 无法查询时保守认为存活，避免双开
    return true;
  }
}

/**
 * 尝试获取单实例锁
 * @returns {Promise<boolean>} true=本实例继续运行；false=已有实例在运行
 */
export async function acquireSingleInstance() {
  if (!isDesktop()) return true;   // 浏览器模式不限制
  const N = window.Neutralino;

  let dataDir;
  try {
    dataDir = await N.os.getPath('config');
  } catch (err) {
    return true;   // 拿不到目录就不做限制
  }

  try {
    _lockPath = await N.filesystem.getJoinedPath(dataDir, LOCK_FILE);
  } catch (err) {
    _lockPath = `${dataDir}/${LOCK_FILE}`;
  }

  // 已有锁 → 检查锁内 PID 是否存活
  try {
    const existing = await N.filesystem.readFile(_lockPath);
    const pid = parseInt(existing, 10);
    if (pid && await _isProcessAlive(pid)) {
      return false;   // 已有实例
    }
  } catch (err) {
    // 无锁文件或读取失败 → 视为可覆盖
  }

  // 写入自己的 PID 并回读校验（降低并发双开概率）
  try {
    const ownPid = String(await N.app.getProcessId());
    await N.filesystem.writeFile(_lockPath, ownPid);
    const readBack = await N.filesystem.readFile(_lockPath);
    if (String(readBack).trim() !== ownPid) return false;
  } catch (err) {
    return true;   // 写锁失败不阻塞启动
  }

  return true;
}

/** 正常退出时释放单实例锁 */
export async function releaseSingleInstance() {
  if (!isDesktop() || !_lockPath) return;
  try {
    await window.Neutralino.filesystem.remove(_lockPath);
  } catch (err) {
    // 忽略：锁可能已不存在
  }
  _lockPath = null;
}
