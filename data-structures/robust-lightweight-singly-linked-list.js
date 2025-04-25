/* ---------------------------------------------------------------------------
   LinkedList – ultra-robust, fully-iterable, sentinel-based singly list
   © 2025 Brian Murdock – MIT-licensed
   ---------------------------------------------------------------------------
   Highlights
   ==========
   • Sentinel head → no branch-heavy “if (!head) …” paths.
   • Tail pointer → O(1) append/concatenate.
   • Private fields (TC39 #) + JSDoc generics  → type-safe, encapsulated.
   • [Symbol.iterator], .map, .reduce, .at (±index), .reverse, .clear.
   • O(1)  concat(list)  (steals nodes from `list`, leaving it empty).
   • Negative indices accepted everywhere, mirroring Array semantics.
   • Length exposed as read-only getter `.length` (no method/property clash).
   • Constant-time  first / last  access,  zero-allocation toArray().
   ------------------------------------------------------------------------- */

/** @template T */
class LinkedList /** @implements {Iterable<T>} */ {
  /* ——— PRIVATE STATE ——— */
  #head /** @type {{value: T|undefined, next: object|null}} */ = {
    value: undefined,
    next: null,
  };
  #tail = this.#head; //  tail sentinel (points to last *real* node or head)
  #size = 0;

  /* ——— CONSTRUCTION ——— */
  /**  Build from any iterable or nothing.  */
  constructor(iterable) {
    if (iterable == null) return;
    for (const value of iterable) this.append(value);
  }

  /* ——— CORE ACCESSORS ——— */
  /** Number of elements – consistent O(1) getter (no name clash!). */
  get length() {
    return this.#size;
  }

  /** True ⇢ list holds zero elements. */
  isEmpty() {
    return this.#size === 0;
  }

  /** First element’s value or *undefined* when empty (O(1)). */
  first() {
    return this.#head.next?.value;
  }

  /** Last element’s value or *undefined* when empty (O(1)). */
  last() {
    return this.#tail === this.#head ? undefined : this.#tail.value;
  }

  /* ——— MUTATORS ——— */
  /** Append value in O(1). */
  append(value) {
    const node = { value, next: null };
    this.#tail.next = node;
    this.#tail = node;
    this.#size++;
    return this;
  }

  /** Prepend value in O(1). */
  prepend(value) {
    const node = { value, next: this.#head.next };
    this.#head.next = node;
    if (this.#tail === this.#head) this.#tail = node; // first real node
    this.#size++;
    return this;
  }

  /** Insert at `index` (negatives allowed; same rules as `Array.prototype.at`). */
  insertAt(value, index = this.#size) {
    if (index < 0) index = this.#size + index + 1;
    if (index < 0 || index > this.#size)
      throw new RangeError("Index out of bounds");
    if (index === this.#size) return this.append(value); // fast-path
    const { prev } = this.#seek(index);
    prev.next = { value, next: prev.next };
    this.#size++;
    return this;
  }

  /** Remove and return element at `index`; returns *undefined* if OOB. */
  removeAt(index) {
    const nodePair = this.#seek(index);
    if (!nodePair) return undefined;
    const { prev, curr } = nodePair;
    prev.next = curr.next;
    if (curr === this.#tail) this.#tail = prev;
    this.#size--;
    return curr.value;
  }

  /** Remove first node whose value satisfies the comparator (strict === by default). */
  remove(value, cmp = (a, b) => a === b) {
    let prev = this.#head,
      curr = prev.next;
    while (curr) {
      if (cmp(curr.value, value)) {
        prev.next = curr.next;
        if (curr === this.#tail) this.#tail = prev;
        this.#size--;
        return curr.value;
      }
      prev = curr;
      curr = curr.next;
    }
    return undefined;
  }

  /** Empty the list in O(1) (all nodes become garbage). */
  clear() {
    this.#head.next = null;
    this.#tail = this.#head;
    this.#size = 0;
    return this;
  }

  /** Reverse the list *in-place* (O(n), no extra memory). */
  reverse() {
    if (this.#size < 2) return this;
    let prev = null,
      curr = this.#head.next;
    this.#tail = curr;
    while (curr) {
      const nxt = curr.next;
      curr.next = prev;
      prev = curr;
      curr = nxt;
    }
    this.#head.next = prev;
    return this;
  }

  /** Concatenate `other` onto *this* in **O(1)**; empties `other`. */
  concat(other) {
    if (!(other instanceof LinkedList))
      throw new TypeError("Argument must be LinkedList");
    if (other.#size === 0) return this;
    this.#tail.next = other.#head.next;
    this.#tail = other.#tail;
    this.#size += other.#size;
    other.clear(); // leave donor empty to avoid accidental misuse
    return this;
  }

  /* ——— QUERIES ——— */
  /** Node (+prev) lookup helper — returns `null` if index OOB. */
  #seek(index) {
    if (index < 0) index = this.#size + index; // negative support
    if (index < 0 || index >= this.#size) return null;
    let prev = this.#head,
      curr = prev.next,
      i = 0;
    while (i++ < index) {
      prev = curr;
      curr = curr.next;
    }
    return { prev, curr };
  }

  /** Node object at index or `undefined`. */
  getNodeAt(index) {
    return this.#seek(index)?.curr;
  }

  /** Value at index (undefined if OOB). */
  get(index) {
    return this.getNodeAt(index)?.value;
  }

  /** Array-style `.at()` (negative accepted). */
  at(index) {
    return this.get(index);
  }

  /** First index whose value satisfies comparator; –1 if not found. */
  indexOf(value, cmp = (a, b) => a === b) {
    let idx = 0,
      curr = this.#head.next;
    while (curr) {
      if (cmp(curr.value, value)) return idx;
      curr = curr.next;
      idx++;
    }
    return -1;
  }

  /* ——— FUNCTIONAL GOODIES ——— */
  /** Iterate values (native `for … of` support). */
  *[Symbol.iterator]() {
    for (let n = this.#head.next; n; n = n.next) yield n.value;
  }

  /** Build *new* LinkedList by mapping each element. */
  map(fn) {
    const out = new LinkedList();
    let i = 0;
    for (const v of this) out.append(fn(v, i++));
    return out;
  }

  /** Reduce over elements (mirrors Array.reduce). */
  reduce(fn, init) {
    let acc,
      i = 0,
      curr = this.#head.next;
    if (arguments.length > 1) {
      acc = init;
    } else {
      if (!curr)
        throw new TypeError("Reduce of empty list with no initial value");
      acc = curr.value;
      curr = curr.next;
      i = 1;
    }
    for (; curr; curr = curr.next) acc = fn(acc, curr.value, i++);
    return acc;
  }

  /* ——— UTILITIES ——— */
  /** Lossless array conversion (pre-allocated). */
  toArray() {
    const a = new Array(this.#size);
    let i = 0;
    for (const v of this) a[i++] = v;
    return a;
  }

  /** Human-readable string (`value -> … -> null`). */
  toString() {
    return this.toArray().join(" -> ") + " -> null";
  }

  get [Symbol.toStringTag]() {
    return "LinkedList";
  }

  /* ——— STATIC HELPERS ——— */
  /** Build from iterable. */
  static from(iterable) {
    return new LinkedList(iterable);
  }

  /** Build from argument list. */
  static of(...values) {
    return new LinkedList(values);
  }
}

/* ------------------------------------------------------------------------- */
/* ----------------------------- DEMO / TESTS ------------------------------ */
/* ------------------------------------------------------------------------- */

// fluent chain
const list = LinkedList.of(10, 20).prepend(0).append(30);
console.log(String(list)); // 0 -> 10 -> 20 -> 30 -> null

// negative indexing & at()
console.log(list.at(-1)); // 30
console.log(list.at(-4)); // 0

// insert, remove, reverse
list.insertAt(15, 3).removeAt(-2).reverse();
console.log([...list]); // [30, 20, 15, 10, 0]

// O(1) concatenation
const a = LinkedList.of("a", "b");
const b = LinkedList.of("c", "d", "e");
a.concat(b);
console.log(a.toString()); // a -> b -> c -> d -> e -> null
console.log(b.length, b.isEmpty()); // 0 true  (emptied donor)

export { LinkedList };
