import { useCallback, useEffect, useState } from 'react';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
  void transport.listen(state => {
    if (disposed || !Number.isSafeInteger(state.revision) || state.revision <= revision) return;
    revision = state.revision;
    receive(state);
  }).then(stop => {
    if (disposed) { stop(); return; }
    unlisten = stop;
    // Never request before installing the listener: the service may answer immediately.
    return transport.requestSnapshot();
  }).catch(error => { if (!disposed) onError(error); });
  return () => {
    disposed = true;
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
  const [snapshot, setSnapshot] = useState<ServiceSnapshot>(INITIAL_SERVICE_STATE);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => subscribeServiceSnapshots({
    listen: receive => listen<ServiceSnapshot>('service-state', event => receive(event.payload)),
    requestSnapshot: async () => { await sendShellAction('snapshot'); },
  }, state => {
    setSnapshot(current => state.revision >= current.revision ? state : current);
    setConnectionError(null);
  }, () => setConnectionError('Не вдалося підключитися до служби.')), []);
  const act = useCallback(async (action: ShellAction, question?: string) => {
    try {
      await executeAction({action,id:crypto.randomUUID(),source:getCurrentWindow().label,...(question===undefined?{}:{question})},{
        listen:receive=>listen('shell-action-result',event=>receive(event.payload as {id:string;ok:boolean;error?:string})),
        send:request=>emitTo('main','shell-action',request),
      });setConnectionError(null);return true;
    }catch(error){setConnectionError(error instanceof Error?error.message:'Не вдалося надіслати дію.');return false;}
  }, []);
  return { snapshot, act, connectionError };
}
