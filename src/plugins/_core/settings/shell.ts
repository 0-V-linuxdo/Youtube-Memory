// Settings modal shell (N-5.3): page-level dialog, 224 px navigation with a two-line version footer,
// right column with title + info hint + status, and the scrollable tab content (N-5.2.16).
// Open via the gear (S-100); close via ✕, backdrop or Esc (D-4); Esc closes nested dialogs first.

import { closeAllDialogs, dialogLayers, hasDialogs } from '../../../api/dialogs';
import { Emitter } from '../../../api/events';
import { getTab, listTabs, tabsChanged, type TabDef } from '../../../api/tabs';
import { button, infoHint } from '../../../api/ui';
import { CLS_BACKDROP, CLS_MODAL, CLS_MODAL_BODY, COMMIT, EVT_LANGUAGE, HOMEPAGE_URL, IS_DEV_BUILD, VERSION_SHORT } from '../../../utils/constants';
import { clear, h, icon, pageHost } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { getMode } from '../../../utils/storage';
import { createScrollLock } from './scrollLock';

interface PaneEntry {
  tab: TabDef;
  el: HTMLElement;
  cleanup: (() => void) | null;
}

export const modalOpened = new Emitter<void>();

export function storageModeLabel(): string {
  return getMode() === 'gm' ? tr('GM Storage', 'GM 存储') : tr('Browser storage', '浏览器本地存储');
}

/** N-5.3.5: "Video Memory • v2.2.0 • (abc1234)" / "Production • Userscript". */
function versionFooter(): HTMLElement {
  const link = (href: string, text: string) => h('a', { class: 'ysrp-version-link', href, target: '_blank', rel: 'noopener noreferrer', text });
  const hash = COMMIT && COMMIT !== 'dev'
    ? link(`${HOMEPAGE_URL}/commit/${COMMIT}`, `(${COMMIT})`)
    : h('span', { text: `(${COMMIT || 'dev'})` });
  return h('div', { class: 'ysrp-nav-footer' },
    h('div', { class: 'ysrp-version-line' }, link(HOMEPAGE_URL, 'Video Memory'), ` • ${VERSION_SHORT} • `, hash),
    h('div', { class: 'ysrp-version-line', text: `${IS_DEV_BUILD ? 'Development' : 'Production'} • Userscript` })
  );
}

export class SettingsModal {
  private backdrop: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private navGroups: HTMLElement | null = null;
  private headingEl: HTMLElement | null = null;
  private infoEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private spinnerEl: HTMLElement | null = null;
  private panesEl: HTMLElement | null = null;
  private panes = new Map<string, PaneEntry>();
  private active = 'records';
  private opened = false;
  private spinUntil = 0;
  private spinTimer = 0;
  private disposers: Array<() => void> = [];
  private languageTimer = 0;
  private readonly scrollLock = createScrollLock(
    () => [this.root, ...dialogLayers()].filter((el): el is HTMLElement => Boolean(el)),
    () => {
      const layers = dialogLayers();
      const top = layers.length ? layers[layers.length - 1].querySelector('.ysrp-dialog') as HTMLElement | null : null;
      return top || this.activePane();
    }
  );

  start(): void {
    this.disposers.push(tabsChanged.on(() => this.onTabsChanged()));
    const onLanguage = () => {
      if (this.languageTimer) clearTimeout(this.languageTimer);
      // U-13 / L-62: rebuild after 50 ms, keeping the open state and the active tab.
      this.languageTimer = window.setTimeout(() => this.rebuild(), 50);
    };
    document.addEventListener(EVT_LANGUAGE, onLanguage);
    this.disposers.push(() => document.removeEventListener(EVT_LANGUAGE, onLanguage));
    const onKey = (ev: KeyboardEvent) => {
      // Nested dialogs consume Esc themselves (window capture), so this only closes the modal.
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

  activePane(): HTMLElement | null {
    return this.panes.get(this.active)?.el || null;
  }

  open(tabId?: string): void {
    this.ensureBuilt();
    if (!this.root || !this.backdrop) return;
    const host = pageHost();
    if (this.backdrop.parentElement !== host) host.appendChild(this.backdrop);
    if (this.root.parentElement !== host) host.appendChild(this.root);
    const wasOpen = this.opened;
    this.opened = true;
    this.backdrop.classList.add('is-open');
    this.root.classList.add('is-open');
    this.scrollLock.lock();
    this.activate(tabId && getTab(tabId) ? tabId : (getTab(this.active) ? this.active : 'records'), !wasOpen);
    if (!wasOpen) modalOpened.emit();
  }

  close(): void {
    if (!this.opened) return;
    closeAllDialogs();
    this.opened = false;
    this.backdrop?.classList.remove('is-open');
    this.root?.classList.remove('is-open');
    this.scrollLock.unlock();
  }

  /** Header spinner (U-54/U-55); kept visible at least 300 ms so it can actually be seen (fixes U-Q4). */
  setBusy(busy: boolean): void {
    if (!this.spinnerEl) return;
    const el = this.spinnerEl;
    if (busy) {
      this.spinUntil = Date.now() + 300;
      el.classList.add('is-active');
      return;
    }
    const wait = Math.max(0, this.spinUntil - Date.now());
    if (this.spinTimer) clearTimeout(this.spinTimer);
    this.spinTimer = window.setTimeout(() => el.classList.remove('is-active'), wait);
  }

  refreshHeader(): void {
    if (!this.headingEl || !this.badgeEl || !this.infoEl) return;
    const tab = getTab(this.active);
    const title = tab ? (tab.heading ? tab.heading() : tab.label()) : '';
    this.headingEl.textContent = title;
    this.headingEl.title = title;
    const info = tab && tab.info ? tab.info() : '';
    this.infoEl.replaceChildren(info ? infoHint(info) : '');
    this.infoEl.style.display = info ? '' : 'none';
    this.badgeEl.textContent = storageModeLabel();
    this.badgeEl.style.display = tab && tab.storageBadge ? '' : 'none';
  }

  /** Rebuild every DOM node (language change), restoring open state and tab. */
  rebuild(): void {
    if (!this.root) return;
    const wasOpen = this.opened;
    const tab = this.active;
    this.close();
    this.teardown();
    this.active = tab;
    if (wasOpen) this.open(tab);
  }

  private teardown(): void {
    for (const entry of this.panes.values()) {
      try { entry.cleanup?.(); } catch (err) { console.error('[Video Memory] tab cleanup failed:', err); }
    }
    this.panes.clear();
    this.root?.remove();
    this.backdrop?.remove();
    this.root = null;
    this.backdrop = null;
    this.navGroups = null;
  }

  private ensureBuilt(): void {
    if (this.root && this.backdrop) return;
    const existing = document.querySelector(`.${CLS_BACKDROP}`) as HTMLElement | null;
    const backdrop = existing || h('div', { class: CLS_BACKDROP });
    // S-101 / D-4: backdrop clicks never reach the page and close the modal.
    backdrop.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.target === backdrop) this.close();
    });
    this.backdrop = backdrop;

    this.navGroups = h('div', { class: 'ysrp-nav-groups' });
    const nav = h('nav', { class: 'ysrp-nav', attrs: { 'aria-label': tr('Settings sections', '设置分区') } }, this.navGroups, versionFooter());

    this.headingEl = h('h3', { class: 'ysrp-heading' });
    this.infoEl = h('span', { class: 'ysrp-header-info' });
    this.badgeEl = h('span', { class: 'ysrp-badge' });
    this.spinnerEl = h('span', { class: 'ysrp-refresh', title: tr('Refreshing…', '正在更新列表…') }, icon('arrows-rotate', 'fa-spin'));
    const closeBtn = button('', { variant: 'tertiary', cls: 'is-square ysrp-close', title: tr('Close', '关闭') });
    closeBtn.replaceChildren(icon('xmark'));
    closeBtn.setAttribute('aria-label', tr('Close', '关闭'));
    closeBtn.addEventListener('click', ev => { ev.preventDefault(); this.close(); });
    const header = h('div', { class: 'ysrp-header' },
      h('div', { class: 'ysrp-header-left' }, this.headingEl, this.infoEl, this.badgeEl, this.spinnerEl),
      closeBtn
    );
    this.panesEl = h('div', { class: `ysrp-panes ${CLS_MODAL_BODY}` });
    const main = h('div', { class: 'ysrp-main' }, header, this.panesEl);

    const root = h('div', { class: `ysrp-ui ${CLS_MODAL}`, attrs: { role: 'dialog', 'aria-modal': 'true' } }, nav, main);
    // Keys typed inside the modal must not trigger YouTube shortcuts.
    root.addEventListener('keydown', ev => ev.stopPropagation());
    root.addEventListener('keyup', ev => ev.stopPropagation());
    root.addEventListener('keypress', ev => ev.stopPropagation());
    this.root = root;
    this.renderNav();
  }

  private renderNav(): void {
    if (!this.navGroups) return;
    clear(this.navGroups);
    const groups: Array<{ id: TabDef['group']; title: string }> = [
      { id: 'main', title: tr('Video Memory', '视频记忆') },
      { id: 'plugins', title: tr('Plugins', '插件') }
    ];
    const tabs = listTabs();
    for (const group of groups) {
      const items = tabs.filter(t => t.group === group.id);
      if (!items.length) continue;
      const box = h('div', { class: 'ysrp-nav-group' }, h('div', { class: 'ysrp-nav-title', text: group.title }));
      for (const tab of items) {
        const btn = h('button', { class: `ysrp-tab${tab.id === this.active ? ' is-active' : ''}`, type: 'button', dataset: { tabId: tab.id } },
          h('span', { class: 'ysrp-tab-icon' }, icon(tab.icon)),
          h('span', { class: 'ysrp-tab-label', text: tab.label() })
        );
        btn.addEventListener('click', ev => { ev.preventDefault(); this.activate(tab.id); });
        box.appendChild(btn);
      }
      this.navGroups.appendChild(box);
    }
  }

  private onTabsChanged(): void {
    // Drop panes whose tab disappeared (plugin turned off).
    for (const [id, entry] of Array.from(this.panes)) {
      if (getTab(id) !== entry.tab) {
        try { entry.cleanup?.(); } catch { /* ignore */ }
        entry.el.remove();
        this.panes.delete(id);
      }
    }
    if (!this.root) return;
    this.renderNav();
    if (!getTab(this.active)) this.activate(getTab('plugins') ? 'plugins' : 'records');
  }

  /** U-60: activate a tab; renders its pane on first use. */
  activate(id: string, forceShow = false): void {
    const tab = getTab(id);
    if (!tab || !this.root || !this.panesEl) return;
    const changed = this.active !== id;
    this.active = id;
    this.root.dataset.activeTab = id;
    for (const btn of Array.from(this.root.querySelectorAll('.ysrp-tab'))) {
      btn.classList.toggle('is-active', (btn as HTMLElement).dataset.tabId === id);
    }
    let entry = this.panes.get(id);
    if (!entry) {
      const el = h('div', { class: 'ysrp-pane', dataset: { pane: id } });
      this.panesEl.appendChild(el);
      entry = { tab, el, cleanup: null };
      this.panes.set(id, entry);
      try {
        const cleanup = tab.render(el);
        entry.cleanup = typeof cleanup === 'function' ? cleanup : null;
      } catch (err) {
        console.error(`[Video Memory] Failed to render tab ${id}:`, err);
      }
    }
    for (const [pid, p] of this.panes) p.el.classList.toggle('is-active', pid === id);
    if (changed || forceShow || !entry.el.dataset.shown) {
      entry.el.dataset.shown = '1';
      try { tab.onShow?.(entry.el); } catch (err) { console.error(`[Video Memory] Failed to show tab ${id}:`, err); }
    }
    this.refreshHeader();
  }
}
