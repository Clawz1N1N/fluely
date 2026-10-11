import { getCurrentWindow } from "@tauri-apps/api/window";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";

/**
 * A tall, narrow strip docked to a screen edge (ui_mode = "side").
 * Draggable ONLY horizontally (x changes, y fixed).
 */
export const ShellSideStrip: React.FC = () => {
  const drag = useShellDrag("x");
  const side = getCurrentWindow().label === "strip-right" ? "right" : "left";

  return (
    <div
      className="flex flex-col items-center gap-3 w-full h-full py-3 cursor-move"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      style={{ userSelect: "none" }}
      data-side={side}
    >
      <Shimmer enabled={true} speed={3} />
      <span className="text-[10px] text-white/60 [writing-mode:vertical-rl] rotate-180">
        PLUELY
      </span>
      {/* action badges render here in a later phase */}
    </div>
  );
};
