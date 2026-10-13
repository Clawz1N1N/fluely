import {t,useI18n} from '@/lib/i18n';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { useShellDrag } from './useShellDrag';
import { Shimmer } from './Shimmer';
import { ACTION_LABELS, ActionIcon, actionIsActive, actionIsDisabled, SHELL_ACTIONS, serviceStatus, requestCounts, type ButtonAction } from './ShellControls';
export type { ShellAction } from '@/lib/overlay/contracts';

export const ShellButton: React.FC = () => {
  useI18n();
  const { snapshot, act, connectionError } = useServiceSnapshot();
  const drag = useShellDrag('free');
  const routeAction = window.location.pathname.split('/').filter(Boolean).pop();
  const action: ButtonAction = SHELL_ACTIONS.find(candidate => candidate === routeAction) ?? 'listen';
  return <div
    className="relative flex h-full w-full cursor-move items-center justify-center"
    {...drag.handlers} style={{ userSelect: 'none' }} data-mode={snapshot.shell.ui_mode}
  >
    <Shimmer enabled={snapshot.shell.shimmer} speed={snapshot.shell.shimmer_speed} />
    <button
      type="button" aria-label={t(ACTION_LABELS[action])} title={connectionError ?? `${t(ACTION_LABELS[action])} · ${serviceStatus(snapshot)} · ${requestCounts(snapshot)}`}
      aria-pressed={actionIsActive(action, snapshot)} disabled={actionIsDisabled(action,snapshot)}
      data-shell-drag
      onClick={() => { if (!drag.consumeClick()) void act(action); }}
      style={{backgroundColor:`rgba(${actionIsActive(action,snapshot)?'29,78,216':'23,23,23'},${snapshot.shell.button_opacities[action]??0.28})`}}
      className="relative flex h-full w-full items-center justify-center rounded-lg border border-white/45 text-white disabled:opacity-40"
    ><ActionIcon action={action} />{snapshot.neutral && <span role="status" className="absolute bottom-0 right-0 rounded bg-amber-600 px-0.5 text-[8px]">{snapshot.nextAllowedAt?Math.max(0,Math.ceil((snapshot.nextAllowedAt-Date.now())/1000)):'Ⅱ'}</span>}</button>
  </div>;
};
