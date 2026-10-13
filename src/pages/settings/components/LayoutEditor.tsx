import { useEffect,useRef,useState,type PointerEvent,type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
import { ActionIcon,ACTION_LABELS } from '@/components/Shell/ShellControls';
import { type CustomPanel,type LayoutMonitor,type LayoutAction,createPreset,newPanel,physicalExtent,panelMonitor,movePanel,moveAction,reorderAction,validateLayout } from '@/lib/overlay/layout';

interface Settings{ui_mode:string;custom_panels?:CustomPanel[]}
const control='w-full rounded-md border border-input bg-background px-2 py-1 text-sm';
const button='rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-40';
const primary=`${button} bg-primary text-primary-foreground hover:bg-primary/90`;
function nextId(panels:CustomPanel[]):string{let index=1;while(panels.some(p=>p.id===`group-${index}`))index++;return`group-${index}`;}
function Field({label,children}:{label:string;children:ReactNode}){return<label className="grid gap-1 text-sm"><span>{label}</span>{children}</label>;}

/** Draft changes stay local until Apply; native Rust validates and persists the layout. */
export function LayoutEditor(){
  const {t}=useI18n();const [monitors,setMonitors]=useState<LayoutMonitor[]>([]);const [panels,setPanels]=useState<CustomPanel[]>([]);
  const [selected,setSelected]=useState('');const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [feedback,setFeedback]=useState('');
  const preview=useRef<HTMLDivElement>(null);const [previewWidth,setPreviewWidth]=useState(640);
  const loadRevision=useRef(0);
  const drag=useRef<{id:string;pointer:number;clientX:number;clientY:number;x:number;y:number;scale:number}|null>(null);
  const load=async()=>{
    const revision=++loadRevision.current;
    setBusy(true);setError('');setFeedback('');
    try{
      const [screens,settings]=await Promise.all([invoke<LayoutMonitor[]>('get_layout_monitors'),invoke<Settings>('get_shell_settings')]);
      if(revision!==loadRevision.current)return;
      if(!screens.length)throw Error('No monitors available');
      // Keep presets available even if a saved custom layout needs repair.
      setMonitors(screens);
      let next=settings.custom_panels?.length?settings.custom_panels:createPreset(settings.ui_mode==='sidestrips'?'sides':settings.ui_mode==='topbottomstrips'?'topbottom':'buttons',screens[0]);
      validateLayout(next);next=structuredClone(next);setPanels(next);setSelected(next[0].id);
    }catch(failure){if(revision===loadRevision.current)setError(failure instanceof Error?failure.message:String(failure));}finally{if(revision===loadRevision.current)setBusy(false);}
  };
  useEffect(()=>{void load();return()=>{loadRevision.current++;};},[]);
  useEffect(()=>{
    const node=preview.current;if(!node)return;
    const observer=new ResizeObserver(()=>setPreviewWidth(node.clientWidth));observer.observe(node);setPreviewWidth(node.clientWidth);
    return()=>observer.disconnect();
  },[]);
  const update=(id:string,value:Partial<CustomPanel>)=>{setPanels(current=>current.map(panel=>panel.id===id?{...panel,...value}:panel));setFeedback('');};
  const choosePreset=(preset:'buttons'|'sides'|'topbottom')=>{
    if(!monitors.length)return;const monitor=panels.find(p=>p.id===selected);const screen=monitor?panelMonitor(monitor,monitors):monitors[0];
    const next=createPreset(preset,screen);setPanels(next);setSelected(next[0].id);setFeedback('');
  };
  const add=()=>{
    if(panels.length>=16||!monitors.length)return;const item=newPanel(nextId(panels),monitors[0]);setPanels([...panels,item]);setSelected(item.id);setFeedback('');
  };
  const remove=()=>{
    if(panels.length<2)return;const source=panels.find(p=>p.id===selected);if(!source)return;
    const rest=panels.filter(p=>p.id!==selected).map(p=>structuredClone(p));rest[0].actions.push(...source.actions.map(a=>({...a})));setPanels(rest);setSelected(rest[0].id);setFeedback('');
  };
  const assign=(action:LayoutAction,id:string)=>{setPanels(current=>moveAction(current,action,id));setFeedback('');};
  const detach=(action:LayoutAction)=>{
    if(panels.length>=16)return;const source=panels.find(p=>p.actions.some(a=>a.action===action));if(!source)return;
    const screen=panelMonitor(source,monitors);const item=newPanel(nextId(panels),screen);const next=moveAction([...panels,item],action,item.id);
    const positioned=movePanel(next[next.length-1],source.x+Math.round(24*screen.scale),source.y+Math.round(24*screen.scale),screen);
    next[next.length-1]=positioned;setPanels(next);setSelected(item.id);setFeedback('');
  };
  const apply=async()=>{
    setBusy(true);setError('');setFeedback('');
    try{validateLayout(panels);const positioned=panels.map(item=>movePanel(item,item.x,item.y,panelMonitor(item,monitors)));await invoke('set_custom_layout',{panels:positioned});setPanels(positioned);const saved=await invoke<Settings>('get_shell_settings');if(saved.custom_panels?.length){validateLayout(saved.custom_panels);setPanels(saved.custom_panels);}setFeedback('Layout applied. Drag the controls on the desktop or edit them here.');}
    catch(failure){setError(failure instanceof Error?failure.message:String(failure));}finally{setBusy(false);}
  };
  const panel=panels.find(p=>p.id===selected);
  const oversized=monitors.length?panels.some(item=>{const screen=panelMonitor(item,monitors),extent=physicalExtent(item,screen);return extent.width>screen.width||extent.height>screen.height;}):false;
  const minX=Math.min(0,...monitors.map(m=>m.x)),minY=Math.min(0,...monitors.map(m=>m.y));
  const desktopWidth=Math.max(1,...monitors.map(m=>m.x+m.width-minX)),desktopHeight=Math.max(1,...monitors.map(m=>m.y+m.height-minY));
  const previewScale=Math.min(Math.max(1,previewWidth-8)/desktopWidth,340/desktopHeight);
  const startDrag=(event:PointerEvent<HTMLDivElement>,item:CustomPanel)=>{
    if(busy||event.button!==0)return;event.preventDefault();setSelected(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:item.id,pointer:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:item.x,y:item.y,scale:previewScale};
  };
  const moveDrag=(event:PointerEvent<HTMLDivElement>)=>{
    const point=drag.current;if(!point||point.pointer!==event.pointerId)return;
    setPanels(current=>current.map(item=>{
      if(item.id!==point.id)return item;const x=point.x+(event.clientX-point.clientX)/point.scale,y=point.y+(event.clientY-point.clientY)/point.scale;
      const screen=panelMonitor({...item,monitor:null,x,y},monitors);return movePanel(item,x,y,screen);
    }));setFeedback('');
  };
  const endDrag=(event:PointerEvent<HTMLDivElement>)=>{if(drag.current?.pointer!==event.pointerId)return;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;};
  return<section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">{t('Overlay layout')}</h2>
    <p className="text-sm text-muted-foreground">{t('Choose a compact preset or arrange free groups. Disabled controls stay assigned and can be restored here.')}</p>
    {error&&<div role="alert" className="rounded bg-destructive/15 p-3 text-sm text-destructive"><p>{t(error)}</p><button type="button" disabled={busy} className={button} onClick={()=>void load()}>{t('Reload saved layout')}</button></div>}
    {feedback&&<p role="status" className="text-sm">{t(feedback)}</p>}
    <fieldset disabled={busy||!monitors.length} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={()=>choosePreset('buttons')}>{t('Compact buttons')}</button>
        <button type="button" className={button} onClick={()=>choosePreset('sides')}>{t('Side groups')}</button>
        <button type="button" className={button} onClick={()=>choosePreset('topbottom')}>{t('Top/bottom groups')}</button>
        <button type="button" className={button} onClick={add} disabled={panels.length>=16}>{t('Add group')}</button>
        <button type="button" className={button} onClick={()=>void load()}>{t('Reload saved layout')}</button>
      </div>
      <div ref={preview} className="w-full overflow-auto rounded-md border p-1" aria-label={t('Layout preview')}>
        <div className="relative" style={{width:desktopWidth*previewScale,height:desktopHeight*previewScale,minHeight:monitors.length?undefined:100}}>
          {monitors.map(screen=><div key={screen.key} className="pointer-events-none absolute overflow-hidden border border-dashed border-muted-foreground/50 bg-muted/20" style={{left:(screen.x-minX)*previewScale,top:(screen.y-minY)*previewScale,width:screen.width*previewScale,height:screen.height*previewScale}}><span className="px-1 text-[10px] text-muted-foreground">{screen.key} · {Math.round(screen.scale*100)}%</span></div>)}
          {panels.map(item=>{
            const screen=panelMonitor(item,monitors),extent=physicalExtent(item,screen);const enabled=item.actions.filter(a=>a.enabled);
            return<div key={item.id} role="button" tabIndex={busy?-1:0} aria-label={`${t('Move group')} ${item.id}`}
              onPointerDown={event=>startDrag(event,item)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(item.id);}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;const x=item.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y=item.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);update(item.id,movePanel(item,x,y,screen));}}}
              className={`absolute cursor-move overflow-hidden rounded border ${selected===item.id?'border-primary ring-1 ring-primary':'border-muted-foreground'}`}
              style={{left:(item.x-minX)*previewScale,top:(item.y-minY)*previewScale,width:Math.max(32,extent.width*previewScale),height:Math.max(22,extent.height*previewScale),touchAction:'none',backgroundColor:`rgba(23,23,23,${item.opacity})`}}>
              <div className="grid h-full w-full place-items-center text-white" style={{gridTemplateColumns:`repeat(${Math.max(1,Math.min(item.columns,enabled.length))},1fr)`,gap:item.gap*screen.scale*previewScale,padding:item.padding*screen.scale*previewScale}}>
                {enabled.map(a=><span key={a.action} title={t(ACTION_LABELS[a.action])} className="flex h-full w-full items-center justify-center"><span style={{transform:`scale(${Math.min(1,item.button_size*screen.scale*previewScale/24)})`}}><ActionIcon action={a.action}/></span></span>)}
                {!enabled.length&&<span className="text-[9px]">{t('Hidden group')}</span>}
              </div>
            </div>;
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('Drag groups in the preview. Arrow keys move a focused group; Shift moves by 10 pixels. Coordinates use physical desktop pixels.')}</p>
      <div className="flex flex-wrap gap-2">{panels.map(item=><button key={item.id} type="button" className={selected===item.id?primary:button} onClick={()=>setSelected(item.id)}>{item.id}</button>)}</div>
      {panel&&<div className="space-y-4 rounded-md border p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('Monitor')}><select className={control} value={panelMonitor(panel,monitors).key} onChange={event=>{const screen=monitors.find(m=>m.key===event.target.value)!;const old=panelMonitor(panel,monitors);update(panel.id,movePanel(panel,screen.x+panel.x-old.x,screen.y+panel.y-old.y,screen));}}>{monitors.map(screen=><option key={screen.key} value={screen.key}>{screen.key}</option>)}</select></Field>
          {(['x','y'] as const).map(axis=><Field key={axis} label={`${axis.toUpperCase()} · ${t('physical pixels')}`}><input className={control} type="number" step={1} value={panel[axis]} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isInteger(value)&&value>=-2147483648&&value<=2147483647)update(panel.id,{[axis]:value});}}/></Field>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {([['columns','Columns',1,8],['button_size','Button size',24,96],['gap','Gap',0,32],['padding','Padding',0,24]] as const).map(([key,label,min,max])=><Field key={key} label={`${t(label)}: ${panel[key]}`}><input type="range" min={min} max={max} step={1} value={panel[key]} onChange={event=>update(panel.id,{[key]:Number(event.target.value)})}/></Field>)}
          <Field label={`${t('Transparency')}: ${Math.round((1-panel.opacity)*100)}%`}><input type="range" min={0} max={95} step={1} value={Math.round((1-panel.opacity)*100)} onChange={event=>update(panel.id,{opacity:1-Number(event.target.value)/100})}/></Field>
        </div>
        <div className="space-y-2">{panel.actions.map((item,index)=><div key={item.action} className="flex flex-wrap items-center gap-2 rounded bg-muted/30 p-2">
          <label className="flex min-w-40 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={event=>update(panel.id,{actions:panel.actions.map(a=>a.action===item.action?{...a,enabled:event.target.checked}:a)})}/><ActionIcon action={item.action}/>{t(ACTION_LABELS[item.action])}</label>
          <button type="button" className={button} aria-label={`${t('Move up')} ${t(ACTION_LABELS[item.action])}`} disabled={index===0} onClick={()=>{setPanels(current=>reorderAction(current,panel.id,index,-1));setFeedback('');}}>↑</button>
          <button type="button" className={button} aria-label={`${t('Move down')} ${t(ACTION_LABELS[item.action])}`} disabled={index===panel.actions.length-1} onClick={()=>{setPanels(current=>reorderAction(current,panel.id,index,1));setFeedback('');}}>↓</button>
          <select className={`${control} !w-auto`} aria-label={`${t('Assign group')} ${t(ACTION_LABELS[item.action])}`} value={panel.id} onChange={event=>assign(item.action,event.target.value)}>{panels.map(group=><option key={group.id} value={group.id}>{group.id}</option>)}</select>
          <button type="button" className={button} disabled={panels.length>=16} onClick={()=>detach(item.action)}>{t('Detach')}</button>
        </div>)}{!panel.actions.length&&<p className="text-sm text-muted-foreground">{t('Move a control here using its group selector in another group.')}</p>}</div>
        <button type="button" className={button} disabled={panels.length<2} onClick={remove}>{t('Remove group and keep its controls')}</button>
      </div>}
      {oversized&&<p role="alert" className="text-sm text-destructive">{t('A group is larger than its monitor workarea. Reduce its columns, button size, gap or padding.')}</p>}
      <button type="button" disabled={oversized} className={primary} onClick={()=>void apply()}>{t(busy?'Applying…':'Apply custom layout')}</button>
    </fieldset>
  </section>;
}
export default LayoutEditor;
