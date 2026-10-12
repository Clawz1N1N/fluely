import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const destination=path.join(root,'public/vad');
fs.mkdirSync(destination,{recursive:true});
const files=[['@ricky0123/vad-web/dist','silero_vad_v5.onnx'],['@ricky0123/vad-web/dist','vad.worklet.bundle.min.js'],
  ...fs.readdirSync(path.join(root,'node_modules/onnxruntime-web/dist')).filter(name=>/^ort-wasm.*\.wasm$/.test(name)).map(name=>['onnxruntime-web/dist',name])];
for(const [directory,name]of files){
  const source=path.join(root,'node_modules',directory,name),target=path.join(destination,name);
  if(!fs.existsSync(target)||!fs.readFileSync(source).equals(fs.readFileSync(target)))fs.copyFileSync(source,target);
}
console.log(`Prepared ${files.length} local VAD assets; microphone processing does not use a CDN.`);
