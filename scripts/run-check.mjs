import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

// Usage: node scripts/run-check.mjs label "command" [working-directory]
const [label, command, directory = '.'] = process.argv.slice(2);
if (!label || !command || !/^[a-zA-Z0-9_-]+$/.test(label)) {
  throw new Error('Usage: run-check.mjs label "command" [working-directory]');
}
const root = path.resolve(import.meta.dirname, '..');
const logs = path.join(root, '_research', 'logs');
mkdirSync(logs, { recursive: true });
const logfile = path.join(logs, `${label}.log`);
const stream = createWriteStream(logfile);
const started = new Date().toISOString();
const child = spawn('cmd.exe', ['/d', '/s', '/c', `chcp 65001 >nul & ${command}`], {
  cwd: path.resolve(root, directory), windowsHide: true,
  env: { ...process.env, VSLANG: '1033', NO_COLOR: '1', CARGO_TERM_COLOR: 'never' },
});
child.stdout.pipe(stream, { end: false });
child.stderr.pipe(stream, { end: false });
child.on('error', error => stream.write(`${error.message}\n`));
child.on('close', code => stream.end(() => {
  const tail = readFileSync(logfile, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split(/\r?\n/).slice(-20).join('\n');
  const entry = `\n## ${label} — ${started}\n\nDirectory: ${path.resolve(root, directory)}\n\nCommand: \`${command}\`\n\nExit code: ${code ?? 'spawn failed'}\n\nLast 20 output lines:\n\n\`\`\`text\n${tail}\n\`\`\`\n\nFull log: logs/${label}.log\n`;
  appendFileSync(path.join(root, '_research', 'BUILD_LOG.md'), entry, 'utf8');
  console.log(entry);
  process.exitCode = code ?? 1;
}));
