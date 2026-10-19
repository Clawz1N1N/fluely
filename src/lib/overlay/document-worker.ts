import {extractDocument} from './document-extraction';
// Run ZIP/XML parsing outside the overlay event loop. No document content is
// evaluated and the worker owns only the copied file bytes for this request.
self.onmessage=async(event:MessageEvent<{name:string;bytes:Uint8Array}>)=>{
  try{self.postMessage({document:await extractDocument(event.data.name,event.data.bytes)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'Could not read attachment.'});}
};
