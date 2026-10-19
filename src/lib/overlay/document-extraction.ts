import {unzip,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

export const MAX_FILE_BYTES=16*1024*1024;
export const MAX_TEXT_CHARS=200000;
export const MAX_ATTACHMENTS=8;
export const DOCUMENT_ACCEPT='.txt,.md,.csv,.tsv,.json,.xml,.html,.log,.rtf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.pdf,.png,.jpg,.jpeg,.webp,.gif';
export interface ChatAttachment {id:string;name:string;kind:'text'|'image';bytes:number;text?:string;base64?:string;mime?:string}
export interface ExtractedDocument {text:string;bytes:number}
function bounded(text:string):string {
  const value=text.replace(/\r\n?/g,'\n').replace(/\n{4,}/g,'\n\n').trim();
  if(value.length>MAX_TEXT_CHARS)throw new Error('Extracted document is too large. Attach a smaller section (maximum 200,000 characters).');
  if(!value)throw new Error('No readable text found. Scanned PDFs need OCR; attach page images instead.');return value;
}
function decode(bytes:Uint8Array):string {
  try {
    const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
    const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
    if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text))throw new Error('binary');return text;
  }catch{throw new Error('Unsupported text encoding or binary content. Save text as UTF-8 or UTF-16 with a BOM.');}
}
type OrderedNode=Record<string,unknown>;
function parseXml(xml:string):OrderedNode[] {
  if(/<!\s*(DOCTYPE|ENTITY)/i.test(xml))throw new Error('XML DOCTYPE and entity declarations are unsupported.');
  if(XMLValidator.validate(xml)!==true)throw new Error('Invalid XML in document.');
  return new XMLParser({preserveOrder:true,ignoreAttributes:false,removeNSPrefix:true,trimValues:false,parseTagValue:false,processEntities:true,htmlEntities:false,maxNestedTags:128}).parse(xml) as OrderedNode[];
}
function content(nodes:OrderedNode[],paragraphs=true):string {
  let text='';
  for(const node of nodes)for(const [key,value] of Object.entries(node)) {
    if(key===':@')continue;
    if(key==='#text')text+=String(value);
    else if(Array.isArray(value)) {
      if(/(?:^|:)(?:s)$/.test(key)){const attrs=node[':@'] as Record<string,string>|undefined;text+=' '.repeat(Math.min(1000,Math.max(1,Number(attrs?.['@_c'])||1)));}
      else if(/(?:^|:)(?:tab)$/.test(key))text+='\t';
      else if(/(?:^|:)(?:br|line-break)$/.test(key))text+='\n';
      else {text+=content(value as OrderedNode[],paragraphs);if(paragraphs&&/(?:^|:)(?:p|h|table-row|row)$/.test(key))text+='\n';}
    }
    if(text.length>MAX_TEXT_CHARS)throw new Error('Extracted document is too large.');
  }
  return text;
}
function descendants(nodes:OrderedNode[],name:RegExp):OrderedNode[][] {
  const result:OrderedNode[][]=[];
  for(const node of nodes)for(const [key,value] of Object.entries(node))if(key!==':@'&&Array.isArray(value)) {
    if(name.test(key))result.push(value as OrderedNode[]);else result.push(...descendants(value as OrderedNode[],name));
  }return result;
}
async function office(name:string,bytes:Uint8Array):Promise<string> {
  const ext=name.split('.').pop()?.toLowerCase();let tooLarge=false,count=0,total=0;
  const files=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>unzip(bytes,{filter:file=>{
    if(++count>4000){tooLarge=true;return false;}
    const selected=ext==='docx'?/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(file.name)
      :ext==='xlsx'?/^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(file.name)
      :ext==='pptx'?/^ppt\/slides\/slide\d+\.xml$/.test(file.name):file.name==='content.xml';
    if(selected){total+=file.originalSize;if(total>16*1024*1024||file.originalSize>8*1024*1024){tooLarge=true;return false;}}
    return selected;
  }},(error,result)=>error?reject(new Error('Cannot read document archive (corrupt or encrypted).')):resolve(result)));
  if(tooLarge)throw new Error('Document archive is too large or contains too many entries.');
  const entries=Object.keys(files).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!entries.length)throw new Error('No supported document content found (encrypted or invalid document).');
  if(ext==='xlsx') {
    const shared=files['xl/sharedStrings.xml']?descendants(parseXml(strFromU8(files['xl/sharedStrings.xml'])),/^si$/).map(node=>content(node,false)):[];
    return entries.filter(path=>path.includes('/worksheets/')).map(path=>{
      const rows=descendants(parseXml(strFromU8(files[path])),/^row$/);
      return `[${path.split('/').pop()}]\n`+rows.map(row=>row.flatMap(node=>{
        const cells=node.c;if(!Array.isArray(cells))return [];
        const attributes=node[':@'] as Record<string,string>|undefined;
        const type=attributes?.['@_t'],reference=attributes?.['@_r']??'';
        const value=content(descendants(cells,/^(?:v|is)$/).flat(),false);
        return [`${reference}: ${type==='s'?shared[Number(value)]??`[Missing shared string ${value}]`:value}`];
      }).join('\t')).join('\n');
    }).join('\n\n');
  }
  return entries.map(path=>`[${path}]\n${content(parseXml(strFromU8(files[path])))}`).join('\n\n');
}
async function pdfText(bytes:Uint8Array):Promise<string> {
  const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
  if(typeof window!=='undefined')pdf.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const resources=typeof window==='undefined'?{}:{cMapUrl:new URL('/pdfjs/cmaps/',window.location.href).href,cMapPacked:true,standardFontDataUrl:new URL('/pdfjs/standard_fonts/',window.location.href).href};
  const loading=pdf.getDocument({data:bytes.slice(),...resources,disableFontFace:true,useSystemFonts:false,isOffscreenCanvasSupported:false,stopAtErrors:true});
  try {
    const document=await loading.promise;
    if(document.numPages>200)throw new Error('PDF is too large (maximum 200 pages).');
    let text='';for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++) {
      const page=await document.getPage(pageNumber),pageText=await page.getTextContent();
      text+=`[Page ${pageNumber}]\n`+pageText.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('')+'\n';
      if(text.length>MAX_TEXT_CHARS)throw new Error('Extracted PDF is too large.');page.cleanup();
    }
    if(!text.replace(/\[Page \d+\]/g,'').trim())throw new Error('No readable text found. Scanned PDFs need OCR; attach page images instead.');return text;
  }finally{await loading.destroy();}
}
export async function extractDocument(name:string,bytes:Uint8Array):Promise<ExtractedDocument> {
  if(bytes.length>MAX_FILE_BYTES)throw new Error('File is too large (maximum 16 MB).');
  const ext=name.split('.').pop()?.toLowerCase()??'';
  let text:string;
  if(['docx','xlsx','pptx','odt','ods','odp'].includes(ext))text=await office(name,bytes);
  else if(ext==='pdf')text=await pdfText(bytes);
  else if(['doc','xls','ppt','rtf'].includes(ext))throw new Error('Legacy Office/RTF documents require LibreOffice conversion. Save as DOCX, XLSX, PPTX, ODT, ODS, ODP or PDF.');
  else if(['txt','md','csv','tsv','json','xml','html','log'].includes(ext))text=decode(bytes);
  else throw new Error('Unsupported attachment format. Choose a text, Office, OpenDocument, PDF or image file.');
  return {text:bounded(text),bytes:bytes.length};
}
