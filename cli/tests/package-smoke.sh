#!/usr/bin/env bash
# Exercise only disposable prefixes. No changes to the caller's npm installation.
set -euo pipefail
: "${CLI_TARBALL:?set CLI_TARBALL to the packed CLI absolute path}"
: "${SDK_TARBALL:?set SDK_TARBALL to the packed SDK absolute path}"
smoke_root=$(mktemp -d)
trap 'rm -rf "$smoke_root"' EXIT
export SMOKE_ROOT="$smoke_root"
# Only public test credentials are passed to child processes by the node driver.
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.SMOKE_ROOT;
const cli = process.env.CLI_TARBALL;
const sdk = process.env.SDK_TARBALL;
const prefix = join(root, 'global');
const separate = join(root, 'legacy');
const scratch = join(root, 'local');
for (const dir of [prefix, separate, scratch]) mkdirSync(dir);
// Do not forward ambient API keys, .env files, or a real user's cache/config.
const env = { PATH: process.env.PATH, HOME: root, TMPDIR: root,
  STOREROUTER_CACHE_DIR: join(root, 'cache'), NO_COLOR: '1' };
async function exec(file, args, extra = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: scratch, env: { ...env, ...extra } });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
async function npm(args, expected = 0) {
  const result = await exec('npm', args);
  assert.equal(result.code, expected, JSON.stringify(result));
  return result;
}
const install = (where, packages) => npm(['install', '-g', '--prefix', where,
  '--ignore-scripts', '--no-audit', '--no-fund', ...packages]);
const old = '@octogen-ai/cli@0.2.0';
await install(prefix, [old]);
const oldBin = join(prefix, 'bin/octogen');
const original = realpathSync(oldBin);
const previous = await exec(oldBin, ['--version']);
assert.equal(previous.code, 0);
assert.equal(JSON.parse(previous.stdout).cli.version, '0.2.0');
let collision = await exec('npm', ['install', '-g', '--prefix', prefix,
  '--ignore-scripts', '--no-audit', '--no-fund', cli]);
assert.notEqual(collision.code, 0, 'new package must not overwrite the old global octogen');
assert.match(collision.stderr, /EEXIST/);
assert.equal(realpathSync(oldBin), original);
assert.deepEqual(await exec(oldBin, ['--version']), previous);
await npm(['uninstall', '-g', '--prefix', prefix, '@octogen-ai/cli']);
await install(prefix, [sdk, cli]);
const primary = join(prefix, 'bin/storerouter');
const alias = join(prefix, 'bin/octogen');
assert.equal(realpathSync(primary), realpathSync(alias));
const manifest = JSON.parse(readFileSync(join(prefix, 'lib/node_modules/@storerouter/cli/package.json')));
assert.equal(manifest.name, '@storerouter/cli');
assert.equal(manifest.publishConfig.tag, 'next');
assert.equal(manifest.publishConfig.access, 'public');
assert.equal(manifest.publishConfig.provenance, true);
assert.deepEqual(manifest.bin, { storerouter: './dist/bin.js', octogen: './dist/bin.js' });
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts[hook], undefined);
assert.ok(readFileSync(join(prefix, 'lib/node_modules/@storerouter/cli/MIGRATION.md')).length > 0);
for (const args of [['--version'], ['status', '--offline'], ['lookup'], ['parse'], ['search', '--help']]) {
  const a = await exec(primary, args);
  assert.deepEqual(await exec(alias, args), a);
  if (args[0] === 'status') {
    assert.equal(a.code, 3);
    const body = JSON.parse(a.stdout);
    assert.equal(a.stdout.trim().split('\n').length, 1);
    assert.equal(Object.keys(body)[0], 'schemaVersion');
    assert.equal(body.exitCode, 3);
    assert.equal(body.api.baseUrl, 'https://api.storerouter.ai/v1');
  }
}
collision = await exec('npm', ['install', '-g', '--prefix', prefix,
  '--ignore-scripts', '--no-audit', '--no-fund', old]);
assert.notEqual(collision.code, 0, 'old package must not overwrite the new global octogen');
assert.match(collision.stderr, /EEXIST/);
assert.equal(realpathSync(primary), realpathSync(alias));
assert.equal((await exec(alias, ['--version'])).code, 0);
await install(separate, [old]);
assert.equal(JSON.parse((await exec(join(separate, 'bin/octogen'), ['--version'])).stdout).cli.version, '0.2.0');
assert.equal(JSON.parse((await exec(primary, ['--version'])).stdout).cli.version, manifest.version);

// Drive the installed executables against an actual HTTP server, with no live API requests.
const requests = [];
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', d => raw += d);
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: raw });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/products/search') {
      res.end(JSON.stringify({ items: [], nextCursor: null }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ detail: 'product_not_found' }));
    }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const key = `octo_live_${'a'.repeat(32)}_${'b'.repeat(40)}`;
  const configured = { STOREROUTER_BASE_URL: base, STOREROUTER_API_KEY: key };
  const args = ['lookup', 'https://example.com/p', '--match-mode', 'strict'];
  const a = await exec(primary, args, configured);
  const b = await exec(alias, args, configured);
  const c = await exec(primary, ['parse', ...args.slice(1)], configured);
  assert.equal(a.code, 6);
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(JSON.parse(c.stdout).command, 'lookup');
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(requests[2], requests[0]);
  assert.equal(requests[0].url, '/v1/products/lookup');
  assert.equal(requests[0].authorization, `Bearer ${key}`);
  assert.equal(JSON.parse(requests[0].body).matchMode, 'strict');
  assert.ok(!a.stdout.includes(key));
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log('CLI package smoke passed: dual bins, request/output/exit equivalence, migration, both collision orders, separate prefixes, no hooks.');
JS
