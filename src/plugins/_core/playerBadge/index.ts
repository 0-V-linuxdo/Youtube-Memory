// Player badge (S-71, S-86..S-89, L-56..L-61, L-74..L-77) and the N-3 resume choice dialog.

import { badgeChanged, badgeText, badgeTooltip, setBadgeContainer } from '../../../api/badge';
import { definePlugin, type PluginContext } from '../../../api/plugins';
import { setResumePromptImpl } from '../../../api/resumePrompt';
import { openSettings } from '../../../api/tabs';
import {
  CLS_BADGE_CONTAINER, CLS_BADGE_INNER, CLS_BADGE_TEXT, CLS_SETTINGS_BUTTON, EVT_LANGUAGE, FONT_AWESOME_URL
} from '../../../utils/constants';
import { h, icon, swallow } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { createResumePrompt } from './resumeDialog';
import css from './style.css';

/** L-65: Font Awesome stylesheet, injected once (fixes L-Q15). */
export function ensureFontAwesome(): void {
  if (document.querySelector(`link[href="${FONT_AWESOME_URL}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = FONT_AWESOME_URL;
  (document.head || document.documentElement).appendChild(link);
}

function createBadge(): HTMLElement {
  const text = h('span', { class: CLS_BADGE_TEXT, text: badgeText() });
  const tooltip = badgeTooltip();
  if (tooltip) text.title = tooltip;
  const gear = h('button', { class: CLS_SETTINGS_BUTTON, type: 'button', title: tr('Open settings', '打开设置') }, icon('gear'));
  // S-100: open on pointerdown in the capture phase; nothing reaches the player.
  gear.addEventListener('pointerdown', ev => {
    swallow(ev);
    openSettings();
  }, true);
  gear.addEventListener('click', swallow, true);
  gear.addEventListener('touchstart', swallow, { capture: true, passive: false });
  return h('div', { class: CLS_BADGE_CONTAINER }, h('div', { class: CLS_BADGE_INNER }, text, gear));
}

function renderBadge(): void {
  const container = document.querySelector(`.${CLS_BADGE_CONTAINER}`);
  if (!container) return;
  const text = container.querySelector(`.${CLS_BADGE_TEXT}`) as HTMLElement | null;
  if (text) {
    text.textContent = badgeText();
    const tooltip = badgeTooltip();
    if (tooltip) text.title = tooltip;
    else text.removeAttribute('title');
    text.classList.toggle('is-error', Boolean(tooltip));
  }
  const gear = container.querySelector(`.${CLS_SETTINGS_BUTTON}`) as HTMLElement | null;
  if (gear) gear.title = tr('Open settings', '打开设置');
}

/** S-87/S-88: attach to the left controls, else to the chapter container. Idempotent. */
function ensureBadge(ctx: PluginContext): void {
  if (document.querySelector(`.${CLS_BADGE_CONTAINER}`)) return;
  const left = document.querySelector('#movie_player .ytp-left-controls') || document.querySelector('.ytp-left-controls');
  const chapter = document.querySelector('.ytp-chapter-container') as HTMLElement | null;
  const parent = left || chapter;
  if (!parent) return;
  const badge = createBadge();
  if (!left && chapter) chapter.style.display = 'flex';
  parent.appendChild(badge);
  ctx.onDispose(() => badge.remove());
  setBadgeContainer(badge);
}

export default definePlugin({
  name: 'PlayerBadge',
  displayName: { en: 'Player badge', zh: '播放器徽标' },
  description: {
    en: 'Shows the last saved time and a settings button in the player controls, plus the dialog for conflicting timestamp links.',
    zh: '在播放器控制栏显示上次保存时间和设置按钮，并在时间戳链接与存档冲突时弹出选择框。'
  },
  authors: ['0_V'],
  icon: 'tag',
  required: true,
  start(ctx) {
    ensureFontAwesome();
    ctx.addStyle(css);
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        ensureBadge(ctx);
      });
    };
    ensureBadge(ctx);
    // L-74..L-77: re-attach whenever the player / controls are rebuilt or the badge is removed.
    ctx.observe(document.documentElement, { childList: true, subtree: true }, schedule);
    ctx.onDispose(badgeChanged.on(renderBadge));
    ctx.listen(document, EVT_LANGUAGE, () => renderBadge());
    setResumePromptImpl(createResumePrompt);
    ctx.onDispose(() => setResumePromptImpl(null));
  }
});
