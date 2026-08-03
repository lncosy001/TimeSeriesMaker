import assert from 'node:assert/strict';

// 构造浏览器环境：platform.js 需要 window.Neutralino / NL_TOKEN / NL_PORT
const fsStore = new Map();
let alivePids = new Set();

globalThis.window = {
  Neutralino: {
    os: {
      getPath: async () => 'C:/fake/appdata',
      execCommand: async cmd => {
        const pid = parseInt((cmd.match(/PID eq (\d+)/) || [])[1] || '0', 10);
        return { stdOut: alivePids.has(pid) ? `"timeseriesmaker","${pid}"` : '' };
      },
    },
    filesystem: {
      getJoinedPath: async (base, name) => `${base}/${name}`,
      readFile: async p => {
        if (!fsStore.has(p)) throw new Error('not found');
        return fsStore.get(p);
      },
      writeFile: async (p, data) => { fsStore.set(p, data); },
      remove: async p => { fsStore.delete(p); },
    },
    app: { getProcessId: async () => 12345 },
  },
  NL_TOKEN: 'test',
  NL_PORT: '1',
};

const { acquireSingleInstance, releaseSingleInstance } =
  await import('../resources/js/modules/singleInstance.js');

const LOCK = 'C:/fake/appdata/timeseriesmaker.lock';

// 1. 无锁 → 获取成功并写入自己的 PID
fsStore.clear();
alivePids = new Set();
assert.equal(await acquireSingleInstance(), true, '无锁时应获取成功');
assert.equal(fsStore.get(LOCK), '12345', '应写入自己的 PID');

// 2. 锁文件 PID 存活 → 拒绝（已有实例）
alivePids = new Set([12345]);
assert.equal(await acquireSingleInstance(), false, '锁内 PID 存活时应拒绝');

// 3. 锁文件 PID 已死（陈旧锁）→ 覆盖并获取
alivePids = new Set();
fsStore.set(LOCK, '9999');
assert.equal(await acquireSingleInstance(), true, '陈旧锁应覆盖并获取');
assert.equal(fsStore.get(LOCK), '12345', '覆盖后应写入自己的 PID');

// 4. 释放锁
await releaseSingleInstance();
assert.equal(fsStore.has(LOCK), false, '退出后应删除锁文件');

console.log('single-instance tests OK');
