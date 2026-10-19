import http from 'node:http';
const models=[
 {id:'fixture-text',name:'Fixture text',context_length:8192,max_tokens:512},
 {id:'fixture-vision',name:'Fixture vision',context_length:16384,max_tokens:1024,architecture:{input_modalities:['text','image']}},
 {id:'fixture-audio',name:'Fixture audio',context_length:8192,max_tokens:512,architecture:{input_modalities:['text','audio']}}
];
let lastRequest=null;
const server=http.createServer((request,response)=>{
 if(request.method==='POST'&&request.url==='/v1/audio/transcriptions'){
  request.resume();request.on('end',()=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({text:'Fixture speaker heard clearly.',segments:[{text:'Fixture speaker heard clearly.',speaker:'Speaker 1',start:0,end:0.25}]}));});return;
 }
 if(request.method==='GET'&&request.url==='/last-request'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(lastRequest));return;}
 if(request.method==='GET'&&['/v1/models','/v1/key'].includes(request.url)){
  if(request.headers.authorization==='Bearer invalid-fixture-key'){response.writeHead(401,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{message:'Fixture API key is invalid'}}));return;}
  response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(request.url==='/v1/key'?{data:{label:'Owned key'}}:{data:models}));return;
 }
 if(request.method==='POST'&&request.url==='/v1/chat/completions'){
  let input='';request.on('data',chunk=>{input+=chunk;if(input.length>2_000_000)request.destroy();});request.on('end',()=>{
   const body=JSON.parse(input);lastRequest=body;const sleep=String(body.messages?.[0]?.content).includes('SLEEP MODE');
   if(body.model==='fixture-agent'&&body.tool_choice!=='none'){
    response.writeHead(200,{'Content-Type':'text/event-stream'});
    for(const delta of [{tool_calls:[{index:0,id:'owned_status',type:'function',function:{name:'get_workspace_status',arguments:'{'}}]},{tool_calls:[{index:0,function:{arguments:'}'}}]}])response.write('data: '+JSON.stringify({choices:[{delta}]})+'\n\n');
    response.write('data: '+JSON.stringify({choices:[],usage:{prompt_tokens:7,completion_tokens:1,total_tokens:8}})+'\n\n');
    response.end('data: [DONE]\n\n');return;
   }
   if(body.model==='fixture-error'){response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{message:'Fixture model parameter rejected: unsupported effort'}}));return;}
   const content=sleep?'<main>Wake signal <+!SOS!+></main>':'<main>Fixture answer.</main><side>Fixture context.</side><speak>Fixture explanation.</speak>';
   response.writeHead(200,{'Content-Type':'text/event-stream'});
   // Marker intentionally spans separate SSE messages.
   for(let i=0;i<content.length;i+=7)response.write('data: '+JSON.stringify({choices:[{delta:{content:content.slice(i,i+7)}}]})+'\n\n');
   response.write('data: '+JSON.stringify({choices:[],usage:{prompt_tokens:11,completion_tokens:9,total_tokens:20}})+'\n\n');
   response.end('data: [DONE]\n\n');
  });return;
 }
 response.writeHead(404);response.end();
});
server.listen(18146,'127.0.0.1',()=>console.log('Owned provider fixture ready on loopback 18146'));
process.on('SIGTERM',()=>server.close());
