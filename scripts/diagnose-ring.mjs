import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Replay only the ring C compilation; never run Cargo or modify product sources.
const root = path.resolve(import.meta.dirname, '..');
const originalLog = path.join(root, 'cargo-debug.log');
const originalBytes = readFileSync(originalLog);
const originalText = originalBytes.toString(originalBytes[0] === 0xff && originalBytes[1] === 0xfe ? 'utf16le' : 'utf8');
const commandLine = originalText.split(/\r?\n/)
  .find(line => line.startsWith('[ring 0.17.14] running: ') && line.includes('curve25519.c'));
if (!commandLine) throw new Error('Original ring curve25519 compiler invocation not found');
const tokens = [...commandLine.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]));
const [compiler, ...originalArgs] = tokens;
const probe = path.join(root, '_research', 'ring-probe');
const logs = path.join(root, '_research', 'logs');
mkdirSync(probe, { recursive: true });
mkdirSync(logs, { recursive: true });
const vcvars = 'C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat';
const olderCompiler = compiler.replace('14.51.36231', '14.44.35207');
const quote = argument => {
  if (/["\r\n%]/.test(argument)) throw new Error('Unsafe command argument');
  return `"${argument}"`;
};
const results = [];

async function run(label, omit = [], developer = null, useOlder = false) {
  label += '-native';
  const output = path.join(probe, `${label}.o`);
  const args = originalArgs.filter(argument => !omit.includes(argument))
    .map(argument => argument.startsWith('-Fo') ? `-Fo${output}` : argument);
  const selectedCompiler = useOlder ? olderCompiler : compiler;
  if (!existsSync(selectedCompiler)) throw new Error(`Compiler not installed: ${selectedCompiler}`);
  const compile = [selectedCompiler, ...args].map(quote).join(' ');
  // The sole baseline argument change is redirecting -Fo into the diagnostic folder.
  const command = developer
    ? `call ${quote(vcvars)} ${developer} && cmd /d /c "set VCToolsVersion & set WindowsSDKVersion & set WindowsSdkDir & where cl" && ${compile}`
    : compile;
  const nativeFile = path.join(logs, `${label}.cmd`);
  writeFileSync(nativeFile, `@echo off\r\nset VSLANG=1033\r\n${command}\r\nexit /b %errorlevel%\r\n`, 'utf8');
  // Node's default Windows argv quoting escapes quotes for CommandLineToArgvW;
  // cmd.exe uses different rules. A native batch file preserves compiler quoting.
  const runnerCommand = `call _research\\logs\\${label}.cmd`;
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'run-check.mjs'), label, runnerCommand], {
      cwd: root, windowsHide: true, stdio: 'inherit',
      env: { ...process.env, VSLANG: '1033' },
    });
    child.on('error', reject);
    child.on('close', code => resolve(code));
  });
  const log = readFileSync(path.join(logs, `${label}.log`), 'utf8');
  results.push({ label, omit, developer, command, compiler: selectedCompiler, exitCode,
    objectCreated: existsSync(output),
    diagnostics: log.split(/\r?\n/).filter(line => /error|warning|VCToolsVersion=|WindowsSDKVersion=|WindowsSdkDir=/i.test(line)),
  });
  writeFileSync(path.join(logs, 'ring-probe-results.json'), JSON.stringify({
    source: originalLog, originalInvocation: commandLine,
    note: 'All original flags retained unless explicitly listed in omit; only -Fo output paths are redirected.', results,
  }, null, 2) + '\n');
  return exitCode === 0 && existsSync(output);
}

await run('ring-exact');
await run('ring-no-z7', ['-Z7']);
await run('ring-no-brepro', ['-Brepro']);
await run('ring-no-z7-brepro', ['-Z7', '-Brepro']);
await run('ring-no-wall', ['/Wall']);
await run('ring-no-z7-brepro-wall', ['-Z7', '-Brepro', '/Wall']);
let developerSucceeded = false;
for (const sdk of ['10.0.22621.0', '10.0.26100.0', '10.0.28000.0']) {
  const suffix = sdk.split('.')[2];
  developerSucceeded = await run(`ring-vcvars-${suffix}`, [], sdk) || developerSucceeded;
}
if (!developerSucceeded) {
  developerSucceeded = await run('ring-vcvars-no-z7-brepro-wall', ['-Z7', '-Brepro', '/Wall'], '10.0.22621.0');
}
if (!developerSucceeded && !results.some(result => result.exitCode === 0 && result.objectCreated)) {
  await run('ring-vcvars-1444', [], '10.0.22621.0 -vcvars_ver=14.44', true);
}
console.log(JSON.stringify(results.map(({ label, exitCode, objectCreated }) => ({ label, exitCode, objectCreated })), null, 2));
