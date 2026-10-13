export const LAYOUT_ACTIONS=['listen','screenshot','continuous','answer','chat','tts','mode','settings'] as const;
export type LayoutAction=typeof LAYOUT_ACTIONS[number];
export interface PanelAction{action:LayoutAction;enabled:boolean}
export interface CustomPanel{id:string;monitor?:string|null;x:number;y:number;columns:number;gap:number;padding:number;button_size:number;opacity:number;actions:PanelAction[]}
export interface LayoutMonitor{key:string;x:number;y:number;width:number;height:number;scale:number}
function integer(value:number,min:number,max:number):boolean{return Number.isInteger(value)&&value>=min&&value<=max;}
function validatePanel(panel:CustomPanel):void{
  if(!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(panel.id))throw Error('Panel IDs must be 1–48 lowercase letters, digits or hyphens');
  if(!integer(panel.x,-2147483648,2147483647)||!integer(panel.y,-2147483648,2147483647))throw Error('Panel positions must be physical integer coordinates');
  if(!integer(panel.columns,1,8)||!integer(panel.button_size,24,96)||!integer(panel.gap,0,32)||!integer(panel.padding,0,24))throw Error('Panel columns, button size, gap or padding is outside its allowed range');
  if(!Number.isFinite(panel.opacity)||panel.opacity<0.05||panel.opacity>1)throw Error('Panel opacity must be between 0.05 and 1');
  if(panel.monitor!=null&&(!panel.monitor||new TextEncoder().encode(panel.monitor).length>512||/[\u0000-\u001f\u007f-\u009f]/.test(panel.monitor)))throw Error('Invalid panel monitor key');
  if(panel.actions.length>8||panel.actions.some(a=>!LAYOUT_ACTIONS.includes(a.action)||typeof a.enabled!=='boolean')||new Set(panel.actions.map(a=>a.action)).size!==panel.actions.length)throw Error('Panel contains an unknown or duplicate action');
}
export function validateLayout(panels:CustomPanel[]):void{
  if(!panels.length||panels.length>16)throw Error('A layout must contain 1–16 groups');
  panels.forEach(validatePanel);
  if(new Set(panels.map(p=>p.id)).size!==panels.length)throw Error('Duplicate panel ID');
  const actions=panels.flatMap(p=>p.actions.map(a=>a.action));
  if(actions.length!==8||new Set(actions).size!==8)throw Error('Every action must belong to exactly one group, including disabled actions');
}
export function panelExtent(panel:CustomPanel):{width:number;height:number}{
  validatePanel(panel);const count=panel.actions.filter(a=>a.enabled).length;if(!count)return{width:0,height:0};
  const columns=Math.min(panel.columns,count),rows=Math.ceil(count/columns);
  return{width:columns*panel.button_size+(columns-1)*panel.gap+2*panel.padding,height:rows*panel.button_size+(rows-1)*panel.gap+2*panel.padding};
}
export function newPanel(id:string,monitor:LayoutMonitor):CustomPanel{return{id,monitor:monitor.key,x:monitor.x,y:monitor.y,columns:1,gap:6,padding:4,button_size:40,opacity:0.28,actions:[]};}
export function physicalExtent(panel:CustomPanel,monitor:LayoutMonitor){const extent=panelExtent(panel);return{width:Math.round(extent.width*monitor.scale),height:Math.round(extent.height*monitor.scale)};}
export function panelMonitor(panel:CustomPanel,monitors:LayoutMonitor[]):LayoutMonitor{
  const named=monitors.find(m=>m.key===panel.monitor);if(named)return named;
  const containing=monitors.find(m=>panel.x>=m.x&&panel.x<m.x+m.width&&panel.y>=m.y&&panel.y<m.y+m.height);if(containing)return containing;
  if(!monitors.length)throw Error('No monitors available');
  return [...monitors].sort((a,b)=>Math.hypot(panel.x-a.x,panel.y-a.y)-Math.hypot(panel.x-b.x,panel.y-b.y))[0];
}
export function movePanel(panel:CustomPanel,x:number,y:number,monitor:LayoutMonitor):CustomPanel{
  const extent=physicalExtent(panel,monitor);
  return{...panel,monitor:monitor.key,x:Math.round(Math.max(monitor.x,Math.min(monitor.x+Math.max(0,monitor.width-extent.width),x))),y:Math.round(Math.max(monitor.y,Math.min(monitor.y+Math.max(0,monitor.height-extent.height),y)))};
}
export function createPreset(preset:'buttons'|'sides'|'topbottom',monitor:LayoutMonitor):CustomPanel[]{
  const action=(action:LayoutAction):PanelAction=>({action,enabled:true});const offset=Math.round(12*monitor.scale);
  if(preset==='buttons')return LAYOUT_ACTIONS.map((name,index)=>{
    const panel={...newPanel(name,monitor),actions:[action(name)]};return movePanel(panel,monitor.x+offset,monitor.y+offset+index*Math.round(52*monitor.scale),monitor);
  });
  return ['first','second'].map((id,index)=>{
    const panel={...newPanel(id,monitor),columns:preset==='topbottom'?4:1,actions:LAYOUT_ACTIONS.slice(index*4,index*4+4).map(action)};
    const extent=physicalExtent(panel,monitor);
    const x=preset==='sides'?(index?monitor.x+monitor.width-extent.width-offset:monitor.x+offset):monitor.x+(monitor.width-extent.width)/2;
    const y=preset==='topbottom'?(index?monitor.y+monitor.height-extent.height-offset:monitor.y+offset):monitor.y+(monitor.height-extent.height)/2;
    return movePanel(panel,x,y,monitor);
  });
}
export function moveAction(panels:CustomPanel[],action:LayoutAction,target:string):CustomPanel[]{
  if(!panels.some(p=>p.id===target))throw Error('Unknown destination group');
  const current=panels.find(p=>p.actions.some(a=>a.action===action));const item=current?.actions.find(a=>a.action===action);
  if(!item)throw Error('Unknown action');if(current!.id===target)return structuredClone(panels);
  return panels.map(panel=>({...panel,actions:panel.id===target?[...panel.actions,{...item}]:panel.actions.filter(a=>a.action!==action).map(a=>({...a}))}));
}
export function reorderAction(panels:CustomPanel[],id:string,index:number,delta:number):CustomPanel[]{
  const next=structuredClone(panels),panel=next.find(p=>p.id===id);if(!panel||!panel.actions[index])throw Error('Unknown action');
  const target=Math.max(0,Math.min(panel.actions.length-1,index+delta));const [item]=panel.actions.splice(index,1);panel.actions.splice(target,0,item);return next;
}
