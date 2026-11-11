import { test } from "node:test";
import assert from "node:assert/strict";

const { runPool } = await import("../src/lib/pool");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("runPool traite tout sans dépasser la concurrence", async () => {
  let running = 0, peak = 0;
  const seen: number[] = [];
  const n = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (i) => {
    running++; peak = Math.max(peak, running);
    await sleep(5);
    seen.push(i);
    running--;
  });
  assert.equal(n, 7);
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test("runPool s'arrête quand une tâche renvoie false", async () => {
  const seen: number[] = [];
  await runPool([1, 2, 3, 4, 5], 1, async (i) => { seen.push(i); return i === 2 ? false : undefined; });
  assert.deepEqual(seen, [1, 2]);
});

test("runPool ne lance plus rien après l'échéance", async () => {
  const seen: number[] = [];
  const n = await runPool([1, 2, 3], 2, async (i) => { seen.push(i); }, Date.now() - 1);
  assert.equal(n, 0);
  assert.deepEqual(seen, []);
});

test("runPool accepte une liste vide", async () => {
  assert.equal(await runPool([], 4, async () => {}), 0);
});
