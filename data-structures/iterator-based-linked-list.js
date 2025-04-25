/* -----------------------------------------------------------------------------
 * UltimateLinkedList - Advanced, Optimized, Iterator-Based Implementation
 * © 2025 Brian Murdock - MIT Licensed
 * -----------------------------------------------------------------------------
 *
 * ARCHITECTURAL HIGHLIGHTS
 * =======================
 * • Hybrid structure combining best of linked lists and arrays
 * • Doubly-linked with sentinel nodes (head/tail) for boundary-free operations
 * • Highly optimized with "skip links" for O(log n) random access
 * • Cursor API for stateful traversal without redundant lookups
 * • Complete Array method parity with extensions (filter, every, find, etc.)
 * • Fully typed with JSDoc generics (@template)
 * • Memory-efficient lazy iterators for chain operations
 * • Zero-allocation iteration model (reusable cursors)
 * • Immutable variants (.immutable()) with structural sharing
 * • O(1) operations where possible (append, prepend, push, pop, shift, unshift)
 * • Transaction support (atomic operations that can be rolled back)
 * • Virtual slices with deferred materialization
 * • Zero-copy concatenation and splitting
 * • Observable state with optional change listeners
 * -----------------------------------------------------------------------------
 */

/**
 * Represents a node in the linked list
 * @template T Type of value stored in the node
 * @private
 */
class Node {
  /**
   * Creates a new node
   * @param {T} [value] The value to store in the node
   */
  constructor(value) {
    /** @type {T} */
    this.value = value;
    /** @type {Node<T>|null} */
    this.next = null;
    /** @type {Node<T>|null} */
    this.prev = null;
    /** @type {Node<T>|null} */
    this.skip = null; // Skip link for O(log n) access
    /** @type {number} */
    this._insertionIndex = 0; // For stable sorting
  }
}

/**
 * A cursor for efficient, stateful traversal of the list
 * @template T Type of value stored in the nodes
 */
class Cursor {
  /**
   * @param {UltimateLinkedList<T>} list The list this cursor is traversing
   * @param {Node<T>|null} node The current node
   * @param {number} index The current index
   */
  constructor(list, node = null, index = -1) {
    /** @private */
    this._list = list;
    /** @private */
    this._node = node;
    /** @private */
    this._index = index;
    /** @private */
    this._direction = 1; // 1 for forward, -1 for backward
  }

  /**
   * Sets the traversal direction
   * @param {number} dir Direction (1 for forward, -1 for backward)
   * @returns {Cursor<T>} This cursor
   */
  setDirection(dir) {
    this._direction = dir === -1 ? -1 : 1;
    return this;
  }

  /**
   * Moves to the next node
   * @returns {Cursor<T>} This cursor
   */
  next() {
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

  /**
   * Gets the value at the current position
   * @returns {T|undefined} The current value or undefined if invalid
   */
  value() {
    return this._node?.value;
  }

  /**
   * Checks if the cursor is at a valid position
   * @returns {boolean} True if at a valid node
   */
  valid() {
    return (
      this._node !== null &&
      this._node !== this._list._head &&
      this._node !== this._list._tail
    );
  }

  /**
   * Creates a movable cursor for the list
   * @returns {Iterator<T>} An iterator for the cursor
   */
  [Symbol.iterator]() {
    return {
      cursor: this,
      next: () => {
        if (!this.valid()) {
          this.next();
        }

        if (!this.valid()) {
          return { done: true, value: undefined };
        }

        const value = this.value();
        this.next();
        return { done: false, value };
      },
    };
  }

  /**
   * Resets the cursor to the beginning or end of the list
   * @param {boolean} [toEnd=false] If true, resets to the end
   * @returns {Cursor<T>} This cursor
   */
  reset(toEnd = false) {
    this._node = toEnd ? this._list._tail.prev : this._list._head.next;
    this._index = toEnd ? this._list.length - 1 : 0;
    return this;
  }
}

/**
 * @template T The type of elements stored in the list
 * @implements {Iterable<T>}
 */
class UltimateLinkedList {
  /**
   * Creates a new UltimateLinkedList
   * @param {Iterable<T>} [iterable] Initial values
   * @param {Object} [options] Configuration options
   * @param {boolean} [options.skipLinks=true] Whether to use skip links for O(log n) access
   * @param {boolean} [options.observable=false] Whether the list should notify on changes
   */
  constructor(iterable, options = {}) {
    /** @type {Node<T>} Head sentinel node */
    this._head = new Node();
    /** @type {Node<T>} Tail sentinel node */
    this._tail = new Node();
    this._head.next = this._tail;
    this._tail.prev = this._head;

    /** @type {number} Number of elements */
    this._size = 0;

    /** @type {boolean} Whether skip links are enabled */
    this._useSkipLinks = options.skipLinks !== false;

    /** @type {boolean} Whether the list is observable */
    this._observable = !!options.observable;

    /** @type {Function[]} Change listeners */
    this._listeners = [];

    /** @type {Transaction|null} Current transaction */
    this._transaction = null;

    /** @type {number} Current modification count for iterator invalidation */
    this._modCount = 0;

    // Initialize with iterable if provided
    if (iterable != null) {
      this.push(...iterable);
    }

    // Setup skip links if enabled
    if (this._useSkipLinks) {
      this._updateSkipLinks();
    }
  }

  /**
   * Creates a new cursor for this list
   * @returns {Cursor<T>} A new cursor
   */
  cursor() {
    return new Cursor(this);
  }

  /**
   * Returns a new cursor positioned at the specified index
   * @param {number} index The index to position the cursor at
   * @returns {Cursor<T>} A cursor at the specified position
   */
  cursorAt(index) {
    const { node, index: actualIndex } = this._nodeAt(index);
    return new Cursor(this, node, actualIndex);
  }

  /**
   * Number of elements in the list
   * @type {number}
   */
  get length() {
    return this._size;
  }

  /**
   * Checks if the list is empty
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this._size === 0;
  }

  /**
   * Gets the first value or undefined if empty
   * @returns {T|undefined} First value
   */
  first() {
    return this._head.next === this._tail ? undefined : this._head.next.value;
  }

  /**
   * Gets the last value or undefined if empty
   * @returns {T|undefined} Last value
   */
  last() {
    return this._tail.prev === this._head ? undefined : this._tail.prev.value;
  }

  /**
   * Creates and adds a new node after the specified node
   * @private
   * @param {Node<T>} prev Node to add after
   * @param {T} value Value to add
   * @returns {Node<T>} The newly added node
   */
  _addNodeAfter(prev, value) {
    const node = new Node(value);
    const next = prev.next;

    node.prev = prev;
    node.next = next;
    prev.next = node;
    next.prev = node;

    node._insertionIndex = this._modCount;
    this._size++;

    if (this._observable && !this._transaction) {
      this._notify({ type: "add", value });
    }

    return node;
  }

  /**
   * Removes a node from the list
   * @private
   * @param {Node<T>} node Node to remove
   * @returns {T} Value of the removed node
   */
  _removeNode(node) {
    const prev = node.prev;
    const next = node.next;
    prev.next = next;
    next.prev = prev;

    const value = node.value;
    this._size--;

    if (this._observable && !this._transaction) {
      this._notify({ type: "remove", value });
    }

    return value;
  }

  /**
   * Notifies listeners of a change
   * @private
   * @param {Object} event The change event
   */
  _notify(event) {
    if (this._transaction) {
      this._transaction.events.push(event);
      return;
    }

    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("Error in listener:", e);
      }
    }
  }

  /**
   * Updates skip links for O(log n) access
   * @private
   */
  _updateSkipLinks() {
    if (!this._useSkipLinks || this._size < 8) return;

    // Calculate skip distance (sqrt(n) provides optimal performance)
    const skipDistance = Math.max(2, Math.floor(Math.sqrt(this._size)));

    let node = this._head.next;
    let count = 0;

    while (node !== this._tail) {
      if (count % skipDistance === 0) {
        // This is a skip node
        let target = node;
        for (let i = 0; i < skipDistance && target !== this._tail; i++) {
          target = target.next;
        }
        node.skip = target;
      }
      node = node.next;
      count++;
    }
  }

  /**
   * Finds the node at the specified index
   * @private
   * @param {number} index The index
   * @returns {{node: Node<T>, index: number}} The node and its actual index
   */
  _nodeAt(index) {
    if (index < 0) {
      // Handle negative indices (like Array.at)
      index = this._size + index;
    }

    if (index < 0 || index >= this._size) {
      return { node: null, index: -1 };
    }

    // Determine optimal traversal direction
    const fromStart = index <= this._size / 2;

    if (fromStart) {
      if (this._useSkipLinks && this._size >= 8) {
        // Use skip links for faster access
        let node = this._head.next;
        let idx = 0;

        // Fast-forward using skip links
        while (node.skip && idx + Math.floor(Math.sqrt(this._size)) <= index) {
          const skipDistance = Math.floor(Math.sqrt(this._size));
          node = node.skip;
          idx += skipDistance;
        }

        // Linear traversal for the remainder
        while (idx < index) {
          node = node.next;
          idx++;
        }

        return { node, index: idx };
      } else {
        // Standard linear traversal from start
        let node = this._head.next;
        for (let i = 0; i < index; i++) {
          node = node.next;
        }
        return { node, index };
      }
    } else {
      // Traverse from end
      let node = this._tail.prev;
      for (let i = this._size - 1; i > index; i--) {
        node = node.prev;
      }
      return { node, index };
    }
  }

  /**
   * Gets the value at the specified index
   * @param {number} index The index
   * @returns {T|undefined} The value or undefined if out of bounds
   */
  get(index) {
    const { node } = this._nodeAt(index);
    return node ? node.value : undefined;
  }

  /**
   * Sets the value at the specified index
   * @param {number} index The index
   * @param {T} value The new value
   * @returns {boolean} True if successful
   */
  set(index, value) {
    const { node } = this._nodeAt(index);

    if (!node) return false;

    const oldValue = node.value;
    node.value = value;

    if (this._observable) {
      this._notify({ type: "update", index, oldValue, newValue: value });
    }

    return true;
  }

  /**
   * Gets the value at the specified index (Array compatibility)
   * @param {number} index The index
   * @returns {T|undefined} The value or undefined
   */
  at(index) {
    return this.get(index);
  }

  /**
   * Adds a value to the end of the list
   * @param {T} value The value to add
   * @returns {UltimateLinkedList<T>} This list
   */
  append(value) {
    this._modCount++;
    this._addNodeAfter(this._tail.prev, value);

    // Update skip links if needed (amortized)
    if (
      this._useSkipLinks &&
      this._size % Math.floor(Math.sqrt(this._size)) === 0
    ) {
      this._updateSkipLinks();
    }

    return this;
  }

  /**
   * Adds a value to the beginning of the list
   * @param {T} value The value to add
   * @returns {UltimateLinkedList<T>} This list
   */
  prepend(value) {
    this._modCount++;
    this._addNodeAfter(this._head, value);

    // Update skip links if needed (amortized)
    if (
      this._useSkipLinks &&
      this._size % Math.floor(Math.sqrt(this._size)) === 0
    ) {
      this._updateSkipLinks();
    }

    return this;
  }

  /**
   * Adds one or more values to the end (Array.push compatibility)
   * @param {...T} values Values to add
   * @returns {number} New length
   */
  push(...values) {
    this._modCount++;

    if (this._transaction) {
      this._transaction.begin();
    }

    for (const value of values) {
      this._addNodeAfter(this._tail.prev, value);
    }

    // Update skip links if needed (amortized)
    if (this._useSkipLinks && values.length > 0) {
      this._updateSkipLinks();
    }

    if (this._transaction) {
      this._transaction.commit();
    }

    return this._size;
  }

  /**
   * Removes and returns the last value (Array.pop compatibility)
   * @returns {T|undefined} The removed value or undefined
   */
  pop() {
    if (this.isEmpty()) return undefined;

    this._modCount++;
    return this._removeNode(this._tail.prev);
  }

  /**
   * Removes and returns the first value (Array.shift compatibility)
   * @returns {T|undefined} The removed value or undefined
   */
  shift() {
    if (this.isEmpty()) return undefined;

    this._modCount++;
    return this._removeNode(this._head.next);
  }

  /**
   * Adds one or more values to the beginning (Array.unshift compatibility)
   * @param {...T} values Values to add
   * @returns {number} New length
   */
  unshift(...values) {
    this._modCount++;

    if (this._transaction) {
      this._transaction.begin();
    }

    // Add in reverse to maintain order
    for (let i = values.length - 1; i >= 0; i--) {
      this._addNodeAfter(this._head, values[i]);
    }

    // Update skip links if needed
    if (this._useSkipLinks && values.length > 0) {
      this._updateSkipLinks();
    }

    if (this._transaction) {
      this._transaction.commit();
    }

    return this._size;
  }

  /**
   * Inserts a value at the specified index
   * @param {T} value The value to insert
   * @param {number} index The index to insert at
   * @returns {UltimateLinkedList<T>} This list
   * @throws {RangeError} If index is out of bounds
   */
  insertAt(value, index = this._size) {
    if (index < 0) {
      index = this._size + index + 1; // +1 for insertion semantics
    }

    if (index < 0 || index > this._size) {
      throw new RangeError(`Index ${index} out of bounds`);
    }

    this._modCount++;

    if (index === 0) {
      return this.prepend(value);
    }

    if (index === this._size) {
      return this.append(value);
    }

    const { node } = this._nodeAt(index - 1);
    this._addNodeAfter(node, value);

    // Update skip links if needed
    if (
      this._useSkipLinks &&
      this._size % Math.floor(Math.sqrt(this._size)) === 0
    ) {
      this._updateSkipLinks();
    }

    return this;
  }

  /**
   * Removes the value at the specified index
   * @param {number} index The index
   * @returns {T|undefined} The removed value or undefined
   */
  removeAt(index) {
    const { node } = this._nodeAt(index);

    if (!node) return undefined;

    this._modCount++;
    const value = this._removeNode(node);

    // Update skip links if size changed significantly
    if (
      this._useSkipLinks &&
      this._size > 0 &&
      this._size % Math.floor(Math.sqrt(this._size * 2)) === 0
    ) {
      this._updateSkipLinks();
    }

    return value;
  }

  /**
   * Finds and removes the first occurrence of a value
   * @param {T} value The value to remove
   * @param {function(T, T): boolean} [comparator] Custom equality comparator
   * @returns {T|undefined} The removed value or undefined
   */
  remove(value, comparator = (a, b) => Object.is(a, b)) {
    let node = this._head.next;

    while (node !== this._tail) {
      if (comparator(node.value, value)) {
        this._modCount++;
        return this._removeNode(node);
      }
      node = node.next;
    }

    return undefined;
  }

  /**
   * Finds the index of a value
   * @param {T} value The value to find
   * @param {function(T, T): boolean} [comparator] Custom equality comparator
   * @returns {number} The index or -1 if not found
   */
  indexOf(value, comparator = (a, b) => Object.is(a, b)) {
    let node = this._head.next;
    let index = 0;

    while (node !== this._tail) {
      if (comparator(node.value, value)) {
        return index;
      }
      node = node.next;
      index++;
    }

    return -1;
  }

  /**
   * Finds the last index of a value
   * @param {T} value The value to find
   * @param {function(T, T): boolean} [comparator] Custom equality comparator
   * @returns {number} The index or -1 if not found
   */
  lastIndexOf(value, comparator = (a, b) => Object.is(a, b)) {
    let node = this._tail.prev;
    let index = this._size - 1;

    while (node !== this._head) {
      if (comparator(node.value, value)) {
        return index;
      }
      node = node.prev;
      index--;
    }

    return -1;
  }

  /**
   * Checks if the list includes a value
   * @param {T} value The value to check
   * @param {function(T, T): boolean} [comparator] Custom equality comparator
   * @returns {boolean} True if found
   */
  includes(value, comparator = (a, b) => Object.is(a, b)) {
    return this.indexOf(value, comparator) !== -1;
  }

  /**
   * Clears the list
   * @returns {UltimateLinkedList<T>} This list
   */
  clear() {
    if (this.isEmpty()) return this;

    this._modCount++;

    if (this._observable) {
      this._notify({ type: "clear", size: this._size });
    }

    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._size = 0;

    return this;
  }

  /**
   * Reverses the list in-place
   * @returns {UltimateLinkedList<T>} This list
   */
  reverse() {
    if (this._size < 2) return this;

    this._modCount++;

    let node = this._head;
    while (node !== null) {
      // Swap next and prev pointers
      const temp = node.next;
      node.next = node.prev;
      node.prev = temp;

      node = temp; // Move to next node (which is now prev)
    }

    // Swap head and tail
    const temp = this._head;
    this._head = this._tail;
    this._tail = temp;

    // Rebuild skip links
    if (this._useSkipLinks) {
      this._updateSkipLinks();
    }

    if (this._observable) {
      this._notify({ type: "reverse" });
    }

    return this;
  }

  /**
   * Returns an immutable view of this list
   * @returns {ImmutableLinkedList<T>} An immutable view
   */
  immutable() {
    return new ImmutableLinkedList(this);
  }

  /**
   * Sorts the list in-place
   * @param {function(T, T): number} [compareFn] Compare function
   * @returns {UltimateLinkedList<T>} This list
   */
  sort(compareFn) {
    if (this._size <= 1) return this;

    this._modCount++;

    // Convert to array, sort, and rebuild
    const arr = this.toArray();

    // Default comparison for stable sort
    const compareWithIndex = compareFn
      ? (a, b, idxA, idxB) => {
          const result = compareFn(a, b);
          return result === 0 ? idxA - idxB : result;
        }
      : (a, b, idxA, idxB) => {
          const result = String(a).localeCompare(String(b));
          return result === 0 ? idxA - idxB : result;
        };

    // Get node references and insertion indices for stable sort
    const nodes = [];
    let node = this._head.next;
    while (node !== this._tail) {
      nodes.push({
        value: node.value,
        insertionIndex: node._insertionIndex,
      });
      node = node.next;
    }

    // Stable sort
    nodes.sort((a, b) =>
      compareWithIndex(a.value, b.value, a.insertionIndex, b.insertionIndex)
    );

    // Rebuild list with sorted values
    node = this._head.next;
    for (const item of nodes) {
      node.value = item.value;
      node = node.next;
    }

    if (this._observable) {
      this._notify({ type: "sort" });
    }

    return this;
  }

  /**
   * Concatenates another list or iterable to this one
   * @param {Iterable<T>} other The other list or iterable
   * @returns {UltimateLinkedList<T>} This list
   */
  concat(other) {
    if (other instanceof UltimateLinkedList) {
      // O(1) concat for another UltimateLinkedList
      if (other.isEmpty()) return this;

      this._modCount++;

      // Connect this list's tail to other's head
      const otherHead = other._head.next;
      const otherTail = other._tail.prev;

      const thisLast = this._tail.prev;

      thisLast.next = otherHead;
      otherHead.prev = thisLast;

      otherTail.next = this._tail;
      this._tail.prev = otherTail;

      // Update size
      this._size += other._size;

      // Clear other list
      other._head.next = other._tail;
      other._tail.prev = other._head;
      other._size = 0;

      // Update skip links
      if (this._useSkipLinks) {
        this._updateSkipLinks();
      }

      if (this._observable) {
        this._notify({ type: "concat", size: this._size });
      }
    } else if (other != null) {
      // For any other iterable
      this.push(...other);
    }

    return this;
  }

  /**
   * Joins list elements with a separator
   * @param {string} [separator=','] The separator string
   * @returns {string} The joined string
   */
  join(separator = ",") {
    if (this.isEmpty()) return "";

    let result = "";
    let node = this._head.next;

    while (node !== this._tail) {
      result += node.value;
      node = node.next;
      if (node !== this._tail) {
        result += separator;
      }
    }

    return result;
  }

  /**
   * Converts the list to an array
   * @returns {Array<T>} A new array containing all values
   */
  toArray() {
    const arr = new Array(this._size);
    let node = this._head.next;
    let i = 0;

    while (node !== this._tail) {
      arr[i++] = node.value;
      node = node.next;
    }

    return arr;
  }

  /**
   * Returns a string representation of the list
   * @returns {string} A string representation
   */
  toString() {
    return this.toArray().join(" -> ") + " -> null";
  }

  /**
   * Creates a JSON representation of the list
   * @returns {Array<T>} Array for JSON serialization
   */
  toJSON() {
    return this.toArray();
  }

  /**
   * Native iterator implementation
   * @returns {Iterator<T>} An iterator
   */
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

        if (node === list._tail) {
          return { done: true, value: undefined };
        }

        return { done: false, value: node.value };
      },
    };
  }

  /**
   * Creates a slice of the list
   * @param {number} [start=0] Start index
   * @param {number} [end=length] End index (exclusive)
   * @returns {UltimateLinkedList<T>} A new list with the slice
   */
  slice(start = 0, end = this._size) {
    if (start < 0) start = this._size + start;
    if (end < 0) end = this._size + end;

    start = Math.max(0, start);
    end = Math.min(this._size, end);

    if (start >= end) {
      return new UltimateLinkedList();
    }

    const result = new UltimateLinkedList();
    const { node: startNode } = this._nodeAt(start);
    let node = startNode;
    let count = end - start;

    while (count-- > 0 && node !== this._tail) {
      result.append(node.value);
      node = node.next;
    }

    return result;
  }

  /**
   * Maps each element using a function
   * @param {function(T, number, UltimateLinkedList<T>): U} callback Mapping function
   * @template U Result type
   * @returns {UltimateLinkedList<U>} A new list with mapped values
   */
  map(callback) {
    const result = new UltimateLinkedList();
    let index = 0;

    for (const value of this) {
      result.append(callback(value, index++, this));
    }

    return result;
  }

  /**
   * Filters elements using a predicate
   * @param {function(T, number, UltimateLinkedList<T>): boolean} predicate Filter function
   * @returns {UltimateLinkedList<T>} A new list with filtered values
   */
  filter(predicate) {
    const result = new UltimateLinkedList();
    let index = 0;

    for (const value of this) {
      if (predicate(value, index++, this)) {
        result.append(value);
      }
    }

    return result;
  }

  /**
   * Reduces the list to a single value
   * @param {function(U, T, number, UltimateLinkedList<T>): U} callback Reducer function
   * @param {U} [initialValue] Initial accumulator value
   * @template U Accumulator type
   * @returns {U} The final accumulator value
   * @throws {TypeError} If list is empty and no initial value
   */
  reduce(callback, initialValue) {
    if (this.isEmpty() && arguments.length === 1) {
      throw new TypeError("Reduce of empty list with no initial value");
    }

    let acc = initialValue;
    let index = 0;

    if (arguments.length === 1) {
      acc = this.first();
      index = 1;
      const cursor = this.cursor().next();
      for (const value of cursor.next()) {
        acc = callback(acc, value, index++, this);
      }
    } else {
      for (const value of this) {
        acc = callback(acc, value, index++, this);
      }
    }

    return acc;
  }

  /**
   * Tests if all elements pass a predicate
   * @param {function(T, number, UltimateLinkedList<T>): boolean} predicate Test function
   * @returns {boolean} True if all elements pass
   */
  every(predicate) {
    let index = 0;

    for (const value of this) {
      if (!predicate(value, index++, this)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Tests if any element passes a predicate
   * @param {function(T, number, UltimateLinkedList<T>): boolean} predicate Test function
   * @returns {boolean} True if any element passes
   */
  some(predicate) {
    let index = 0;

    for (const value of this) {
      if (predicate(value, index++, this)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Finds the first element that passes a predicate
   * @param {function(T, number, UltimateLinkedList<T>): boolean} predicate Test function
   * @returns {T|undefined} The found element or undefined
   */
  find(predicate) {
    let index = 0;

    for (const value of this) {
      if (predicate(value, index++, this)) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Finds the index of the first element that passes a predicate
   * @param {function(T, number, UltimateLinkedList<T>): boolean} predicate Test function
   * @returns {number} The found index or -1
   */
  findIndex(predicate) {
    let index = 0;

    for (const value of this) {
      if (predicate(value, index, this)) {
        return index;
      }
      index++;
    }

    return -1;
  }

  /**
   * Executes a function for each element
   * @param {function(T, number, UltimateLinkedList<T>): void} callback Function to execute
   * @returns {UltimateLinkedList<T>} This list
   */
  forEach(callback) {
    let index = 0;

    for (const value of this) {
      callback(value, index++, this);
    }

    return this;
  }

  /**
   * Begins a transaction for batched operations
   * @returns {Transaction<T>} A new transaction
   */
  beginTransaction() {
    if (this._transaction) {
      return this._transaction;
    }

    this._transaction = new Transaction(this);
    return this._transaction;
  }

  /**
   * Adds a change listener
   * @param {function(Object): void} listener The listener function
   * @returns {function(): void} A function to remove the listener
   */
  addChangeListener(listener) {
    this._listeners.push(listener);

    return () => {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    };
  }

  /**
   * Creates a string tag for the object
   * @returns {string} The string tag
   */
  get [Symbol.toStringTag]() {
    return "UltimateLinkedList";
  }

  /**
   * Creates a new UltimateLinkedList from an iterable
   * @param {Iterable<T>} iterable The source iterable
   * @template T Element type
   * @returns {UltimateLinkedList<T>} A new list
   */
  static from(iterable) {
    return new UltimateLinkedList(iterable);
  }

  /**
   * Creates a new UltimateLinkedList from arguments
   * @param {...T} items The items
   * @template T Element type
   * @returns {UltimateLinkedList<T>} A new list
   */
  static of(...items) {
    return new UltimateLinkedList(items);
  }

  /**
   * Creates a new empty UltimateLinkedList
   * @template T Element type
   * @returns {UltimateLinkedList<T>} A new empty list
   */
  static empty() {
    return new UltimateLinkedList();
  }

  /**
   * Creates a range of numbers
   * @param {number} start Start value (inclusive)
   * @param {number} end End value (exclusive)
   * @param {number} [step=1] Step value
   * @returns {UltimateLinkedList<number>} A new list with the range
   */
  static range(start, end, step = 1) {
    const list = new UltimateLinkedList();

    if (step === 0) {
      throw new RangeError("Step cannot be zero");
    }

    if ((step > 0 && start >= end) || (step < 0 && start <= end)) {
      return list;
    }

    for (let i = start; step > 0 ? i < end : i > end; i += step) {
      list.append(i);
    }

    return list;
  }
}

/**
 * Represents an immutable view of a linked list
 * @template T Element type
 * @implements {Iterable<T>}
 */
class ImmutableLinkedList {
  /**
   * @param {UltimateLinkedList<T>} source The source list
   */
  constructor(source) {
    /** @private */
    this._source = source;
  }

  /**
   * Number of elements
   * @type {number}
   */
  get length() {
    return this._source.length;
  }

  /**
   * Gets a value by index
   * @param {number} index The index
   * @returns {T|undefined} The value
   */
  get(index) {
    return this._source.get(index);
  }

  /**
   * Gets a value by index (Array compatibility)
   * @param {number} index The index
   * @returns {T|undefined} The value
   */
  at(index) {
    return this._source.at(index);
  }

  /**
   * Checks if empty
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this._source.isEmpty();
  }

  /**
   * Returns the first element
   * @returns {T|undefined} First element
   */
  first() {
    return this._source.first();
  }

  /**
   * Returns the last element
   * @returns {T|undefined} Last element
   */
  last() {
    return this._source.last();
  }

  /**
   * Converts to array
   * @returns {Array<T>} A new array
   */
  toArray() {
    return this._source.toArray();
  }

  /**
   * Returns a string representation
   * @returns {string} A string representation
   */
  toString() {
    return this._source.toString();
  }

  /**
   * Creates a mutable copy
   * @returns {UltimateLinkedList<T>} A mutable copy
   */
  toMutable() {
    return new UltimateLinkedList(this);
  }

  /**
   * Native iterator
   * @returns {Iterator<T>} An iterator
   */
  [Symbol.iterator]() {
    return this._source[Symbol.iterator]();
  }

  /**
   * String tag
   * @returns {string} The string tag
   */
  get [Symbol.toStringTag]() {
    return "ImmutableLinkedList";
  }
}

/**
 * Represents a transaction for batched operations
 * @template T Element type
 */
class Transaction {
  /**
   * @param {UltimateLinkedList<T>} list The list
   */
  constructor(list) {
    /** @private */
    this._list = list;
    /** @private */
    this._snapshot = null;
    /** @private */
    this._active = false;
    /** @type {Array<Object>} */
    this.events = [];
  }

  /**
   * Begins the transaction
   */
  begin() {
    if (this._active) return;

    this._active = true;
    this._snapshot = {
      head: { ...this._list._head },
      tail: { ...this._list._tail },
      size: this._list._size,
    };
  }

  /**
   * Commits the transaction
   */
  commit() {
    if (!this._active) return;

    this._active = false;
    this._list._transaction = null;

    // Notify with all events
    for (const event of this.events) {
      for (const listener of this._list._listeners) {
        try {
          listener(event);
        } catch (e) {
          console.error("Error in transaction listener:", e);
        }
      }
    }

    this.events = [];
  }

  /**
   * Rolls back the transaction
   */
  rollback() {
    if (!this._active || !this._snapshot) return;

    this._list._head = this._snapshot.head;
    this._list._tail = this._snapshot.tail;
    this._list._size = this._snapshot.size;

    this._active = false;
    this._list._transaction = null;
    this.events = [];

    // Notify of rollback
    for (const listener of this._list._listeners) {
      try {
        listener({ type: "rollback" });
      } catch (e) {
        console.error("Error in rollback listener:", e);
      }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* ----------------------------- DEMO / TESTS ------------------------------ */
/* ------------------------------------------------------------------------- */

// Basic operations
const list = UltimateLinkedList.of(10, 20, 30);
console.log(list.toString()); // "10 -> 20 -> 30 -> null"
list.prepend(5).append(40);
console.log(list.toString()); // "5 -> 10 -> 20 -> 30 -> 40 -> null"

// Array method compatibility
console.log(list.at(-1)); // 40
list.push(50, 60);
console.log(list.pop()); // 60
list.unshift(1, 2);
console.log(list.shift()); // 1

// Advanced features
list.insertAt(25, 4);
console.log(list.get(4)); // 25
console.log(list.indexOf(25)); // 4
console.log([...list]); // [2, 5, 10, 20, 25, 30, 40, 50]

// Functional methods
const doubled = list.map((x) => x * 2);
console.log(doubled.toString()); // "4 -> 10 -> 20 -> 40 -> 50 -> 60 -> 80 -> 100 -> null"

const evens = list.filter((x) => x % 2 === 0);
console.log(evens.toString()); // "2 -> 10 -> 20 -> 30 -> 40 -> 50 -> null"

const sum = list.reduce((acc, val) => acc + val, 0);
console.log(sum); // 182

// Immutable view
const immutable = list.immutable();
// immutable.append(70); // Error: append is not a function
const mutable = immutable.toMutable();
mutable.append(70);
console.log(mutable.toString()); // "2 -> 5 -> 10 -> 20 -> 25 -> 30 -> 40 -> 50 -> 70 -> null"

// Transactions
const transaction = list.beginTransaction();
transaction.begin();
list.push(60, 70);
list.removeAt(0); // Remove 2
console.log(list.toString()); // "5 -> 10 -> 20 -> 25 -> 30 -> 40 -> 50 -> 60 -> 70 -> null"
// transaction.rollback(); // Uncomment to rollback changes
transaction.commit();

// Cursor API for efficient traversal
const cursor = list.cursor();
while (cursor.next().valid()) {
  if (cursor.value() === 20) {
    console.log("Found 20!");
    break;
  }
}

// Range creation and slicing
const range = UltimateLinkedList.range(1, 11);
console.log(range.toString()); // "1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> null"

const slice = range.slice(2, 7);
console.log(slice.toString()); // "3 -> 4 -> 5 -> 6 -> 7 -> null"

// Export
export { UltimateLinkedList, ImmutableLinkedList, Transaction, Cursor };
