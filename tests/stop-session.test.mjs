import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const fixture = path.join(import.meta.dirname, 'stop-session-fixture.mjs');
const helper = path.join(root, 'scripts/stop-session.ps1');
const powershell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const children = [];
let owned = [], control = [], identity;
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function launch(kind) {
  const child = spawn(process.execPath, [fixture, kind], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  children.push(child);
  return await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Fixture readiness timed out')), 10000);
    child.once('error', reject);
    child.once('message', message => { clearTimeout(deadline); resolve(message.pids); });
    child.once('exit', code => reject(new Error(`Fixture exited before ready: ${code}`)));
  });
}
async function call(action, pid, startedUtc) {
  assert(existsSync(helper), 'production cleanup helper must exist');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper,
    '-Action', action, '-RootProcessId', String(pid)];
  if (startedUtc) args.push('-StartedUtc', startedUtc);
  const child = spawn(powershell, args, { windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  return await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { child.kill(); reject(new Error('Cleanup helper timed out')); }, 15000);
    child.once('error', reject);
    child.once('close', code => { clearTimeout(deadline); resolve({ code, stdout, stderr }); });
  });
}
try {
  owned = await launch('root'); control = await launch('control');
  assert.equal(owned.length, 5, 'root, two children, and two grandchildren must be alive');
  const description = await call('Describe', owned[0]);
  assert.equal(description.code, 0, description.stderr);
  identity = JSON.parse(description.stdout);
  const mismatch = await call('Stop', owned[0], '2000-01-01T00:00:00.0000000Z');
  assert.notEqual(mismatch.code, 0, 'wrong creation time must be rejected');
  assert(owned.every(alive), 'identity mismatch must preserve the entire owned tree');
  assert(control.every(alive), 'identity mismatch must preserve unrelated process');
  console.log('PASS creation-time mismatch preserves owned and unrelated processes');
  const missingRoot = await call('Stop', 2147483647, identity.startedUtc);
  assert.notEqual(missingRoot.code, 0, 'unqueryable root must fail without broad cleanup');
  assert(owned.every(alive), 'unqueryable root must preserve owned tree');
  assert(control.every(alive), 'unqueryable root must preserve unrelated process');
  console.log('PASS unqueryable root fails without terminating any fixture process');
  const stopped = await call('Stop', owned[0], identity.startedUtc);
  if (stopped.code !== 0) console.log(`Stop returned ${stopped.code}: ${stopped.stderr || stopped.stdout}`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(owned.some(alive), false, 'cleanup must terminate owned children, grandchildren, then root');
  assert(control.every(alive), 'unrelated control process must survive');
  assert.equal(stopped.code, 0, stopped.stderr);
  const result = JSON.parse(stopped.stdout);
  assert.equal(result.terminatedProcessIds.at(-1), owned[0], 'root must terminate last');
  console.log('PASS bottom-first owned tree cleanup; unrelated control survives');
} finally {
  // Retry through verified handles if a test failed before cleanup; never kill
  // stale descendant PID numbers after the production helper has finished.
  if (identity && owned.some(alive)) { try { await call('Stop', owned[0], identity.startedUtc); } catch {} }
  for (const child of children) { try { child.kill(); } catch {} }
}
