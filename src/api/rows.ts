// Record-card control registry (N-4.1, N-5.4.2): plugins contribute icon buttons to each record card.
// Buttons open nested dialogs (N-5.4.3: nothing ever expands inside a card).

import { Emitter } from './events';
import type { VideoRecord } from './records';

export interface RowContext {
  videoId: string;
  /** Record as it was when the card was built; use readRecord() for the latest. */
  record: VideoRecord;
  url: string;
  isCurrent: boolean;
  /** Title currently shown on the card. */
  title(): string;
  /** Re-render the card's marks / description from storage (e.g. after the note changed). */
  refresh(): void;
}

export interface RowParts {
  button: HTMLElement;
  dispose?(): void;
}

export interface RowContribution {
  id: string;
  /** Position in the card's control group (lower first; delete is always last). */
  order: number;
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
