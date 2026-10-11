// N-5.9 plugin menu (like Void++'s avatar menu → Void++ → Plugins): pops up from the gear button and lists
// the menu plugins (N-5.9.4), each opening its settings dialog directly, plus "All plugins".

import { menuPlugins } from '../../../api/pluginMenu';
import type { PluginDef } from '../../../api/plugins';
import { h, icon, pageHost } from '../../../utils/dom';
import { getLanguage, pick, tr } from '../../../utils/i18n';

const GAP = 8;

export interface MenuActions {
  openPlugin(plugin: PluginDef): void;
  openAll(): void;
}

export class PluginMenu {
  private el: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly actions: MenuActions) {}

  isOpen(): boolean {
    return Boolean(this.el);
  }

  /** N-5.9.3: pressing the gear again closes the menu. */
  toggle(anchor: HTMLElement): void {
    if (this.el) this.close();
    else this.open(anchor);
  }

  open(anchor: HTMLElement): void {
    this.close();
    this.anchor = anchor;
    const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
    const plugins = menuPlugins().sort((a, b) => pick(a.displayName).localeCompare(pick(b.displayName), lang));
    const item = (iconName: string, label: string, onSelect: () => void, dataset: Record<string, string>) => {
      const btn = h('button', { class: 'ysrp-menu-item', type: 'button', dataset, attrs: { role: 'menuitem', tabindex: '-1' } },
        h('span', { class: 'ysrp-menu-icon' }, icon(iconName)),
        h('span', { class: 'ysrp-menu-label', text: label }));
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.close();
        onSelect();
      });
      return btn;
    };
    const el = h('div', { class: 'ysrp-ui ysrp-plugin-menu', attrs: { role: 'menu', 'aria-label': tr('Plugins', '插件') } },
      h('div', { class: 'ysrp-menu-title', text: tr('Plugins', '插件') }),
      plugins.map(p => item(p.icon, pick(p.displayName), () => this.actions.openPlugin(p), { plugin: p.name })),
      h('div', { class: 'ysrp-menu-sep', attrs: { role: 'separator' } }),
      item('plug', tr('All plugins', '全部插件'), () => this.actions.openAll(), { action: 'all' })
    );
    // Clicks and keys inside the menu never reach the page or the player.
    for (const type of ['pointerdown', 'mousedown', 'keyup', 'keypress']) el.addEventListener(type, ev => ev.stopPropagation());
    pageHost().appendChild(el);
    this.el = el;
    this.position();

    const onOutside = (ev: Event) => {
      const target = ev.target as Element | null;
      if (!target || el.contains(target)) return;
      // The gear's own handler toggles the menu.
      if (this.anchor && (target === this.anchor || this.anchor.contains(target))) return;
      this.close();
    };
    const onKey = (ev: KeyboardEvent) => this.onKey(ev);
    const onViewport = () => this.position();
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onViewport, true);
    this.disposers.push(
      () => document.removeEventListener('pointerdown', onOutside, true),
      () => window.removeEventListener('keydown', onKey, true),
      () => window.removeEventListener('resize', onViewport),
      () => window.removeEventListener('scroll', onViewport, true)
    );
    this.items()[0]?.focus({ preventScroll: true });
  }

  close(): void {
    for (const fn of this.disposers.splice(0)) fn();
    this.el?.remove();
    this.el = null;
    this.anchor = null;
  }

  private items(): HTMLButtonElement[] {
    return this.el ? Array.from(this.el.querySelectorAll<HTMLButtonElement>('.ysrp-menu-item')) : [];
  }

  /** N-5.9.3: arrows move, Enter selects, Esc closes. */
  private onKey(ev: KeyboardEvent): void {
    if (!this.el) return;
    const items = this.items();
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const stop = () => { ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation(); };
    switch (ev.key) {
      case 'Escape':
        stop();
        this.close();
        break;
      case 'ArrowDown':
        stop();
        items[(idx + 1 + items.length) % items.length]?.focus({ preventScroll: true });
        break;
      case 'ArrowUp':
        stop();
        items[(idx - 1 + items.length * 2) % items.length]?.focus({ preventScroll: true });
        break;
      case 'Home':
        stop();
        items[0]?.focus({ preventScroll: true });
        break;
      case 'End':
        stop();
        items[items.length - 1]?.focus({ preventScroll: true });
        break;
      case 'Enter':
      case ' ':
        if (idx >= 0) {
          stop();
          items[idx].click();
        }
        break;
      default:
        break;
    }
  }

  /** N-5.9.2: above the gear (below when there is no room), right edges aligned. */
  private position(): void {
    const el = this.el;
    const anchor = this.anchor;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(GAP, r.right - w), Math.max(GAP, vw - w - GAP));
    const above = r.top - GAP - hgt;
    const top = above >= GAP ? above : Math.min(r.bottom + GAP, Math.max(GAP, vh - hgt - GAP));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.classList.toggle('is-below', above < GAP);
  }
}
