/**
 * 配置外置（11 §3）—— 模型名、各种上限、落盘路径集中在此，别散成魔法值。
 * 将来模型路由、不同环境配置都从这里改。
 */

export interface AgentConfig {
  /** 模型供应商：ollama（本地）| kimi（云端，OpenAI 兼容）。切换只动这里（13 §5）。 */
  provider: 'ollama' | 'kimi';
  /** 默认模型（口子 A 用；切云端模型只动 provider，见 13）。 */
  model: string;
  /** 单个 run 的最大循环步数 —— 防死循环兜底（04 §工程要点）。 */
  maxSteps: number;
  /** 检查点/追踪落盘根目录（17 §6）。 */
  dataDir: string;
  /** 传给底层模型的可选参数（temperature 等）。 */
  modelOptions?: Record<string, unknown>;
}

export const CONFIG: AgentConfig = {
  provider: (process.env.AGENT_PROVIDER as AgentConfig['provider']) ?? 'ollama',
  // 默认按 provider 给个合理模型；显式 AGENT_MODEL 优先。
  model:
    process.env.AGENT_MODEL ?? (process.env.AGENT_PROVIDER === 'kimi' ? 'kimi-k2.5' : 'llama3.1'),
  maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 12),
  dataDir: process.env.AGENT_DATA_DIR ?? '.agent-cook',
  modelOptions: {
    // TODO: temperature / num_ctx 等，按需补（Kimi 的取值范围与 OpenAI 不同，见 13 §6）
  },
};
