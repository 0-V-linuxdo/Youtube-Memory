// Player badge state ("last saved" text). The PlayerBadge plugin renders it; the engine and others update it.
// The state is kept here so a rebuilt badge immediately shows the latest text (fixes L-Q14).

import { tr } from '../utils/i18n';
import { formatTime } from '../utils/text';
import { Emitter } from './events';

export type BadgeState =
  | { kind: 'loading' }
  | { kind: 'time'; seconds: number }
  | { kind: 'status'; en: string; zh: string; params?: Record<string, unknown>; tooltip?: string; error?: boolean };

let state: BadgeState = { kind: 'loading' };
let flashUntil = 0;
let flashTimer = 0;
let pendingTime: number | null = null;

export const badgeChanged = new Emitter<void>();
/** Fired by the PlayerBadge plugin whenever a (new) badge container is attached to the page. */
export const badgeMounted = new Emitter<HTMLElement>();

export function badgeState(): BadgeState { return state; }

export function badgeText(): string {
  switch (state.kind) {
    case 'loading': return tr('Loading...', '加载中...');
    case 'time': return formatTime(state.seconds);
    default: return tr(state.en, state.zh, state.params);
  }
}

export function badgeTooltip(): string {
  return state.kind === 'status' && state.tooltip ? state.tooltip : '';
}

function set(next: BadgeState): void {
  state = next;
  badgeChanged.emit();
}

/** Show the last saved position. Deferred while a transient message is showing. */
export function showSavedTime(seconds: number): void {
  if (Date.now() < flashUntil) {
    pendingTime = seconds;
    return;
  }
  set({ kind: 'time', seconds });
}

/** Persistent status text until replaced. */
export function showStatus(en: string, zh: string, params?: Record<string, unknown>, extra: { tooltip?: string; error?: boolean } = {}): void {
  flashUntil = 0;
  set({ kind: 'status', en, zh, params, ...extra });
}

/** Transient status text; saved times arriving meanwhile are shown afterwards. */
export function flashStatus(en: string, zh: string, params: Record<string, unknown> | undefined, ms: number): void {
  flashUntil = Date.now() + ms;
  pendingTime = null;
  set({ kind: 'status', en, zh, params });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashUntil = 0;
    if (pendingTime !== null) {
      set({ kind: 'time', seconds: pendingTime });
      pendingTime = null;
    }
  }, ms);
}

/** Reset to the neutral state (e.g. a new video session started). */
export function resetBadge(): void {
  flashUntil = 0;
  pendingTime = null;
  set({ kind: 'loading' });
}

let currentContainer: HTMLElement | null = null;
export function setBadgeContainer(el: HTMLElement | null): void {
  currentContainer = el;
  if (el) badgeMounted.emit(el);
}
export function badgeContainer(): HTMLElement | null {
  return currentContainer && currentContainer.isConnected ? currentContainer : null;
}
