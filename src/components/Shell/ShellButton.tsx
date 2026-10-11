import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
  Mic,
  Camera,
  Video,
  MessageSquare,
  Volume2,
  LayoutGrid,
  Settings,
  Square,
} from "lucide-react";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";

export type ShellAction =
  | "listen"
  | "screenshot"
  | "continuous"
  | "answer"
  | "chat"
  | "tts"
  | "mode"
  | "settings";

const ACTION_ICONS: Record<ShellAction, React.ReactNode> = {
  listen: <Mic className="h-5 w-5" />,
  screenshot: <Camera className="h-5 w-5" />,
  continuous: <Video className="h-5 w-5" />,
  answer: <MessageSquare className="h-5 w-5" />,
  chat: <Square className="h-5 w-5" />,
  tts: <Volume2 className="h-5 w-5" />,
  mode: <LayoutGrid className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
};

/**
 * One tiny, freely-draggable window per action (ui_mode = "buttons").
 * Clicking dispatches the same action the main window would.
 */
export const ShellButton: React.FC = () => {
  const [active, setActive] = useState(false);
  const [shimmer, setShimmer] = useState(true);
  const drag = useShellDrag("free");

  // Determine action from the route (/shell/button/:action).
  const action = (
    window.location.pathname.split("/").filter(Boolean).pop() ?? "listen"
  ) as ShellAction;

  useEffect(() => {
    invoke<{ shimmer: boolean }>("get_shell_settings")
      .then((s) => setShimmer(s?.shimmer ?? true))
      .catch(() => {});
  }, []);

  const handleClick = async () => {
    setActive((v) => !v);
    try {
      await emit("shell-action", { action });
    } catch {
      // Event bus unavailable; fall back to direct invoke.
    }
    switch (action) {
      case "screenshot":
        await invoke("start_screen_capture").catch(() => {});
        break;
      case "settings":
        await invoke("open_dashboard").catch(() => {});
        break;
      case "answer":
        await invoke("toggle_answer_window").catch(() => {});
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="relative flex items-center justify-center w-full h-full cursor-move"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onClick={handleClick}
      data-active={active}
      style={{ userSelect: "none" }}
    >
      <Shimmer enabled={shimmer} speed={3} />
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-neutral-800/90 text-white"
        style={{ pointerEvents: "none" }}
      >
        {ACTION_ICONS[action]}
      </div>
    </div>
  );
};
