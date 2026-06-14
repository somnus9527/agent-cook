/**
 * rollup 打包配置（TS 版）—— 把 src/ 打成可分发的 dist/index.js（ESM）。
 *
 * 用 TS 写配置需要让 rollup 现编译它：`rollup -c rollup.config.ts --configPlugin rollup-plugin-esbuild`
 * （见 package.json 的 build 脚本）。本文件由 tsconfig.node.json 覆盖类型检查。
 *
 * 干三件事：① TS→JS（剥 import type）② 解析 @/ 别名 + .js→.ts 重映射 ③ 注入 node shebang。
 * 运行时依赖（ollama/openai/smol-toml/node:）保持 external，靠 npm 安装。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'rollup-plugin-esbuild';
import type { Plugin, RollupOptions } from 'rollup';

const SRC = fileURLToPath(new URL('./src', import.meta.url));

// 与 tsconfig.json 的 paths 对应
const ALIASES: Record<string, string> = {
  '@/': '',
  '@collection/': 'collection/',
  '@io/': 'io/',
  '@loop/': 'loop/',
  '@providers/': 'providers/',
  '@seams/': 'seams/',
  '@tools/': 'tools/',
};

/** 解析 @/ 别名 + 相对路径，并把 .js 重映射到 .ts。 */
function resolveTs(): Plugin {
  return {
    name: 'resolve-ts',
    resolveId(source: string, importer: string | undefined) {
      let abs: string | undefined;
      for (const [prefix, sub] of Object.entries(ALIASES)) {
        if (source.startsWith(prefix)) {
          abs = path.join(SRC, sub, source.slice(prefix.length));
          break;
        }
      }
      if (!abs && importer && (source.startsWith('./') || source.startsWith('../'))) {
        abs = path.resolve(path.dirname(importer), source);
      }
      if (!abs) return null; // 外部依赖：交给 external

      const ts = abs.replace(/\.js$/, '.ts');
      if (existsSync(ts)) return ts;
      if (existsSync(abs)) return abs;
      if (existsSync(`${abs}.ts`)) return `${abs}.ts`;
      return null;
    },
  };
}

const config: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
    sourcemap: true,
  },
  external: [/^node:/, 'ollama', 'openai', 'smol-toml'],
  plugins: [resolveTs(), esbuild({ target: 'node20' })],
};

export default config;
