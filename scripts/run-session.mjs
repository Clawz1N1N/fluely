import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [label, secondsText, command, probeUrl] = process.argv.slice(2);
const seconds = Number(secondsText);
if (!/^[\w-]+$/.test(label ?? '') || !command || seconds < 1 || seconds > 300) throw new Error('Usage: run-session label seconds "command" [probe-url]');
const root = path.resolve(import.meta.dirname, '..');
mkdirSync(path.join(root, '_research/logs'), { recursive: true });
const temporary = path.join(root, '_research', 'temp');
mkdirSync(temporary, { recursive: true });
const logfile = path.join(root, '_research/logs', `${label}.log`);
const stream = createWriteStream(logfile);
const started = Date.now();
writeFileSync(path.join(root, '_research/logs', `${label}-launch.cmd`), `@echo off\r\nchcp 65001 >nul\r\n${command}\r\nexit /b %errorlevel%\r\n`, 'utf8');
const child = spawn('cmd.exe', ['/d', '/c', `call _research\\logs\\${label}-launch.cmd`], {
  cwd: root, windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary, VSLANG: '1033', RUST_BACKTRACE: '1', NO_COLOR: '1', CARGO_TERM_COLOR: 'never' },
});
child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
let terminated = false, finished = false, probes = [];
let cleanupFailed = false;
function sessionControl(action, identity) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'scripts/stop-session.ps1'), '-Action', action, '-RootProcessId', String(child.pid)];
  if (identity) args.push('-StartedUtc', identity.startedUtc);
  const result = spawnSync('powershell.exe', args, { cwd: root, windowsHide: true,
    encoding: 'utf8', timeout: 25000, maxBuffer: 65536,
    env: { ...process.env, TEMP: temporary, TMP: temporary } });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr?.trim() || `Owned-process helper exit ${result.status}`);
  return JSON.parse(result.stdout.trim());
}
let identity;
try {
  identity = sessionControl('Describe');
  writeFileSync(path.join(root, '_research/logs', `${label}-process.json`), JSON.stringify(identity, null, 2) + '\n', 'utf8');
} catch (error) {
  cleanupFailed = true;
  stream.write(`Owned-process identity unavailable: ${error.message}\n`);
}
const timer = setTimeout(() => {
  terminated = true;
  try {
    if (!identity) throw new Error('No verified root creation time; broad cleanup refused');
    const stopped = sessionControl('Stop', identity);
    stream.write(`Owned-process cleanup: ${JSON.stringify(stopped)}\n`);
  } catch (error) {
    cleanupFailed = true;
    stream.write(`Owned-process cleanup failed: ${error.message}\n`);
    // child.kill uses the retained process handle; it does not match other PIDs.
    try { child.kill(); } catch {}
  }
  // Do not hang on pipes inherited by an uncooperative descendant after failure.
  setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); }, 1000);
}, Math.max(0, seconds * 1000 - (Date.now() - started)));
const probeTimer = probeUrl ? setInterval(async () => {
  try {
    for (const route of ['', '/src/main.tsx']) {
      const response = await fetch(`${probeUrl}${route}`, { signal: AbortSignal.timeout(3000) });
      const body = await response.text();
      probes.push(`${route || '/'} HTTP${response.status}, ${body.length} bytes`);
    }
  } catch (error) { probes.push(`probe: ${error.message}`); }
}, 5000) : undefined;
child.on('error', error => stream.write(`${error.message}\n`));
child.on('close', code => {
  if (finished) return; finished = true;
  clearTimeout(timer); clearInterval(probeTimer);
  stream.end(() => {
    const bytes = readFileSync(logfile);
    let decoded;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { decoded = new TextDecoder('ibm866').decode(bytes); }
    const text = decoded.replace(/\x1b\[[0-9;]*m/g, '');
    const tail = text.replace(/\uFFFD/g,'[U+FFFD in native diagnostic]').trimEnd().split(/\r?\n/).slice(-20).map(line => line.trimEnd()).join('\n');
    const entry = `\n## ${label} — ${new Date(started).toISOString()}\n\nCommand: \`${command}\`\n\nObservation: ${((Date.now()-started)/1000).toFixed(1)}s; native exit: ${code}; stopped by timer: ${terminated}. Intentional termination is not a build success.\n\nProbes: ${[...new Set(probes)].join('; ') || 'none'}\n\nLast 20 lines:\n\n\`\`\`text\n${tail}\n\`\`\`\n\nFull log: logs/${label}.log\n`;
    appendFileSync(path.join(root, '_research/BUILD_LOG.md'), entry, 'utf8'); console.log(entry);
    const badLogs = /error TS\d|Internal server error|failed to resolve|panicked at|error: failed|Failed to initialize shell/i.test(text);
    const badProbe = probeUrl && (!probes.some(p => p.includes('HTTP200')) || probes.some(p => /HTTP[45]/.test(p)));
    process.exitCode = terminated && !cleanupFailed && !badLogs && !badProbe ? 0 : (code || 1);
  });
});
