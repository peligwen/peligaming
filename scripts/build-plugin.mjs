// Builds the RuneLite plugin in runelite/minimap-loupe/ and publishes the jar
// into public/, where the site serves it: `npm run build:plugin`.
//
// The jar is committed (deploys stay a plain `wrangler deploy`, like the built
// tool HTML), and release.json alongside it carries the version, size, build
// date and SHA-256 so the download page states what it is actually serving
// instead of a number typed by hand and left to rot.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGIN_DIR = 'runelite/minimap-loupe';
const OUT_DIR = 'public/plugins/minimap-loupe';
const JAR_NAME = 'minimap-loupe.jar';

// gradlew isn't committed (a binary in a repo of text), so use whatever gradle
// is on PATH — any 7.x/8.x will do for a plugin this size.
const gradle = process.env.GRADLE ?? 'gradle';
console.log(`> ${gradle} test jar (in ${PLUGIN_DIR})`);
execFileSync(gradle, ['--console=plain', '-q', 'test', 'jar'], {
  cwd: PLUGIN_DIR,
  stdio: ['ignore', 'inherit', 'inherit'],
});

const libs = join(PLUGIN_DIR, 'build/libs');
const jars = readdirSync(libs).filter((f) => f.endsWith('.jar'));
if (jars.length !== 1) {
  throw new Error(`expected exactly one jar in ${libs}, found: ${jars.join(', ') || 'none'}`);
}
const built = join(libs, jars[0]);

// the properties file the plugin hub reads is also the version of record here
const props = Object.fromEntries(
  readFileSync(join(PLUGIN_DIR, 'runelite-plugin.properties'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);

const bytes = readFileSync(built);
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(built, join(OUT_DIR, JAR_NAME));
writeFileSync(
  join(OUT_DIR, 'release.json'),
  JSON.stringify(
    {
      name: props.displayName,
      version: props.version,
      file: JAR_NAME,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      built: new Date().toISOString().slice(0, 10),
      plugin: props.plugins,
    },
    null,
    2,
  ) + '\n',
);

console.log(`${OUT_DIR}/${JAR_NAME}  ${(bytes.length / 1024).toFixed(1)} KB`);
