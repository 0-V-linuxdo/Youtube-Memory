// N-5.2 parts. Every settings tab, plugin tab and nested dialog is assembled only from these:
// card, card grid, icon button, button, switch, input / select / textarea, settings row, group,
// search + filter bar, category strip, info hint, empty state, field and result message.

import { h, icon, type Child } from '../utils/dom';
import { tr } from '../utils/i18n';

/* ----------------------------------------------------------------------------- buttons */

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export function button(label: string, opts: { variant?: ButtonVariant; small?: boolean; icon?: string; cls?: string; title?: string; onClick?: (ev: MouseEvent) => void } = {}): HTMLButtonElement {
  const btn = h('button', {
    class: `ysrp-btn is-${opts.variant || 'secondary'}${opts.small ? ' is-small' : ''}${opts.cls ? ` ${opts.cls}` : ''}`,
    type: 'button',
    title: opts.title
  }, opts.icon ? icon(opts.icon) : null, h('span', { class: 'ysrp-btn-label', text: label }));
  if (opts.onClick) btn.addEventListener('click', ev => { ev.preventDefault(); opts.onClick?.(ev); });
  return btn;
}

export function setButtonLabel(btn: HTMLElement, label: string): void {
  const span = btn.querySelector('.ysrp-btn-label');
  if (span) span.textContent = label;
}

/** N-5.2.3: 24 px square, monochrome icon, aria-label plus a same-named tooltip. */
export function iconButton(iconName: string, label: string, cls = '', onClick?: (ev: MouseEvent) => void): HTMLButtonElement {
  const btn = h('button', { class: `ysrp-ibtn${cls ? ` ${cls}` : ''}`, type: 'button' }, icon(iconName));
  setIconButtonLabel(btn, label);
  if (onClick) btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); onClick(ev); });
  return btn;
}

export function setIconButtonLabel(btn: HTMLElement, label: string): void {
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

export function setIcon(btn: HTMLElement, iconName: string, variant: 'solid' | 'regular' = 'solid'): void {
  const i = btn.querySelector('i');
  if (i) i.className = `fa-${variant} fa-${iconName}`;
}

/* ----------------------------------------------------------------------------- switch */

export interface SwitchHandle {
  el: HTMLButtonElement;
  set(on: boolean): void;
  value(): boolean;
}

/** N-5.2.5: role="switch", aria-checked mirrors the state. */
export function switchControl(checked: boolean, onChange: (on: boolean) => void, opts: { disabled?: boolean; dataset?: Record<string, string>; label?: string; cls?: string } = {}): SwitchHandle {
  const el = h('button', {
    class: `ysrp-switch${opts.cls ? ` ${opts.cls}` : ''}`,
    type: 'button',
    disabled: Boolean(opts.disabled),
    dataset: opts.dataset,
    attrs: { role: 'switch', 'aria-label': opts.label }
  }, h('span', { class: 'ysrp-switch-knob' }));
  let on = checked;
  const set = (next: boolean) => {
    on = next;
    el.setAttribute('aria-checked', String(next));
    el.classList.toggle('is-on', next);
  };
  set(checked);
  el.addEventListener('click', ev => {
    ev.preventDefault();
    if (el.disabled) return;
    set(!on);
    onChange(on);
  });
  return { el, set, value: () => on };
}

/* ----------------------------------------------------------------------------- inputs */

export function textInput(opts: { value?: string; placeholder?: string; type?: string; cls?: string; field?: string } = {}): HTMLInputElement {
  return h('input', {
    class: `ysrp-input${opts.cls ? ` ${opts.cls}` : ''}`,
    type: opts.type || 'text',
    value: opts.value ?? '',
    placeholder: opts.placeholder,
    autocomplete: opts.type === 'password' ? 'new-password' : 'off',
    spellcheck: false,
    dataset: opts.field ? { field: opts.field } : undefined
  });
}

export function textArea(opts: { value?: string; placeholder?: string; cls?: string; readOnly?: boolean } = {}): HTMLTextAreaElement {
  return h('textarea', {
    class: `ysrp-textarea${opts.cls ? ` ${opts.cls}` : ''}`,
    value: opts.value ?? '',
    placeholder: opts.placeholder,
    readOnly: Boolean(opts.readOnly),
    spellcheck: false
  });
}

export interface SelectOption { value: string; label: string; disabled?: boolean }

export interface SelectHandle {
  el: HTMLElement;
  select: HTMLSelectElement;
  value(): string;
  set(value: string): void;
}

/** N-5.2.6 drop-down with a chevron on the right. */
export function selectControl(options: SelectOption[], value: string, onChange: (value: string) => void, opts: { cls?: string; label?: string; dataset?: Record<string, string> } = {}): SelectHandle {
  const select = h('select', {
    class: `ysrp-select${opts.cls ? ` ${opts.cls}` : ''}`,
    dataset: opts.dataset,
    attrs: { 'aria-label': opts.label }
  }, options.map(o => h('option', { value: o.value, text: o.label, disabled: Boolean(o.disabled), selected: o.value === value })));
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  const el = h('span', { class: 'ysrp-select-wrap' }, select, h('span', { class: 'ysrp-select-arrow' }, icon('chevron-down')));
  return { el, select, value: () => select.value, set: v => { select.value = v; } };
}

/** Password input plus a tertiary "Show / Hide" button (N-5.7.2, N-5.7.3). */
export function secretInput(input: HTMLInputElement): HTMLElement {
  input.type = 'password';
  const toggle = button(tr('Show', '显示'), { variant: 'tertiary', small: true, cls: 'ysrp-secret-toggle' });
  toggle.addEventListener('click', ev => {
    ev.preventDefault();
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    setButtonLabel(toggle, reveal ? tr('Hide', '隐藏') : tr('Show', '显示'));
  });
  return h('div', { class: 'ysrp-secret' }, input, toggle);
}

/* ----------------------------------------------------------------------------- card */

export interface CardOptions {
  icon: string;
  title: string;
  titleTip?: string;
  marks?: Child[];
  controls?: Child[];
  desc?: string;
  footer?: string;
  cls?: string;
  dataset?: Record<string, string>;
}

export interface CardHandle {
  el: HTMLElement;
  iconEl: HTMLElement;
  titleEl: HTMLElement;
  marksEl: HTMLElement;
  controlsEl: HTMLElement;
  descEl: HTMLElement;
  footerEl: HTMLElement;
  setIcon(name: string): void;
  setTitle(text: string, tip?: string): void;
  setDesc(text: string): void;
  setFooter(text: string): void;
}

const NBSP = ' ';

/** N-5.2.1 Void++ card: icon block, title, marks, controls; two-line description; separator; footer. */
export function card(opts: CardOptions): CardHandle {
  const iconEl = h('span', { class: 'ysrp-card-icon' }, icon(opts.icon));
  const titleEl = h('span', { class: 'ysrp-card-title' });
  const marksEl = h('span', { class: 'ysrp-card-marks' }, opts.marks || []);
  const controlsEl = h('span', { class: 'ysrp-card-controls' }, opts.controls || []);
  const descEl = h('div', { class: 'ysrp-card-desc' });
  const footerEl = h('div', { class: 'ysrp-card-footer' });
  const el = h('div', { class: `ysrp-card${opts.cls ? ` ${opts.cls}` : ''}`, dataset: opts.dataset },
    h('div', { class: 'ysrp-card-body' },
      h('div', { class: 'ysrp-card-top' },
        h('div', { class: 'ysrp-card-lead' }, iconEl, titleEl, marksEl),
        controlsEl
      ),
      descEl
    ),
    h('div', { class: 'ysrp-card-sep' }),
    footerEl
  );
  const handle: CardHandle = {
    el, iconEl, titleEl, marksEl, controlsEl, descEl, footerEl,
    setIcon(name) { iconEl.replaceChildren(icon(name)); },
    setTitle(text, tip) { titleEl.textContent = text; titleEl.title = tip ?? text; },
    setDesc(text) { descEl.textContent = text; descEl.title = text; },
    setFooter(text) { footerEl.textContent = text || NBSP; }
  };
  handle.setTitle(opts.title, opts.titleTip);
  handle.setDesc(opts.desc || '');
  handle.setFooter(opts.footer || '');
  return handle;
}

/** Small monochrome mark next to a card title, with a tooltip. */
export function cardMark(iconName: string, tip: string, cls = ''): HTMLElement {
  return h('span', { class: `ysrp-card-mark${cls ? ` ${cls}` : ''}`, title: tip, attrs: { 'aria-label': tip, role: 'img' } }, icon(iconName));
}

export function grid(cls = '', ...children: Child[]): HTMLElement {
  return h('div', { class: `ysrp-grid${cls ? ` ${cls}` : ''}` }, children);
}

/* ----------------------------------------------------------------------------- settings rows */

export interface RowHandle {
  el: HTMLElement;
  descEl: HTMLElement;
  below: HTMLElement;
}

/** N-5.2.7: title + description on the left, control on the right, full-width content below. */
export function settingsRow(opts: { title: string; desc?: string; control?: Child; below?: Child[]; cls?: string; dataset?: Record<string, string> }): RowHandle {
  const descEl = h('div', { class: 'ysrp-srow-desc', text: opts.desc || '' });
  if (!opts.desc) descEl.style.display = 'none';
  const below = h('div', { class: 'ysrp-srow-below' }, opts.below || []);
  if (!opts.below || !opts.below.length) below.style.display = 'none';
  const el = h('div', { class: `ysrp-srow${opts.cls ? ` ${opts.cls}` : ''}`, dataset: opts.dataset },
    h('div', { class: 'ysrp-srow-main' },
      h('div', { class: 'ysrp-srow-text' }, h('div', { class: 'ysrp-srow-title', text: opts.title }), descEl),
      opts.control ? h('div', { class: 'ysrp-srow-control' }, opts.control) : null
    ),
    below
  );
  return { el, descEl, below };
}

export function setRowDesc(row: RowHandle, text: string): void {
  row.descEl.textContent = text;
  row.descEl.style.display = text ? '' : 'none';
}

/** N-5.2.8 */
export function group(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'ysrp-group' }, h('div', { class: 'ysrp-group-title', text: title }), children);
}

export function actions(...children: Child[]): HTMLElement {
  return h('div', { class: 'ysrp-actions' }, children);
}

/* ----------------------------------------------------------------------------- search bar, categories */

export interface SearchBarHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  filter: SelectHandle;
  query(): string;
  setPlaceholder(text: string): void;
}

/** N-5.2.9 */
export function searchBar(placeholder: string, filters: SelectOption[], onChange: () => void): SearchBarHandle {
  const input = h('input', { class: 'ysrp-input ysrp-search', type: 'search', placeholder, spellcheck: false, autocomplete: 'off' });
  input.addEventListener('input', onChange);
  const filter = selectControl(filters, filters[0]?.value || 'all', onChange, { cls: 'ysrp-filter', label: tr('Filter', '筛选') });
  return {
    el: h('div', { class: 'ysrp-searchbar' }, input, filter.el),
    input,
    filter,
    query: () => input.value.trim().toLowerCase(),
    setPlaceholder: text => { input.placeholder = text; }
  };
}

export interface CategoryHandle {
  el: HTMLElement;
  value(): string;
  set(id: string): void;
}

/** N-5.2.10 */
export function categoryStrip(cats: Array<{ id: string; label: string }>, active: string, onSelect: (id: string) => void): CategoryHandle {
  let current = active;
  const buttons = cats.map(c => {
    const btn = button(c.label, { variant: 'tertiary', small: true, cls: 'ysrp-cat' });
    btn.dataset.cat = c.id;
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      if (current === c.id) return;
      set(c.id);
      onSelect(c.id);
    });
    return btn;
  });
  const set = (id: string) => {
    current = id;
    for (const b of buttons) {
      const on = b.dataset.cat === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    }
  };
  set(active);
  return { el: h('div', { class: 'ysrp-cats', attrs: { role: 'tablist' } }, buttons), value: () => current, set };
}

/* ----------------------------------------------------------------------------- misc */

/** N-5.2.14 */
export function infoHint(text: string): HTMLElement {
  return h('span', { class: 'ysrp-info-hint', title: text, attrs: { 'aria-label': text, role: 'img', tabindex: '0' } }, icon('circle-info'));
}

/** N-5.2.15 */
export function emptyState(text: string, cls = ''): HTMLElement {
  return h('p', { class: `ysrp-empty${cls ? ` ${cls}` : ''}`, text });
}

/** N-5.2.12 */
export function field(label: string, ...content: Child[]): HTMLElement {
  return h('div', { class: 'ysrp-field' }, h('div', { class: 'ysrp-field-label', text: label }), content);
}

export interface MessageLine {
  el: HTMLElement;
  set(text: string, tone?: 'neutral' | 'success' | 'error'): void;
}

/** N-5.7.5: 12 px; success / error coloured, everything else secondary; hidden when empty. */
export function messageLine(cls = ''): MessageLine {
  const el = h('div', { class: `ysrp-msg${cls ? ` ${cls}` : ''}`, attrs: { role: 'status', 'aria-live': 'polite' } });
  return {
    el,
    set(text, tone = 'neutral') {
      const value = (text || '').trim();
      el.textContent = value;
      el.classList.toggle('is-visible', Boolean(value));
      el.classList.toggle('is-success', Boolean(value) && tone === 'success');
      el.classList.toggle('is-error', Boolean(value) && tone === 'error');
    }
  };
}

/** Clipboard write with a legacy fallback (fixes R-Q15). */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    if (!legacyCopy(text)) throw err;
    return;
  }
  if (!legacyCopy(text)) throw new Error(tr('Clipboard is not available', '剪贴板不可用'));
}

function legacyCopy(text: string): boolean {
  try {
    const area = h('textarea', { value: text, style: 'position:fixed;top:-1000px;left:-1000px;opacity:0' });
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
