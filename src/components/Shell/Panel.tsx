import { getCurrentWindow } from '@tauri-apps/api/window';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { useI18n } from '@/lib/i18n';
import { type CustomPanel,panelExtent } from '@/lib/overlay/layout';
import { ActionIcon,ACTION_LABELS,actionIsActive,actionIsDisabled } from './ShellControls';
import { useShellDrag } from './useShellDrag';
import { Shimmer } from './Shimmer';

/** A tight native panel is only a grid of the assigned enabled controls. */
export function ShellPanel(){
  const {snapshot,act,connectionError}=useServiceSnapshot();const {t}=useI18n();const drag=useShellDrag('free');
  const id=getCurrentWindow().label.replace(/^panel-/,'');
  const panel=(snapshot.shell as typeof snapshot.shell&{custom_panels?:CustomPanel[]}).custom_panels?.find(p=>p.id===id);
  if(!panel)return null;const enabled=panel.actions.filter(a=>a.enabled);if(!enabled.length)return null;
  const extent=panelExtent(panel);
  return <div role="toolbar" aria-label={t('Overlay controls')} title={connectionError??undefined}
    {...drag.handlers} data-panel-id={id}
    className="relative grid select-none overflow-hidden rounded-lg"
    style={{width:extent.width,height:extent.height,gridTemplateColumns:`repeat(${Math.min(panel.columns,enabled.length)},${panel.button_size}px)`,
      gap:panel.gap,padding:panel.padding,backgroundColor:`rgba(23,23,23,${panel.opacity})`,boxShadow:'inset 0 0 0 1px rgba(255,255,255,.4)'}}>
    <Shimmer enabled={snapshot.shell.shimmer} speed={snapshot.shell.shimmer_speed}/>
    {enabled.map(({action})=><button key={action} type="button" data-shell-drag
      title={t(ACTION_LABELS[action])} aria-label={t(ACTION_LABELS[action])} aria-pressed={actionIsActive(action,snapshot)} disabled={actionIsDisabled(action,snapshot)}
      onClick={()=>{if(!drag.consumeClick())void act(action);}}
      className={`flex items-center justify-center rounded-md border bg-transparent hover:border-white/80 disabled:opacity-40 ${actionIsActive(action,snapshot)?'border-sky-300 text-sky-200':'border-white/25 text-white'}`}
      style={{width:panel.button_size,height:panel.button_size,backgroundColor:`rgba(23,23,23,${snapshot.shell.button_opacities[action]??0})`}}><ActionIcon action={action}/></button>)}
  </div>;
}
export default ShellPanel;
