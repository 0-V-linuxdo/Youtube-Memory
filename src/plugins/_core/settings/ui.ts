// Shared settings widgets (N-5.3): cards, pill buttons, icon buttons, switches, radio cards, fields, status lines.

import { h, icon, type Child } from '../../../utils/dom';

export function card(opts: { icon: string; title: string; desc?: string; cls?: string }, ...children: Child[]): HTMLElement {
  return h('div', { class: `ysrp-card${opts.cls ? ` ${opts.cls}` : ''}` },
    h('div', { class: 'ysrp-card-head' },
      h('span', { class: 'ysrp-card-icon' }, icon(opts.icon)),
      h('span', { class: 'ysrp-card-title', text: opts.title })
    ),
    opts.desc ? h('div', { class: 'ysrp-card-desc', text: opts.desc }) : null,
    ...children
  );
}

export function button(label: string, opts: { icon?: string; small?: boolean; title?: string; cls?: string; onClick?: (ev: MouseEvent) => void } = {}): HTMLButtonElement {
  const btn = h('button', {
    class: `ysrp-btn${opts.small ? ' is-small' : ''}${opts.cls ? ` ${opts.cls}` : ''}`,
    type: 'button',
    title: opts.title
  }, opts.icon ? icon(opts.icon) : null, h('span', { class: 'ysrp-btn-label', text: label }));
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  return btn;
}

export function setButtonLabel(btn: HTMLElement, label: string): void {
  const span = btn.querySelector('.ysrp-btn-label');
  if (span) span.textContent = label;
}

export function iconButton(iconName: string, title: string, cls: string, onClick?: (ev: MouseEvent) => void): HTMLButtonElement {
  const btn = h('button', { class: `ysrp-ibtn ${cls}`.trim(), type: 'button', title, attrs: { 'aria-label': title } }, icon(iconName));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export function setIcon(btn: HTMLElement, iconName: string): void {
  const i = btn.querySelector('i');
  if (i) i.className = `fa-solid fa-${iconName}`;
}

export interface SwitchHandle {
  el: HTMLButtonElement;
  set(on: boolean): void;
}

export function switchControl(checked: boolean, onChange: (on: boolean) => void, opts: { disabled?: boolean; dataset?: Record<string, string>; label?: string } = {}): SwitchHandle {
  const el = h('button', {
    class: 'ysrp-switch',
    type: 'button',
    disabled: Boolean(opts.disabled),
    dataset: opts.dataset,
    attrs: { role: 'switch', 'aria-checked': String(checked), 'aria-label': opts.label }
  }, h('span', { class: 'ysrp-switch-knob' }));
  const set = (on: boolean) => {
    el.setAttribute('aria-checked', String(on));
    el.classList.toggle('is-on', on);
  };
  set(checked);
  el.addEventListener('click', ev => {
    ev.preventDefault();
    if (el.disabled) return;
    const next = el.getAttribute('aria-checked') !== 'true';
    set(next);
    onChange(next);
  });
  return { el, set };
}

export interface ChoiceOption {
  value: string;
  tag: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface ChoiceGroup {
  el: HTMLElement;
  value(): string;
  set(value: string): void;
}

/** Radio cards (N-5.3.7): a label per option with a hidden native radio. */
export function choiceGroup(name: string, options: ChoiceOption[], selected: string, onSelect: (value: string) => void, cls = ''): ChoiceGroup {
  let current = selected;
  const items = options.map(opt => {
    const radio = h('input', { type: 'radio', name, value: opt.value, checked: opt.value === selected, disabled: Boolean(opt.disabled), class: 'ysrp-choice-radio' });
    const label = h('label', { class: `ysrp-choice${opt.disabled ? ' is-disabled' : ''}`, dataset: { value: opt.value } },
      radio,
      h('span', { class: 'ysrp-choice-tag', text: opt.tag }),
      h('span', { class: 'ysrp-choice-text' },
        h('span', { class: 'ysrp-choice-label', text: opt.label }),
        opt.hint ? h('span', { class: 'ysrp-choice-hint', text: opt.hint }) : null
      )
    );
    label.addEventListener('click', ev => {
      ev.preventDefault();
      if (opt.disabled || current === opt.value) return;
      set(opt.value);
      onSelect(opt.value);
    });
    return { opt, radio, label };
  });
  const set = (value: string) => {
    current = value;
    for (const item of items) {
      const on = item.opt.value === value;
      item.radio.checked = on;
      item.label.classList.toggle('is-selected', on);
    }
  };
  set(selected);
  return { el: h('div', { class: `ysrp-choices${cls ? ` ${cls}` : ''}`, attrs: { role: 'radiogroup' } }, items.map(i => i.label)), value: () => current, set };
}

export interface MessageLine {
  el: HTMLElement;
  set(text: string, tone?: 'neutral' | 'success' | 'error'): void;
}

/** T-12/T-13 status line: hidden when empty, coloured only for success / error (N-5.3.1). */
export function messageLine(): MessageLine {
  const el = h('div', { class: 'ysrp-msg', attrs: { role: 'status', 'aria-live': 'polite' } });
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

export function field(label: string, control: Child, hint?: string): HTMLElement {
  return h('label', { class: 'ysrp-field' },
    h('span', { class: 'ysrp-field-label', text: label }),
    control,
    hint ? h('span', { class: 'ysrp-field-hint', text: hint }) : null
  );
}

export function infoRow(label: string, value: HTMLElement): HTMLElement {
  return h('div', { class: 'ysrp-info-row' }, h('span', { class: 'ysrp-info-label', text: label }), value);
}

/** A password input with a show/hide button (L-15, L-16). */
export function secretInput(input: HTMLInputElement, labels: { show: string; hide: string }): HTMLElement {
  input.type = 'password';
  const toggle = button(labels.show, { small: true, cls: 'ysrp-secret-toggle' });
  toggle.addEventListener('click', ev => {
    ev.preventDefault();
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    setButtonLabel(toggle, reveal ? labels.hide : labels.show);
  });
  return h('div', { class: 'ysrp-secret' }, input, toggle);
}
