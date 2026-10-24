// The Plugins page (N-5.5), the only page of the settings window: Favorites / All category strip,
// search + filter bar, Void++ plugin cards with star, pin, settings (opens N-5.6) and switch.

import {
  dependenciesOf, dependentsOf, hasFailed, hasVisibleSettings, isEnabled, listPlugins, pluginsChanged, setPluginEnabled, type PluginDef
} from '../../../api/plugins';
import { pinnedPlugins, setListed, starredPlugins } from '../../../api/pluginSettings';
import {
  card, cardMark, categoryStrip, emptyState, grid, iconButton, searchBar, setIcon, setIconButtonLabel, switchControl
} from '../../../api/ui';
import { h } from '../../../utils/dom';
import { pick, tr } from '../../../utils/i18n';
import { openPluginDialog } from './pluginDialog';

type Category = 'favorites' | 'all';
let lastCategory: Category = 'favorites';

export const pluginsPageInfo = (): string =>
  tr('Toggle features. Changes apply immediately. Click the sliders icon to configure.', '开启或关闭功能，立即生效。点击滑杆图标进行配置。');

/** Draws the page into the scroll area; returns a cleanup. */
export function renderPluginsPage(pane: HTMLElement): () => void {
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
    // N-13.4: dependency marks.
    const list = (ps: PluginDef[]) => ps.map(p => pick(p.displayName)).join(tr(', ', '、'));
    const deps = dependenciesOf(plugin);
    if (deps.length) marks.push(cardMark('puzzle-piece', tr('Requires: {names}', '依赖：{names}', { names: list(deps) }), 'is-deps-mark'));
    const users = dependentsOf(plugin);
    if (users.length) marks.push(cardMark('link', tr('Required by: {names}', '被以下插件依赖：{names}', { names: list(users) }), 'is-used-by-mark'));

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
    if (hasVisibleSettings(plugin)) controls.push(iconButton('sliders', tr('Settings', '设置'), 'ysrp-plugin-config', () => openPluginDialog(plugin)));
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
