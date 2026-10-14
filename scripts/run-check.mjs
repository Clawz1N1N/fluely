import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Usage: node scripts/run-check.mjs label "command" [working-directory]
const [label, command, directory = '.'] = process.argv.slice(2);
if (!label || !command || !/^[a-zA-Z0-9_-]+$/.test(label)) {
  throw new Error('Usage: run-check.mjs label "command" [working-directory]');
}
const root = path.resolve(import.meta.dirname, '..');
const buildLog=path.join(root,'_research','BUILD_LOG.md');
try {
  const previous=readFileSync(buildLog,'utf8');
  if(previous.includes('\r\n'))writeFileSync(buildLog,previous.replace(/\r\n/g,'\n'),'utf8');
}catch(error){if(error.code!=='ENOENT')throw error;}
const logs = path.join(root, '_research', 'logs');
mkdirSync(logs, { recursive: true });
const temporary = path.join(root, '_research', 'temp');
mkdirSync(temporary, { recursive: true });
const logfile = path.join(logs, `${label}.log`);
const stream = createWriteStream(logfile);
const started = new Date().toISOString();
// A native batch file preserves embedded quotes; Node's Windows argv escaping
// follows different rules from cmd.exe and would escape compiler paths wrongly.
writeFileSync(path.join(logs, `${label}-launch.cmd`), `@echo off\r\nchcp 65001 >nul\r\ncd /d "${path.resolve(root, directory)}"\r\n${command}\r\nexit /b %errorlevel%\r\n`, 'utf8');
const child = spawn('cmd.exe', ['/d', '/c', `call _research\\logs\\${label}-launch.cmd`], {
  cwd: root, windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary, npm_config_cache: path.join(root, '_research', 'npm-cache'), VSLANG: '1033', NO_COLOR: '1', CARGO_TERM_COLOR: 'never' },
});
child.stdout.pipe(stream, { end: false });
child.stderr.pipe(stream, { end: false });
child.on('error', error => stream.write(`${error.message}\n`));
child.on('close', code => stream.end(() => {
  const bytes = readFileSync(logfile);
  let output;
  try { output = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { output = new TextDecoder('ibm866').decode(bytes); }
  const tail = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\uFFFD/g,'[U+FFFD in native diagnostic]').trimEnd().split(/\r?\n/).slice(-20).map(line => line.trimEnd()).join('\n');
  const entry = `\n## ${label} — ${started}\n\nDirectory: ${path.resolve(root, directory)}\n\nCommand: \`${command}\`\n\nExit code: ${code ?? 'spawn failed'}\n\nLast 20 output lines:\n\n\`\`\`text\n${tail}\n\`\`\`\n\nFull log: logs/${label}.log\n`;
  const published=entry.replaceAll(path.join(path.dirname(root),'RELEASE'),'<delivery>')
    .replaceAll(root,'<workspace>').replaceAll(process.env.USERPROFILE??'__NO_PROFILE__','%USERPROFILE%');
  appendFileSync(buildLog, published, 'utf8');
  console.log(entry);
  process.exitCode = code ?? 1;
}));
