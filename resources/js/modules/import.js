/**
 * import.js — 数据导入模块（CSV / JSON → 数据坐标点）
 *
 * 职责：
 *   - 解析 CSV / JSON 为 [[x, y], ...] 数据坐标数组
 *   - 通过 FileReader 读取本地文件，返回 Promise
 */

import { t } from './i18n.js';

// ---------- 解析函数 ----------

/**
 * 解析 CSV 文本，返回 [[x, y], ...] 数据坐标
 * 支持格式：
 *   index,value
 *   datetime,index,value
 */
export function parseCSV(csvText) {
  const lines  = csvText.trim().split('\n');
  if (lines.length === 0) throw new Error(t('csvEmpty'));

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('index') || firstLine.includes('datetime') || firstLine.includes('value');
  const startIdx  = hasHeader ? 1 : 0;
  const hasDatetime = hasHeader && firstLine.includes('datetime');

  const points = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');

    let xVal, yVal;
    if (hasDatetime && parts.length >= 3) {
      // datetime, index, value
      xVal = parseFloat(parts[1]);
      yVal = parseFloat(parts[2]);
    } else if (parts.length >= 2) {
      // index, value
      xVal = parseFloat(parts[0]);
      yVal = parseFloat(parts[1]);
    }

    if (!isNaN(xVal) && !isNaN(yVal)) {
      points.push([xVal, yVal]);
    }
  }

  if (points.length === 0) throw new Error(t('csvNoData'));
  return points;
}

/**
 * 解析 JSON 文本，返回 [[x, y], ...] 数据坐标
 * 支持格式：
 *   { indices: [...], values: [...] }          ← 本工具导出格式
 *   [[x, y], ...]                               ← 二维数组
 *   [{ x: ..., y: ... }, ...]                  ← 对象数组
 */
export function parseJSON(jsonText) {
  const data = JSON.parse(jsonText);

  if (data.indices && data.values && data.indices.length === data.values.length) {
    return data.indices.map((x, i) => [x, data.values[i]]);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error(t('csvNoData'));
    if (Array.isArray(data[0])) return data;
    if (typeof data[0] === 'object' && data[0].x !== undefined && data[0].y !== undefined) {
      return data.map(({ x, y }) => [x, y]);
    }
  }

  throw new Error(t('unsupportedJson'));
}

/**
 * 从 File 对象读取并解析数据，返回 Promise<[[x,y],...]>
 * @param {File} file
 * @returns {Promise<Array>}
 */
export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const ext    = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let points;
        if (ext === 'csv')       points = parseCSV(content);
        else if (ext === 'json') points = parseJSON(content);
        else throw new Error(t('unsupportedFormat', { ext }));
        resolve(points);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error(t('fileReadError')));
    reader.readAsText(file);
  });
}
