import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outdir = resolve(root, '.work/portable');
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: [resolve(root, 'src/main.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  target: ['es2022'],
  outfile: resolve(outdir, 'game.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  legalComments: 'eof',
});
const assets = {};
const modelDir = resolve(root, 'public/models');
for (const file of (await readdir(modelDir)).filter(f => f.endsWith('.glb')).sort()) {
  assets[file] = `data:model/gltf-binary;base64,${(await readFile(resolve(modelDir, file))).toString('base64')}`;
}
if (Object.keys(assets).filter(name=>/^chapter-\d+\.glb$/.test(name)).length !== 16 || !assets['worker.glb']) throw new Error('Portable build requires all sixteen Blender worlds and the maintenance crew.');
const [script, css, notices] = await Promise.all([readFile(resolve(outdir, 'game.js'), 'utf8'), readFile(resolve(outdir, 'game.css'), 'utf8'), readFile(resolve(root, 'public/THIRD_PARTY_NOTICES.txt'), 'utf8')]);
const safeScript = script.replace(/<\/script/gi, '<\\/script');
const safeNotices = JSON.stringify(notices).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#c6e5e4"><title>Systems / Islands — offline expedition</title><style>${css}</style></head><body><div id="root"></div><script type="application/json" id="third-party-notices">${safeNotices}<\/script><script>window.__SYSTEMS_ASSETS__=${JSON.stringify(assets)};<\/script><script>${safeScript}<\/script></body></html>`;
await writeFile(resolve(root, 'dist/systems-islands-offline.html'), html);
console.log(`Portable edition: ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB, 16 embedded Blender worlds plus maintenance crew, zero external dependencies.`);
