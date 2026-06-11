/**
 * 口子 A：单一"调模型"入口（11 §口子A）。
 *
 * 所有对模型的调用都经过这里，绝不在 loop 里到处直接调 provider。
 * 现在：转发给注入的 provider。
 * 将来不改 loop 就能在此长出：多供应商路由、成本/预算上限、缓存、重试退避、对"调模型"这步的 tracing。
 */
import { CONFIG } from '@/config.js';
import type { ModelRequest, ModelResponse } from '@/types.js';
import type { Provider } from '@providers/provider.js';

/** 用注入的 provider 造一个 callModel（保持收口处尽量薄，11 §4）。 */
export function makeCallModel(provider: Provider) {
  return async function callModel(req: ModelRequest): Promise<ModelResponse> {
    // TODO: 在这里加横切逻辑（重试/缓存/成本统计/路由）——但先保持只转发。
    return provider.chat({
      model: req.model ?? CONFIG.model,
      messages: req.messages,
      tools: req.tools,
      options: CONFIG.modelOptions,
    });
  };
}
