import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

// Exact source-line retention within tracked source paths, with Git rename detection.
const baseline=process.argv[2]??'dc35e936e36b7fe2b03119df268cb1b02d35cf5b';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const source=p=>/^(src\/|src-tauri\/src\/)/.test(p)&&/\.(?:rs|tsx?|css)$/.test(p);
const lines=text=>text.length?text.replace(/\r\n/g,'\n').split('\n').length-(text.endsWith('\n')?1:0):0;
const original=git('ls-tree','-r','--name-only',baseline).split('\n').filter(source);
const current=git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(source).filter(p=>existsSync(p));
const originalLines=original.reduce((sum,p)=>sum+lines(git('show',`${baseline}:${p}`)),0);
const currentLines=current.reduce((sum,p)=>sum+lines(readFileSync(path.resolve(p),'utf8')),0);
const changes=git('diff','--numstat','--find-renames','--ignore-cr-at-eol',baseline,'--','src','src-tauri/src').trim().split('\n');
let added=0,removed=0,changedFiles=0;
for(const row of changes){const [a,d,p]=row.split('\t');if(!p)continue;const renamed=p.replace(/\{([^{}]+) => ([^{}]+)\}/g,'$2').replace(/^.* => /,'');if(!source(renamed))continue;if(a==='-'||d==='-')continue;added+=Number(a);removed+=Number(d);changedFiles++;}
const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(source);
added+=untracked.reduce((sum,p)=>sum+lines(readFileSync(path.resolve(p),'utf8')),0);
changedFiles+=untracked.length;
const preserved=originalLines-removed;
const pct=n=>Number(n.toFixed(2));
console.log(JSON.stringify({baseline,metric:'Exact line retention within src and src-tauri/src (.rs/.ts/.tsx/.css), Git diff rename detection, CRLF ignored; includes blank/comment lines, excludes docs/tests/generated/dependencies.',originalFiles:original.length,currentFiles:current.length,changedFiles,originalLines,currentLines,addedLines:added,removedOriginalLines:removed,preservedOriginalLines:preserved,originalPreservedPercent:pct(100*preserved/originalLines),originalChangedOrRemovedPercent:pct(100*removed/originalLines),unchangedOriginalShareOfForkPercent:pct(100*preserved/currentLines)},null,2));
