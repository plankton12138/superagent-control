import { defineConfig } from 'tsdown'
// Builds the mock control-plane sandbox into `.mock/mock-env.js`; `pnpm mock` runs it with Node.
export default defineConfig({
  entry: { 'mock-env': 'scripts/mock-env/main.ts' },
  outDir: '.mock',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
  deps: { neverBundle: [/^@deepseek-ai\//, 'zod', 'proper-lockfile'] },
})
