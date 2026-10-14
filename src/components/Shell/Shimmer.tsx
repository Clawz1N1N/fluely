import React, { useEffect, useState } from "react";
import { listen } from '@tauri-apps/api/event';

/**
 * Animated rainbow/gradient "shimmer" so buttons are hard to lose.
 * Toggle and speed are controlled by the `set_shimmer` Rust command
 * (persisted in shell_layout.json). The shimmer is drawn with a
 * CSS animation; it lives only inside the tight button window so it
 * never creates a large transparent hit area.
 */
export const Shimmer: React.FC<{ enabled: boolean; speed: number }> = ({
  enabled,
  speed,
}) => {
  const [on, setOn] = useState(enabled);
  const [flash,setFlash]=useState(false);

  useEffect(() => setOn(enabled), [enabled]);
  useEffect(()=>{
    let disposed=false,off:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    void listen('shell-flash',()=>{setFlash(true);clearTimeout(timer);timer=setTimeout(()=>setFlash(false),2500);}).then(stop=>{if(disposed)stop();else off=stop;});
    return()=>{disposed=true;off?.();clearTimeout(timer);};
  },[]);

  if (!on&&!flash) return null;

  const duration = flash?0.4:Math.max(1,speed);
  return (
    <div
      aria-hidden
      className="shimmer-ring"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 8,
        pointerEvents: "none",
        background:
          "linear-gradient(90deg, rgba(255,80,170,0.95), rgba(60,220,255,0.95), rgba(255,220,80,0.95), rgba(255,80,170,0.95))",
        backgroundSize: "300% 100%",
        animation: `shimmer-slide ${duration}s linear infinite`,
        padding: 2,
        mask:'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite:'exclude',
        zIndex: 2,
        opacity: flash?1:0.85,
      }}
    />
  );
};

// Inject keyframes once.
if (typeof document !== "undefined" && !document.getElementById("shimmer-keyframes")) {
  const style = document.createElement("style");
  style.id = "shimmer-keyframes";
  style.textContent = `@keyframes shimmer-slide { 0% { background-position: 0% 0; } 100% { background-position: 300% 0; } }`;
  document.head.appendChild(style);
}
