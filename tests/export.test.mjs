import assert from 'node:assert/strict';
import { buildCSV, buildJSON } from '../resources/js/modules/export.js';

const config = { numPoints: '', startTime: '', endTime: '', xMin: 0, xMax: 10 };

// ---------- 单条曲线（保持旧格式） ----------
const c1 = {
  name: '曲线 1',
  points: [[0, 10], [5, 20], [10, 30]],
};

const csv1 = buildCSV([c1], config);
assert.equal(csv1, 'index,value\r\n0,10\r\n5,20\r\n10,30', '单条 CSV 格式');

const json1 = JSON.parse(buildJSON([c1], config));
assert.deepEqual(json1, { indices: [0, 5, 10], values: [10, 20, 30] }, '单条 JSON 格式');

// ---------- 多条曲线（宽表 + curves 对象） ----------
const c2 = {
  name: '曲线 2',
  points: [[0, 0], [10, 100]],
};

const csv2 = buildCSV([c1, c2], config);
assert.equal(
  csv2,
  'index,曲线 1,曲线 2\r\n0,10,0\r\n5,20,50\r\n10,30,100',
  '多条 CSV：每条曲线按共享 index 线性插值',
);

const json2 = JSON.parse(buildJSON([c1, c2], config));
assert.equal(json2.indices.length, 3);
assert.deepEqual(json2.curves['曲线 1'], [10, 20, 30]);
assert.deepEqual(json2.curves['曲线 2'], [0, 50, 100]);

// ---------- 指定点数采样（多条：统一网格） ----------
const sampled = buildCSV([c1, c2], { ...config, numPoints: 3 });
assert.equal(
  sampled,
  'index,曲线 1,曲线 2\r\n0,10,0\r\n5,20,50\r\n10,30,100',
  'numPoints=3 时在 [0,10] 上均匀取 3 点',
);

// ---------- 时间映射 ----------
const tcfg = { numPoints: '', startTime: '2024-01-01T08:00', endTime: '2024-01-01T10:00', xMin: 0, xMax: 10 };
const csvT = buildCSV([c1], tcfg);
assert.match(csvT, /^datetime,index,value\r\n2024\/01\/01 08:00,0,10\r\n/, '时间映射首行');

const jsonT = JSON.parse(buildJSON([c1], tcfg));
assert.equal(jsonT.datetimes.length, 3);
assert.equal(jsonT.datetimes[1], '2024/01/01 09:00');

// 空格分隔的文本格式（日期输入框改为文本后）
const tcfgSpace = { numPoints: '', startTime: '2024-01-01 08:00', endTime: '2024-01-01 10:00', xMin: 0, xMax: 10 };
const jsonSpace = JSON.parse(buildJSON([c1], tcfgSpace));
assert.equal(jsonSpace.datetimes[1], '2024/01/01 09:00', '空格格式时间应正常解析');

// ---------- CSV 名称转义 ----------
const c3 = { name: '曲线 "A",带逗号', points: [[0, 1]] };
const csv3 = buildCSV([c3, c1], config);
assert.ok(csv3.startsWith('index,"曲线 ""A"",带逗号",曲线 1\r\n'), 'CSV 名称转义');

console.log('export tests OK');
