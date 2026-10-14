import { t, useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useState } from 'react';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {invoke} from '@tauri-apps/api/core';
import { INITIAL_SERVICE_STATE, type ActionRequest, type ServiceSnapshot, type ShellAction } from '@/lib/overlay/contracts';
import { executeAction } from '@/lib/overlay/action-client';

interface SnapshotTransport {
  listen: (receive: (state: ServiceSnapshot) => void) => Promise<UnlistenFn>;
  requestSnapshot: () => Promise<void>;
}

/** Listener installation can finish after React StrictMode has disposed an effect. */
export function subscribeServiceSnapshots(
  transport: SnapshotTransport,
  receive: (state: ServiceSnapshot) => void,
  onError: (error: unknown) => void = console.error,
): UnlistenFn {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  let revision = -1;
  let session:string|undefined;
  const retiredSessions=new Set<string>();
  let retry:ReturnType<typeof setTimeout>|undefined;
  const connect=()=>{void transport.listen(state => {
    if(disposed||!Number.isSafeInteger(state.revision))return;
    const incoming=(state as ServiceSnapshot&{service_id?:string}).service_id;
    if(incoming&&incoming!==session){
      if(retiredSessions.has(incoming))return;
      if(session)retiredSessions.add(session);
      while(retiredSessions.size>16)retiredSessions.delete(retiredSessions.values().next().value!);
      session=incoming;revision=-1;
    }else if(session&&!incoming)return;
    if(state.revision<=revision)return;
    revision = state.revision;
    receive(state);
  }).then(stop => {
    if (disposed) { stop(); return; }
    unlisten = stop;
    // Never request before installing the listener: the service may answer immediately.
    return transport.requestSnapshot();
  }).catch(error => {
    if(disposed)return;
    onError(error);
    unlisten?.();unlisten=undefined;
    retry=setTimeout(()=>{retry=undefined;if(!disposed)connect();},3000);
  });};
  connect();
  return () => {
    disposed = true;
    if(retry)clearTimeout(retry);
    unlisten?.();
    unlisten = undefined;
  };
}

export async function sendShellAction(action: ShellAction, question?: string): Promise<string> {
  const request: ActionRequest = {
    action, id: crypto.randomUUID(), source: getCurrentWindow().label,
    ...(question === undefined ? {} : { question }),
  };
  await emitTo('main', 'shell-action', request);
  return request.id;
}

/** Visible windows observe the service; only the hidden main window executes actions. */
export function useServiceSnapshot() {
  useI18n();
  const [snapshot, setSnapshot] = useState<ServiceSnapshot>(INITIAL_SERVICE_STATE);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => subscribeServiceSnapshots({
    listen: receive => listen<ServiceSnapshot>('service-state', event => receive(event.payload)),
    requestSnapshot: async () => { await sendShellAction('snapshot'); },
  }, state => {
    setSnapshot(state);
    setConnectionError(null);
  }, () => setConnectionError(t("Не вдалося підключитися до служби."))), []);
  const act = useCallback(async (action: ShellAction, question?: string) => {
    try {
      // Recovery must work even if the service never installed its action listener.
      if(action==='settings'){await invoke('open_dashboard');setConnectionError(null);return true;}
      await executeAction({action,id:crypto.randomUUID(),source:getCurrentWindow().label,...(question===undefined?{}:{question})},{
        listen:receive=>listen('shell-action-result',event=>receive(event.payload as {id:string;ok:boolean;error?:string})),
        send:request=>emitTo('main','shell-action',request),
      });setConnectionError(null);return true;
    }catch(error){setConnectionError(error instanceof Error?error.message:t("Не вдалося надіслати дію."));return false;}
  }, []);
  return { snapshot, act, connectionError };
}
