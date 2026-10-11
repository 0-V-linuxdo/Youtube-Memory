// Settings window core plugin (N-4.6): the window shell with its only page, Plugins (N-5.3, N-5.5), the
// plugin settings dialogs (N-5.6) and the gear's plugin menu (N-5.9). Its own settings (N-5.7.4): the
// interface language (mapped onto YSRP_LanguagePreference) and "show the plugin menu on the gear button".

import { dialogLayers } from '../../../api/dialogs';
import { menuChoiceChanged } from '../../../api/pluginMenu';
import { definePlugin, pluginsChanged } from '../../../api/plugins';
import { setSettingsWindow } from '../../../api/settingsWindow';
import { EVT_LANGUAGE } from '../../../utils/constants';
import { detectBrowserLanguage, getLanguage, getPreference, languageName, setPreference, tr } from '../../../utils/i18n';
import { PluginMenu } from './menu';
import { SettingsModal } from './shell';
import css from './style.css';

export default definePlugin({
  name: 'Settings',
  displayName: { en: 'Settings window', zh: '设置窗口' },
  description: {
    en: 'The settings window with the Plugins page, the plugin settings dialogs and the plugin menu on the gear button.',
    zh: '设置窗口与插件页、插件设置子弹窗，以及齿轮按钮的插件菜单。'
  },
  authors: ['0_V'],
  icon: 'gear',
  required: true,
  settings: {
    language: {
      type: 'select',
      default: 'auto',
      label: { en: 'Interface language', zh: '界面语言' },
      // N-5.7.4: "Current: <active>; browser: <browser>", evaluated each time the dialog is drawn.
      description: () => tr('Current: {active}; browser: {browser}', '当前：{active}；浏览器：{browser}', {
        active: languageName(getLanguage()),
        browser: languageName(detectBrowserLanguage())
      }),
      // Each language is named in its own language (N-5.7.4 "自动 / 中文 / English").
      options: [
        { value: 'auto', label: { en: 'Auto', zh: '自动' } },
        { value: 'zh', label: () => '中文' },
        { value: 'en', label: () => 'English' }
      ],
      // N-5.7.6: the value stays in YSRP_LanguagePreference.
      get: () => getPreference(),
      set: value => { setPreference(value); }
    },
    showMenu: {
      type: 'switch',
      default: true,
      label: { en: 'Show the plugin menu on the gear button', zh: '点齿轮先显示插件菜单' },
      description: { en: 'When off, the gear button opens the settings window directly.', zh: '关闭后，点齿轮直接打开设置窗口。' }
    }
  },
  start(ctx) {
    ctx.addStyle(css);
    const modal = new SettingsModal();
    modal.start();
    const menu = new PluginMenu({
      openPlugin: plugin => modal.openPlugin(plugin.name),
      openAll: () => modal.open()
    });
    ctx.onDispose(() => menu.close());
    ctx.onDispose(() => modal.destroy());
    // N-4.4: a plugin turned off disappears from the menu at once; the menu is simply closed and rebuilt next time.
    ctx.onDispose(pluginsChanged.on(() => menu.close()));
    ctx.onDispose(menuChoiceChanged.on(() => menu.close()));
    ctx.listen(document, EVT_LANGUAGE, () => menu.close());

    setSettingsWindow({
      open: () => { menu.close(); modal.open(); },
      openPlugin: name => { menu.close(); modal.openPlugin(name); },
      close: () => modal.close(),
      isOpen: () => modal.isOpen(),
      gear: anchor => {
        // N-5.9.1: the menu first (default), or straight to the window when the switch is off.
        if (!modal.isOpen() && !dialogLayers().length && ctx.settings.get<boolean>('showMenu')) {
          menu.toggle(anchor);
          return;
        }
        menu.close();
        modal.open();
      }
    });
    ctx.onDispose(() => setSettingsWindow(null));
  }
});
