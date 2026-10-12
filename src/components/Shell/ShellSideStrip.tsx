import { getCurrentWindow } from "@tauri-apps/api/window";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { ShellControls, ServiceBadge, SHELL_ACTIONS } from './ShellControls';

/**
 * A tall, narrow strip docked to a screen edge (ui_mode = "sidestrips").
 * Draggable ONLY horizontally (x changes, y fixed).
 */
export const ShellSideStrip: React.FC = () => {
  const drag = useShellDrag("x");
  const { snapshot, act, connectionError } = useServiceSnapshot();
  const side = getCurrentWindow().label === "strip-right" ? "right" : "left";

  return (
    <div
      className="relative flex flex-col items-center gap-2 w-full h-full rounded-lg border border-white/45 py-3 cursor-move overflow-auto"
      {...drag.handlers}
      style={{ userSelect: "none",backgroundColor:`rgba(23,23,23,${snapshot.shell.strip_opacity})`,textShadow:'0 1px 2px #000' }}
      data-side={side}
      data-mode={snapshot.shell.ui_mode}
      title={connectionError ?? undefined}
    >
      <Shimmer enabled={snapshot.shell.shimmer} speed={snapshot.shell.shimmer_speed} />
      <span className="text-[10px] text-white/60 [writing-mode:vertical-rl] rotate-180">
        PLUELY
      </span>
      <ShellControls snapshot={snapshot} act={act} actions={side==='left'?SHELL_ACTIONS.slice(0,4):SHELL_ACTIONS.slice(4)} />
      <ServiceBadge snapshot={snapshot} />
    </div>
  );
};
