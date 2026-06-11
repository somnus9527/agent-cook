/**
 * 口子 B：单一"执行工具"入口（11 §口子B）。
 *
 * 模型请求的每个工具都经过这一个派发函数，绝不在 loop 里直接 registry[name](args)。
 * MCP 工具启动时并入同一个 registry，所以"调 MCP" = "调 Tool"，都走这里（16 §2）。
 * 将来不改 loop 就能在此长出：参数校验(09)、人在环确认/权限(10)、超时、限流、审计、tracing。
 */
import type { Tool, ToolCall, ToolContext, ToolResult } from '@/types.js';

/** 工具注册表：name → Tool。 */
export type ToolRegistry = Map<string, Tool>;

export function makeDispatchTool(registry: ToolRegistry) {
  return async function dispatchTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const tool = registry.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        output: { error: `unknown tool: ${call.name}` },
        isError: true,
      };
    }

    // TODO（执行前横切，挂这里）：
    //  1) 参数校验（09 结构化输出 / JSON Schema）
    //  2) 权限 / 人在环确认（10）—— 有副作用的工具尤其要确认
    //  3) 幂等检查（17 §6.5）：resume 重放时避免重复副作用

    try {
      const output = await tool.run(call.args, ctx);
      return { toolCallId: call.id, output };
    } catch (e) {
      // 工具报错也回填成 observation，让模型自我修正，而不是崩（04 §工程要点）。
      return { toolCallId: call.id, output: { error: String(e) }, isError: true };
    }
  };
}
