/**
 * ReAct loop 行为测试（最重要的一组）——用确定性 mock 验证两分支/回填/兜底/存档。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ModelResponse, Tool } from '@/types.js';
import { createLoopManager } from '@loop/manager.js';
import { createReActLoop } from '@loop/reactLoop.js';

import { TEST_CONFIG, freshState, makeMockDeps, memoryStore } from './helpers.js';

const addTool: Tool = {
  schema: {
    name: 'add',
    description: '相加两个数',
    parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
  },
  async run(args) {
    return { sum: Number(args.a) + Number(args.b) };
  },
};

test('tool 分支：调用工具→回填→final，消息流正确', async () => {
  let n = 0;
  const deps = makeMockDeps({
    tools: [addTool],
    callModel: async (): Promise<ModelResponse> =>
      ++n === 1
        ? { content: '', toolCalls: [{ id: 'c1', name: 'add', args: { a: 2, b: 3 } }] }
        : { content: '结果 5' },
  });
  const state = freshState('2+3?');
  const { output } = await createReActLoop(TEST_CONFIG).run(state, deps);

  assert.equal(output, '结果 5');
  assert.equal(state.status, 'done');
  assert.deepEqual(state.messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.equal(n, 2);
});

test('final 分支：无 toolCalls 立即结束', async () => {
  const deps = makeMockDeps({ callModel: async () => ({ content: '直接回答' }) });
  const state = freshState('hi');
  const { output } = await createReActLoop(TEST_CONFIG).run(state, deps);

  assert.equal(output, '直接回答');
  assert.equal(state.status, 'done');
  assert.deepEqual(state.messages.map((m) => m.role), ['user', 'assistant']);
});

test('工具抛错：error 作为 observation 回填，loop 不崩，下一轮 final', async () => {
  const boom: Tool = {
    schema: { name: 'boom', description: 'x', parameters: { type: 'object', properties: {} } },
    async run() {
      throw new Error('boom');
    },
  };
  let n = 0;
  const deps = makeMockDeps({
    tools: [boom],
    callModel: async () =>
      ++n === 1 ? { content: '', toolCalls: [{ id: 'c1', name: 'boom', args: {} }] } : { content: '已处理错误' },
  });
  const state = freshState('go');
  const { output } = await createReActLoop(TEST_CONFIG).run(state, deps);

  assert.equal(output, '已处理错误');
  const toolMsg = state.messages.find((m) => m.role === 'tool');
  assert.ok(toolMsg && toolMsg.content.includes('error'));
});

test('maxSteps 兜底：永不 final → status failed', async () => {
  const deps = makeMockDeps({
    tools: [addTool],
    callModel: async () => ({ content: '', toolCalls: [{ id: 'c', name: 'add', args: { a: 1, b: 1 } }] }),
  });
  const cfg = { ...TEST_CONFIG, maxSteps: 3 };
  const { state } = await createReActLoop(cfg).run(freshState('loop'), deps);

  assert.equal(state.status, 'failed');
  assert.ok(state.step >= 3);
});

test('每 step 存档：store.save 被调用', async () => {
  const store = memoryStore();
  let n = 0;
  const deps = makeMockDeps({
    tools: [addTool],
    store,
    callModel: async () =>
      ++n === 1 ? { content: '', toolCalls: [{ id: 'c1', name: 'add', args: { a: 2, b: 3 } }] } : { content: '5' },
  });
  await createReActLoop(TEST_CONFIG).run(freshState('2+3?'), deps);

  assert.ok(store.saved.length >= 2);
});

test('manager.route 默认返回 react（不靠静态配置切换）', () => {
  const m = createLoopManager(TEST_CONFIG);
  assert.equal(m.route(freshState('x')), m.react);
});
