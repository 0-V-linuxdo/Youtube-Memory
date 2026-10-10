// 💾 badge toggle (N-6): a button before the badge that shows / hides it.

import { badgeContainer, badgeMounted } from '../../api/badge';
import { definePlugin } from '../../api/plugins';
import { CLS_BADGE_CONTAINER, EVT_LANGUAGE } from '../../utils/constants';
import { h, swallow } from '../../utils/dom';
import { tr } from '../../utils/i18n';
import css from './style.css';

const HIDDEN_CLASS = 'ysrp-badge-hidden';

export default definePlugin({
  name: 'BadgeToggle',
  displayName: { en: 'Badge toggle', zh: '徽标开关' },
  description: {
    en: 'Adds a 💾 button in front of the badge to show or hide it with one click.',
    zh: '在徽标前添加 💾 按钮，一键显示或隐藏徽标。'
  },
  authors: ['0_V'],
  icon: 'floppy-disk',
  enabledByDefault: true,
  settings: {
    startHidden: {
      type: 'switch',
      default: true,
      label: { en: 'Hide the badge when a page opens', zh: '打开页面时先隐藏徽标' }
    }
  },
  start(ctx) {
    ctx.addStyle(css);
    let hidden = ctx.settings.get<boolean>('startHidden') !== false;

    const button = h('button', { class: 'ysrp-badge-toggle', type: 'button', text: '💾' });
    const refreshTitle = () => {
      const tip = hidden ? tr('Show the badge', '显示徽标') : tr('Hide the badge', '隐藏徽标');
      button.title = tip;
      button.setAttribute('aria-label', tip);
      button.setAttribute('aria-pressed', String(!hidden));
    };
    // N-6.3: same interception as the gear button; nothing reaches the player.
    button.addEventListener('pointerdown', ev => {
      swallow(ev);
      hidden = !hidden;
      apply();
    }, true);
    button.addEventListener('click', swallow, true);
    button.addEventListener('touchstart', swallow, { capture: true, passive: false });

    const container = () => badgeContainer() || (document.querySelector(`.${CLS_BADGE_CONTAINER}`) as HTMLElement | null);
    const apply = () => {
      const badge = container();
      if (!badge) return;
      if (button.nextElementSibling !== badge) badge.before(button);
      badge.classList.toggle(HIDDEN_CLASS, hidden);
      refreshTitle();
    };

    ctx.onDispose(badgeMounted.on(() => apply()));
    // A rebuilt badge or a removed button is put back in place (N-6.1: always exactly one).
    ctx.observe(document.documentElement, { childList: true, subtree: true }, () => {
      const badge = container();
      if (badge && (button.nextElementSibling !== badge || badge.classList.contains(HIDDEN_CLASS) !== hidden)) apply();
    });
    ctx.listen(document, EVT_LANGUAGE, refreshTitle);
    ctx.onDispose(() => {
      // N-6.4: plugin off -> button removed, badge visible.
      button.remove();
      for (const el of Array.from(document.querySelectorAll(`.${HIDDEN_CLASS}`))) el.classList.remove(HIDDEN_CLASS);
    });
    apply();
  }
});
