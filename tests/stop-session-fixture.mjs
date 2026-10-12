import { spawn } from 'node:child_process';
const kind = process.argv[2];
const timer = setInterval(() => {}, 1000);
if (kind === 'root' || kind === 'child') {
  const count = kind === 'root' ? 2 : 1;
  const descendantKind = kind === 'root' ? 'child' : 'leaf';
  const descendants = [];
  await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [import.meta.filename, descendantKind], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    child.once('error', reject);
    child.once('message', message => { descendants.push(...message.pids); resolve(); });
  })));
  process.send({ pids: [process.pid, ...descendants] });
} else {
  process.send({ pids: [process.pid] });
}
