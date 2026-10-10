// N-5.2.11 nested dialog and N-5.2.13 confirm dialog. Dialogs stack above the settings modal on a
// transparent layer (the modal is not dimmed); Esc or a click outside closes only the top dialog.

import { h, pageHost, type Child } from '../utils/dom';
import { tr } from '../utils/i18n';
import { Emitter } from './events';
import { button, iconButton } from './ui';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogOptions {
  title: string;
  desc?: string;
  size?: DialogSize;
  content?: Child[];
  footer?: Child[];
  cls?: string;
  /** Called once when the dialog closes, whatever closed it. */
  onClose?: () => void;
}

export interface DialogHandle {
  layer: HTMLElement;
  el: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close(): void;
  isOpen(): boolean;
}

const stack: DialogHandle[] = [];
export const dialogsChanged = new Emitter<void>();

const STOP_KEYS = ['keydown', 'keyup', 'keypress'];

// Esc closes the top dialog first (N-5.3.3). Window capture runs before any document listener,
// so the settings modal never sees an Esc that a dialog consumed.
function onEscape(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape' || !stack.length) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  ev.stopPropagation();
  stack[stack.length - 1].close();
}

export function openDialog(opts: DialogOptions): DialogHandle {
  const body = h('div', { class: 'ysrp-dialog-body' }, opts.content || []);
  const footer = h('div', { class: 'ysrp-dialog-footer' }, opts.footer || []);
  if (!opts.footer || !opts.footer.length) footer.style.display = 'none';
  const closeBtn = iconButton('xmark', tr('Close', '关闭'), 'ysrp-dialog-close');
  const el = h('div', {
    class: `ysrp-dialog is-${opts.size || 'md'}${opts.cls ? ` ${opts.cls}` : ''}`,
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title }
  },
    closeBtn,
    h('div', { class: 'ysrp-dialog-head' },
      h('div', { class: 'ysrp-dialog-title', text: opts.title }),
      opts.desc ? h('div', { class: 'ysrp-dialog-desc', text: opts.desc }) : null
    ),
    body,
    footer
  );
  const layer = h('div', { class: 'ysrp-ui ysrp-dialog-layer' }, el);
  let open = true;
  const handle: DialogHandle = {
    layer, el, body, footer,
    isOpen: () => open,
    close() {
      if (!open) return;
      open = false;
      layer.remove();
      const idx = stack.indexOf(handle);
      if (idx >= 0) stack.splice(idx, 1);
      if (!stack.length) window.removeEventListener('keydown', onEscape, true);
      try { opts.onClose?.(); } catch (err) { console.error('[Video Memory] dialog onClose failed:', err); }
      dialogsChanged.emit();
    }
  };
  closeBtn.addEventListener('click', () => handle.close());
  // A click outside the dialog closes it, and never reaches the settings backdrop or the page.
  layer.addEventListener('click', ev => {
    ev.stopPropagation();
    if (ev.target === layer) handle.close();
  });
  layer.addEventListener('pointerdown', ev => ev.stopPropagation());
  // Keys typed in a dialog must not trigger YouTube shortcuts.
  for (const type of STOP_KEYS) layer.addEventListener(type, ev => ev.stopPropagation());
  if (!stack.length) window.addEventListener('keydown', onEscape, true);
  stack.push(handle);
  pageHost().appendChild(layer);
  dialogsChanged.emit();
  return handle;
}

export interface ConfirmOptions {
  title: string;
  desc: string;
  confirmLabel: string;
  danger?: boolean;
}

/** N-5.2.13: small dialog, "Cancel" (secondary) and a primary or danger confirm button. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    let answer = false;
    const cancel = button(tr('Cancel', '取消'), { variant: 'secondary', cls: 'ysrp-confirm-cancel' });
    const ok = button(opts.confirmLabel, { variant: opts.danger ? 'danger' : 'primary', cls: 'ysrp-confirm-ok' });
    const dlg = openDialog({
      title: opts.title,
      desc: opts.desc,
      size: 'sm',
      cls: 'is-confirm',
      footer: [cancel, ok],
      onClose: () => resolve(answer)
    });
    cancel.addEventListener('click', () => dlg.close());
    ok.addEventListener('click', () => { answer = true; dlg.close(); });
    requestAnimationFrame(() => { if (dlg.isOpen()) ok.focus({ preventScroll: true }); });
  });
}

export function hasDialogs(): boolean {
  return stack.length > 0;
}

export function closeAllDialogs(): void {
  while (stack.length) stack[stack.length - 1].close();
}

/** Layers that may scroll while the modal's scroll lock is active. */
export function dialogLayers(): HTMLElement[] {
  return stack.map(d => d.layer);
}
