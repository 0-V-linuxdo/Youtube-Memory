// "Plugins" tab (N-5.5): Favorites / All category strip, search + filter bar, Void++ plugin cards
// with star, pin, settings and switch; plugin settings dialog with a confirmed reset (N-5.6).

import { confirmDialog, openDialog } from '../../../api/dialogs';
import {
  getSetting, hasFailed, isEnabled, listPlugins, pluginsChanged, setPluginEnabled, settingsContext, type PluginDef, type SettingDef
} from '../../../api/plugins';
import { pinnedPlugins, setListed, starredPlugins } from '../../../api/pluginSettings';
import type { TabDef } from '../../../api/tabs';
import {
  button, card, cardMark, categoryStrip, emptyState, field, grid, iconButton, searchBar, selectControl, setIcon, setIconButtonLabel,
  settingsRow, switchControl, textInput
} from '../../../api/ui';
import { h } from '../../../utils/dom';
import { pick, tr } from '../../../utils/i18n';

function visibleSettings(plugin: PluginDef): Array<[string, SettingDef]> {
  return Object.entries(plugin.settings || {}).filter(([, def]) => !def.hidden);
}

/** N-5.6: switches and drop-downs on the right, text and number inputs below (numbers 96 px wide). */
function settingRow(plugin: PluginDef, key: string, def: SettingDef): HTMLElement {
  const ctx = settingsContext(plugin);
  const value = getSetting(plugin, key);
  const title = pick(def.label);
  const desc = def.description ? pick(def.description) : '';
  switch (def.type) {
    case 'switch':
      return settingsRow({ title, desc, control: switchControl(Boolean(value), on => ctx.settings.set(key, on), { dataset: { setting: key }, label: title }).el }).el;
    case 'select':
      return settingsRow({
        title, desc,
        control: selectControl((def.options || []).map(o => ({ value: o.value, label: pick(o.label) })), String(value), v => ctx.settings.set(key, v), { dataset: { setting: key }, label: title }).el
      }).el;
    case 'number': {
      const input = textInput({ type: 'number', value: String(value ?? ''), placeholder: def.placeholder, cls: 'is-number' });
      input.dataset.setting = key;
      if (def.min !== undefined) input.min = String(def.min);
      if (def.max !== undefined) input.max = String(def.max);
      if (def.step !== undefined) input.step = String(def.step);
      input.addEventListener('change', () => {
        const n = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(n)) ctx.settings.set(key, n);
      });
      return settingsRow({ title, desc, below: [input] }).el;
    }
    default: {
      const input = textInput({ value: String(value ?? ''), placeholder: def.placeholder });
      input.dataset.setting = key;
      input.addEventListener('input', () => ctx.settings.set(key, input.value));
      return settingsRow({ title, desc, below: [input] }).el;
    }
  }
}

function openPluginDialog(plugin: PluginDef): void {
  const settings = visibleSettings(plugin);
  const list = h('div', { class: 'ysrp-plugin-settings' });
  const renderList = () => list.replaceChildren(...settings.map(([key, def]) => settingRow(plugin, key, def)));
  renderList();
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
    settingsContext(plugin).settings.reset();
    renderList();
  });
  openDialog({
    title: pick(plugin.displayName),
    desc: pick(plugin.description),
    size: 'md',
    cls: 'ysrp-plugin-dialog',
    content: [
      h('hr', { class: 'ysrp-sep' }),
      field(tr('Authors', '作者'), h('p', { class: 'ysrp-field-value ysrp-plugin-authors', text: plugin.authors.join(', ') })),
      field(tr('Settings', '设置'), settings.length ? list : h('p', { class: 'ysrp-field-value', text: tr('No configurable settings.', '没有可配置的设置项。') }))
    ],
    footer: settings.length ? [reset] : []
  });
}

type Category = 'favorites' | 'all';
let lastCategory: Category = 'favorites';

export function createPluginsTab(): TabDef {
  return {
    id: 'plugins',
    group: 'plugins',
    order: 10,
    icon: 'plug',
    label: () => tr('Plugins', '插件'),
    info: () => tr('Toggle features. Changes apply immediately. Click the sliders icon to configure.', '开启或关闭功能，立即生效。点击滑杆图标进行配置。'),
    render(pane) {
      const plugins = listPlugins();
      const cats = categoryStrip([
        { id: 'favorites', label: tr('Favorites', '收藏') },
        { id: 'all', label: tr('All', '全部') }
      ], lastCategory, id => { lastCategory = id as Category; build(); });
      const bar = searchBar('', [
        { value: 'all', label: tr('All', '全部') },
        { value: 'enabled', label: tr('Enabled', '已开启') },
        { value: 'disabled', label: tr('Disabled', '已关闭') }
      ], () => applyFilter());
      const mainGrid = grid('ysrp-plugin-grid');
      const divider = h('hr', { class: 'ysrp-sep ysrp-core-sep' });
      const coreGrid = grid('ysrp-plugin-grid is-core');
      const empty = emptyState('', 'ysrp-plugins-empty');
      const container = h('div', { class: 'ysrp-pane-stack ysrp-plugins' }, mainGrid, divider, coreGrid, empty);
      const cards = new Map<string, HTMLElement>();

      const makeCard = (plugin: PluginDef, starred: boolean, pinned: boolean): HTMLElement => {
        const name = pick(plugin.displayName);
        const marks: HTMLElement[] = [];
        if (plugin.required) marks.push(cardMark('circle-exclamation', tr('Core plugin, always on', '核心插件，始终开启'), 'is-core-mark'));
        const failed = isEnabled(plugin) && hasFailed(plugin.name);
        if (failed) marks.push(cardMark('triangle-exclamation', tr('This plugin failed to start', '插件启动失败'), 'is-danger'));

        const star = iconButton('star', '', `is-star${starred ? ' is-active' : ''}`, () => {
          setListed('starred', plugin.name, !starred);
          build();
        });
        setIcon(star, 'star', starred ? 'solid' : 'regular');
        setIconButtonLabel(star, starred ? tr('Remove from favorites', '取消收藏') : tr('Add to favorites', '收藏'));
        const controls: HTMLElement[] = [star];
        if (!plugin.required) {
          const pin = iconButton('thumbtack', pinned ? tr('Unpin', '取消置顶') : tr('Pin to top', '置顶'), `is-pin${pinned ? ' is-active' : ''}`, () => {
            setListed('pinned', plugin.name, !pinned);
            build();
          });
          controls.push(pin);
        }
        if (visibleSettings(plugin).length) controls.push(iconButton('sliders', tr('Settings', '设置'), 'ysrp-plugin-config', () => openPluginDialog(plugin)));
        controls.push(switchControl(isEnabled(plugin), on => setPluginEnabled(plugin.name, on), {
          disabled: plugin.required, dataset: { plugin: plugin.name }, label: name
        }).el);

        return card({
          icon: plugin.icon,
          title: name,
          marks,
          controls,
          desc: pick(plugin.description),
          footer: plugin.authors.join(', '),
          cls: `ysrp-plugin${plugin.required ? ' is-core' : ''}${failed ? ' is-failed' : ''}${starred ? ' is-starred' : ''}${pinned ? ' is-pinned' : ''}`,
          dataset: { plugin: plugin.name }
        }).el;
      };

      const build = () => {
        mainGrid.replaceChildren();
        coreGrid.replaceChildren();
        cards.clear();
        const starred = starredPlugins();
        const pinned = pinnedPlugins();
        const byName = (a: PluginDef, b: PluginDef) => a.name.localeCompare(b.name);
        const pinRank = (p: PluginDef) => { const i = pinned.indexOf(p.name); return i < 0 ? Infinity : i; };
        const pinnedFirst = (a: PluginDef, b: PluginDef) => {
          const ra = pinRank(a);
          const rb = pinRank(b);
          if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
          return byName(a, b);
        };
        const favorites = lastCategory === 'favorites';
        const inCategory = favorites ? plugins.filter(p => starred.includes(p.name)) : plugins;
        bar.setPlaceholder(tr('Search {n} plugins...', '搜索 {n} 个插件...', { n: inCategory.length }));
        if (favorites) {
          // N-5.5.2: only the starred plugins, not grouped.
          for (const p of inCategory.slice().sort(pinnedFirst)) {
            const el = makeCard(p, true, pinned.includes(p.name));
            cards.set(p.name, el);
            mainGrid.appendChild(el);
          }
        } else {
          for (const p of plugins.filter(x => !x.required).sort(pinnedFirst)) {
            const el = makeCard(p, starred.includes(p.name), pinned.includes(p.name));
            cards.set(p.name, el);
            mainGrid.appendChild(el);
          }
          for (const p of plugins.filter(x => x.required).sort(byName)) {
            const el = makeCard(p, starred.includes(p.name), false);
            cards.set(p.name, el);
            coreGrid.appendChild(el);
          }
        }
        applyFilter();
      };

      const applyFilter = () => {
        const q = bar.query();
        const mode = bar.filter.value();
        let mainShown = 0;
        let coreShown = 0;
        for (const plugin of plugins) {
          const el = cards.get(plugin.name);
          if (!el) continue;
          const haystack = [plugin.name, pick(plugin.displayName), pick(plugin.description), ...plugin.authors].join('\n').toLowerCase();
          const enabled = isEnabled(plugin);
          const ok = (!q || haystack.includes(q)) && (mode === 'all' || (mode === 'enabled' ? enabled : !enabled));
          el.style.display = ok ? '' : 'none';
          if (ok) {
            if (el.parentElement === coreGrid) coreShown++;
            else mainShown++;
          }
        }
        mainGrid.style.display = mainShown ? '' : 'none';
        coreGrid.style.display = coreShown ? '' : 'none';
        divider.style.display = mainShown && coreShown ? '' : 'none';
        const none = !mainShown && !coreShown;
        empty.textContent = lastCategory === 'favorites' && !cards.size
          ? tr('No favorites yet. Star a plugin to see it here.', '还没有收藏。点星标收藏插件。')
          : tr('No plugins match your search.', '没有符合条件的插件。');
        empty.style.display = none ? '' : 'none';
      };

      const off = pluginsChanged.on(build);
      build();
      pane.appendChild(h('div', { class: 'ysrp-pane-stack' }, cats.el, bar.el, container));
      return off;
    }
  };
}
