/**
 * 示例工具：get_temperature。
 *
 * 这是一个【参考片段】，演示一个 Tool 长什么样、以及 schema.description 怎么写
 * （何时用/何时不用 —— 直接影响模型调用正确率，见 knowledge/18 §3）。
 *
 * 真要用时，把它（或仿照它）放到 src/tools/ 下，并在 src/index.ts 的 tools:[...] 里注册。
 * import 路径按放置位置调整（此文件在 docs/ 下，仅作阅读参考，不参与 src 编译）。
 */
import type { Tool } from '@/types.js';

const DB: Record<string, number> = { 北京: 30, 上海: 26 };

export const getTemperature: Tool = {
  schema: {
    name: 'get_temperature',
    // ↓↓↓ 关键：写清"何时用 / 何时不用"，模型据此决定调不调（18 §3）
    description:
      '查询某城市当前气温（摄氏度）。用户问到天气/温度时调用；不要用于天气预测或历史查询，闲聊也不要调。',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '中文城市名，例如 "北京"' },
      },
      required: ['city'],
    },
  },

  // 真实执行体。本例无副作用；若有副作用（发邮件/扣费）务必考虑幂等（17 §6.5）。
  async run(args) {
    const city = String(args.city ?? '');
    const temp = DB[city];
    if (temp == null) return { error: `unknown city: ${city}` }; // 错误也回填，让模型自我修正（04）
    return { city, temp };
  },
};
