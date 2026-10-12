import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeServiceSnapshots } from '../src/hooks/useServiceSnapshot.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));

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
