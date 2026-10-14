import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeServiceSnapshots } from '../src/hooks/useServiceSnapshot.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';
import {actionIsDisabled} from '../src/components/Shell/ShellControls.tsx';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('the Settings recovery control remains enabled when service initialization fails',()=>{
  const state={...INITIAL_SERVICE_STATE,ready:false,error:'Initialization failed'};
  assert.equal(actionIsDisabled('settings',state),false);
  assert.equal(actionIsDisabled('listen',state),true);
});

test('a temporary shell listener failure reconnects without a window reload',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  let attempts=0,requested=0,receive;const snapshots=[];
  const stop=subscribeServiceSnapshots({
    listen:async callback=>{attempts++;if(attempts===1)throw Error('IPC not ready');receive=callback;return()=>{};},
    requestSnapshot:async()=>{requested++;},
  },state=>snapshots.push(state.ready),()=>{});
  try{
    await tick();assert.equal(attempts,1);
    context.mock.timers.tick(3000);await tick();
    assert.equal(attempts,2);assert.equal(requested,1);
    receive({...INITIAL_SERVICE_STATE,ready:true,revision:1});assert.deepEqual(snapshots,[true]);
  }finally{stop();context.mock.timers.reset();}
});

test('a new service session can publish lower revisions without stale sessions taking control again',async()=>{
  let receive;const snapshots=[];
  const stop=subscribeServiceSnapshots({listen:async callback=>{receive=callback;return()=>{};},requestSnapshot:async()=>{}},state=>snapshots.push([state.service_id,state.revision]));
  await tick();
  receive({...INITIAL_SERVICE_STATE,service_id:'first',revision:400,ready:true});
  receive({...INITIAL_SERVICE_STATE,service_id:'replacement',revision:1,ready:false});
  receive({...INITIAL_SERVICE_STATE,service_id:'first',revision:401,ready:true});
  receive({...INITIAL_SERVICE_STATE,service_id:'replacement',revision:2,ready:true});
  assert.deepEqual(snapshots,[['first',400],['replacement',1],['replacement',2]]);stop();
});

test('shell installs its listener before requesting a snapshot and rejects stale revisions', async () => {
  const events = [];
  const snapshots = [];
  let receive;
  const transport = {
    async listen(callback) { events.push('listen'); receive = callback; return () => events.push('unlisten'); },
    async requestSnapshot() { events.push('snapshot'); },
  };
  const stop = subscribeServiceSnapshots(transport, state => snapshots.push(state.revision));
  await tick();
  assert.deepEqual(events, ['listen', 'snapshot']);
  for (const revision of [0, 3, 2, 3, 4]) receive({ ...INITIAL_SERVICE_STATE, revision });
  assert.deepEqual(snapshots, [0, 3, 4]);
  stop();
  receive({ ...INITIAL_SERVICE_STATE, revision: 5 });
  assert.deepEqual(snapshots, [0, 3, 4]);
  assert.deepEqual(events, ['listen', 'snapshot', 'unlisten']);
});

test('StrictMode cleanup releases a late listener without requesting a snapshot', async () => {
  let finishListening;
  let unlistened = 0;
  let requested = 0;
  const stop = subscribeServiceSnapshots({
    listen: () => new Promise(resolve => { finishListening = resolve; }),
    async requestSnapshot() { requested++; },
  }, () => assert.fail('disposed subscription received state'));
  stop();
  finishListening(() => unlistened++);
  await tick();
  assert.equal(unlistened, 1);
  assert.equal(requested, 0);
  stop();
  assert.equal(unlistened, 1);
});
