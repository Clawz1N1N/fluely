import {DOCUMENT_ACCEPT,MAX_ATTACHMENTS,MAX_FILE_BYTES,type ChatAttachment} from '@/lib/overlay/document-attachments';

export function validateAttachmentCount(count:number,currentCount:number):void {
  if(count+currentCount>MAX_ATTACHMENTS)throw new Error('Attach at most 8 files.');
}
/** Shared by DOM drops, native drops and the file picker before document extraction. */
export function validateAttachmentSelection(files:ReadonlyArray<{name:string;size:number}>,current:ReadonlyArray<Pick<ChatAttachment,'bytes'>>):void {
  validateAttachmentCount(files.length,current.length);
  for(const file of files){
    if(!DOCUMENT_ACCEPT.split(',').includes('.'+file.name.split('.').pop()?.toLowerCase()))throw new Error('Unsupported attachment format.');
    if(file.size>MAX_FILE_BYTES)throw new Error('File is too large (maximum 16 MB).');
  }
  if(files.reduce((sum,file)=>sum+file.size,0)+current.reduce((sum,file)=>sum+file.bytes,0)>32*1024*1024)throw new Error('Combined attachments exceed 32 MB. Attach fewer or smaller files.');
}
export function canAcceptAttachmentDrop(interactive:string|undefined,disabled:boolean):boolean {
  return interactive==='true'&&!disabled;
}
