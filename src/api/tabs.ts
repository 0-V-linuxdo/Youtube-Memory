// Settings tabs registry and settings-modal bridge (N-4.1, N-5.2.1).

import { Emitter } from './events';

export type TabGroup = 'main' | 'plugins';

export interface TabDef {
  id: string;
  group: TabGroup;
  order: number;
  /** Font Awesome icon name without the fa- prefix. */
  icon: string;
  label(): string;
  /** Header title while the tab is active (defaults to the label). */
  heading?(): string;
  /** Show the storage-backend badge in the header (records and storage tabs). */
  storageBadge?: boolean;
  /** Build the tab content into the pane; may return a cleanup function. */
  render(pane: HTMLElement): void | (() => void);
  /** Called each time the tab becomes active (pane already rendered). */
  onShow?(pane: HTMLElement): void;
}

const tabs = new Map<string, TabDef>();
export const tabsChanged = new Emitter<void>();

export function registerTab(def: TabDef): () => void {
  tabs.set(def.id, def);
  tabsChanged.emit();
  return () => {
    if (tabs.get(def.id) === def) {
      tabs.delete(def.id);
      tabsChanged.emit();
    }
  };
}

export function getTab(id: string): TabDef | undefined {
  return tabs.get(id);
}

export function listTabs(): TabDef[] {
  const groupRank: Record<TabGroup, number> = { main: 0, plugins: 1 };
  return Array.from(tabs.values()).sort((a, b) => groupRank[a.group] - groupRank[b.group] || a.order - b.order);
}

/* ----------------------------------------------------------- modal bridge */

export interface ModalController {
  open(tabId?: string): void;
  close(): void;
  isOpen(): boolean;
  /** Re-render the header (title count, storage badge). */
  refreshHeader(): void;
}

let controller: ModalController | null = null;

export function setModalController(c: ModalController | null): void {
  controller = c;
}

export function openSettings(tabId?: string): void {
  controller?.open(tabId);
}

export function closeSettings(): void {
  controller?.close();
}

export function isSettingsOpen(): boolean {
  return Boolean(controller?.isOpen());
}

export function refreshSettingsHeader(): void {
  controller?.refreshHeader();
}
