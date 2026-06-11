/**
 * Ollama provider —— 最小可运行实现（02 / 03）。
 *
 * 职责仅"翻译"：把内部统一格式 (Message/ToolSchema) ↔ ollama 的格式互转。
 * 重试/缓存/成本统计等横切逻辑【不在这里】，挂在口子 A(callModel)。
 */
import { randomUUID } from 'node:crypto';

import ollama from 'ollama';

import type { Message, ModelResponse, ToolCall, ToolSchema } from '@/types.js';

import type { Provider, ProviderChatRequest } from './provider.js';
import type { Message as OllamaMessage, Tool as OllamaTool } from 'ollama';

export function createOllamaProvider(): Provider {
  return {
    async chat(req: ProviderChatRequest): Promise<ModelResponse> {
      const res = await ollama.chat({
        model: req.model,
        messages: req.messages.map(toOllamaMessage),
        tools: req.tools?.map(toOllamaTool),
        options: req.options,
        stream: false, // 一次性拿完整响应；要流式回显再单开一个分支
      });

      const toolCalls = res.message.tool_calls?.map(toUnifiedToolCall) ?? [];
      return {
        content: res.message.content ?? '',
        // 无 toolCalls 时返回 undefined —— loop 据此判 final（16 §2）
        toolCalls: toolCalls.length ? toolCalls : undefined,
        usage: {
          promptTokens: res.prompt_eval_count,
          completionTokens: res.eval_count,
        },
      };
    },
  };
}

// ── 内部统一格式 → ollama ─────────────────────────────────────

function toOllamaMessage(m: Message): OllamaMessage {
  return {
    role: m.role,
    content: m.content,
    // assistant 轮里若有 toolCalls，转成 ollama 的形状
    ...(m.toolCalls?.length
      ? {
          tool_calls: m.toolCalls.map((tc) => ({
            function: { name: tc.name, arguments: tc.args },
          })),
        }
      : {}),
  } as OllamaMessage;
}

function toOllamaTool(schema: ToolSchema): OllamaTool {
  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      // 我们的 parameters 是通用 JSON Schema；ollama 的类型更具体，这里做一次窄化转换
      parameters: schema.parameters as OllamaTool['function']['parameters'],
    },
  };
}

// ── ollama → 内部统一格式 ─────────────────────────────────────

function toUnifiedToolCall(tc: {
  function: { name: string; arguments: Record<string, unknown> };
}): ToolCall {
  return {
    // ollama 不给 toolCall id，自己生成一个用于回填关联（17 §6.5 / 04）
    id: randomUUID(),
    name: tc.function.name,
    args: tc.function.arguments ?? {},
  };
}
