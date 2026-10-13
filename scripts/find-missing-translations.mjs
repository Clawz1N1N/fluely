import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {catalog} from '../src/lib/i18n/catalog.ts';
const missing=new Set();
function scan(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,file.name);if(file.isDirectory()){scan(name);continue;}if(!/\.tsx?$/.test(name))continue;
 const source=ts.createSourceFile(name,fs.readFileSync(name,'utf8'),ts.ScriptTarget.Latest,true);
 const visit=node=>{let value;if(ts.isCallExpression(node)&&node.expression.getText(source)==='t')value=node.arguments[0];else if(ts.isJsxAttribute(node)&&node.name.getText(source)==='label')value=node.initializer;
 if(value&&ts.isStringLiteralLike(value)&&!catalog[value.text])missing.add(value.text);ts.forEachChild(node,visit);};visit(source);
}}
scan('src');console.log([...missing].join('\n'));
