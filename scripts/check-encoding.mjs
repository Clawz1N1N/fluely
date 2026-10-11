import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ignored = new Set(['.git', 'node_modules', 'target', 'dist', 'dist-ssr', 'gen', 'logs', '.superpowers']);
const extensions = /\.(json|ts|tsx|rs|toml|css|md|html|yml|yaml|txt|sql|mjs|cjs|ps1|bat|cfg|ini)$/i;
const mojibake = /\u044f\u2510\u255c|\u0420\u040e\u2026|\u0440\u045f|\u00e2\u20ac|\u00ef\u00bb\u00bf|\u0432\u0402/;
export function inspectEncoding(bytes) {
  const findings = [];
  if ((bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
      (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) findings.push('BOM');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { findings.push('invalid UTF-8'); return findings; }
  if (text.includes('\uFFFD')) findings.push('replacement character U+FFFD');
  if (mojibake.test(text)) findings.push('probable mojibake');
  if (/\r\n/.test(text) && /(?<!\r)\n/.test(text)) findings.push('mixed CRLF/LF');
  if (/\r(?!\n)/.test(text)) findings.push('bare CR');
  return findings;
}
export function repositoryTextFiles(root) {
  const result = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (extensions.test(entry.name) || ['.npmrc', '.gitattributes', '.editorconfig', '.gitignore'].includes(entry.name)) result.push(full);
    }
  }
  visit(root);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const files = repositoryTextFiles(root);
  let failures = 0;
  for (const file of files) {
    const problems = inspectEncoding(fs.readFileSync(file));
    if (problems.length) { failures++; console.error(`${path.relative(root, file)}: ${problems.join(', ')}`); }
  }
  console.log(`Encoding: ${files.length} text files checked; ${failures} failures.`);
  process.exitCode = failures ? 1 : 0;
}
