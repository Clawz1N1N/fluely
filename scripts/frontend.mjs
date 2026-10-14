import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import './prepare-vad.mjs';

const mode = process.argv[2] ?? 'dev';
if (!['dev', 'build', 'preview'].includes(mode)) throw new Error('Unknown frontend mode');
const root = path.resolve(import.meta.dirname, '..');
const temporary = path.join(root, '_research/temp');
const logs = path.join(root, '_research/logs');
fs.mkdirSync(temporary, { recursive: true }); fs.mkdirSync(logs, { recursive: true });
const args = [mode === 'dev' ? '' : mode, '--configLoader runner'].filter(Boolean).join(' ');
let child;
// Use the real checkout path. SUBST is session-wide, not process-local: an
// interrupted build used to leave P:/Q: visible in Explorer indefinitely.
child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), ...args.split(' ')], {
  cwd: root, windowsHide: true, stdio: 'inherit',
  env: { ...process.env, TEMP: temporary, TMP: temporary },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
