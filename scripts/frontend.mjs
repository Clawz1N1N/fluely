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
if (process.platform === 'win32') {
  // A process-local DOS mapping avoids esbuild traversing unreadable profile
  // parents in restricted Windows sessions. All files remain in this repo.
  const letter = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].find(l => !fs.existsSync(`${l}:/`));
  if (!letter) throw new Error('No free temporary drive letter for frontend build');
  const launcher = path.join(logs, `frontend-${mode}.cmd`);
  fs.writeFileSync(launcher, `@echo off\r\nsubst ${letter}: "${root}"\r\nif errorlevel 1 exit /b %errorlevel%\r\ncd /d ${letter}:\\\r\nnode --preserve-symlinks --preserve-symlinks-main node_modules\\vite\\bin\\vite.js ${args}\r\nset frontend_exit=%errorlevel%\r\ncd /d "${root}"\r\nsubst ${letter}: /d\r\nexit /b %frontend_exit%\r\n`, 'utf8');
  child = spawn('cmd.exe', ['/d', '/c', `call _research\\logs\\frontend-${mode}.cmd`], {
    cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, TEMP: temporary, TMP: temporary },
  });
} else {
  child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), ...args.split(' ')], { cwd: root, stdio: 'inherit' });
}
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
