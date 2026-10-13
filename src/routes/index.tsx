import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import {
  Dashboard,
  App,
  SystemPrompts,
  ViewChat,
  Settings,
  DevSpace,
  Shortcuts,
  Audio,
  Screenshot,
  Chats,
  Responses,
} from "@/pages";
import { DashboardLayout } from "@/layouts";
import {StatusWindow} from '@/components/Shell/StatusWindow';
import {ShellPanel} from '@/components/Shell/Panel';
import {
  ShellSideStrip,
  ShellTopStrip,
  ShellButton,
  AnswerWindow,
} from "@/components/Shell";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/system-prompts" element={<SystemPrompts />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/screenshot" element={<Screenshot />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/responses" element={<Responses />} />
          <Route path="/dev-space" element={<DevSpace />} />
        </Route>
        {/* Shell overlay windows (routed by window label in main.tsx) */}
        <Route path="/shell/side-strip" element={<ShellSideStrip />} />
        <Route path="/shell/top-strip" element={<ShellTopStrip />} />
        <Route path="/shell/button/:action" element={<ShellButton />} />
        <Route path="/shell/answer" element={<AnswerWindow />} />
        <Route path="/shell/status" element={<StatusWindow />} />
        <Route path="/shell/panel/:id" element={<ShellPanel />} />
      </Routes>
    </Router>
  );
}
