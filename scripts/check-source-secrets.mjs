import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const patterns=[/sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{24,}/,/AIza[0-9A-Za-z_-]{35}/,/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/,/AKIA[0-9A-Z]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const findings=[];
for(const file of files){if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>5_000_000)continue;const data=fs.readFileSync(file);if(data.includes(0))continue;const source=data.toString('utf8');if(patterns.some(p=>p.test(source)))findings.push(file);}
console.log(JSON.stringify({files:files.length,potentialCredentialFiles:findings}));
if(findings.length)process.exitCode=1;
