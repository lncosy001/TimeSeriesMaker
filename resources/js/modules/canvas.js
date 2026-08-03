/**
 * canvas.js — SVG 画布初始化与图层管理
 *
 * 职责：
 *   - 创建 SVG 元素及固定边距
 *   - 按顺序创建所有具名图层 <g>（从下到上）
 *   - 初始化并管理 D3 比例尺与坐标轴
 *   - 对外暴露 getScales / getLayers / getDimensions / updateAxes
 *
 * SVG 图层顺序（从下到上）：
 *   layer-bg-image   背景图片（图片临摹功能）
 *   layer-preserved  已保留的曲线
 *   layer-imported   导入的参考曲线
 *   layer-reflines   参考线
 *   layer-draw       当前绘制路径
 *   layer-controls   图片控制手柄（图片临摹功能）
 */

export function initCanvas(containerId, axisConfig) {
  const container = document.getElementById(containerId);
  const divWidth  = container.clientWidth;
  const divHeight = divWidth / 2.5;

  const margin = { top: 20, right: 40, bottom: 50, left: 50 };
  let width  = divWidth  - margin.left - margin.right;
  let height = divHeight - margin.top  - margin.bottom;

  // ---------- 比例尺 ----------
  const xScale = d3.scaleLinear()
    .domain([axisConfig.xMin, axisConfig.xMax])
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([axisConfig.yMin, axisConfig.yMax])
    .range([height, 0]);

  // ---------- 坐标轴生成器 ----------
  const xAxis = d3.axisBottom(xScale)
    .tickSizeInner(-height)
    .tickSizeOuter(6)
    .tickPadding(10);

  const yAxis = d3.axisLeft(yScale)
    .ticks(10)
    .tickSizeInner(-width)
    .tickSizeOuter(6)
    .tickPadding(10);

  // ---------- 创建 SVG ----------
  const svgRoot = d3.select(`#${containerId}`)
    .append('svg')
    .attr('width',  width  + margin.left + margin.right)
    .attr('height', height + margin.top  + margin.bottom);

  const svg = svgRoot
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // ---------- 可交互背景矩形（捕获鼠标事件）----------
  svg.append('rect')
    .attr('id', 'rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', width).attr('height', height)
    .style('fill', 'rgba(255,255,255,0.01)')
    .style('cursor', 'crosshair')
    .style('pointer-events', 'all');

  // ---------- 图层（顺序即渲染顺序）----------
  const layers = {
    bgImage:   svg.append('g').attr('class', 'layer-bg-image'),
    preserved: svg.append('g').attr('class', 'layer-preserved'),
    imported:  svg.append('g').attr('class', 'layer-imported'),
    reflines:  svg.append('g').attr('class', 'layer-reflines'),
    draw:      svg.append('g').attr('class', 'layer-draw'),
    controls:  svg.append('g').attr('class', 'layer-controls'),
  };

  // ---------- 坐标轴元素 ----------
  const xAxisEl = svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);

  const yAxisEl = svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis);

  // ---------- 更新坐标轴 ----------
  function updateAxes(newConfig) {
    xScale.domain([newConfig.xMin, newConfig.xMax]);
    yScale.domain([newConfig.yMin, newConfig.yMax]);
    xAxisEl.call(xAxis);
    yAxisEl.call(yAxis);
  }

  /**
   * 响应容器尺寸变化（窗口缩放 / 最大化）：
   * 重算 SVG 尺寸与比例尺范围，返回新 scales / dims 供各模块重绘。
   * 图层元素保留，内容由各模块按新比例尺重新渲染。
   */
  function resize() {
    const availW = container.clientWidth;
    const availH = container.clientHeight || (availW / 2.5);

    let w = availW - margin.left - margin.right;
    let h = w / 2.5;
    const maxH = availH - margin.top - margin.bottom;
    if (h > maxH && maxH > 0) {
      h = maxH;
      w = h * 2.5;
    }

    width  = Math.max(200, w);
    height = Math.max(120, h);

    xScale.range([0, width]);
    yScale.range([height, 0]);

    svgRoot.attr('width',  width  + margin.left + margin.right)
           .attr('height', height + margin.top  + margin.bottom);

    svg.select('#rect')
      .attr('width',  width)
      .attr('height', height);

    // 网格线长度与 X 轴位置必须随新尺寸更新，否则辅助线排版错乱
    xAxis.tickSizeInner(-height);
    yAxis.tickSizeInner(-width);
    xAxisEl.attr('transform', `translate(0,${height})`);
    xAxisEl.call(xAxis);
    yAxisEl.call(yAxis);

    return { scales: { x: xScale, y: yScale }, dims: { width, height, margin } };
  }

  return {
    svg,
    svgRoot,
    layers,
    getScales:     () => ({ x: xScale, y: yScale }),
    getDimensions: () => ({ width, height, margin }),
    getAxes:       () => ({ xAxis, yAxis }),
    updateAxes,
    resize,
  };
}
