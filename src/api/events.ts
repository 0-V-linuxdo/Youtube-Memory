// Minimal typed event emitter used by the api modules.

export class Emitter<T> {
  private handlers = new Set<(value: T) => void>();

  on(fn: (value: T) => void): () => void {
    this.handlers.add(fn);
    return () => { this.handlers.delete(fn); };
  }

  emit(value: T): void {
    for (const fn of Array.from(this.handlers)) {
      try { fn(value); } catch (err) { console.error('[Video Memory] listener failed:', err); }
    }
  }
}

/** Dispatch a CustomEvent on document, ignoring failures. */
export function dispatch(name: string, detail: unknown): void {
  try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
}
