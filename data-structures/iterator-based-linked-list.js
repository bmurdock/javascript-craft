/* -----------------------------------------------------------------------------
 * UltimateLinkedList - feature-rich, iterator-based doubly linked list
 * © 2025 Brian Murdock - MIT Licensed
 * -----------------------------------------------------------------------------
 *
 * This implementation favors honest linked-list behavior over inflated claims:
 * - Doubly linked with head/tail sentinels for simple boundary handling.
 * - O(1) single-value endpoint operations and list-to-list concat by splicing.
 * - Indexed access traverses from the closer end: O(min(index, length - index)).
 * - Array-like helpers for common operations, plus cursors and observations.
 * - Transactions snapshot values and can roll back in O(n).
 * - immutable() returns a snapshot, not a live view.
 * ----------------------------------------------------------------------------- */

/** @template T */
class Node {
  /** @param {T} [value] */
  constructor(value) {
    /** @type {T} */
    this.value = value;
    /** @type {Node<T>|null} */
    this.next = null;
    /** @type {Node<T>|null} */
    this.prev = null;
  }
}

/** @template T */
class Cursor {
  /**
   * @param {UltimateLinkedList<T>} list
   * @param {Node<T>|null} [node]
   * @param {number} [index]
   */
  constructor(list, node = null, index = -1) {
    this._list = list;
    this._node = node;
    this._index = index;
    this._direction = 1;
    this._terminal = false;
    this._expectedModCount = list._modCount;
  }

  _assertUnmodified() {
    if (this._expectedModCount !== this._list._modCount) {
      throw new Error("Concurrent modification during cursor traversal");
    }
  }

  /** @param {number} dir */
  setDirection(dir) {
    this._direction = dir === -1 ? -1 : 1;
    return this;
  }

  next() {
    this._assertUnmodified();
    if (this._terminal) return this;

    if (!this._node) {
      this._node =
        this._direction === 1 ? this._list._head.next : this._list._tail.prev;
      this._index = this._direction === 1 ? 0 : this._list.length - 1;
    } else {
      this._node = this._direction === 1 ? this._node.next : this._node.prev;
      this._index += this._direction;
    }
    return this;
  }

  value() {
    return this.valid() ? this._node.value : undefined;
  }

  valid() {
    this._assertUnmodified();
    return (
      this._node !== null &&
      this._node !== this._list._head &&
      this._node !== this._list._tail
    );
  }

  reset(toEnd = false) {
    this._expectedModCount = this._list._modCount;
    this._node = toEnd ? this._list._tail.prev : this._list._head.next;
    this._index = toEnd ? this._list.length - 1 : 0;
    this._terminal = false;
    return this;
  }

  [Symbol.iterator]() {
    return {
      next: () => {
        if (!this.valid()) this.next();
        if (!this.valid()) return { done: true, value: undefined };

        const value = this.value();
        this.next();
        return { done: false, value };
      },
    };
  }
}

/**
 * @template T
 * @implements {Iterable<T>}
 */
class UltimateLinkedList {
  /**
   * @param {Iterable<T>} [iterable]
   * @param {{ observable?: boolean }} [options]
   */
  constructor(iterable, options = {}) {
    /** @type {Node<T>} */
    this._head = new Node();
    /** @type {Node<T>} */
    this._tail = new Node();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._size = 0;
    this._observable = !!options.observable;
    this._listeners = [];
    this._transaction = null;
    this._modCount = 0;

    if (iterable != null) {
      for (const value of iterable) this._insertBeforeTail(value);
    }
  }

  get length() {
    return this._size;
  }

  isEmpty() {
    return this._size === 0;
  }

  first() {
    return this.isEmpty() ? undefined : this._head.next.value;
  }

  last() {
    return this.isEmpty() ? undefined : this._tail.prev.value;
  }

  cursor() {
    return new Cursor(this);
  }

  cursorAt(index) {
    const { node, index: actualIndex } = this._nodeAt(index);
    const cursor = new Cursor(this, node, actualIndex);
    cursor._terminal = !node;
    return cursor;
  }

  /** @param {Node<T>} prev @param {T} value */
  _insertAfter(prev, value) {
    const node = new Node(value);
    const next = prev.next;
    node.prev = prev;
    node.next = next;
    prev.next = node;
    next.prev = node;
    this._size++;
    return node;
  }

  /** @param {T} value */
  _insertBeforeTail(value) {
    return this._insertAfter(this._tail.prev, value);
  }

  /** @param {Node<T>} node */
  _unlink(node) {
    const prev = node.prev;
    const next = node.next;
    prev.next = next;
    next.prev = prev;
    node.prev = null;
    node.next = null;
    this._size--;
    return node.value;
  }

  _changed() {
    this._modCount++;
  }

  /** @param {Object} event */
  _record(event) {
    if (!this._observable) return;

    if (this._transaction?._active) {
      this._transaction.events.push(event);
      return;
    }

    this._notify(event);
  }

  /** @param {Object} event */
  _notify(event) {
    for (const listener of [...this._listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in listener:", error);
      }
    }
  }

  _resetFrom(values) {
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._size = 0;
    for (const value of values) this._insertBeforeTail(value);
    this._changed();
  }

  /** @param {number} index */
  _normalizeIndex(index) {
    if (!Number.isInteger(index)) return -1;
    return index < 0 ? this._size + index : index;
  }

  /** @param {number} index */
  _nodeAt(index) {
    index = this._normalizeIndex(index);
    if (index < 0 || index >= this._size) return { node: null, index: -1 };

    if (index <= this._size / 2) {
      let node = this._head.next;
      for (let i = 0; i < index; i++) node = node.next;
      return { node, index };
    }

    let node = this._tail.prev;
    for (let i = this._size - 1; i > index; i--) node = node.prev;
    return { node, index };
  }

  /** @param {number} index */
  get(index) {
    const { node } = this._nodeAt(index);
    return node ? node.value : undefined;
  }

  /** @param {number} index @param {T} value */
  set(index, value) {
    const normalizedIndex = this._normalizeIndex(index);
    const { node } = this._nodeAt(index);
    if (!node) return false;

    const oldValue = node.value;
    node.value = value;
    if (this._observable) {
      this._record({ type: "update", index: normalizedIndex, oldValue, newValue: value });
    }
    return true;
  }

  at(index) {
    return this.get(index);
  }

  append(value) {
    const index = this._size;
    this._changed();
    this._insertBeforeTail(value);
    if (this._observable) this._record({ type: "add", index, value });
    return this;
  }

  prepend(value) {
    this._changed();
    this._insertAfter(this._head, value);
    if (this._observable) this._record({ type: "add", index: 0, value });
    return this;
  }

  push(...values) {
    if (values.length === 0) return this._size;

    this._changed();
    let index = this._size;
    for (const value of values) {
      this._insertBeforeTail(value);
      if (this._observable) this._record({ type: "add", index, value });
      index++;
    }
    return this._size;
  }

  pop() {
    if (this.isEmpty()) return undefined;

    const index = this._size - 1;
    this._changed();
    const value = this._unlink(this._tail.prev);
    if (this._observable) this._record({ type: "remove", index, value });
    return value;
  }

  shift() {
    if (this.isEmpty()) return undefined;

    this._changed();
    const value = this._unlink(this._head.next);
    if (this._observable) this._record({ type: "remove", index: 0, value });
    return value;
  }

  unshift(...values) {
    if (values.length === 0) return this._size;

    this._changed();
    for (let i = values.length - 1; i >= 0; i--) {
      this._insertAfter(this._head, values[i]);
    }
    if (this._observable) {
      values.forEach((value, index) => this._record({ type: "add", index, value }));
    }
    return this._size;
  }

  insertAt(value, index = this._size) {
    if (!Number.isInteger(index)) {
      throw new RangeError("Expected an integer index");
    }
    if (index < 0) index = this._size + index + 1;
    if (index < 0 || index > this._size) {
      throw new RangeError(`Index ${index} out of bounds`);
    }

    this._changed();
    if (index === this._size) {
      this._insertBeforeTail(value);
    } else {
      const prev = index === 0 ? this._head : this._nodeAt(index - 1).node;
      this._insertAfter(prev, value);
    }
    if (this._observable) this._record({ type: "add", index, value });
    return this;
  }

  removeAt(index) {
    const normalizedIndex = this._normalizeIndex(index);
    const { node } = this._nodeAt(index);
    if (!node) return undefined;

    this._changed();
    const value = this._unlink(node);
    if (this._observable) {
      this._record({ type: "remove", index: normalizedIndex, value });
    }
    return value;
  }

  remove(value, comparator = Object.is) {
    let node = this._head.next;
    let index = 0;

    while (node !== this._tail) {
      if (comparator(node.value, value)) {
        this._changed();
        const removed = this._unlink(node);
        if (this._observable) this._record({ type: "remove", index, value: removed });
        return removed;
      }
      node = node.next;
      index++;
    }

    return undefined;
  }

  indexOf(value, comparator = Object.is) {
    let node = this._head.next;
    let index = 0;
    while (node !== this._tail) {
      if (comparator(node.value, value)) return index;
      node = node.next;
      index++;
    }
    return -1;
  }

  lastIndexOf(value, comparator = Object.is) {
    let node = this._tail.prev;
    let index = this._size - 1;
    while (node !== this._head) {
      if (comparator(node.value, value)) return index;
      node = node.prev;
      index--;
    }
    return -1;
  }

  includes(value, comparator = Object.is) {
    return this.indexOf(value, comparator) !== -1;
  }

  clear() {
    if (this.isEmpty()) return this;

    const size = this._size;
    this._changed();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._size = 0;
    if (this._observable) this._record({ type: "clear", size });
    return this;
  }

  reverse() {
    if (this._size < 2) return this;

    this._changed();
    let node = this._head;
    while (node) {
      const next = node.next;
      node.next = node.prev;
      node.prev = next;
      node = next;
    }

    const oldHead = this._head;
    this._head = this._tail;
    this._tail = oldHead;
    if (this._observable) this._record({ type: "reverse" });
    return this;
  }

  immutable() {
    return new ImmutableLinkedList(this.toArray());
  }

  sort(compareFn) {
    if (this._size <= 1) return this;

    const values = this.toArray();
    values.sort(compareFn);
    this._resetFrom(values);
    if (this._observable) this._record({ type: "sort" });
    return this;
  }

  concat(other) {
    if (other === this) {
      throw new TypeError("Cannot concatenate list with itself");
    }

    if (other instanceof UltimateLinkedList) {
      if (this._transaction?._active || other._transaction?._active) {
        throw new TypeError("Cannot concatenate during an active transaction");
      }
      if (other.isEmpty()) return this;

      const startIndex = this._size;
      const otherSize = other._size;
      const otherFirst = other._head.next;
      const otherLast = other._tail.prev;
      const thisLast = this._tail.prev;

      this._changed();
      thisLast.next = otherFirst;
      otherFirst.prev = thisLast;
      otherLast.next = this._tail;
      this._tail.prev = otherLast;
      this._size += otherSize;

      other._head.next = other._tail;
      other._tail.prev = other._head;
      other._size = 0;
      other._changed();

      if (this._observable) {
        this._record({ type: "concat", index: startIndex, size: otherSize });
      }
      if (other._observable) other._record({ type: "clear", size: otherSize });
      return this;
    }

    if (other != null) {
      for (const value of other) this.append(value);
    }

    return this;
  }

  join(separator = ",") {
    return this.toArray().join(separator);
  }

  toArray() {
    const arr = new Array(this._size);
    let node = this._head.next;
    let index = 0;
    while (node !== this._tail) {
      arr[index++] = node.value;
      node = node.next;
    }
    return arr;
  }

  toString() {
    return this.toArray().join(" -> ") + " -> null";
  }

  toJSON() {
    return this.toArray();
  }

  [Symbol.iterator]() {
    const list = this;
    const expectedModCount = this._modCount;
    let node = this._head;

    return {
      next() {
        if (expectedModCount !== list._modCount) {
          throw new Error("Concurrent modification during iteration");
        }

        node = node.next;
        if (node === list._tail) return { done: true, value: undefined };
        return { done: false, value: node.value };
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  *keys() {
    for (let index = 0; index < this._size; index++) yield index;
  }

  values() {
    return this[Symbol.iterator]();
  }

  *entries() {
    let index = 0;
    for (const value of this) yield [index++, value];
  }

  slice(start = 0, end = this._size) {
    start = Math.trunc(start) || 0;
    end = Math.trunc(end) || 0;
    if (start < 0) start = this._size + start;
    if (end < 0) end = this._size + end;
    start = Math.max(0, start);
    end = Math.min(this._size, end);

    const result = new UltimateLinkedList();
    if (start >= end) return result;

    let { node } = this._nodeAt(start);
    for (let index = start; index < end && node !== this._tail; index++) {
      result.append(node.value);
      node = node.next;
    }
    return result;
  }

  splitAt(index) {
    if (!Number.isInteger(index)) {
      throw new RangeError("Expected an integer index");
    }
    if (index < 0) index = this._size + index;
    if (index < 0 || index > this._size) {
      throw new RangeError(`Index ${index} out of bounds`);
    }
    if (this._transaction?._active) {
      throw new TypeError("Cannot split during an active transaction");
    }

    const tailList = new UltimateLinkedList(undefined, {
      observable: this._observable,
    });
    if (index === this._size) return tailList;

    const splitNode = index === 0 ? this._head.next : this._nodeAt(index).node;
    const originalLast = this._tail.prev;
    const tailSize = this._size - index;

    this._changed();
    tailList._changed();

    if (index === 0) {
      this._head.next = this._tail;
      this._tail.prev = this._head;
    } else {
      const beforeSplit = splitNode.prev;
      beforeSplit.next = this._tail;
      this._tail.prev = beforeSplit;
    }

    tailList._head.next = splitNode;
    splitNode.prev = tailList._head;
    tailList._tail.prev = originalLast;
    originalLast.next = tailList._tail;

    this._size = index;
    tailList._size = tailSize;
    if (this._observable) this._record({ type: "split", index, size: tailSize });
    return tailList;
  }

  map(callback) {
    const result = new UltimateLinkedList();
    let index = 0;
    for (const value of this) result.append(callback(value, index++, this));
    return result;
  }

  filter(predicate) {
    const result = new UltimateLinkedList();
    let index = 0;
    for (const value of this) {
      if (predicate(value, index, this)) result.append(value);
      index++;
    }
    return result;
  }

  reduce(callback, initialValue) {
    if (this.isEmpty() && arguments.length === 1) {
      throw new TypeError("Reduce of empty list with no initial value");
    }

    let index = 0;
    let node = this._head.next;
    let acc = initialValue;
    if (arguments.length === 1) {
      acc = node.value;
      node = node.next;
      index = 1;
    }

    while (node !== this._tail) {
      acc = callback(acc, node.value, index++, this);
      node = node.next;
    }
    return acc;
  }

  every(predicate) {
    let index = 0;
    for (const value of this) {
      if (!predicate(value, index++, this)) return false;
    }
    return true;
  }

  some(predicate) {
    let index = 0;
    for (const value of this) {
      if (predicate(value, index++, this)) return true;
    }
    return false;
  }

  find(predicate) {
    let index = 0;
    for (const value of this) {
      if (predicate(value, index++, this)) return value;
    }
    return undefined;
  }

  findIndex(predicate) {
    let index = 0;
    for (const value of this) {
      if (predicate(value, index, this)) return index;
      index++;
    }
    return -1;
  }

  forEach(callback) {
    let index = 0;
    for (const value of this) callback(value, index++, this);
    return this;
  }

  beginTransaction() {
    if (this._transaction) return this._transaction;
    this._transaction = new Transaction(this);
    return this._transaction;
  }

  addChangeListener(listener) {
    this._listeners.push(listener);
    return () => {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) this._listeners.splice(index, 1);
    };
  }

  get [Symbol.toStringTag]() {
    return "UltimateLinkedList";
  }

  static from(iterable) {
    return new UltimateLinkedList(iterable);
  }

  static of(...items) {
    return new UltimateLinkedList(items);
  }

  static empty() {
    return new UltimateLinkedList();
  }

  static range(start, end, step = 1) {
    if (![start, end, step].every(Number.isFinite)) {
      throw new RangeError("Range requires finite numbers");
    }
    if (step === 0) throw new RangeError("Step cannot be zero");

    const list = new UltimateLinkedList();
    if ((step > 0 && start >= end) || (step < 0 && start <= end)) return list;

    for (let value = start; step > 0 ? value < end : value > end; ) {
      list.append(value);
      const nextValue = value + step;
      if (nextValue === value) {
        throw new RangeError("Step does not advance range");
      }
      value = nextValue;
    }
    return list;
  }
}

/**
 * @template T
 * @implements {Iterable<T>}
 */
class ImmutableLinkedList {
  /** @param {Iterable<T>} source */
  constructor(source) {
    this._values = Object.freeze(Array.from(source));
  }

  get length() {
    return this._values.length;
  }

  get(index) {
    return this.at(index);
  }

  at(index) {
    return this._values.at(index);
  }

  isEmpty() {
    return this._values.length === 0;
  }

  first() {
    return this._values[0];
  }

  last() {
    return this._values.at(-1);
  }

  toArray() {
    return Array.from(this._values);
  }

  toString() {
    return this._values.join(" -> ") + " -> null";
  }

  toMutable() {
    return new UltimateLinkedList(this._values);
  }

  [Symbol.iterator]() {
    return this._values[Symbol.iterator]();
  }

  get [Symbol.toStringTag]() {
    return "ImmutableLinkedList";
  }
}

/** @template T */
class Transaction {
  /** @param {UltimateLinkedList<T>} list */
  constructor(list) {
    this._list = list;
    this._snapshot = null;
    this._active = false;
    this.events = [];
  }

  begin() {
    if (this._active) return this;
    this._snapshot = this._list.toArray();
    this.events = [];
    this._active = true;
    return this;
  }

  commit() {
    if (!this._active) return this;

    const events = this.events.slice();
    this._active = false;
    this._snapshot = null;
    this.events = [];
    this._list._transaction = null;

    if (this._list._observable) {
      this._list._notify({ type: "transaction", action: "commit", events });
    }
    return this;
  }

  rollback() {
    if (!this._active || !this._snapshot) return this;

    const events = this.events.slice();
    const snapshot = this._snapshot;
    this._active = false;
    this._snapshot = null;
    this.events = [];
    this._list._transaction = null;
    this._list._resetFrom(snapshot);

    if (this._list._observable) {
      this._list._notify({ type: "transaction", action: "rollback", events });
    }
    return this;
  }
}

export { UltimateLinkedList, ImmutableLinkedList, Transaction, Cursor };
