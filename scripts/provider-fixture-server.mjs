import http from 'node:http';
const models=[
 {id:'fixture-text',name:'Fixture text',context_length:8192,max_tokens:512},
 {id:'fixture-vision',name:'Fixture vision',context_length:16384,max_tokens:1024,architecture:{input_modalities:['text','image']}},
 {id:'fixture-audio',name:'Fixture audio',context_length:8192,max_tokens:512,architecture:{input_modalities:['text','audio']}}
];
const server=http.createServer((request,response)=>{
 if(request.method==='GET'&&request.url==='/v1/models'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:models}));return;}
 if(request.method==='POST'&&request.url==='/v1/chat/completions'){
  let input='';request.on('data',chunk=>{input+=chunk;if(input.length>2_000_000)request.destroy();});request.on('end',()=>{
   const body=JSON.parse(input);const sleep=String(body.messages?.[0]?.content).includes('SLEEP MODE');
   const content=sleep?'<main>Wake signal <+!SOS!+></main>':'<main>Fixture answer.</main><side>Fixture context.</side><speak>Fixture explanation.</speak>';
   response.writeHead(200,{'Content-Type':'text/event-stream'});
   // Marker intentionally spans separate SSE messages.
   for(let i=0;i<content.length;i+=7)response.write('data: '+JSON.stringify({choices:[{delta:{content:content.slice(i,i+7)}}]})+'\n\n');
   response.end('data: [DONE]\n\n');
  });return;
 }
 response.writeHead(404);response.end();
});
server.listen(18146,'127.0.0.1',()=>console.log('Owned provider fixture ready on loopback 18146'));
process.on('SIGTERM',()=>server.close());
