/**
 * 模型供应商 adapter 接口（03 跨供应商可移植性 / 13 切云端）。
 *
 * 口子 A(callModel) 之下唯一与具体厂商耦合的地方。换 Ollama → Kimi/OpenAI 只实现一个新 Provider，
 * loop 与其它所有代码不动。
 */
import type { Message, ModelResponse, ToolSchema } from '@/types.js';

export interface ProviderChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolSchema[];
  options?: Record<string, unknown>;
}

export interface Provider {
  /** 把内部统一格式 → 厂商格式 → 调 → 厂商响应解析回统一 ModelResponse。 */
  chat(req: ProviderChatRequest): Promise<ModelResponse>;
}
