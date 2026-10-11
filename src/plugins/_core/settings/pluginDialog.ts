// N-5.6 plugin settings dialog: the only entry point to every feature's UI. Medium by default, large when
// the plugin asks for it. Authors field, then the settings: rows for switch / text / number / select
// (N-5.6.3) and full-width custom panels (N-5.6.4). Reset (confirmed) skips custom panels (N-5.6.2).

import { confirmDialog, openDialog, type DialogHandle } from '../../../api/dialogs';
import {
  getSetting, isResettable, settingsContext, settingText, visibleSettings, type PluginDef, type SettingDef
} from '../../../api/plugins';
import { button, field, secretInput, selectControl, settingsRow, switchControl, textInput } from '../../../api/ui';
import { h } from '../../../utils/dom';
import { pick, tr } from '../../../utils/i18n';

const TEXT_DEBOUNCE_MS = 250;

let current: { plugin: string; dialog: DialogHandle } | null = null;

/** Name of the plugin whose settings dialog is open (used to reopen it after a language rebuild). */
export function currentPluginDialog(): string | null {
  return current && current.dialog.isOpen() ? current.plugin : null;
}

/** Text and number inputs save 250 ms after typing stops (L-19) and immediately on change. */
function bindInput(input: HTMLInputElement, commit: () => void): () => void {
  let timer = 0;
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    commit();
  };
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => { timer = 0; commit(); }, TEXT_DEBOUNCE_MS);
  });
  input.addEventListener('change', () => { if (timer) clearTimeout(timer); timer = 0; commit(); });
  return flush;
}

function settingRow(plugin: PluginDef, key: string, def: SettingDef, flushers: Array<() => void>): HTMLElement {
  const ctx = settingsContext(plugin);
  const value = getSetting(plugin, key);
  const title = settingText(def.label) || key;
  const desc = settingText(def.description);
  const dataset = { setting: key };
  switch (def.type) {
    case 'switch':
      return settingsRow({ title, desc, dataset, control: switchControl(Boolean(value), on => ctx.settings.set(key, on), { dataset, label: title }).el }).el;
    case 'select':
      return settingsRow({
        title, desc, dataset,
        control: selectControl((def.options || []).map(o => ({ value: o.value, label: settingText(o.label) })), String(value), v => ctx.settings.set(key, v), { dataset, label: title }).el
      }).el;
    case 'number': {
      const input = textInput({ type: 'number', value: String(value ?? ''), placeholder: def.placeholder, cls: 'is-number' });
      input.dataset.setting = key;
      if (def.min !== undefined) input.min = String(def.min);
      if (def.max !== undefined) input.max = String(def.max);
      if (def.step !== undefined) input.step = String(def.step);
      flushers.push(bindInput(input, () => {
        const n = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(n)) ctx.settings.set(key, n);
      }));
      return settingsRow({ title, desc, dataset, below: [input] }).el;
    }
    default: {
      const input = textInput({ type: def.secret ? 'password' : 'text', value: String(value ?? ''), placeholder: def.placeholder });
      input.dataset.setting = key;
      flushers.push(bindInput(input, () => ctx.settings.set(key, input.value)));
      return settingsRow({ title, desc, dataset, below: [def.secret ? secretInput(input) : input] }).el;
    }
  }
}

/** N-5.6.4: full-width block with an optional title and description, drawn by the plugin. */
function customPanel(key: string, def: SettingDef, cleanups: Array<() => void>): HTMLElement {
  const title = settingText(def.label);
  const desc = settingText(def.description);
  const content = h('div', { class: 'ysrp-custom-body' });
  const block = h('div', { class: 'ysrp-custom', dataset: { setting: key } },
    title || desc ? h('div', { class: 'ysrp-srow-text' },
      title ? h('div', { class: 'ysrp-srow-title', text: title }) : null,
      desc ? h('div', { class: 'ysrp-srow-desc', text: desc }) : null) : null,
    content
  );
  try {
    const cleanup = def.render?.(content);
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  } catch (err) {
    console.error(`[Video Memory] Custom setting ${key} failed to render:`, err);
  }
  return block;
}

export function openPluginDialog(plugin: PluginDef): DialogHandle {
  if (current && current.dialog.isOpen()) current.dialog.close();
  const settings = visibleSettings(plugin);
  const cleanups: Array<() => void> = [];
  let flushers: Array<() => void> = [];
  const slots = settings.map(([key, def]) => ({ key, def, el: h('div', { class: 'ysrp-setting-slot' }) }));
  const renderRows = () => {
    for (const fn of flushers.splice(0)) fn();
    flushers = [];
    for (const slot of slots) {
      if (slot.def.type === 'custom') continue;
      slot.el.replaceChildren(settingRow(plugin, slot.key, slot.def, flushers));
    }
  };
  for (const slot of slots) {
    if (slot.def.type === 'custom') slot.el.appendChild(customPanel(slot.key, slot.def, cleanups));
  }
  renderRows();

  const list = h('div', { class: 'ysrp-plugin-settings' }, slots.map(s => s.el));
  const footer: HTMLElement[] = [];
  if (settings.some(([, def]) => isResettable(def))) {
    const reset = button(tr('Reset', '重置'), { variant: 'secondary', cls: 'ysrp-plugin-reset' });
    reset.addEventListener('click', async ev => {
      ev.preventDefault();
      const ok = await confirmDialog({
        title: tr('Reset settings', '重置设置'),
        desc: tr("Reset this plugin's settings to defaults? This cannot be undone.", '把这个插件的设置恢复为默认值？此操作无法撤销。'),
        confirmLabel: tr('Reset', '重置'),
        danger: true
      });
      if (!ok) return;
      flushers = [];
      settingsContext(plugin).settings.reset();
      renderRows();
    });
    footer.push(reset);
  }
  const dialog = openDialog({
    title: pick(plugin.displayName),
    desc: pick(plugin.description),
    size: plugin.dialogSize === 'lg' ? 'lg' : 'md',
    cls: 'ysrp-plugin-dialog',
    dataset: { plugin: plugin.name },
    content: [
      h('hr', { class: 'ysrp-sep' }),
      field(tr('Authors', '作者'), h('p', { class: 'ysrp-field-value ysrp-plugin-authors', text: plugin.authors.join(', ') })),
      h('div', { class: 'ysrp-field ysrp-settings-field' },
        h('div', { class: 'ysrp-field-label', text: tr('Settings', '设置') }),
        settings.length ? list : h('p', { class: 'ysrp-field-value', text: tr('No configurable settings.', '没有可配置的设置项。') }))
    ],
    footer,
    onClose: () => {
      for (const fn of flushers.splice(0)) {
        try { fn(); } catch { /* ignore */ }
      }
      for (const fn of cleanups.splice(0)) {
        try { fn(); } catch (err) { console.error('[Video Memory] custom setting cleanup failed:', err); }
      }
      if (current && current.dialog === dialog) current = null;
    }
  });
  current = { plugin: plugin.name, dialog };
  return dialog;
}
