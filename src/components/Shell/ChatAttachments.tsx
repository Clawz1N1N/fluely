import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {Paperclip,X} from 'lucide-react';
import {t} from '@/lib/i18n';
import {DOCUMENT_ACCEPT,attachmentPrompt,readAttachment,type ChatAttachment} from '@/lib/overlay/document-attachments';
import {canAcceptAttachmentDrop,validateAttachmentCount,validateAttachmentSelection} from './attachment-intake';

export function ChatAttachments({attachments,onChange,onError,onLoading,disabled=false,scopeKey,dropTarget}:{attachments:ChatAttachment[];onChange:(files:ChatAttachment[])=>void;onError?:(error:string)=>void;onLoading?:(loading:boolean)=>void;disabled?:boolean;scopeKey?:string;dropTarget?:RefObject<HTMLDivElement|null>}) {
  const input=useRef<HTMLInputElement>(null),revision=useRef(0),latest=useRef(attachments);
  const abort=useRef<AbortController|undefined>(undefined);
  const [loading,setLoading]=useState(false),[preview,setPreview]=useState<string|null>(null);
  latest.current=attachments;
  useEffect(()=>{onLoading?.(loading);},[loading,onLoading]);
  useEffect(()=>{revision.current++;abort.current?.abort();setLoading(false);setPreview(null);return()=>{revision.current++;abort.current?.abort();};},[scopeKey]);
  const add=useCallback(async(source:File[]|(()=>Promise<File[]>))=>{
    if(disabled)return;
    const owner=++revision.current;setLoading(true);
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    try {
      const files=typeof source==='function'?await source():source;
      if(owner!==revision.current||controller.signal.aborted)return;
      validateAttachmentSelection(files,latest.current);
      const prepared:ChatAttachment[]=[];
      for(const file of files){prepared.push(await readAttachment(file,controller.signal));if(owner!==revision.current)return;}
      const next=[...latest.current,...prepared];attachmentPrompt(next);
      if(owner===revision.current)onChange(next);
    }catch(error){if(owner===revision.current)onError?.(error instanceof Error?t(error.message):t('Could not read attachment.'));}
    finally{if(owner===revision.current)setLoading(false);}
  },[disabled,onChange,onError]);
  useEffect(()=>{
    const target=dropTarget?.current;if(!target)return;
    let disposed=false,off:UnlistenFn|undefined;
    const allowed=()=>canAcceptAttachmentDrop(target.dataset.interactive,disabled);
    const dragOver=(event:DragEvent)=>{
      if(!Array.from(event.dataTransfer?.types??[]).includes('Files'))return;
      event.preventDefault();
      if(event.dataTransfer)event.dataTransfer.dropEffect=allowed()?'copy':'none';
    };
    const drop=(event:DragEvent)=>{
      if(!Array.from(event.dataTransfer?.types??[]).includes('Files'))return;
      event.preventDefault();
      if(allowed())void add(Array.from(event.dataTransfer?.files??[]));
    };
    target.addEventListener('dragover',dragOver);target.addEventListener('drop',drop);
    // WebView2 routes OS file drops through Tauri rather than DOM DataTransfer.
    // The native bridge accepts only a short-lived one-use OS-drop grant, never arbitrary paths.
    void listen<{dropId?:string;count:number;error?:string}>('answer-attachment-drop',event=>{
      if(disposed||!allowed())return;
      if(event.payload.error){onError?.(t(event.payload.error));return;}
      if(!event.payload.dropId)return;
      void add(async()=>{
        validateAttachmentCount(event.payload.count,latest.current.length);
        const files=await invoke<Array<{name:string;base64:string}>>('read_dropped_documents',{dropId:event.payload.dropId});
        return files.map(file=>new File([Uint8Array.from(atob(file.base64),character=>character.charCodeAt(0))],file.name));
      });
    }).then(stop=>{if(disposed)stop();else off=stop;}).catch(error=>{if(!disposed)console.error('Attachment drop listener:',error);});
    return()=>{disposed=true;off?.();target.removeEventListener('dragover',dragOver);target.removeEventListener('drop',drop);};
  },[add,disabled,dropTarget,onError,scopeKey]);
  const selected=attachments.find(file=>file.id===preview);
  return <div className="fluely-attachments" onPointerDown={event=>event.stopPropagation()}>
    <input ref={input} type="file" accept={DOCUMENT_ACCEPT} multiple hidden aria-label={t('Attach files')} onChange={event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';void add(files);}}/>
    <button type="button" className="fluely-inline-button" disabled={disabled||loading} onClick={()=>input.current?.click()} title={t('Attach files')}><Paperclip size={14}/>{loading?t('Reading files…'):t('Attach files')}</button>
    {attachments.map(file=><span key={file.id} className="fluely-attachment"><button type="button" title={`${file.name} (${Math.ceil(file.bytes/1024)} KB)`} onClick={()=>setPreview(preview===file.id?null:file.id)}>{file.name}</button><button type="button" disabled={disabled||loading} title={t('Remove attachment')} aria-label={`${t('Remove attachment')}: ${file.name}`} onClick={()=>onChange(attachments.filter(item=>item.id!==file.id))}><X size={12}/></button></span>)}
    {selected&&<div className="fluely-attachment-preview">{selected.kind==='image'?<img src={`data:${selected.mime};base64,${selected.base64}`} alt={selected.name} style={{maxWidth:'100%',maxHeight:160}}/>:<pre style={{maxHeight:160,overflow:'auto',whiteSpace:'pre-wrap'}}>{selected.text}</pre>}</div>}
  </div>;
}
