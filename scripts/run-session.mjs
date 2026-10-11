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
const timer = setTimeout(() => {
  terminated = true;
  // Stop the exact owned Vite PID. taskkill /T may spend minutes enumerating
  // inaccessible processes in a restricted Windows session.
  try {
    const owned = JSON.parse(readFileSync(path.join(root, '_research/logs/vite-process.json'), 'utf8'));
    if (Date.parse(owned.started) >= started) process.kill(owned.pid);
  } catch (error) { stream.write(`Owned-process stop: ${error.message}\n`); }
  setTimeout(() => { try { child.kill(); } catch {} }, 1000);
}, seconds * 1000);
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
    const text = readFileSync(logfile, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    const tail = text.trimEnd().split(/\r?\n/).slice(-20).join('\n');
    const entry = `\n## ${label} — ${new Date(started).toISOString()}\n\nCommand: \`${command}\`\n\nObservation: ${((Date.now()-started)/1000).toFixed(1)}s; native exit: ${code}; stopped by timer: ${terminated}. Intentional termination is not a build success.\n\nProbes: ${[...new Set(probes)].join('; ') || 'none'}\n\nLast 20 lines:\n\n\`\`\`text\n${tail}\n\`\`\`\n\nFull log: logs/${label}.log\n`;
    appendFileSync(path.join(root, '_research/BUILD_LOG.md'), entry, 'utf8'); console.log(entry);
    const badLogs = /error TS\d|Internal server error|failed to resolve|panicked at|error: failed|Failed to initialize shell/i.test(text);
    const badProbe = probeUrl && (!probes.some(p => p.includes('HTTP200')) || probes.some(p => /HTTP[45]/.test(p)));
    process.exitCode = terminated && !badLogs && !badProbe ? 0 : (code || 1);
  });
});
