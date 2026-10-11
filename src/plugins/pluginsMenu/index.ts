// Plugins menu plugin (N-4.6, N-5.9.4): chooses which plugins the gear's plugin menu lists. One custom panel,
// "Plugins in the menu": every plugin with its icon, name and a switch. The choice is stored as `menuPlugins`
// ({name: boolean}) in this plugin's YSRP_Plugins entry; a plugin never chosen is listed when it has visible
// settings. With this plugin off the menu lists every enabled plugin that has visible settings.

import { chosenInMenu, MENU_PLUGIN, setInMenu } from '../../api/pluginMenu';
import { definePlugin, isEnabled, listPlugins, pluginsChanged } from '../../api/plugins';
import { switchControl } from '../../api/ui';
import { h, icon } from '../../utils/dom';
import { getLanguage, pick, tr } from '../../utils/i18n';

function renderChoices(el: HTMLElement): () => void {
  const list = h('div', { class: 'ysrp-menu-choices' });
  const build = () => {
    const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
    const plugins = listPlugins().sort((a, b) => pick(a.displayName).localeCompare(pick(b.displayName), lang));
    list.replaceChildren(...plugins.map(plugin => {
      const name = pick(plugin.displayName);
      const sw = switchControl(chosenInMenu(plugin), on => setInMenu(plugin.name, on), {
        dataset: { menuPlugin: plugin.name },
        label: name
      });
      const enabled = isEnabled(plugin);
      return h('div', { class: `ysrp-srow ysrp-menu-choice${enabled ? '' : ' is-off'}`, dataset: { plugin: plugin.name } },
        h('div', { class: 'ysrp-srow-main' },
          h('div', { class: 'ysrp-menu-choice-lead' },
            h('span', { class: 'ysrp-menu-choice-icon' }, icon(plugin.icon)),
            h('div', { class: 'ysrp-srow-text' },
              h('div', { class: 'ysrp-srow-title', text: name }),
              // N-5.9.2: only enabled plugins are listed, so say why a chosen one may be missing.
              enabled ? null : h('div', { class: 'ysrp-srow-desc', text: tr('Off: not shown in the menu until turned on.', '已关闭：开启后才会出现在菜单里。') }))),
          h('div', { class: 'ysrp-srow-control' }, sw.el)));
    }));
  };
  build();
  el.appendChild(list);
  return pluginsChanged.on(build);
}

export default definePlugin({
  name: MENU_PLUGIN,
  displayName: { en: 'Plugins menu', zh: '插件菜单' },
  description: {
    en: 'Choose which plugins the menu on the gear button lists.',
    zh: '选择齿轮按钮的插件菜单里列出哪些插件。'
  },
  authors: ['0_V'],
  icon: 'list-check',
  enabledByDefault: true,
  settings: {
    menuPlugins: {
      type: 'custom',
      label: { en: 'Plugins in the menu', zh: '菜单中的插件' },
      description: {
        en: 'Plugins that are switched on here appear in the gear menu and open their settings directly.',
        zh: '这里打开的插件会出现在齿轮菜单里，可直接打开其设置。'
      },
      render: renderChoices
    }
  },
  start() {
    // The gear menu reads the choice itself (api/pluginMenu); nothing to set up.
  }
});
