import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import ServiceRuntime from './components/ServiceRuntime';

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
// Shell overlay windows render their dedicated shell components.
if (windowLabel === 'main') {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<ServiceRuntime />);
} else if (
  windowLabel.startsWith("strip-") ||
  windowLabel.startsWith("button-") ||
  windowLabel === "answer"
) {
  document.documentElement.dataset.overlayShell='true';
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
