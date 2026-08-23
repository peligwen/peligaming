// Builds each React tool in tools-src/ into a single self-contained HTML file
// in public/tools/. Run manually after editing a source: `npm run build:tools`.
// The built HTML is committed — deploys stay a plain `wrangler deploy`.
//
// Each tool bundles React (and any libraries it imports) via esbuild, plus a
// Tailwind pass over the source so utility classes and the preflight reset
// match the Claude-artifact environment the tools were authored in.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const TOOLS = [
  {
    entry: 'tools-src/runescape/flip-desk.jsx',
    out: 'public/tools/runescape/flip-desk.html',
    title: 'OSRS Flip Desk',
  },
  {
    entry: 'tools-src/skyrim/enchanting-simulator.jsx',
    out: 'public/tools/skyrim/enchanting-simulator.html',
    title: 'Skyrim Enchanting Simulator',
  },
];

for (const tool of TOOLS) {
  const result = await build({
    stdin: {
      contents: [
        `import { createRoot } from 'react-dom/client';`,
        `import App from './${tool.entry}';`,
        `createRoot(document.getElementById('root')).render(<App />);`,
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'jsx',
    },
    bundle: true,
    minify: true,
    write: false,
    jsx: 'automatic',
    loader: { '.jsx': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  // A literal "</script>" inside the bundle would end the inline script tag early.
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  execFileSync('node_modules/.bin/tailwindcss', [
    '--content', tool.entry,
    '-o', '.tw-tmp.css',
    '--minify',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const css = (await import('node:fs')).readFileSync('.tw-tmp.css', 'utf8');
  rmSync('.tw-tmp.css');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tool.title}</title>
<style>${css}</style>
<style>html,body{margin:0;padding:0;background:#0d1117}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;

  mkdirSync(dirname(tool.out), { recursive: true });
  writeFileSync(tool.out, html);
  console.log(`built ${tool.out} (${(html.length / 1024).toFixed(0)} KB)`);
}
