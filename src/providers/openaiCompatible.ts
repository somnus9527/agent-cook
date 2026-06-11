/**
 * 通用 OpenAI 兼容 provider（13 篇）。
 *
 * Kimi(Moonshot)、OpenAI 本家、以及任何"OpenAI 兼容"服务都走这一个实现 ——
 * 区别只是 baseURL / model / apiKey 不同（13 §2/§7）。所以不单独写 "kimiProvider"，
 * 只提供一个通用 provider + 一个 Kimi 预设配置。
 *
 * 与 Ollama 的字段差异（本文件负责吸收，loop/工具/registry 全不感知，13 §4 对照表）：
 *  - 内容在 res.choices[0].message.content（Ollama 是 res.message.content）
 *  - tool_calls 的 arguments 是 JSON 字符串，需 JSON.parse（Ollama 已是对象）
 *  - 结果回填用 tool_call_id（Ollama 用 tool_name）
 */
import OpenAI from 'openai';

import type { Message, ModelResponse, ToolCall, ToolSchema } from '@/types.js';

import type { Provider, ProviderChatRequest } from './provider.js';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

export interface OpenAICompatOptions {
  /** 兼容端点，如 Kimi 国际站 https://api.moonshot.ai/v1 */
  baseURL?: string;
  /** 密钥（只放服务端/CLI，绝不进前端，13 §2 / 10）。 */
  apiKey: string;
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): Provider {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });

  return {
    async chat(req: ProviderChatRequest): Promise<ModelResponse> {
      const res = await client.chat.completions.create({
        model: req.model,
        messages: req.messages.map(toOpenAIMessage),
        tools: req.tools?.map(toOpenAITool),
        ...(req.options ?? {}),
        stream: false,
      });

      const msg = res.choices[0]?.message;
      const toolCalls =
        msg?.tool_calls?.filter((c) => c.type === 'function').map(toUnifiedToolCall) ?? [];

      return {
        content: msg?.content ?? '',
        toolCalls: toolCalls.length ? toolCalls : undefined, // 无则 final（16 §2）
        usage: {
          promptTokens: res.usage?.prompt_tokens,
          completionTokens: res.usage?.completion_tokens,
        },
      };
    },
  };
}

/** Kimi(Moonshot) 预设（13 §2）。密钥/站点从环境变量取。 */
export function createKimiProvider(): Provider {
  return createOpenAICompatProvider({
    baseURL: process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1',
    apiKey: process.env.MOONSHOT_API_KEY ?? '',
  });
}

// ── 内部统一格式 → OpenAI ─────────────────────────────────────

function toOpenAIMessage(m: Message): ChatCompletionMessageParam {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    };
  }
  // system / user / 无工具的 assistant
  return { role: m.role, content: m.content } as ChatCompletionMessageParam;
}

function toOpenAITool(schema: ToolSchema): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  };
}

// ── OpenAI → 内部统一格式 ─────────────────────────────────────

function toUnifiedToolCall(c: {
  id: string;
  function: { name: string; arguments: string };
}): ToolCall {
  return {
    id: c.id, // OpenAI 给了 id，回填时用 tool_call_id 对应（13 §4）
    name: c.function.name,
    args: parseArgs(c.function.arguments),
  };
}

function parseArgs(s: string): Record<string, unknown> {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {}; // 容错：模型偶尔吐非法 JSON，给空对象让工具层报错回填（04）
  }
}
