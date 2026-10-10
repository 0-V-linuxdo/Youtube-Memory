// "Display" tab (N-5.7.4 layout; behaviour L-33..L-50): interface language as a settings row with a drop-down.

import type { TabDef } from '../../../api/tabs';
import { group, messageLine, selectControl, settingsRow } from '../../../api/ui';
import { h } from '../../../utils/dom';
import { detectBrowserLanguage, getLanguage, getPreference, languageName, setPreference, t, tr, type LanguagePref } from '../../../utils/i18n';

/** N-5.7.4 lists the options as "Auto / 中文 / English": each language is named in its own language. */
function optionLabel(code: LanguagePref): string {
  if (code === 'zh') return '中文';
  if (code === 'en') return 'English';
  return tr('Auto', '自动');
}

export function createDisplayTab(): TabDef {
  return {
    id: 'display',
    group: 'main',
    order: 30,
    icon: 'palette',
    label: () => t('language.tabLabel', tr('Display', '界面')),
    info: () => t('language.description'),
    render(pane) {
      const status = messageLine('ysrp-language-msg');
      const describe = () => tr('Current: {active}; browser: {browser}', '当前：{active}；浏览器：{browser}', {
        active: languageName(getLanguage()),
        browser: languageName(detectBrowserLanguage())
      });
      const options: LanguagePref[] = ['auto', 'zh', 'en'];
      const select = selectControl(options.map(code => ({ value: code, label: optionLabel(code) })), getPreference(), value => {
        // L-46: change language; the modal is rebuilt ~50 ms later in the new language.
        if (value === getPreference()) {
          status.set(tr('Already using this language.', '当前已使用该语言。'));
          return;
        }
        setPreference(value);
        row.descEl.textContent = describe();
        status.set(tr('Language preference updated.', '语言偏好已更新。'), 'success');
      }, { cls: 'ysrp-language-select', label: tr('Interface language', '界面语言') });
      const row = settingsRow({ title: tr('Interface language', '界面语言'), desc: describe(), control: select.el, below: [status.el] });
      pane.appendChild(h('div', { class: 'ysrp-groups' }, group(tr('Language', '语言'), row.el)));
    }
  };
}
