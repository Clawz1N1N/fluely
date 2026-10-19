import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';

/** Keep PDF.js' maintained fonts and CMaps local in dev and packaged webviews. */
export function pdfResources(root=path.resolve('node_modules/pdfjs-dist')):Plugin {
  const resources=new Map<string,{path:string;contentType:string}>();
  for(const directory of ['cmaps','standard_fonts'])for(const name of readdirSync(path.join(root,directory))) {
    if(!/^[a-zA-Z0-9_.-]+$/.test(name))continue;
    resources.set(`/pdfjs/${directory}/${name}`,{path:path.join(root,directory,name),contentType:name==='LICENSE'?'text/plain':'application/octet-stream'});
  }
  resources.set('/pdfjs/LICENSE',{path:path.join(root,'LICENSE'),contentType:'text/plain'});
  return {name:'bundled-pdf-resources',configureServer(server){
    server.middlewares.use((request,response,next)=>{
      const resource=resources.get((request.url??'').split('?')[0]);if(!resource){next();return;}
      response.setHeader('Content-Type',resource.contentType);response.end(readFileSync(resource.path));
    });
  },generateBundle(){
    for(const [name,resource] of resources)this.emitFile({type:'asset',fileName:name.slice(1),source:readFileSync(resource.path)});
  }};
}
