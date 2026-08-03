import assert from 'node:assert/strict';
import { parseCSV, parseJSON } from '../resources/js/modules/import.js';

// ---------- CSV ----------
assert.deepEqual(parseCSV('index,value\n0,1\n1,2'), [[0, 1], [1, 2]]);
assert.deepEqual(parseCSV('datetime,index,value\n2024/01/01 08:00,0,1\n2024/01/01 08:06,0.1,2'), [[0, 1], [0.1, 2]]);

// ---------- JSON ----------
assert.deepEqual(parseJSON('{"indices":[0,1],"values":[10,20]}'), [[0, 10], [1, 20]]);
assert.deepEqual(parseJSON('[[0,1],[1,2]]'), [[0, 1], [1, 2]]);
assert.deepEqual(parseJSON('[{"x":0,"y":5}]'), [[0, 5]]);

console.log('import tests OK');
