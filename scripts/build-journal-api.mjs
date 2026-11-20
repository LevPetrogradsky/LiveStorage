import { build } from 'esbuild'

await build({
  entryPoints: ['server/journal-entry.ts'],
  outfile: 'api/journal.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['jose', '@neondatabase/serverless'],
  legalComments: 'none',
})
