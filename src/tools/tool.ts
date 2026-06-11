/**
 * 工具注册表（03 + 18 §3）。
 *
 * 内置工具、MCP 工具（15）都注册进同一个 registry，对 loop 透明 —— 都经口子 B 派发。
 * 写工具时重点在 schema.description："何时用/何时不用"直接决定模型调用正确率（18 §3）。
 */
import type { Tool } from '@/types.js';
import type { ToolRegistry } from '@seams/dispatchTool.js';

/** 收集内置工具，建一个 registry。 */
export function createRegistry(tools: Tool[] = []): ToolRegistry {
  const registry: ToolRegistry = new Map();
  for (const tool of tools) registry.set(tool.schema.name, tool);
  return registry;
}

// TODO: 在这里（或单独文件）定义你的工具，例如：
// export const getTemperature: Tool = {
//   schema: {
//     name: 'get_temperature',
//     description: '查询某城市当前气温（摄氏度）。用户问天气/温度时调用；不要用于预测或历史查询。',
//     parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
//   },
//   async run(args) { /* ... */ },
// };

// TODO（15 MCP）：实现一个把 MCP server 暴露的工具适配成 Tool 并注册进来的函数，
//   这样"调 MCP"自然塌缩成"调 Tool"，loop 无感。
