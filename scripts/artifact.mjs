// Inline the production build into one HTML body fragment for publishing as a claude.ai Artifact.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const out = process.argv[2] ?? join(dist, 'artifact.html');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const title = html.match(/<title>.*?<\/title>/)?.[0] ?? '<title>Bloodstream</title>';
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const js = [...html.matchAll(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
writeFileSync(
  out,
  `${title}\n<style>${css.join('\n')}</style>\n${body.trim()}\n${js.map((j) => `<script type="module">${safe(j)}</script>`).join('\n')}\n`,
);
console.log(`wrote ${out}`);
