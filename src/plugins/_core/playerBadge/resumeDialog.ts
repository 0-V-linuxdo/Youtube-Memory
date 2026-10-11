// N-3.2..N-3.5: "Where to continue?" dialog shown inside #movie_player, styled as a small nested dialog (N-5.8).

import type { ResumeChoice, ResumePromptHandle, ResumePromptOptions } from '../../../api/resumePrompt';
import { h } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { formatTime } from '../../../utils/text';

const STOP_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'touchstart', 'touchend', 'wheel', 'contextmenu'];

export function createResumePrompt(opts: ResumePromptOptions): ResumePromptHandle {
  let settle: (choice: ResumeChoice) => void = () => {};
  let done = false;
  const result = new Promise<ResumeChoice>(resolve => { settle = resolve; });

  const savedBtn = h('button', { class: 'ysrp-btn is-primary ysrp-resume-btn ysrp-resume-saved', type: 'button' },
    tr('Saved progress {t}', '上次进度 {t}', { t: formatTime(opts.saved) }));
  const linkBtn = h('button', { class: 'ysrp-btn is-secondary ysrp-resume-btn ysrp-resume-link', type: 'button' },
    tr('Link time {t}', '链接时间 {t}', { t: formatTime(opts.link) }));
  // No ✕ (N-5.8): Esc counts as "link time" (N-3.4).
  const root = h('div', { class: 'ysrp-ui ysrp-resume', attrs: { role: 'dialog', 'aria-modal': 'true' } },
    h('div', { class: 'ysrp-resume-head' },
      h('div', { class: 'ysrp-resume-title', text: tr('Where to continue?', '从哪里继续播放？') }),
      h('div', { class: 'ysrp-resume-text', text: tr('This link starts at a different time than your saved progress.', '这个链接指定的时间与你上次的进度不同。') })
    ),
    h('div', { class: 'ysrp-resume-actions' }, linkBtn, savedBtn)
  );

  const onDocKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    finish('link');
  };
  const finish = (choice: ResumeChoice | null) => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onDocKey, true);
    root.remove();
    if (choice) settle(choice);
  };
  document.addEventListener('keydown', onDocKey, true);

  // N-3.3: clicks and keys on the dialog never reach the player.
  for (const type of STOP_EVENTS) root.addEventListener(type, ev => ev.stopPropagation());
  const bind = (btn: HTMLElement, choice: ResumeChoice) => {
    btn.addEventListener('pointerdown', ev => { ev.preventDefault(); finish(choice); });
    btn.addEventListener('click', ev => { ev.preventDefault(); finish(choice); });
  };
  bind(savedBtn, 'saved');
  bind(linkBtn, 'link');

  const player = document.getElementById('movie_player');
  if (!player) {
    finish('link');
    return { result, cancel() { /* nothing */ } };
  }
  // N-5.8: 448 px, never wider than the player minus 32 px.
  const width = Math.max(200, Math.min(448, (player.clientWidth || 480) - 32));
  root.style.width = `${width}px`;
  player.appendChild(root);
  try { savedBtn.focus({ preventScroll: true }); } catch { /* ignore */ }

  return { result, cancel: () => finish(null) };
}
