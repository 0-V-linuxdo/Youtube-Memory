// Settings window shell (N-5.3): page-level window with only the Plugins page (everything is a plugin).
// 224 px navigation with a single item "Plugins" and the two-line version footer; right column with the
// title "Plugins", its info hint and ✕, then the Plugins page in the scroll area (N-5.2.16).
// Close via ✕, backdrop or Esc (Esc closes nested dialogs first, N-5.3.3).

import { closeAllDialogs, dialogLayers, hasDialogs } from '../../../api/dialogs';
import { findPlugin } from '../../../api/plugins';
import { button, infoHint } from '../../../api/ui';
import { CLS_BACKDROP, CLS_MODAL, CLS_MODAL_BODY, COMMIT, EVT_LANGUAGE, HOMEPAGE_URL, IS_DEV_BUILD, VERSION_SHORT } from '../../../utils/constants';
import { h, icon, pageHost } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { currentPluginDialog, openPluginDialog } from './pluginDialog';
import { pluginsPageInfo, renderPluginsPage } from './pluginsPage';
import { createScrollLock } from './scrollLock';

/** N-5.3.5: "Video Memory • v2.2.0 • (abc1234)" / "Production • Userscript". */
function versionFooter(cls: string): HTMLElement {
  const link = (href: string, text: string) => h('a', { class: 'ysrp-version-link', href, target: '_blank', rel: 'noopener noreferrer', text });
  const hash = COMMIT && COMMIT !== 'dev'
    ? link(`${HOMEPAGE_URL}/commit/${COMMIT}`, `(${COMMIT})`)
    : h('span', { text: `(${COMMIT || 'dev'})` });
  return h('div', { class: `ysrp-nav-footer ${cls}` },
    h('div', { class: 'ysrp-version-line' }, link(HOMEPAGE_URL, 'Video Memory'), ` • ${VERSION_SHORT} • `, hash),
    h('div', { class: 'ysrp-version-line', text: `${IS_DEV_BUILD ? 'Development' : 'Production'} • Userscript` })
  );
}

export class SettingsModal {
  private backdrop: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private pane: HTMLElement | null = null;
  private paneCleanup: (() => void) | null = null;
  private opened = false;
  private disposers: Array<() => void> = [];
  private languageTimer = 0;
  private readonly scrollLock = createScrollLock(
    () => [this.root, ...dialogLayers()].filter((el): el is HTMLElement => Boolean(el)),
    () => {
      const layers = dialogLayers();
      const top = layers.length ? layers[layers.length - 1].querySelector('.ysrp-dialog') as HTMLElement | null : null;
      return top || this.pane;
    }
  );

  start(): void {
    const onLanguage = () => {
      if (this.languageTimer) clearTimeout(this.languageTimer);
      // U-13 / L-62: rebuild after 50 ms, keeping the window and the plugin dialog open (N-5.7.4).
      this.languageTimer = window.setTimeout(() => this.rebuild(), 50);
    };
    document.addEventListener(EVT_LANGUAGE, onLanguage);
    this.disposers.push(() => {
      document.removeEventListener(EVT_LANGUAGE, onLanguage);
      if (this.languageTimer) clearTimeout(this.languageTimer);
    });
    const onKey = (ev: KeyboardEvent) => {
      // Nested dialogs consume Esc themselves (window capture), so this only closes the window.
      if (!this.opened || ev.key !== 'Escape' || hasDialogs()) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
    };
    document.addEventListener('keydown', onKey, true);
    this.disposers.push(() => document.removeEventListener('keydown', onKey, true));
  }

  destroy(): void {
    this.close();
    for (const fn of this.disposers.splice(0)) fn();
    this.teardown();
  }

  isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.ensureBuilt();
    if (!this.root || !this.backdrop) return;
    const host = pageHost();
    if (this.backdrop.parentElement !== host) host.appendChild(this.backdrop);
    if (this.root.parentElement !== host) host.appendChild(this.root);
    if (this.opened) return;
    this.opened = true;
    this.backdrop.classList.add('is-open');
    this.root.classList.add('is-open');
    this.scrollLock.lock();
  }

  /** N-5.6.5: open the window, then the plugin's settings dialog on top of it. */
  openPlugin(name: string): void {
    const plugin = findPlugin(name);
    this.open();
    if (plugin) openPluginDialog(plugin);
  }

  close(): void {
    if (!this.opened) return;
    closeAllDialogs();
    this.opened = false;
    this.backdrop?.classList.remove('is-open');
    this.root?.classList.remove('is-open');
    this.scrollLock.unlock();
  }

  /** Rebuild every DOM node (language change), restoring the open window and plugin dialog. */
  rebuild(): void {
    if (!this.root) return;
    const wasOpen = this.opened;
    const dialog = currentPluginDialog();
    this.close();
    this.teardown();
    if (!wasOpen) return;
    if (dialog) this.openPlugin(dialog);
    else this.open();
  }

  private teardown(): void {
    try { this.paneCleanup?.(); } catch (err) { console.error('[Video Memory] plugins page cleanup failed:', err); }
    this.paneCleanup = null;
    this.root?.remove();
    this.backdrop?.remove();
    this.root = null;
    this.backdrop = null;
    this.pane = null;
  }

  private ensureBuilt(): void {
    if (this.root && this.backdrop) return;
    const existing = document.querySelector(`.${CLS_BACKDROP}`) as HTMLElement | null;
    const backdrop = existing || h('div', { class: CLS_BACKDROP });
    // S-101 / D-4: backdrop clicks never reach the page and close the window.
    backdrop.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.target === backdrop) this.close();
    });
    this.backdrop = backdrop;

    // N-5.3.5: one group, one item, always the current one.
    const tab = h('button', { class: 'ysrp-tab is-active', type: 'button', dataset: { tabId: 'plugins' }, attrs: { 'aria-current': 'page' } },
      h('span', { class: 'ysrp-tab-icon' }, icon('plug')),
      h('span', { class: 'ysrp-tab-label', text: tr('Plugins', '插件') })
    );
    tab.addEventListener('click', ev => ev.preventDefault());
    const nav = h('nav', { class: 'ysrp-nav', attrs: { 'aria-label': tr('Settings sections', '设置分区') } },
      h('div', { class: 'ysrp-nav-groups' },
        h('div', { class: 'ysrp-nav-group' }, h('div', { class: 'ysrp-nav-title', text: tr('Video Memory', '视频记忆') }), tab)),
      versionFooter('is-nav'));

    const title = tr('Plugins', '插件');
    const heading = h('h3', { class: 'ysrp-heading', text: title, title });
    const closeBtn = button('', { variant: 'tertiary', cls: 'is-square ysrp-close', title: tr('Close', '关闭') });
    closeBtn.replaceChildren(icon('xmark'));
    closeBtn.setAttribute('aria-label', tr('Close', '关闭'));
    closeBtn.addEventListener('click', ev => { ev.preventDefault(); this.close(); });
    const header = h('div', { class: 'ysrp-header' },
      h('div', { class: 'ysrp-header-left' }, heading, h('span', { class: 'ysrp-header-info' }, infoHint(pluginsPageInfo()))),
      closeBtn
    );
    const pane = h('div', { class: 'ysrp-pane is-active', dataset: { pane: 'plugins' } });
    this.pane = pane;
    const panes = h('div', { class: `ysrp-panes ${CLS_MODAL_BODY}` }, pane);
    // N-5.3.7: on narrow screens the navigation is hidden and the version moves under the right column.
    const main = h('div', { class: 'ysrp-main' }, header, panes, versionFooter('is-main'));

    const root = h('div', { class: `ysrp-ui ${CLS_MODAL}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, dataset: { activeTab: 'plugins' } }, nav, main);
    // Keys typed inside the window must not trigger YouTube shortcuts.
    root.addEventListener('keydown', ev => ev.stopPropagation());
    root.addEventListener('keyup', ev => ev.stopPropagation());
    root.addEventListener('keypress', ev => ev.stopPropagation());
    this.root = root;
    try {
      this.paneCleanup = renderPluginsPage(pane);
    } catch (err) {
      console.error('[Video Memory] Failed to render the plugins page:', err);
    }
  }
}
