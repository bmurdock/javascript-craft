# JavaScript Craft

Small JavaScript data-structure experiments with executable tests.

## Data Structures

### `LinkedList`

`data-structures/robust-lightweight-singly-linked-list.js` exports a compact
sentinel-based singly linked list.

Use it when you want a small implementation with predictable linked-list
behavior:

- O(1) `append`, `prepend`, `first`, `last`, `clear`, and list-to-list
  `concat`.
- `concat(other)` steals the donor list's nodes and leaves the donor empty.
- Indexed reads, insertion, and removal are O(n) and require integer indices.
- Negative indices are supported; `insertAt` uses insertion-position semantics,
  so `-1` appends. Invalid or out-of-bounds reads and removals return
  `undefined`; `insertAt` throws `RangeError`.
- `remove` and `removeAt` return the removed value or `undefined`, so they are
  not fluent mutators.

### `UltimateLinkedList`

`data-structures/iterator-based-linked-list.js` exports a richer doubly linked
list with sentinels, cursors, Array-like helpers, observable events, snapshots,
and transactions.

Use it when you want a larger API surface:

- O(1) single-value endpoint operations (`append`, `prepend`, `pop`, `shift`)
  and O(1) list-to-list `concat` where possible. Variadic `push` and
  `unshift` are O(k) for k inserted values.
- List-to-list `concat` and `splitAt(index)` transfer node ownership. `concat`
  is rejected while either list has an active transaction; `splitAt` is
  rejected while its source list has one.
- Indexed access traverses from the closer end:
  O(min(index, length - index)).
- Indexed operations require integer indices. Invalid reads and removals return
  `undefined`, `set` returns `false`, and `insertAt` and `splitAt` throw
  `RangeError`. `slice` separately coerces bounds like `Array.prototype.slice`.
- Cursors fail fast after structural changes; `reset()` rebinds a cursor to the
  list's current structure.
- `immutable()` returns a snapshot, not a live view.
- Transactions snapshot values and roll back in O(n).
- `slice()` materializes a new list. `splitAt(index)` relinks nodes into a new
  tail list.
- `range(start, end, step)` accepts finite numbers and rejects zero or
  non-advancing steps.

## Testing

```bash
npm test
```
