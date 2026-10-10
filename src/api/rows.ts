// Record-row button registry (N-4.1: plugins contribute row buttons with an expandable panel).

import { Emitter } from './events';
import type { VideoRecord } from './records';

/** Per-video UI state kept across list rebuilds (fixes R-Q6: open panels / note drafts survive). */
export type RowUiState = Record<string, unknown>;

export interface RowContext {
  videoId: string;
  record: VideoRecord;
  url: string;
  isCurrent: boolean;
  ui: RowUiState;
  /** Title currently shown in the row. */
  title(): string;
}

export interface RowParts {
  button: HTMLElement;
  panel?: HTMLElement;
  dispose?(): void;
}

export interface RowContribution {
  id: string;
  /** Button order in the row's top bar (lower first). */
  order: number;
  /** Panel order below the top bar (lower first). */
  panelOrder?: number;
  create(ctx: RowContext): RowParts | null;
}

const contributions = new Map<string, RowContribution>();
export const rowsChanged = new Emitter<void>();

export function registerRowButton(def: RowContribution): () => void {
  contributions.set(def.id, def);
  rowsChanged.emit();
  return () => {
    if (contributions.get(def.id) === def) {
      contributions.delete(def.id);
      rowsChanged.emit();
    }
  };
}

export function listRowButtons(): RowContribution[] {
  return Array.from(contributions.values()).sort((a, b) => a.order - b.order);
}
