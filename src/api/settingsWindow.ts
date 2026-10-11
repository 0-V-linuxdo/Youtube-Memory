// Bridge to the settings window (N-5.3, N-5.6.5, N-5.9). The window has only the Plugins page: plugins
// cannot add pages; every feature's UI lives in its plugin settings dialog.

export interface SettingsWindowController {
  /** Open the window on the Plugins page. */
  open(): void;
  /** Open the window, then the settings dialog of one plugin on top of it. */
  openPlugin(name: string): void;
  close(): void;
  isOpen(): boolean;
  /** The gear button in the player was pressed (pointerdown, capture phase). */
  gear(anchor: HTMLElement): void;
}

let controller: SettingsWindowController | null = null;

export function setSettingsWindow(c: SettingsWindowController | null): void {
  controller = c;
}

export function openSettings(): void {
  controller?.open();
}

export function openPluginSettings(name: string): void {
  controller?.openPlugin(name);
}

export function closeSettings(): void {
  controller?.close();
}

export function isSettingsOpen(): boolean {
  return Boolean(controller?.isOpen());
}

export function pressGear(anchor: HTMLElement): void {
  controller?.gear(anchor);
}
