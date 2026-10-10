// "Display" tab: interface language (L-33..L-50). Fixes U-Q8/L-Q4: all option texts follow the UI language.

import type { TabDef } from '../../../api/tabs';
import { h } from '../../../utils/dom';
import { detectBrowserLanguage, getLanguage, getPreference, languageName, LANGUAGE_OPTIONS, setPreference, t, tr } from '../../../utils/i18n';
import { card, choiceGroup, infoRow, messageLine } from './ui';

export function createDisplayTab(): TabDef {
  return {
    id: 'display',
    group: 'main',
    order: 30,
    icon: 'globe',
    label: () => t('language.tabLabel', tr('Display', '界面')),
    render(pane) {
      const status = messageLine();
      const active = h('span', { class: 'ysrp-info-value' });
      const browser = h('span', { class: 'ysrp-info-value' });
      const refreshInfo = () => {
        active.textContent = languageName(getLanguage());
        browser.textContent = languageName(detectBrowserLanguage());
      };
      const group = choiceGroup('ysrp-language-preference', LANGUAGE_OPTIONS.map(code => ({
        value: code,
        tag: t(`language.badges.${code}`),
        label: t(`language.options.${code}`),
        hint: t(`language.optionHints.${code}`)
      })), getPreference(), value => {
        // L-46: change language; the modal is rebuilt ~50 ms later in the new language.
        if (value === getPreference()) {
          status.set(tr('Already using this language.', '当前已使用该语言。'));
          return;
        }
        setPreference(value);
        refreshInfo();
        status.set(tr('Language preference updated.', '语言偏好已更新。'), 'success');
      }, 'ysrp-language-options');
      refreshInfo();
      pane.appendChild(card({ icon: 'globe', title: tr('Interface Language', '界面语言'), desc: t('language.description') },
        group.el,
        h('div', { class: 'ysrp-info' },
          infoRow(tr('Active language', '当前语言'), active),
          infoRow(tr('Browser language', '浏览器语言'), browser)
        ),
        status.el
      ));
    }
  };
}
