import { getCurrentWindow } from "@tauri-apps/api/window";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { ShellControls, ServiceBadge, SHELL_ACTIONS } from './ShellControls';

/**
 * A wide, short strip docked to the top or bottom edge
 * (ui_mode = "topbottomstrips"). Draggable ONLY vertically (y changes, x fixed).
 */
export const ShellTopStrip: React.FC = () => {
  const drag = useShellDrag("y");
  const { snapshot, act, connectionError } = useServiceSnapshot();
  const label = getCurrentWindow().label;
  const side = label === "strip-bottom" ? "bottom" : "top";

  return (
    <div
      className="relative flex flex-row items-center gap-2 w-full h-full rounded-lg bg-neutral-900/90 px-3 cursor-move overflow-auto"
      {...drag.handlers}
      style={{ userSelect: "none" }}
      data-side={side}
      data-mode={snapshot.shell.ui_mode}
      title={connectionError ?? undefined}
    >
      <Shimmer enabled={snapshot.shell.shimmer} speed={snapshot.shell.shimmer_speed} />
      <span className="text-[10px] text-white/60">PLUELY</span>
      <ShellControls snapshot={snapshot} act={act} actions={side==='top'?SHELL_ACTIONS.slice(0,4):SHELL_ACTIONS.slice(4)} />
      <ServiceBadge snapshot={snapshot} />
    </div>
  );
};
