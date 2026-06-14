/**
 * 配置加载（11 §3 配置外置 + 打包/分发的多源合并）。
 *
 * 优先级（后者覆盖前者）：
 *   内置默认  <  用户级 ~/.agent-cook/config.toml  <  项目级 ./agent-cook.toml  <  环境变量  <  CLI 参数
 *
 * 密钥纪律（重要）：config.toml【不放真实 key】，只放 env_key（环境变量名）；
 *   真实 key 从使用者自己的系统环境变量读。这样仓库/配置文件永不泄密，每个使用者配自己的 key。
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parse as parseToml } from 'smol-toml';

/** App 实际使用的、已解析好的配置。 */
export interface AgentConfig {
  provider: 'ollama' | 'kimi';
  model: string;
  /** 供应商端点（ollama host / OpenAI 兼容 baseURL）。 */
  baseURL?: string;
  /** 已从 env_key 解析出的真实密钥（云端 provider 用；ollama 不需要）。 */
  apiKey?: string;
  maxSteps: number;
  dataDir: string;
  modelOptions?: Record<string, unknown>;
}

/** 来自 CLI 的覆盖项（最高优先级）。 */
export interface ConfigOverrides {
  provider?: string;
  model?: string;
}

/** TOML / 默认的原始结构（下划线风格，贴近 Codex 的 config.toml）。 */
interface RawConfig {
  provider?: string;
  max_steps?: number;
  data_dir?: string;
  providers?: Record<string, ProviderTable>;
}
interface ProviderTable {
  model?: string;
  base_url?: string;
  /** 环境变量名；真实 key 从 process.env[env_key] 读。 */
  env_key?: string;
}

const DEFAULTS: RawConfig = {
  provider: 'ollama',
  max_steps: 12,
  data_dir: '.agent-cook',
  providers: {
    ollama: { model: 'llama3.1', base_url: 'http://localhost:11434' },
    kimi: { model: 'kimi-k2.5', base_url: 'https://api.moonshot.ai/v1', env_key: 'MOONSHOT_API_KEY' },
  },
};

function readTomlIfExists(path: string): RawConfig {
  if (!existsSync(path)) return {};
  try {
    return parseToml(readFileSync(path, 'utf8')) as RawConfig;
  } catch (e) {
    throw new Error(`配置文件解析失败：${path}\n${String(e)}`);
  }
}

function mergeProviders(
  a: Record<string, ProviderTable> = {},
  b: Record<string, ProviderTable> = {},
): Record<string, ProviderTable> {
  const out: Record<string, ProviderTable> = { ...a };
  for (const k of Object.keys(b)) out[k] = { ...(a[k] ?? {}), ...b[k] };
  return out;
}

function mergeRaw(base: RawConfig, over: RawConfig): RawConfig {
  return { ...base, ...over, providers: mergeProviders(base.providers, over.providers) };
}

/** 按优先级合并多源配置，并解析出 active provider 的端点与密钥。 */
export function loadConfig(overrides: ConfigOverrides = {}): AgentConfig {
  let raw = DEFAULTS;
  raw = mergeRaw(raw, readTomlIfExists(join(homedir(), '.agent-cook', 'config.toml'))); // 用户级
  raw = mergeRaw(raw, readTomlIfExists(join(process.cwd(), 'agent-cook.toml'))); // 项目级

  // provider：CLI > env > 文件 > 默认
  const provider = (overrides.provider ??
    process.env.AGENT_PROVIDER ??
    raw.provider ??
    'ollama') as AgentConfig['provider'];

  const pt = raw.providers?.[provider] ?? {};
  const model = overrides.model ?? process.env.AGENT_MODEL ?? pt.model ?? 'llama3.1';
  const baseURL = pt.base_url;
  // 真实 key：仅按 env_key 从环境变量读，绝不来自配置文件本身
  const apiKey = pt.env_key ? process.env[pt.env_key] : undefined;

  return {
    provider,
    model,
    baseURL,
    apiKey,
    maxSteps: Number(process.env.AGENT_MAX_STEPS ?? raw.max_steps ?? 12),
    dataDir: process.env.AGENT_DATA_DIR ?? raw.data_dir ?? '.agent-cook',
  };
}
