// "Before restore" hooks (N-2.4.6): optional plugins may delay the restore of a video session
// (at most 4 s) to pull remote data first.

export type BeforeRestoreHook = (videoId: string) => Promise<void> | void;

const hooks = new Set<BeforeRestoreHook>();

export function addBeforeRestoreHook(fn: BeforeRestoreHook): () => void {
  hooks.add(fn);
  return () => { hooks.delete(fn); };
}

/**
 * Run every hook for the video. Resolves when all settled or after the timeout.
 * `onWaiting` is called once when at least one hook returned a pending promise.
 */
export function runBeforeRestoreHooks(videoId: string, timeoutMs: number, onWaiting: () => void): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const fn of hooks) {
    try {
      const out = fn(videoId);
      if (out && typeof (out as Promise<void>).then === 'function') {
        pending.push((out as Promise<void>).catch(err => console.warn('[Video Memory] before-restore hook failed:', err)));
      }
    } catch (err) {
      console.warn('[Video Memory] before-restore hook failed:', err);
    }
  }
  if (!pending.length) return Promise.resolve();
  onWaiting();
  return new Promise(resolve => {
    const timer = window.setTimeout(resolve, timeoutMs);
    Promise.allSettled(pending).then(() => { clearTimeout(timer); resolve(); });
  });
}
