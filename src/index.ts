/**
 * bin 入口 —— 解析命令行，组装 App 并启动。
 *
 * 这一层只做"解析参数 + 加载配置 + 选前端 + 启动"，业务全在 App（16 §1）。
 * 用法：
 *   agent-cook                          新建会话
 *   agent-cook --resume <sessionId>     恢复会话（16 §6）
 *   agent-cook --provider kimi          覆盖 provider（CLI 优先级最高）
 *   agent-cook --model kimi-k2.6        覆盖 model
 * 配置优先级：内置默认 < ~/.agent-cook/config.toml < ./agent-cook.toml < 环境变量 < CLI 参数（见 config.ts）
 */
import { createRawTtyFrontend } from '@io/rawTty.js';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
// import { 你的工具们 } from '@tools/...';

/** 取 `--flag value` 形式的值。 */
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);

  const config = loadConfig({
    provider: flag(args, '--provider'),
    model: flag(args, '--model'),
  });

  const app = createApp({
    config,
    frontend: createRawTtyFrontend(),
    tools: [
      // TODO: 注册你的工具，例如 getTemperature
    ],
    resumeSessionId: flag(args, '--resume'),
  });

  await app.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

