// Core record-card controls: notes (N-5.4.5, saving rules R-63..R-73) and link (N-5.4.4).
// Both open nested dialogs; nothing expands inside the card (N-5.4.3).

import { openDialog } from '../../../api/dialogs';
import { readRecord, updateRecord } from '../../../api/records';
import type { RowContribution, RowContext } from '../../../api/rows';
import { button, copyText, iconButton, setButtonLabel, setIconButtonLabel, textArea, textInput } from '../../../api/ui';
import { tr } from '../../../utils/i18n';

function storedNote(videoId: string): string {
  const rec = readRecord(videoId);
  return rec && typeof rec.videoNote === 'string' ? rec.videoNote : '';
}

function openNoteDialog(ctx: RowContext): void {
  const area = textArea({ value: storedNote(ctx.videoId), placeholder: tr('Write a note…', '写点笔记…'), cls: 'ysrp-note-input' });
  const cancel = button(tr('Cancel', '取消'), { variant: 'secondary', cls: 'ysrp-note-cancel' });
  const save = button(tr('Save', '保存'), { variant: 'primary', cls: 'ysrp-note-save' });
  const dlg = openDialog({
    title: tr('Notes', '笔记'),
    desc: ctx.title(),
    size: 'md',
    cls: 'ysrp-note-dialog',
    content: [area],
    footer: [cancel, save]
  });
  const doSave = () => {
    const next = area.value.trim();
    try {
      // Fix R-Q14: never resurrect a deleted record just to hold a note.
      updateRecord(ctx.videoId, cur => {
        if (!cur) return null;
        const out = { ...cur };
        if (next) out.videoNote = next;
        else delete out.videoNote;
        return out;
      }, 'content');
    } catch (err) {
      console.error('[Video Memory] Failed to update video note in storage:', err);
    }
    dlg.close();
    ctx.refresh();
  };
  cancel.addEventListener('click', () => dlg.close());
  save.addEventListener('click', doSave);
  area.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      doSave();
    }
  });
  requestAnimationFrame(() => {
    if (!area.isConnected) return;
    area.focus({ preventScroll: true });
    area.setSelectionRange(area.value.length, area.value.length);
  });
}

export const noteContribution: RowContribution = {
  id: 'note',
  order: 20,
  create(ctx: RowContext) {
    const label = () => (storedNote(ctx.videoId).trim() ? tr('Edit note', '编辑笔记') : tr('Add note', '添加笔记'));
    const btn = iconButton('pen-to-square', label(), 'is-note', () => openNoteDialog(ctx));
    btn.addEventListener('mouseenter', () => setIconButtonLabel(btn, label()));
    return { button: btn };
  }
};

function openLinkDialog(ctx: RowContext): void {
  const input = textInput({ value: ctx.url, cls: 'ysrp-link-input' });
  input.readOnly = true;
  input.addEventListener('focus', () => input.select());
  const copyLabel = tr('Copy', '复制');
  const copy = button(copyLabel, { variant: 'secondary', cls: 'ysrp-link-copy' });
  const open = button(tr('Open in new tab', '在新标签打开'), { variant: 'primary', cls: 'ysrp-link-open' });
  let timer = 0;
  openDialog({
    title: tr('Video link', '视频链接'),
    desc: ctx.title(),
    size: 'sm',
    cls: 'ysrp-link-dialog',
    content: [input],
    footer: [copy, open],
    onClose: () => clearTimeout(timer)
  });
  copy.addEventListener('click', () => {
    copyText(ctx.url).then(() => {
      setButtonLabel(copy, tr('Copied', '已复制'));
    }).catch(err => {
      console.warn('[Video Memory] Failed to copy text: ', err);
      setButtonLabel(copy, tr('Copy failed', '复制失败'));
    }).finally(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setButtonLabel(copy, copyLabel), 1500);
    });
  });
  open.addEventListener('click', () => { window.open(ctx.url, '_blank', 'noopener'); });
}

export const linkContribution: RowContribution = {
  id: 'link',
  order: 30,
  create(ctx: RowContext) {
    return { button: iconButton('link', tr('Video link', '视频链接'), 'is-link', () => openLinkDialog(ctx)) };
  }
};
