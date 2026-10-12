import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const config = JSON.parse(fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
test('service window starts hidden and release policy permits native IPC and local assets', () => {
  assert.equal(config.app.windows[0].visible, false);
  const csp = config.app.security.csp;
  assert.match(csp, /connect-src[^;]* ipc: /);
  assert.match(csp, /connect-src[^;]*http:\/\/ipc\.localhost/);
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /worker-src[^;]*blob:/);
  assert.match(csp, /media-src[^;]*blob:/);
  assert.match(csp, /font-src[^;]*'self'/);
  assert.match(config.app.security.devCsp, /ws:\/\/localhost:\*/);
});
