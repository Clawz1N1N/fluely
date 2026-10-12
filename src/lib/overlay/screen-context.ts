export interface VisionSettings { mode:'ocr'|'ocr+ui'|'vlm'|'full';max_chars:number;ui_max_depth:number;ui_max_chars:number }
interface ContextPorts { native(frame:string):Promise<string>;describe(frame:string):Promise<string> }
/** Changed frames arrive from the native deduplicator. Full mode overlaps both sources. */
export async function resolveScreenContext(frames:string[],settings:Pick<VisionSettings,'mode'|'max_chars'>,ports:ContextPorts):Promise<string> {
  const contexts=await Promise.all(frames.map(async frame=>{
    if(settings.mode==='vlm')return `[VLM]\n${await ports.describe(frame)}`;
    if(settings.mode==='full'){
      const [native,description]=await Promise.all([ports.native(frame),ports.describe(frame)]);
      return `${native}\n[VLM]\n${description}`;
    }
    return ports.native(frame);
  }));
  return Array.from(contexts.join('\n\n')).slice(0,settings.max_chars).join('');
}
