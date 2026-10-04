// Calculation tape with multi-level undo/redo.
//
// Each step is one committed operation: { before, after, expr, result, op }.
// `before`/`after` are calculator snapshots, so undo shows exactly what was
// on screen before the key (including a half-typed number) and redo replays
// the result. Typing a number is not a step; it is "dirty" state on top of
// the last position, and the first undo just discards it.

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.clear(null);
  }

  clear(current) {
    this.steps = [];
    this.i = 0;           // number of applied steps
    this.anchor = current; // state at the current position
    this.dirty = false;    // entry edited since the last position
  }

  record(before, after, expr, result, op = null) {
    this.steps.length = this.i; // drop the redo tail
    this.steps.push({ before, after, expr, result, op });
    if (this.steps.length > this.limit) this.steps.shift();
    this.i = this.steps.length;
    this.anchor = after;
    this.dirty = false;
  }

  // Updates the last step in place (e.g. repeated D/R presses).
  amendLast(after, expr, result) {
    const last = this.steps[this.i - 1];
    if (!last) return;
    Object.assign(last, { after, expr, result });
    this.steps.length = this.i;
    this.anchor = after;
    this.dirty = false;
  }

  touch() {
    this.dirty = true;
  }

  canUndo() {
    return (this.dirty && this.anchor !== null) || this.i > 0;
  }

  canRedo() {
    return this.i < this.steps.length;
  }

  // Returns the snapshot to restore, or null.
  undo() {
    if (this.dirty && this.anchor !== null) {
      this.dirty = false;
      return this.anchor;
    }
    if (this.i === 0) return null;
    this.i--;
    return this.moveTo(this.steps[this.i].before);
  }

  redo() {
    if (this.i >= this.steps.length) return null;
    this.i++;
    return this.moveTo(this.steps[this.i - 1].after);
  }

  // Jump so that n steps are applied (0 = before the first step).
  jump(n) {
    if (n < 0 || n > this.steps.length || this.steps.length === 0) return null;
    this.i = n;
    return this.moveTo(n === 0 ? this.steps[0].before : this.steps[n - 1].after);
  }

  moveTo(snap) {
    this.anchor = snap;
    this.dirty = false;
    return snap;
  }

  toJSON() {
    return { steps: this.steps, i: this.i };
  }

  loadJSON(o, current) {
    this.clear(current);
    if (!o || !Array.isArray(o.steps)) return false;
    const ok = (st) => st && st.before && st.after && typeof st.expr === 'string';
    this.steps = o.steps.filter(ok).slice(-this.limit);
    this.i = Number.isInteger(o.i) ? Math.max(0, Math.min(o.i, this.steps.length)) : this.steps.length;
    return true;
  }
}
