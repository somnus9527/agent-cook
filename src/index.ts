#!/usr/bin/env -S npx tsx
/**
 * bin 入口 —— 解析命令行，组装 App 并启动。
 *
 * 这一层只做"解析参数 + 选前端 + 启动"，业务全在 App（16 §1）。
 * 用法（骨架阶段未实现）：
 *   pnpm dev                       新建会话
 *   pnpm dev --resume <sessionId>  恢复会话（16 §6）
 */
import { createRawTtyFrontend } from '@io/rawTty.js';

import { createApp } from './app.js';
import { CONFIG } from './config.js';
// import { 你的工具们 } from '@tools/...';

async function main() {
  const args = process.argv.slice(2);
  const resumeIdx = args.indexOf('--resume');
  const resumeSessionId = resumeIdx >= 0 ? args[resumeIdx + 1] : undefined;

  const app = createApp({
    config: CONFIG,
    frontend: createRawTtyFrontend(),
    tools: [
      // TODO: 注册你的工具，例如 getTemperature
    ],
    resumeSessionId,
  });

  await app.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
