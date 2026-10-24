// N-10 toasts: one stack at the bottom of the viewport (inside the fullscreen element when there is one).
// The Toasts plugin switches them on and sets the duration and which topics are shown; while it is off
// showToast() does nothing and the existing feedback (badge, inline messages) is all there is.

import { h, icon } from '../utils/dom';
import { iconButton } from './ui';
import { tr } from '../utils/i18n';

export type ToastType = 'info' | 'success' | 'warning' | 'error';
/** Optional toasts the user can switch off one by one (N-10.5); errors have no topic. */
export type ToastTopic = 'resume' | 'cloud';

export interface ToastOptions {
  text: string;
  type?: ToastType;
  /** Same id replaces the earlier toast instead of stacking (N-10.1). */
  id?: string;
  topic?: ToastTopic;
  /** Overrides the plugin's duration (ms). */
  duration?: number;
}

interface ToastConfig {
  durationMs: number;
  topics: Record<ToastTopic, boolean>;
}

const MAX_TOASTS = 3;
const ICONS: Record<ToastType, string> = {
  info: 'circle-info',
  success: 'circle-check',
  warning: 'triangle-exclamation',
  error: 'circle-xmark'
};

let config: ToastConfig | null = null;
let root: HTMLElement | null = null;
let seq = 0;

interface Live {
  el: HTMLElement;
  timer: number;
  ms: number;
}
const live = new Map<string, Live>();

/** Called by the Toasts plugin; null switches toasts off and removes the ones on screen. */
export function configureToasts(next: ToastConfig | null): void {
  config = next;
  if (!next) clearToasts();
}

export function toastsEnabled(): boolean {
  return config !== null;
}

function host(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) || document.body;
}

function ensureRoot(): HTMLElement {
  if (!root) {
    root = h('div', { class: 'ysrp-ui ysrp-toasts' });
    // N-10.3: nothing typed or clicked on a toast reaches the player.
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'keyup', 'wheel', 'contextmenu']) {
      root.addEventListener(type, ev => ev.stopPropagation());
    }
    document.addEventListener('fullscreenchange', onFullscreen);
  }
  const target = host();
  if (root.parentElement !== target) target.appendChild(root);
  return root;
}

function onFullscreen(): void {
  if (root && root.childElementCount) host().appendChild(root);
}

function arm(id: string, item: Live): void {
  if (item.timer) clearTimeout(item.timer);
  item.timer = window.setTimeout(() => dismissToast(id), item.ms);
}

export function dismissToast(id: string): void {
  const item = live.get(id);
  if (!item) return;
  live.delete(id);
  if (item.timer) clearTimeout(item.timer);
  item.el.remove();
  if (root && !root.childElementCount) root.remove();
}

export function clearToasts(): void {
  for (const id of Array.from(live.keys())) dismissToast(id);
  if (root) {
    root.remove();
    document.removeEventListener('fullscreenchange', onFullscreen);
    root = null;
  }
}

/** N-10.1: returns the toast id, or '' when nothing was shown. */
export function showToast(opts: ToastOptions): string {
  if (!config) return '';
  if (opts.topic && !config.topics[opts.topic]) return '';
  const type = opts.type || 'info';
  const id = opts.id || `toast-${++seq}`;
  dismissToast(id);
  const close = iconButton('xmark', tr('Close', '关闭'), 'ysrp-toast-close', () => dismissToast(id));
  const el = h('div', {
    class: 'ysrp-toast',
    dataset: { type, toastId: id },
    attrs: { role: type === 'error' ? 'alert' : 'status', 'aria-live': type === 'error' ? 'assertive' : 'polite' }
  },
    h('span', { class: 'ysrp-toast-icon' }, icon(ICONS[type])),
    h('span', { class: 'ysrp-toast-text', text: opts.text }),
    close);
  const base = opts.duration ?? config.durationMs;
  const item: Live = { el, timer: 0, ms: type === 'error' ? base * 2 : base };
  // N-10.4: hovering pauses the countdown; leaving starts it again.
  el.addEventListener('mouseenter', () => { if (item.timer) clearTimeout(item.timer); item.timer = 0; });
  el.addEventListener('mouseleave', () => { if (live.get(id) === item) arm(id, item); });
  ensureRoot().appendChild(el);
  live.set(id, item);
  while (live.size > MAX_TOASTS) dismissToast(live.keys().next().value as string);
  arm(id, item);
  return id;
}
