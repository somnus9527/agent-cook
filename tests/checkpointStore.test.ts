/**
 * 文件 CheckpointStore round-trip —— save 后能 load 回来；缺失返回 null。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileCheckpointStore } from '@collection/checkpointStore.js';

import { freshState } from './helpers.js';

test('checkpoint round-trip + 缺失返回 null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentcook-'));
  try {
    const store = createFileCheckpointStore(dir);

    assert.equal(await store.load('does-not-exist'), null);

    const state = freshState('hi');
    state.sessionId = 'sess1';
    state.step = 3;
    await store.save('sess1', state);

    const loaded = await store.load('sess1');
    assert.equal(loaded?.sessionId, 'sess1');
    assert.equal(loaded?.step, 3);
    assert.deepEqual(loaded?.messages, state.messages);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
