import { t, useI18n } from "@/lib/i18n";
import { Sidebar } from "@/components";
import { Outlet,useNavigate } from "react-router-dom";
import {useEffect} from 'react';
import {listen} from '@tauri-apps/api/event';
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";

export const DashboardLayout = () => {
  useI18n();
  const navigate=useNavigate();
  useEffect(()=>{
    let disposed=false,off:(()=>void)|undefined;
    void listen<string>('dashboard-navigate',event=>{if(event.payload==='/settings'||event.payload==='/dashboard')navigate(event.payload);}).then(stop=>{if(disposed)stop();else off=stop;}).catch(console.error);
    return()=>{disposed=true;off?.();};
  },[navigate]);
  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout />;
      }}
      resetKeys={["dashboard-error"]}
      onReset={() => {
        console.log(t("Reset"));
      }}
    >
      <div className="fluely-dashboard-canvas relative flex h-screen w-screen overflow-hidden">
        {/* Draggable region */}
        <div
          className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
          data-tauri-drag-region={true}
        />

        {/* Sidebar */}
        <Sidebar />
        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden px-8">
          <Outlet />
        </main>
      </div>
    </ErrorBoundary>
  );
};
