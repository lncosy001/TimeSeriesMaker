/**
 * export.js — 数据导出模块（CSV / JSON）
 *
 * 职责：
 *   - 支持单条 / 多条曲线导出
 *     · 单条：保持原有格式（index,value / {indices,values}）
 *     · 多条：合并为一个文件，共享 index 列，每条曲线一列
 *   - 支持采样/插值到指定点数
 *   - 支持时间映射（datetime 列）
 *   - 通过 platform.js 保存文件（桌面原生对话框 / 浏览器下载）
 *
 * 注意：本模块只处理「数据坐标」曲线（[[x, y], ...]），
 *       像素坐标 → 数据坐标的换算由调用方完成。
 */

import { saveTextFile } from '../platform.js';
import { t } from './i18n.js';

// ---------- 采样 / 插值 ----------

/**
 * 对坐标数组进行采样或插值，返回指定数量的点
 * @param {Array} points — [[x, y], ...]
 * @param {number} n     — 目标点数；null/NaN 时返回全部
 */
function samplePoints(points, n) {
  if (!n || isNaN(n) || n <= 0) return points;
  if (n === 1) return [points[0]];

  if (n <= points.length) {
    // 降采样
    const step = (points.length - 1) / (n - 1);
    return Array.from({ length: n }, (_, i) => points[Math.round(i * step)]);
  }

  // 插值（线性）
  const xMin = points[0][0];
  const xMax = points[points.length - 1][0];
  const xStep = (xMax - xMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const targetX = xMin + i * xStep;
    return _lerpPoint(points, targetX);
  });
}

/** 线性插值：在 points 中找到 targetX 对应的插值点 */
function _lerpPoint(points, targetX) {
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i][0], x2 = points[i + 1][0];
    if (targetX >= x1 && targetX <= x2) {
      const ratio = (targetX - x1) / (x2 - x1);
      return [targetX, points[i][1] + ratio * (points[i + 1][1] - points[i][1])];
    }
  }
  return targetX < points[0][0] ? points[0] : points[points.length - 1];
}

/** 在 points 中按 targetX 线性插值出 y；超出范围返回 null */
function _lerpY(points, targetX) {
  if (!points.length) return null;
  if (targetX < points[0][0] || targetX > points[points.length - 1][0]) return null;
  const pt = _lerpPoint(points, targetX);
  return pt[1];
}

// ---------- 时间映射 ----------

/** 格式化 Date 为 'YYYY/MM/DD HH:mm' */
function formatDateTime(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} `
       + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 根据数据 x 值线性插值计算对应 datetime 字符串
 * @param {number} xVal
 * @param {string} startStr — datetime-local 字符串
 * @param {string} endStr
 * @param {number} xMin
 * @param {number} xMax
 * @returns {string|null}
 */
function calcDateTime(xVal, startStr, endStr, xMin, xMax) {
  if (!startStr || !endStr) return null;
  // 兼容 "2024-01-01 08:00" 这类文本输入（空格 → T，按本地时间解析）
  const norm = s => (s.includes('T') ? s : s.replace(' ', 'T'));
  const t0 = new Date(norm(startStr)).getTime();
  const t1 = new Date(norm(endStr)).getTime();
  if (isNaN(t0) || isNaN(t1) || t1 <= t0) return null;
  const ratio = (xVal - xMin) / (xMax - xMin);
  const ts = Math.round((t0 + ratio * (t1 - t0)) / 60000) * 60000;
  return formatDateTime(new Date(ts));
}

// ---------- 多曲线公共索引 ----------

/**
 * 生成多曲线共享的 index 网格：
 *   - 指定了 numPoints → 在 [xMin, xMax] 上均匀取 n 点
 *   - 未指定 → 取所有曲线 x 值的并集（排序去重）
 */
function buildIndexGrid(curves, n, xMin, xMax) {
  if (n && n > 1) {
    return Array.from({ length: n }, (_, i) => xMin + (xMax - xMin) * i / (n - 1));
  }
  const xs = [];
  for (const c of curves) {
    for (const [x] of c.points) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-9);
}

/** CSV 字段名转义（含逗号/引号/换行时加引号） */
function csvField(value) {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------- 纯内容构建函数（便于测试） ----------

/**
 * 构建 CSV 文本
 * @param {Array} curves — [{ name, points: [[x,y],...] }]，数据坐标
 * @param {object} config — { numPoints, startTime, endTime, xMin, xMax }
 * @returns {string}
 */
export function buildCSV(curves, config) {
  if (!curves || curves.length === 0) return '';

  const { numPoints, startTime, endTime, xMin, xMax } = config;
  const n = parseInt(numPoints);
  const hasTime = startTime && endTime;
  const single  = curves.length === 1;

  if (single) {
    const c       = curves[0];
    const sampled = samplePoints(c.points, n);
    const header  = hasTime ? 'datetime,index,value\r\n' : 'index,value\r\n';
    const rows = sampled.map(([x, y]) => {
      if (hasTime) {
        const dt = calcDateTime(x, startTime, endTime, xMin, xMax) ?? '';
        return `${dt},${x},${y}`;
      }
      return `${x},${y}`;
    });
    return header + rows.join('\r\n');
  }

  // 多曲线：宽表格式
  const grid = buildIndexGrid(curves, n, xMin, xMax);
  const header = [
    ...(hasTime ? ['datetime'] : []),
    'index',
    ...curves.map(c => csvField(c.name)),
  ].join(',') + '\r\n';

  const rows = grid.map(x => {
    const cells = [];
    if (hasTime) cells.push(calcDateTime(x, startTime, endTime, xMin, xMax) ?? '');
    cells.push(x);
    for (const c of curves) {
      const y = _lerpY(c.points, x);
      cells.push(y === null ? '' : y);
    }
    return cells.join(',');
  });

  return header + rows.join('\r\n');
}

/**
 * 构建 JSON 文本
 * @param {Array} curves — [{ name, points: [[x,y],...] }]，数据坐标
 * @param {object} config — { numPoints, startTime, endTime, xMin, xMax }
 * @returns {string}
 */
export function buildJSON(curves, config) {
  if (!curves || curves.length === 0) return '';

  const { numPoints, startTime, endTime, xMin, xMax } = config;
  const n = parseInt(numPoints);
  const hasTime = startTime && endTime;
  const jsonData = {};

  if (curves.length === 1) {
    const c       = curves[0];
    const sampled = samplePoints(c.points, n);
    if (hasTime) {
      jsonData.datetimes = sampled.map(([x]) => calcDateTime(x, startTime, endTime, xMin, xMax) ?? '');
    }
    jsonData.indices = sampled.map(([x]) => x);
    jsonData.values  = sampled.map(([, y]) => y);
  } else {
    const grid = buildIndexGrid(curves, n, xMin, xMax);
    if (hasTime) {
      jsonData.datetimes = grid.map(x => calcDateTime(x, startTime, endTime, xMin, xMax) ?? '');
    }
    jsonData.indices = grid;
    jsonData.curves  = {};
    for (const c of curves) {
      jsonData.curves[c.name] = grid.map(x => _lerpY(c.points, x));
    }
  }

  return JSON.stringify(jsonData, null, 2);
}

// ---------- 导出（含保存） ----------

/**
 * 导出所选曲线为 CSV 文件
 * @param {Array} curves — [{ name, points: [[x,y],...] }]，数据坐标
 * @param {object} config — { numPoints, fileName, startTime, endTime, xMin, xMax }
 */
export async function exportToCSV(curves, config) {
  const content = buildCSV(curves, config);
  if (!content) {
    throw new Error(t('noCurvesToExport'));
  }
  await saveTextFile(`${config.fileName}.csv`, content, 'text/csv;charset=utf-8');
}

/**
 * 导出所选曲线为 JSON 文件
 * @param {Array} curves
 * @param {object} config
 */
export async function exportToJSON(curves, config) {
  const content = buildJSON(curves, config);
  if (!content) {
    throw new Error(t('noCurvesToExport'));
  }
  await saveTextFile(`${config.fileName}.json`, content, 'application/json');
}
