import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";

const moduleUrl = pathToFileURL(
  new URL("../data-structures/robust-lightweight-singly-linked-list.js", import.meta.url).pathname
).href;

async function importQuietly() {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    const module = await import(`${moduleUrl}?cacheBust=${Date.now()}-${Math.random()}`);
    return { module, logs };
  } finally {
    console.log = originalLog;
  }
}

test("module import has no console output", async () => {
  const { module, logs } = await importQuietly();

  assert.equal(typeof module.LinkedList, "function");
  assert.deepEqual(logs, []);
});

test("constructs, iterates, and exposes first and last values", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of(1, 2).prepend(0).append(3);

  assert.equal(list.length, 4);
  assert.equal(list.first(), 0);
  assert.equal(list.last(), 3);
  assert.deepEqual([...list], [0, 1, 2, 3]);
});

test("supports positive and negative indexed access and removal", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of("a", "b", "c", "d");

  assert.equal(list.at(0), "a");
  assert.equal(list.at(-1), "d");
  assert.equal(list.at(-4), "a");
  assert.equal(list.removeAt(-2), "c");
  assert.deepEqual(list.toArray(), ["a", "b", "d"]);
});

test("non-integer indices cannot mutate list state", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  for (const index of [Number.NaN, 1.5]) {
    const list = LinkedList.of("a", "b", "c");

    assert.equal(list.get(index), undefined);
    assert.equal(list.removeAt(index), undefined);
    assert.throws(() => list.insertAt("changed", index), /integer index/);
    assert.equal(list.length, 3);
    assert.deepEqual(list.toArray(), ["a", "b", "c"]);
  }
});

test("uses insertion-specific negative index semantics", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of(1, 2, 3);

  list.insertAt(9, -1);

  assert.deepEqual(list.toArray(), [1, 2, 3, 9]);
});

test("removal methods return removed values without becoming fluent mutators", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of(1, 2, 3, 2);

  assert.equal(list.remove(2), 2);
  assert.equal(list.removeAt(1), 3);
  assert.equal(list.remove(99), undefined);
  assert.deepEqual(list.toArray(), [1, 2]);
});

test("concatenates by stealing donor nodes and rejects self-concat", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const receiver = LinkedList.of("a", "b");
  const donor = LinkedList.of("c", "d");

  assert.equal(receiver.concat(donor), receiver);
  assert.deepEqual(receiver.toArray(), ["a", "b", "c", "d"]);
  assert.deepEqual(donor.toArray(), []);
  assert.equal(donor.length, 0);
  assert.throws(() => receiver.concat(receiver), /Cannot concatenate list with itself/);
  assert.deepEqual(receiver.toArray(), ["a", "b", "c", "d"]);
});

test("reverses, maps, and reduces predictably", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of(1, 2, 3);

  assert.equal(list.reverse(), list);
  assert.deepEqual(list.toArray(), [3, 2, 1]);
  assert.deepEqual(list.map((value, index) => value + index).toArray(), [3, 3, 3]);
  assert.equal(list.reduce((sum, value) => sum + value, 0), 6);
});

test("does not expose mutable internal nodes", async () => {
  const {
    module: { LinkedList },
  } = await importQuietly();

  const list = LinkedList.of(1, 2, 3);

  assert.equal(typeof list.getNodeAt, "undefined");
  assert.deepEqual(list.toArray(), [1, 2, 3]);
});
