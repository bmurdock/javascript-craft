import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";

const moduleUrl = pathToFileURL(
  new URL("../data-structures/iterator-based-linked-list.js", import.meta.url).pathname
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

  assert.equal(typeof module.UltimateLinkedList, "function");
  assert.equal(typeof module.ImmutableLinkedList, "function");
  assert.equal(typeof module.Transaction, "function");
  assert.equal(typeof module.Cursor, "function");
  assert.deepEqual(logs, []);
});

test("indexed access matches an Array after mixed insertions, removals, and reverse", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.from(Array.from({ length: 32 }, (_, index) => index));
  const expected = Array.from({ length: 32 }, (_, index) => index);

  for (const index of [1, 3, 5, 7, 9, 11, 13]) {
    assert.equal(list.removeAt(index), expected.splice(index, 1)[0]);
  }

  for (const [value, index] of [
    [100, 2],
    [101, 5],
    [102, 8],
  ]) {
    list.insertAt(value, index);
    expected.splice(index, 0, value);
  }

  list.reverse();
  expected.reverse();
  list.append(999);
  expected.push(999);
  list.prepend(-1);
  expected.unshift(-1);

  assert.deepEqual(list.toArray(), expected);
  for (let index = -list.length; index < list.length; index++) {
    const expectedValue = index < 0 ? expected[expected.length + index] : expected[index];
    assert.equal(list.get(index), expectedValue);
  }
});

test("self-concat is rejected without data loss", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of(1, 2, 3);

  assert.throws(() => list.concat(list), /Cannot concatenate list with itself/);
  assert.deepEqual(list.toArray(), [1, 2, 3]);
});

test("immutable lists are snapshots, not live views", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of(1, 2);
  const immutable = list.immutable();

  list.append(3);
  const mutable = immutable.toMutable();
  mutable.append(4);

  assert.deepEqual(immutable.toArray(), [1, 2]);
  assert.deepEqual(mutable.toArray(), [1, 2, 4]);
  assert.deepEqual(list.toArray(), [1, 2, 3]);
});

test("transaction rollback restores order and length after mixed operations", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of(1, 2, 3);
  const transaction = list.beginTransaction();

  transaction.begin();
  list.push(4, 5);
  list.removeAt(0);
  list.insertAt(9, 1);
  transaction.rollback();

  assert.deepEqual(list.toArray(), [1, 2, 3]);
  assert.equal(list.length, 3);
});

test("no-op variadic mutators do not invalidate existing iterators", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of(1, 2);
  const iterator = list[Symbol.iterator]();

  assert.deepEqual(iterator.next(), { done: false, value: 1 });
  assert.equal(list.push(), 2);
  assert.equal(list.unshift(), 2);
  assert.deepEqual(iterator.next(), { done: false, value: 2 });
  assert.deepEqual(iterator.next(), { done: true, value: undefined });
});

test("generic iterable concat does not spread the iterable", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  function* values() {
    yield 2;
    yield 3;
  }

  const list = UltimateLinkedList.of(1);

  assert.equal(list.concat(values()), list);
  assert.deepEqual(list.toArray(), [1, 2, 3]);
});

test("list-to-list concat rejects active transactions without changing either list", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const receiver = UltimateLinkedList.of("a");
  const donor = UltimateLinkedList.of("b", "c");
  receiver.beginTransaction().begin();

  assert.throws(() => receiver.concat(donor), /Cannot concatenate during an active transaction/);
  assert.deepEqual(receiver.toArray(), ["a"]);
  assert.deepEqual(donor.toArray(), ["b", "c"]);

  const secondReceiver = UltimateLinkedList.of("a");
  const secondDonor = UltimateLinkedList.of("b", "c");
  secondDonor.beginTransaction().begin();

  assert.throws(
    () => secondReceiver.concat(secondDonor),
    /Cannot concatenate during an active transaction/
  );
  assert.deepEqual(secondReceiver.toArray(), ["a"]);
  assert.deepEqual(secondDonor.toArray(), ["b", "c"]);
});

test("list-to-list concat splices without materializing donor values", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const receiver = UltimateLinkedList.of("a");
  const donor = UltimateLinkedList.of("b", "c");
  donor.toArray = () => {
    throw new Error("donor values should not be materialized");
  };

  assert.equal(receiver.concat(donor), receiver);
  assert.deepEqual(receiver.toArray(), ["a", "b", "c"]);
  assert.equal(donor.length, 0);
});

test("observable list-to-list concat emits constant-size splice events", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const receiver = new UltimateLinkedList(["a"], { observable: true });
  const donor = new UltimateLinkedList(["b", "c"], { observable: true });
  const receiverEvents = [];
  const donorEvents = [];
  receiver.addChangeListener((event) => receiverEvents.push(event));
  donor.addChangeListener((event) => donorEvents.push(event));
  donor.toArray = () => {
    throw new Error("donor values should not be materialized");
  };

  receiver.concat(donor);

  assert.deepEqual(receiverEvents, [{ type: "concat", index: 1, size: 2 }]);
  assert.deepEqual(donorEvents, [{ type: "clear", size: 2 }]);
});

test("out-of-bounds cursors are terminal", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of(1, 2, 3);

  for (const index of [-99, 3, 99]) {
    const cursor = list.cursorAt(index);

    assert.equal(cursor.valid(), false);
    assert.equal(cursor.value(), undefined);
    assert.deepEqual([...cursor], []);
  }
});

test("cursors can reverse direction after reaching an endpoint", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const cursor = UltimateLinkedList.of(1, 2, 3).cursor();
  while (cursor.next().valid()) {}

  assert.equal(cursor.valid(), false);
  assert.equal(cursor.setDirection(-1).next().value(), 3);
  assert.equal(cursor.next().value(), 2);
  assert.equal(cursor.setDirection(1).next().value(), 3);
});

test("observable lists emit direct events and transactional commit or rollback events", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = new UltimateLinkedList([1], { observable: true });
  const events = [];
  list.addChangeListener((event) => events.push(event));

  list.append(2);
  const transaction = list.beginTransaction();
  transaction.begin();
  list.append(3);
  list.removeAt(0);
  transaction.commit();

  const rollback = list.beginTransaction();
  rollback.begin();
  list.append(4);
  rollback.rollback();

  assert.deepEqual(events, [
    { type: "add", index: 1, value: 2 },
    {
      type: "transaction",
      action: "commit",
      events: [
        { type: "add", index: 2, value: 3 },
        { type: "remove", index: 0, value: 1 },
      ],
    },
    {
      type: "transaction",
      action: "rollback",
      events: [{ type: "add", index: 2, value: 4 }],
    },
  ]);
  assert.deepEqual(list.toArray(), [2, 3]);
});

test("keys, values, entries, and splitAt expose Array-like iteration helpers", async () => {
  const {
    module: { UltimateLinkedList },
  } = await importQuietly();

  const list = UltimateLinkedList.of("a", "b", "c", "d");
  const tail = list.splitAt(2);

  assert.deepEqual([...list.keys()], [0, 1]);
  assert.deepEqual([...list.values()], ["a", "b"]);
  assert.deepEqual([...list.entries()], [
    [0, "a"],
    [1, "b"],
  ]);
  assert.deepEqual(list.toArray(), ["a", "b"]);
  assert.deepEqual(tail.toArray(), ["c", "d"]);
});
