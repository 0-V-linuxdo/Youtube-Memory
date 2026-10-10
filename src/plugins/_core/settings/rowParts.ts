// Core row contributions: note (R-63..R-73) and link (R-74..R-78, D-13: one-line panel).

import { updateRecord } from '../../../api/records';
import type { RowContribution, RowContext } from '../../../api/rows';
import { h } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { iconButton, setIcon } from './ui';

function showPanel(panel: HTMLElement, open: boolean): void {
  panel.style.display = open ? 'flex' : 'none';
}

/** Clipboard write with a legacy fallback (fixes R-Q15). */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    if (!legacyCopy(text)) throw err;
    return;
  }
  if (!legacyCopy(text)) throw new Error(tr('Clipboard is not available', '剪贴板不可用'));
}

function legacyCopy(text: string): boolean {
  try {
    const area = h('textarea', { value: text, style: 'position:fixed;top:-1000px;left:-1000px;opacity:0' });
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export const noteContribution: RowContribution = {
  id: 'note',
  order: 20,
  panelOrder: 30,
  create(ctx: RowContext) {
    const ui = ctx.ui;
    let note = typeof ctx.record.videoNote === 'string' ? ctx.record.videoNote : '';
    let editor: HTMLTextAreaElement | null = null;

    const topBtn = iconButton('pen-to-square', '', 'is-note');
    const editBtn = iconButton('pencil', '', 'is-note-edit');
    const preview = h('div', { class: 'ysrp-note-text' });
    const body = h('div', { class: 'ysrp-note-body' }, preview);
    const panel = h('div', { class: 'ysrp-panel ysrp-note-container' },
      h('div', { class: 'ysrp-panel-head' }, h('span', { class: 'ysrp-panel-label', text: tr('Notes', '笔记') }), editBtn),
      body
    );

    const hasNote = () => note.trim().length > 0;
    const isOpen = () => ui.noteOpen === true;
    const editing = () => editor !== null;

    const renderPreview = () => {
      preview.textContent = hasNote() ? note : tr('No notes yet', '暂无笔记');
      preview.classList.toggle('is-empty', !hasNote());
    };
    const refreshButtons = () => {
      const topTip = editing() ? tr('Save & collapse note', '保存并折叠笔记')
        : hasNote() ? (isOpen() ? tr('Hide notes', '隐藏笔记') : tr('Show notes', '显示笔记'))
          : tr('Add note', '添加笔记');
      topBtn.title = topTip;
      topBtn.setAttribute('aria-label', topTip);
      topBtn.classList.toggle('has-content', hasNote());
      setIcon(editBtn, editing() ? 'floppy-disk' : 'pencil');
      const editTip = editing() ? tr('Save note', '保存笔记') : tr('Edit note', '编辑笔记');
      editBtn.title = editTip;
      editBtn.setAttribute('aria-label', editTip);
    };
    const setOpen = (open: boolean) => {
      if (!open && editing()) return; // R-70
      ui.noteOpen = open;
      showPanel(panel, open);
      refreshButtons();
    };
    const autosize = () => {
      if (!editor) return;
      editor.style.height = 'auto';
      editor.style.height = `${editor.scrollHeight}px`;
    };
    const startEdit = (draft?: string) => {
      if (editing()) return;
      ui.noteOpen = true;
      showPanel(panel, true);
      const area = h('textarea', { class: 'ysrp-textarea ysrp-note-input', value: draft ?? note, rows: 3 });
      area.addEventListener('input', () => {
        ui.noteDraft = area.value;
        autosize();
      });
      editor = area;
      ui.editing = true;
      ui.noteDraft = area.value;
      preview.replaceWith(area);
      autosize();
      requestAnimationFrame(() => {
        if (!area.isConnected) return;
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      });
      refreshButtons();
    };
    const save = () => {
      if (!editor) return;
      const next = editor.value.trim();
      editor.replaceWith(preview);
      editor = null;
      ui.editing = false;
      delete ui.noteDraft;
      note = next;
      renderPreview();
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
      refreshButtons();
    };

    topBtn.addEventListener('click', ev => {
      ev.preventDefault();
      if (editing()) {
        save();
        setOpen(false);
      } else if (!hasNote()) {
        startEdit();
      } else {
        setOpen(!isOpen());
      }
    });
    editBtn.addEventListener('click', ev => {
      ev.preventDefault();
      if (editing()) save();
      else startEdit();
    });

    renderPreview();
    showPanel(panel, isOpen());
    if (ui.editing === true) startEdit(typeof ui.noteDraft === 'string' ? ui.noteDraft : undefined);
    refreshButtons();
    return { button: topBtn, panel };
  }
};

export const linkContribution: RowContribution = {
  id: 'link',
  order: 30,
  panelOrder: 10,
  create(ctx: RowContext) {
    const ui = ctx.ui;
    const tip = h('span', { class: 'ysrp-copied', text: tr('Copied', '已复制') });
    let tipTimer = 0;
    let iconTimer = 0;
    const copyBtn = iconButton('copy', tr('Copy URL', '复制 URL'), 'is-link is-copy');
    const openBtn = iconButton('arrow-up-right-from-square', tr('Open in new tab', '在新标签页中打开 URL'), 'is-open');
    const panel = h('div', { class: 'ysrp-panel ysrp-url' },
      h('span', { class: 'ysrp-url-text', title: ctx.url }, tr('URL: {url}', '链接：{url}', { url: ctx.url })),
      tip, copyBtn, openBtn
    );
    const flashTip = (text: string, error = false) => {
      tip.textContent = text;
      tip.classList.toggle('is-error', error);
      tip.classList.add('is-visible');
      if (tipTimer) clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => tip.classList.remove('is-visible'), 2000);
    };
    copyBtn.addEventListener('click', ev => {
      ev.preventDefault();
      copyText(ctx.url).then(() => {
        setIcon(copyBtn, 'check');
        copyBtn.classList.add('is-success');
        if (iconTimer) clearTimeout(iconTimer);
        iconTimer = window.setTimeout(() => {
          setIcon(copyBtn, 'copy');
          copyBtn.classList.remove('is-success');
        }, 1000);
        flashTip(tr('Copied', '已复制'));
      }).catch(err => {
        console.warn('[Video Memory] Failed to copy text: ', err);
        flashTip(tr('Copy failed', '复制失败'), true);
      });
    });
    openBtn.addEventListener('click', ev => {
      ev.preventDefault();
      window.open(ctx.url, '_blank', 'noopener');
    });
    const button = iconButton('link', tr('Show / hide URL', '显示/隐藏 URL'), 'is-link');
    button.addEventListener('click', ev => {
      ev.preventDefault();
      ui.linkOpen = ui.linkOpen !== true;
      showPanel(panel, ui.linkOpen === true);
    });
    showPanel(panel, ui.linkOpen === true);
    return {
      button,
      panel,
      dispose() {
        clearTimeout(tipTimer);
        clearTimeout(iconTimer);
      }
    };
  }
};
