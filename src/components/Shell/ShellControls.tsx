import { Camera, LayoutGrid, MessageSquare, Mic, Settings, Square, Video, Volume2 } from 'lucide-react';
import type { ServiceSnapshot, ShellAction } from '@/lib/overlay/contracts';

export const SHELL_ACTIONS = ['listen', 'screenshot', 'continuous', 'answer', 'chat', 'tts', 'mode', 'settings'] as const;
export type ButtonAction = typeof SHELL_ACTIONS[number];
export const ACTION_LABELS: Record<ButtonAction, string> = {
  listen: 'Слухати', screenshot: 'Знімок екрана', continuous: 'Безперервні знімки',
  answer: 'Відповідь', chat: 'Чат', tts: 'Озвучення', mode: 'Режим панелей', settings: 'Налаштування',
};
const ICONS = { listen: Mic, screenshot: Camera, continuous: Video, answer: MessageSquare, chat: Square, tts: Volume2, mode: LayoutGrid, settings: Settings };

export function actionIsActive(action: ButtonAction, state: ServiceSnapshot) {
  switch (action) {
    case 'listen': return state.listening;
    case 'continuous': return state.continuous;
    case 'answer': case 'chat': return state.answerVisible;
    case 'tts': return state.tts.enabled;
    default: return false;
  }
}

export function ActionIcon({ action }: { action: ButtonAction }) {
  const Icon = ICONS[action];
  return <Icon className="h-5 w-5" />;
}

export function serviceStatus(state:ServiceSnapshot):string {
  if(state.error)return state.error;
  const seconds=state.nextAllowedAt?Math.max(0,Math.ceil((state.nextAllowedAt-Date.now())/1000)):0;
  if(state.neutral)return seconds?`Нейтральний режим · ${seconds} с`:'Запити призупинено';
  return state.currentModel??(state.listening?'Слухаємо':'Готово');
}
export function requestCounts(state:ServiceSnapshot):string {
  return (['per_second','per_minute','per_hour','per_day'] as const)
    .map((period,index)=>`${['с','хв','год','доба'][index]} ${state.requestCounts[period]}/${state.requestLimits[period]||'∞'}`).join(' · ');
}
export function ServiceBadge({snapshot}:{snapshot:ServiceSnapshot}) {
  return <span role="status" title={`${serviceStatus(snapshot)} · ${requestCounts(snapshot)}`} className="max-w-full overflow-hidden text-ellipsis text-[9px] text-white/80">{serviceStatus(snapshot)}</span>;
}

export function ShellControls({ snapshot, act, actions=SHELL_ACTIONS }: {
  snapshot: ServiceSnapshot;
  act: (action: ShellAction, question?: string) => Promise<unknown>;
  actions?:readonly ButtonAction[];
}) {
  return <>{actions.map(action => <button
    key={action} type="button" title={ACTION_LABELS[action]} aria-label={ACTION_LABELS[action]}
    aria-pressed={actionIsActive(action, snapshot)} disabled={!snapshot.ready}
    onClick={() => void act(action)}
    style={{backgroundColor:`rgba(${actionIsActive(action,snapshot)?'29,78,216':'23,23,23'},${snapshot.shell.button_opacities[action]??0.28})`}}
    className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white hover:border-white/70 disabled:opacity-40"
  ><ActionIcon action={action} /></button>)}</>;
}
