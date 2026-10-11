import fs from 'node:fs';
import { repositoryTextFiles, inspectEncoding } from './check-encoding.mjs';
import path from 'node:path';

// Targeted recovery: leave valid files byte-identical. Run only after auditing.
const root = path.resolve(import.meta.dirname, '..');
for (const file of repositoryTextFiles(root)) {
  const bytes = fs.readFileSync(file);
  if (!inspectEncoding(bytes).length) continue;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1251', { fatal: true }).decode(bytes); }
  text = text.replace(/^\uFEFF/, '');
  // A known, reversible broken lightbulb sequence used in three UI hints.
  text = text.replace(/\u0440\u045f\u2019\u040e/g, '\u{1F4A1}');
  if (/\r\n/.test(text) && /(?<!\r)\n/.test(text)) text = text.replace(/\r\n/g, '\n');
  const repaired = Buffer.from(text, 'utf8');
  const remaining = inspectEncoding(repaired);
  if (remaining.length) throw new Error(`${file}: ${remaining.join(', ')}`);
  if (!bytes.equals(repaired)) {
    fs.writeFileSync(file, repaired);
    console.log(`Recovered ${path.relative(root, file)}`);
  }
}
