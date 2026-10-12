import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const directory=path.resolve(root,'..','RELEASE');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const line of fs.readFileSync(path.join(directory,'SHA256.txt'),'utf8').trim().split(/\r?\n/)){
  const match=line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
  if(!match)throw Error('Invalid checksum manifest entry');
  if(hash(path.join(directory,match[2]))!==match[1])throw Error(`Checksum mismatch: ${match[2]}`);
  console.log(`SHA256 OK ${match[2]}`);
}
const sources={'pluely.exe':'src-tauri/target/release/pluely.exe',
  'Pluely_0.1.9_x64-setup.exe':'src-tauri/target/release/bundle/nsis/Pluely_0.1.9_x64-setup.exe',
  'Pluely_0.1.9_x64_en-US.msi':'src-tauri/target/release/bundle/msi/Pluely_0.1.9_x64_en-US.msi'};
for(const [name,source] of Object.entries(sources)){
  if(hash(path.join(directory,name))!==hash(path.join(root,source)))throw Error(`Stale release artifact: ${name}`);
  console.log(`Build artifact matches ${name}`);
}
const executable=fs.readFileSync(path.join(directory,'pluely.exe'));
if(executable.readUInt16LE(0)!==0x5a4d||executable.readUInt16LE(executable.readUInt32LE(0x3c)+4)!==0x8664)throw Error('Expected Windows x64 PE executable');
console.log('Windows x64 PE verified; Authenticode signing is not configured.');
