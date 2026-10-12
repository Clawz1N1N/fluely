// Local integration fixture. Stores only request counts/flags, never raw bodies.
import http from 'node:http';
const stats={requests:[],summaries:[]};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/stats'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(stats));return;}
  let source='';for await(const chunk of req){source+=chunk;if(source.length>32*1024*1024){res.writeHead(413);res.end();return;}}
  const body=JSON.parse(source||'{}');stats.requests.push(body.model??req.url);
  if(body.model==='smoke-fail'){res.writeHead(429,{'Retry-After':'1'});res.end('fixture limit');return;}
  const content=body.messages?.at(-1)?.content;
  const text=typeof content==='string'?content:content?.filter(part=>part.type==='text').map(part=>part.text).join(' ')??'';
  const images=Array.isArray(content)?content.filter(part=>part.type==='image_url'):[];
  stats.summaries.push({mic:text.includes('[mic]'),system:text.includes('[system]'),q1:text.includes('SMOKE-Q1'),q2:text.includes('SMOKE-Q2'),images:images.length,jpeg:images.every(part=>part.image_url.url.startsWith('data:image/jpeg;'))});
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const response='<main>Перевірено $x^2$.</main><side>Додатково.</side><speak>Просте пояснення.</speak>';
  for(const chunk of response.match(/.{1,5}/gu)??[])res.write(`data: ${JSON.stringify({choices:[{delta:{content:chunk}}]})}\n\n`);
  res.end('data: [DONE]\n\n');
});
server.listen(18086,'127.0.0.1',()=>console.log('Local fixture listening on 127.0.0.1:18086'));
