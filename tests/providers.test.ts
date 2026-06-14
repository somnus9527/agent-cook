/**
 * Provider 格式映射测试 —— 纯翻译、无网络，专抓 Ollama↔OpenAI 字段差异坑（knowledge/13 §4）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toOllamaMessage, toUnifiedToolCall as ollamaUnify } from '@providers/ollama.js';
import { parseArgs, toOpenAIMessage } from '@providers/openaiCompatible.js';

test('ollama: assistant 带 toolCalls → tool_calls 形状', () => {
  const m = toOllamaMessage({ role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'add', args: { a: 1 } }] });
  assert.deepEqual((m as { tool_calls?: unknown }).tool_calls, [{ function: { name: 'add', arguments: { a: 1 } } }]);
});

test('ollama: 普通消息无 tool_calls 字段', () => {
  const m = toOllamaMessage({ role: 'user', content: 'hi' });
  assert.equal((m as { tool_calls?: unknown }).tool_calls, undefined);
});

test('ollama: arguments 已是对象，并自动生成 id', () => {
  const tc = ollamaUnify({ function: { name: 'add', arguments: { a: 2 } } });
  assert.equal(tc.name, 'add');
  assert.deepEqual(tc.args, { a: 2 });
  assert.ok(tc.id.length > 0);
});

test('openai: assistant toolCalls → arguments 字符串化 + 带 id', () => {
  const m = toOpenAIMessage({
    role: 'assistant',
    content: '',
    toolCalls: [{ id: 'c1', name: 'add', args: { a: 1 } }],
  }) as { tool_calls: { id: string; function: { arguments: string } }[] };
  assert.equal(m.tool_calls[0].function.arguments, JSON.stringify({ a: 1 }));
  assert.equal(m.tool_calls[0].id, 'c1');
});

test('openai: tool 消息带 tool_call_id', () => {
  const m = toOpenAIMessage({ role: 'tool', content: '{}', toolCallId: 'c1' }) as { tool_call_id: string };
  assert.equal(m.tool_call_id, 'c1');
});

test('openai: parseArgs 容错（合法/空/非法 JSON）', () => {
  assert.deepEqual(parseArgs('{"a":1}'), { a: 1 });
  assert.deepEqual(parseArgs(''), {});
  assert.deepEqual(parseArgs('not json'), {});
});
