// "Plugins" tab (N-5.4) and plugin settings sub dialog (N-5.5).

import {
  getSetting, isEnabled, listPlugins, pluginsChanged, setPluginEnabled, settingsContext, type PluginDef, type SettingDef
} from '../../../api/plugins';
import type { TabDef } from '../../../api/tabs';
import { clear, h, icon } from '../../../utils/dom';
import { pick, tr } from '../../../utils/i18n';
import { button, setButtonLabel, switchControl } from './ui';

type OpenDialog = (content: HTMLElement, onClose?: () => void) => () => void;

function visibleSettings(plugin: PluginDef): Array<[string, SettingDef]> {
  return Object.entries(plugin.settings || {}).filter(([, def]) => !def.hidden);
}

function settingControl(plugin: PluginDef, key: string, def: SettingDef): HTMLElement {
  const ctx = settingsContext(plugin);
  const value = getSetting(plugin, key);
  switch (def.type) {
    case 'switch':
      return switchControl(Boolean(value), on => ctx.settings.set(key, on), { dataset: { setting: key }, label: pick(def.label) }).el;
    case 'select': {
      const select = h('select', { class: 'ysrp-select', dataset: { setting: key } },
        (def.options || []).map(o => h('option', { value: o.value, text: pick(o.label), selected: String(value) === o.value })));
      select.addEventListener('change', () => ctx.settings.set(key, select.value));
      return select;
    }
    case 'number': {
      const input = h('input', { class: 'ysrp-input', type: 'number', value: String(value ?? ''), min: def.min, max: def.max, step: def.step, placeholder: def.placeholder, dataset: { setting: key } });
      input.addEventListener('change', () => {
        const n = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(n)) ctx.settings.set(key, n);
      });
      return input;
    }
    default: {
      const input = h('input', { class: 'ysrp-input', type: 'text', value: String(value ?? ''), placeholder: def.placeholder, dataset: { setting: key } });
      input.addEventListener('input', () => ctx.settings.set(key, input.value));
      return input;
    }
  }
}

function openPluginDialog(plugin: PluginDef, openDialog: OpenDialog): void {
  const list = h('div', { class: 'ysrp-setting-list' });
  const settings = visibleSettings(plugin);
  const renderList = () => {
    clear(list);
    for (const [key, def] of settings) {
      const stacked = def.type === 'text' || def.type === 'number';
      list.appendChild(h('div', { class: `ysrp-setting-row${stacked ? ' is-stacked' : ''}` },
        h('div', { class: 'ysrp-setting-text' },
          h('div', { class: 'ysrp-setting-label', text: pick(def.label) }),
          def.description ? h('div', { class: 'ysrp-setting-desc', text: pick(def.description) }) : null
        ),
        settingControl(plugin, key, def)
      ));
    }
  };
  renderList();

  let resetArmed = false;
  let resetTimer = 0;
  const resetLabel = tr('Reset', '重置');
  const reset = button(resetLabel, { small: true });
  reset.addEventListener('click', ev => {
    ev.preventDefault();
    if (!resetArmed) {
      // N-5.5.5: two clicks within 3 s.
      resetArmed = true;
      reset.classList.add('is-danger');
      setButtonLabel(reset, tr('Click again to reset', '再点一次确认重置'));
      resetTimer = window.setTimeout(() => {
        resetArmed = false;
        reset.classList.remove('is-danger');
        setButtonLabel(reset, resetLabel);
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    reset.classList.remove('is-danger');
    setButtonLabel(reset, resetLabel);
    settingsContext(plugin).settings.reset();
    renderList();
  });

  const closeBtn = h('button', { class: 'ysrp-close ysrp-dialog-close', type: 'button', title: tr('Close', '关闭'), attrs: { 'aria-label': tr('Close', '关闭') } }, icon('xmark'));
  const dialog = h('div', { class: 'ysrp-dialog', attrs: { role: 'dialog', 'aria-modal': 'true' } },
    closeBtn,
    h('div', { class: 'ysrp-dialog-title', text: pick(plugin.displayName) }),
    h('div', { class: 'ysrp-dialog-desc', text: pick(plugin.description) }),
    h('hr', { class: 'ysrp-sep' }),
    h('div', { class: 'ysrp-dialog-subtitle', text: tr('Authors', '作者') }),
    h('div', { class: 'ysrp-dialog-authors', text: plugin.authors.join(', ') }),
    h('div', { class: 'ysrp-dialog-subtitle', text: tr('Settings', '设置') }),
    settings.length ? list : h('div', { class: 'ysrp-empty', text: tr('No configurable settings.', '没有可配置的设置项。') }),
    settings.length ? h('div', { class: 'ysrp-dialog-footer' }, reset) : null
  );
  const close = openDialog(dialog, () => clearTimeout(resetTimer));
  closeBtn.addEventListener('click', ev => { ev.preventDefault(); close(); });
}

export function createPluginsTab(openDialog: OpenDialog): TabDef {
  return {
    id: 'plugins',
    group: 'plugins',
    order: 10,
    icon: 'puzzle-piece',
    label: () => tr('Plugins', '插件'),
    render(pane) {
      const plugins = listPlugins();
      const search = h('input', { class: 'ysrp-input ysrp-search', type: 'search', placeholder: tr('Search {n} plugins...', '搜索 {n} 个插件...', { n: plugins.length }) });
      const filter = h('select', { class: 'ysrp-select ysrp-filter' },
        h('option', { value: 'all', text: tr('All', '全部') }),
        h('option', { value: 'enabled', text: tr('Enabled', '已开启') }),
        h('option', { value: 'disabled', text: tr('Disabled', '已关闭') })
      );
      const normalGrid = h('div', { class: 'ysrp-plugin-grid' });
      const divider = h('hr', { class: 'ysrp-sep ysrp-core-sep' });
      const coreGrid = h('div', { class: 'ysrp-plugin-grid is-core' });
      const empty = h('div', { class: 'ysrp-empty', text: tr('No plugins match your search.', '没有符合条件的插件。') });
      const container = h('div', { class: 'ysrp-plugins' }, normalGrid, divider, coreGrid, empty);

      const cards = new Map<string, HTMLElement>();
      const build = () => {
        clear(normalGrid);
        clear(coreGrid);
        cards.clear();
        const byName = (a: PluginDef, b: PluginDef) => a.name.localeCompare(b.name);
        const ordered = [...plugins.filter(p => !p.required).sort(byName), ...plugins.filter(p => p.required).sort(byName)];
        for (const plugin of ordered) {
          const enabled = isEnabled(plugin);
          const toggle = switchControl(enabled, on => setPluginEnabled(plugin.name, on), {
            disabled: plugin.required, dataset: { plugin: plugin.name }, label: pick(plugin.displayName)
          });
          const config = visibleSettings(plugin).length
            ? h('button', { class: 'ysrp-ibtn ysrp-plugin-config', type: 'button', title: tr('Configure', '配置'), attrs: { 'aria-label': tr('Configure', '配置') } }, icon('sliders'))
            : null;
          config?.addEventListener('click', ev => { ev.preventDefault(); openPluginDialog(plugin, openDialog); });
          const name = h('span', { class: 'ysrp-plugin-name', text: pick(plugin.displayName), title: pick(plugin.displayName) });
          const cardEl = h('div', { class: `ysrp-plugin${plugin.required ? ' is-core' : ''}`, dataset: { plugin: plugin.name } },
            h('div', { class: 'ysrp-plugin-head' },
              h('span', { class: 'ysrp-card-icon' }, icon(plugin.icon)),
              name,
              plugin.required ? h('span', { class: 'ysrp-core-mark', title: tr('Core plugin, always on', '核心插件，始终开启') }, icon('circle-exclamation')) : null,
              h('span', { class: 'ysrp-plugin-tools' }, config, toggle.el)
            ),
            h('div', { class: 'ysrp-plugin-desc', text: pick(plugin.description) }),
            h('hr', { class: 'ysrp-sep' }),
            h('div', { class: 'ysrp-plugin-authors', text: plugin.authors.join(', ') })
          );
          cards.set(plugin.name, cardEl);
          (plugin.required ? coreGrid : normalGrid).appendChild(cardEl);
        }
        applyFilter();
      };
      const applyFilter = () => {
        const q = search.value.trim().toLowerCase();
        const mode = filter.value;
        let normalShown = 0;
        let coreShown = 0;
        for (const plugin of plugins) {
          const el = cards.get(plugin.name);
          if (!el) continue;
          const haystack = [plugin.name, pick(plugin.displayName), pick(plugin.description), ...plugin.authors].join('\n').toLowerCase();
          const enabled = isEnabled(plugin);
          const ok = (!q || haystack.includes(q)) && (mode === 'all' || (mode === 'enabled' ? enabled : !enabled));
          el.style.display = ok ? '' : 'none';
          if (ok) {
            if (plugin.required) coreShown++;
            else normalShown++;
          }
        }
        normalGrid.style.display = normalShown ? '' : 'none';
        coreGrid.style.display = coreShown ? '' : 'none';
        divider.style.display = normalShown && coreShown ? '' : 'none';
        empty.style.display = normalShown || coreShown ? 'none' : '';
      };
      search.addEventListener('input', applyFilter);
      filter.addEventListener('change', applyFilter);
      const off = pluginsChanged.on(build);
      build();
      pane.append(
        h('div', { class: 'ysrp-tab-intro', text: tr('Turn features on or off. Changes apply immediately. Click the sliders icon to configure.', '开启或关闭各项功能，立即生效。点滑杆图标进行配置。') }),
        h('div', { class: 'ysrp-searchbar' }, search, filter),
        container
      );
      return off;
    }
  };
}
