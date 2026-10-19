export type VisionMethod = 'semantic' | 'pixel-text';
export interface VisionSettings { method?:VisionMethod;vision_provider_id?:string|null;pixel_width?:number;pixel_colors?:boolean;mode:'ocr'|'ocr+ui'|'vlm'|'full';max_chars:number;ui_max_depth:number;ui_max_chars:number }
interface ContextPorts { native(frame:string):Promise<string>;describe(frame:string):Promise<string> }
export class ScreenSceneMemory {
  private observations=new Map<string,{context:string;observed:number}>();
  clear():void{this.observations.clear();}
  remember(monitor:string,context:string,now=Date.now()):void {
    this.observations.delete(monitor);
    this.observations.set(monitor,{context:Array.from(context).slice(0,4096).join(''),observed:now});
    while(this.observations.size>8)this.observations.delete(this.observations.keys().next().value!);
  }
  context(maxChars:number,now=Date.now()):string {
    for(const [monitor,observation] of this.observations){if(now-observation.observed>120_000)this.observations.delete(monitor);}
    const notes=Array.from(this.observations).reverse().map(([monitor,observation])=>`[Monitor ${monitor}; last observed ${Math.max(0,Math.floor((now-observation.observed)/1000))} seconds ago]\n${observation.context}`).join('\n\n');
    return Array.from(notes).slice(0,Math.max(0,Math.min(32_000,maxChars))).join('');
  }
}
/** Changed frames arrive from the native deduplicator. Full mode overlaps both sources. */
export async function resolveScreenContext(frames:string[],settings:{mode:VisionSettings['mode']|'pixel-text';max_chars:number},ports:ContextPorts):Promise<string> {
  const contexts=await Promise.all(frames.map(async frame=>{
    if(settings.mode==='pixel-text'){
      const representation=await ports.native(frame);
      if(!representation.trim())throw new Error('Pixel representation is empty');
      return {primary:representation,supplemental:''};
    }
    if(settings.mode==='vlm'){
      const description=await ports.describe(frame);if(!description.trim())throw new Error('Visual description is empty');
      return {primary:`[VLM]\n${description}`,supplemental:''};
    }
    if(settings.mode==='full'){
      const [native,description]=await Promise.all([ports.native(frame).catch(()=>''),ports.describe(frame)]);
      if(!description.trim())throw new Error('Visual description is empty');
      return {primary:`[VLM]\n${description}`,supplemental:native?`[SUPPLEMENTAL OCR/UI]\n${native}`:''};
    }
    return {primary:await ports.native(frame),supplemental:''};
  }));
  return Array.from([...contexts.map(context=>context.primary),...contexts.map(context=>context.supplemental).filter(Boolean)].join('\n\n')).slice(0,settings.max_chars).join('');
}
