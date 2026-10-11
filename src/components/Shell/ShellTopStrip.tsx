import { getCurrentWindow } from "@tauri-apps/api/window";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";

/**
 * A wide, short strip docked to the top or bottom edge
 * (ui_mode = "top"). Draggable ONLY vertically (y changes, x fixed).
 */
export const ShellTopStrip: React.FC = () => {
  const drag = useShellDrag("y");
  const label = getCurrentWindow().label;
  const side = label === "strip-bottom" ? "bottom" : "top";

  return (
    <div
      className="flex flex-row items-center gap-3 w-full h-full px-3 cursor-move"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      style={{ userSelect: "none" }}
      data-side={side}
    >
      <Shimmer enabled={true} speed={3} />
      <span className="text-[10px] text-white/60">PLUELY</span>
      {/* action badges render here in a later phase */}
    </div>
  );
};
