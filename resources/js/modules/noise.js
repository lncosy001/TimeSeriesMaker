/**
 * noise.js — 噪声生成与施加（纯函数模块）
 *
 * 职责：
 *   - 提供三种噪声生成函数（高斯、均匀、椒盐）
 *   - applyNoise：在原始像素坐标上叠加噪声，返回新数组
 */

/** Box-Muller 变换生成标准正态分布随机数 */
function gaussianRandom() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * 计算单点噪声偏移量（像素）
 * @param {'gaussian'|'uniform'|'saltpepper'} type
 * @param {number} level      — 0~100，百分比
 * @param {number} yRangePx   — Y 轴像素总高度（用于确定噪声量级）
 * @returns {number} 噪声像素偏移
 */
function computeNoise(type, level, yRangePx) {
  const amplitude = yRangePx * (level / 100);
  switch (type) {
    case 'gaussian':
      return gaussianRandom() * amplitude;
    case 'uniform':
      return (Math.random() - 0.5) * 2 * amplitude;
    case 'saltpepper':
      return Math.random() < level / 100
        ? (Math.random() < 0.5 ? -1 : 1) * yRangePx * 0.5
        : 0;
    default:
      return 0;
  }
}

/**
 * 对一组像素坐标施加噪声，返回新数组（不修改原数组）
 * @param {Array}   originalPoints — [[px, py], ...] 原始像素坐标
 * @param {string}  noiseType      — 'gaussian' | 'uniform' | 'saltpepper'
 * @param {number}  noiseLevel     — 0~100
 * @param {number}  canvasHeight   — 画布像素高度（约束 y 范围）
 * @returns {Array} 加噪后的像素坐标数组
 */
export function applyNoise(originalPoints, noiseType, noiseLevel, canvasHeight) {
  return originalPoints.map(([px, py]) => {
    const offset = computeNoise(noiseType, noiseLevel, canvasHeight);
    const noisyY = Math.max(0, Math.min(canvasHeight, py + offset));
    return [px, noisyY];
  });
}
