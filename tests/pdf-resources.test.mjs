import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfResources} from '../scripts/pdf-resources.ts';
test('bundles installed PDF.js fonts and CMaps with deterministic local paths',()=>{
 const plugin=pdfResources(),assets=[];plugin.generateBundle.call({emitFile:asset=>assets.push(asset)});
 assert(assets.some(asset=>asset.fileName==='pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap'));
 assert(assets.some(asset=>asset.fileName.startsWith('pdfjs/standard_fonts/')&&asset.source.length>1000));
 assert(assets.every(asset=>!asset.fileName.includes('..')));
});
test('dev middleware serves only packaged resource names',()=>{
 const plugin=pdfResources();let middleware;plugin.configureServer({middlewares:{use:handler=>middleware=handler}});
 let next=false,body;
 middleware({url:'/pdfjs/cmaps/../../package.json'},{setHeader(){},end(value){body=value;}},()=>{next=true;});assert(next);assert.equal(body,undefined);
 middleware({url:'/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap'},{setHeader(){},end(value){body=value;}},()=>{});assert(body.length>0);
});
