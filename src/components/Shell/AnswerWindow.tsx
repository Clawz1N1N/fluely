import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { Markdown } from "@/components";
import { useTts } from "@/hooks/useTts";
import { useShellDrag } from "./useShellDrag";
import { Shimmer } from "./Shimmer";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  side?: string;
}

/**
 * Central answer window (label "answer").
 * Header + two panes (MAIN / SIDE) + chat input.
 * Movable freely by the header. Reuses the Markdown/KaTeX
 * renderer for both panes.
 */
export const AnswerWindow: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mainText, setMainText] = useState("");
  const [sideText, setSideText] = useState("");
  const drag = useShellDrag("free");

  const sendQuestion = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    // The typed question joins the single-request pipeline
    // (Phase 3); for now emit it so the main app can pick it up.
    try {
      await invoke("answer_ask", { question: text }).catch(() => {});
    } catch {
      // Not yet wired in Phase 2.
    }
    // Placeholder: when the model streams a structured
    // response, parse it and route MAIN/SIDE/SPEAK.
    // (Phase 5 wiring; the real stream arrives via the
    // continuous-batch / answer pipeline.)
  };

  return (
    <div className="flex flex-col w-full h-full bg-neutral-900/95 text-white rounded-lg overflow-hidden">
      <Shimmer enabled={false} speed={3} />
      {/* Header (drag region) */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-neutral-800 cursor-move"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
      >
        <span className="text-xs font-medium">Pluely</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50" id="rate-limit-status" />
          <button
            className="p-1 hover:bg-neutral-700 rounded"
            onClick={() => {
              getCurrentWindow().close().catch(() => {});
            }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two panes */}
      <div className="flex flex-1 min-h-0 gap-2 p-2">
        <div className="flex-1 min-w-0 overflow-auto rounded bg-neutral-800/60 p-2">
          <div className="text-[10px] uppercase text-white/40 mb-1">Main</div>
          <Markdown>{mainText || "…"}</Markdown>
        </div>
        <div className="flex-1 min-w-0 overflow-auto rounded bg-neutral-800/60 p-2">
          <div className="text-[10px] uppercase text-white/40 mb-1">Side</div>
          <Markdown>{sideText || "…"}</Markdown>
        </div>
      </div>

      {/* Chat input */}
      <div className="p-2 border-t border-neutral-700">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendQuestion();
            }}
            placeholder="Ask…"
            className="flex-1 bg-neutral-800 rounded px-2 py-1 text-sm outline-none"
          />
          <button
            onClick={sendQuestion}
            className="px-3 py-1 bg-blue-600 rounded text-sm"
          >
            Send
          </button>
        </div>
      </div>

      {/* Message history (hidden, kept for state) */}
      <div className="hidden">{messages.length}</div>
    </div>
  );
};
