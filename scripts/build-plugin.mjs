// Builds the Minimap Loupe RuneLite plugin and publishes the jar into public/,
// where the site serves it: `npm run build:plugin`.
//
// The plugin's source is not in this repository. RuneLite's Plugin Hub builds
// a plugin from the root of a repository it clones, so the project *is* the
// root of its own — https://github.com/peligwen/minimap-loupe — and here it is
// a dependency: checked out into .plugin-src/ (gitignored) and built there.
//
// The jar is committed (deploys stay a plain `wrangler deploy`, like the built
// tool HTML), and release.json alongside it carries the version, size, build
// date, SHA-256 and the source commit, so the download page states what it is
// actually serving instead of a number typed by hand and left to rot.
//
//   npm run build:plugin                    # main of the plugin repository
//   npm run build:plugin -- --ref=v1.1.0    # a tag, branch or commit
//   npm run build:plugin -- --source=../minimap-loupe   # a checkout you have

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE_REPO = 'https://github.com/peligwen/minimap-loupe';
const CHECKOUT_DIR = '.plugin-src/minimap-loupe';
const OUT_DIR = 'public/plugins/minimap-loupe';
const JAR_NAME = 'minimap-loupe.jar';

const args = process.argv.slice(2);
const option = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const ref = option('ref') ?? 'main';
const local = option('source');

const git = (cwd, ...rest) => execFileSync('git', rest, { cwd, encoding: 'utf8' }).trim();

// --- the source ------------------------------------------------------------
// Either a checkout you point at (plugin work in progress, built here before
// it is pushed) or the pinned repository at a ref, fetched fresh each run.
let pluginDir = local;
if (!pluginDir) {
  pluginDir = CHECKOUT_DIR;
  if (!existsSync(pluginDir)) {
    console.log(`> git clone ${SOURCE_REPO} ${pluginDir}`);
    mkdirSync(dirname(pluginDir), { recursive: true });
    execFileSync('git', ['clone', SOURCE_REPO, pluginDir], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  console.log(`> git fetch origin ${ref} (in ${pluginDir})`);
  git(pluginDir, 'fetch', '--quiet', 'origin', ref);
  git(pluginDir, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
}

// a local checkout need not be a git repository at all; the pinned one always is
let commit = null;
try {
  commit = git(pluginDir, 'rev-parse', 'HEAD');
  if (git(pluginDir, 'status', '--porcelain')) commit += '-dirty';
} catch {
  /* built from whatever is on disk, and release.json says so by omission */
}

// --- the build -------------------------------------------------------------
// gradlew isn't committed in the plugin repository (a binary in a repo of
// text), so use whatever gradle is on PATH — any 7.x/8.x will do for a plugin
// this size. The build itself targets Java 11 bytecode, as the client needs.
const gradle = process.env.GRADLE ?? 'gradle';
console.log(`> ${gradle} test jar (in ${pluginDir})`);
execFileSync(gradle, ['--console=plain', '-q', 'test', 'jar'], {
  cwd: pluginDir,
  stdio: ['ignore', 'inherit', 'inherit'],
});

const libs = join(pluginDir, 'build/libs');
const jars = readdirSync(libs).filter((f) => f.endsWith('.jar'));
if (jars.length !== 1) {
  throw new Error(`expected exactly one jar in ${libs}, found: ${jars.join(', ') || 'none'}`);
}
const built = join(libs, jars[0]);

// the properties file the plugin hub reads is also the version of record here
const props = Object.fromEntries(
  readFileSync(join(pluginDir, 'runelite-plugin.properties'), 'utf8')
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
      source: { repo: SOURCE_REPO, commit },
    },
    null,
    2,
  ) + '\n',
);

console.log(`${OUT_DIR}/${JAR_NAME}  ${(bytes.length / 1024).toFixed(1)} KB  ${commit ?? 'local build'}`);
