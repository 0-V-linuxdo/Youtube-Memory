// "Storage" tab (T-15..T-87): backend choice + migration, export (copy / download / iOS share), import.

import { refreshSettingsHeader, type TabDef } from '../../../api/tabs';
import { h } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { exportData, getMode, gmAvailable, importData, switchMode, type StorageMode } from '../../../utils/storage';
import { errorMessage } from '../../../utils/text';
import { copyText } from './rowParts';
import { button, card, choiceGroup, messageLine, setButtonLabel } from './ui';

/* ----------------------------------------------------------- platform detection (U-14..U-16, T-61) */

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || navigator.vendor || '').toLowerCase();
  if (/\b(ipad|iphone|ipod)\b/.test(ua)) return true;
  return ua.includes('mac') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

const canShareFiles: boolean = (() => {
  try {
    if (!isIOS() || typeof File !== 'function' || typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare === 'function') {
      const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
      return navigator.canShare({ files: [probe] });
    }
    return true;
  } catch {
    return false;
  }
})();

/** T-56: [Youtube] Video Memory「YYYY MM DD」「HH:MM:SS」.json */
export function exportFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `[Youtube] Video Memory「${date.getFullYear()} ${p(date.getMonth() + 1)} ${p(date.getDate())}」「${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}」.json`;
}

function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function modeName(mode: StorageMode): string {
  return mode === 'gm' ? tr('GM storage', 'GM 存储') : tr('localStorage', 'localStorage');
}

export function createStorageTab(): TabDef {
  return {
    id: 'storage',
    group: 'main',
    order: 20,
    icon: 'gear',
    label: () => tr('Storage', '存储'),
    storageBadge: true,
    render(pane) {
      /* ------------------------------------------------ backend card */
      const backendMsg = messageLine();
      const choices = choiceGroup('ysrp-storage-mode', [
        { value: 'local', tag: tr('LOCAL', '本地'), label: tr('localStorage (default)', 'localStorage（默认）'), hint: tr('Fast storage scoped to this browser profile.', '快速、本地浏览器可用的存储。') },
        {
          value: 'gm', tag: 'GM', label: tr('GM storage', 'GM 存储'),
          hint: gmAvailable
            ? tr('Tampermonkey-backed storage that can sync across profiles.', '由 Tampermonkey 提供、可在配置间同步的存储。')
            : tr('Not available in this userscript manager.', '当前脚本管理器不提供 GM 存储。'),
          disabled: !gmAvailable
        }
      ], getMode(), () => backendMsg.set(''));
      const applyLabel = tr('Apply & Migrate', '应用并迁移');
      const applyBtn = button(applyLabel, { icon: 'right-left', title: tr('Switch storage backend and migrate data.', '切换存储方式并迁移数据。') });
      applyBtn.addEventListener('click', ev => {
        ev.preventDefault();
        const target = choices.value() === 'gm' ? 'gm' : 'local';
        const from = getMode();
        if (target === from) {
          backendMsg.set(tr('Already using {mode}.', '当前已在使用{mode}。', { mode: modeName(from) }));
          return;
        }
        applyBtn.disabled = true;
        setButtonLabel(applyBtn, tr('Migrating...', '正在迁移...'));
        try {
          const result = switchMode(target, { migrate: true, clearSource: true });
          if (result.ok) {
            backendMsg.set(tr('Moved {count} record(s) to {mode}.', '已将 {count} 条记录迁移到{mode}。', { count: result.moved, mode: modeName(target) }), 'success');
          } else {
            choices.set(getMode());
            backendMsg.set(tr('Migration failed: {message}', '迁移失败：{message}', { message: result.error || '' }), 'error');
          }
        } catch (err) {
          console.error('[Video Memory] Failed to switch storage:', err);
          choices.set(getMode());
          backendMsg.set(tr('Migration failed: {message}', '迁移失败：{message}', { message: errorMessage(err) }), 'error');
        }
        refreshSettingsHeader();
        window.setTimeout(() => {
          applyBtn.disabled = false;
          setButtonLabel(applyBtn, applyLabel);
        }, 500);
      });
      const backendCard = card({ icon: 'database', title: tr('Storage Backend', '存储后端'), desc: tr('Choose where to store your progress data.', '选择保存进度的存储方式。') },
        choices.el,
        h('div', { class: 'ysrp-actions' }, applyBtn,
          h('span', { class: 'ysrp-hint', text: tr('Migrates all saved records to the selected backend (moves data).', '将所有记录迁移至所选存储后端（移动数据）。') })),
        backendMsg.el
      );

      /* ------------------------------------------------ export card */
      const exportMsg = messageLine();
      const exportJson = () => JSON.stringify(exportData(), null, 2);
      const copyBtn = button(tr('Copy JSON', '复制 JSON'), { icon: 'copy', title: tr('Copy export JSON to clipboard', '复制导出的 JSON 到剪贴板') });
      copyBtn.addEventListener('click', ev => {
        ev.preventDefault();
        let text: string;
        try { text = exportJson(); } catch (err) {
          exportMsg.set(tr('Copy export failed: {message}', '复制导出失败：{message}', { message: errorMessage(err) }), 'error');
          return;
        }
        copyText(text).then(() => {
          exportMsg.set(tr('JSON copied to clipboard.', 'JSON 已复制到剪贴板。'), 'success');
        }).catch(err => {
          console.warn('[Video Memory] Copy export failed:', err);
          exportMsg.set(tr('Copy export failed: {message}', '复制导出失败：{message}', { message: errorMessage(err) }), 'error');
        });
      });
      const downloadBtn = button(tr('Download JSON', '下载 JSON'), { icon: 'file-arrow-down', title: tr('Download export JSON as file', '下载导出的 JSON 文件') });
      downloadBtn.addEventListener('click', async ev => {
        ev.preventDefault();
        try {
          const text = exportJson();
          const name = exportFileName();
          if (canShareFiles) {
            try {
              const file = new File([text], name, { type: 'application/json' });
              if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
                await navigator.share({
                  files: [file],
                  title: tr('Video Memory Export', '视频记忆导出'),
                  text: tr('Choose “Save to Files” to store your backup.', '请选择“存储到文件”以保存备份。')
                });
                exportMsg.set(tr('Shared. If you chose “Save to Files”, the backup is stored.', '已分享。如选择了“存储到文件”，备份已保存。'), 'success');
                return;
              }
            } catch (err) {
              const name2 = (err as { name?: string })?.name;
              if (name2 === 'AbortError' || name2 === 'NotAllowedError') {
                exportMsg.set(tr('Share cancelled.', '已取消分享。'));
                return;
              }
              console.warn('[Video Memory] Share failed, falling back to download:', err);
            }
          }
          downloadFile(name, text);
          exportMsg.set(tr('Export download started.', '导出下载已开始。'), 'success');
        } catch (err) {
          console.warn('[Video Memory] Download export failed:', err);
          exportMsg.set(tr('Download failed: {message}', '下载失败：{message}', { message: errorMessage(err) }), 'error');
        }
      });
      const exportCard = card({ icon: 'file-arrow-down', title: tr('Export Data', '导出数据'), desc: tr('Back up your saved progress as JSON.', '将保存的进度备份为 JSON。') },
        h('div', { class: 'ysrp-actions' }, copyBtn, downloadBtn),
        h('div', { class: 'ysrp-hint', text: tr('Exports all saved records from the currently selected backend.', '导出当前存储后端中的所有记录。') }),
        exportMsg.el
      );

      /* ------------------------------------------------ import card */
      const importMsg = messageLine();
      const overwrite = h('input', { type: 'checkbox', class: 'ysrp-overwrite', id: 'ysrp-overwrite' });
      const overwriteRow = h('div', { class: 'ysrp-check-row' },
        h('label', { class: 'ysrp-check' }, overwrite, h('span', { text: tr('Overwrite', '覆盖') })),
        h('span', { class: 'ysrp-hint', text: tr('Deletes all records of the current backend before importing.', '导入前先删除当前存储后端中的全部记录。') })
      );
      const textarea = h('textarea', { class: 'ysrp-textarea', rows: 4, placeholder: tr('Paste exported JSON here...', '在此粘贴导出的 JSON...') });
      const runImport = (text: string) => {
        let payload: unknown;
        try {
          payload = JSON.parse(text);
          const count = importData(payload, { overwrite: overwrite.checked });
          importMsg.set(tr('Imported {count} record(s).', '已导入 {count} 条记录。', { count }), 'success');
          refreshSettingsHeader();
        } catch (err) {
          console.warn('[Video Memory] Import failed:', err);
          importMsg.set(tr('Import failed: {message}', '导入失败：{message}', { message: errorMessage(err) }), 'error');
        }
      };
      const importBtn = button(tr('Import from Text', '从文本导入'), { icon: 'file-arrow-up', title: tr('Import from pasted JSON', '从粘贴的 JSON 导入') });
      importBtn.addEventListener('click', ev => {
        ev.preventDefault();
        const text = textarea.value.trim();
        if (!text) {
          importMsg.set(tr('Nothing to import.', '没有可导入的内容。'));
          return;
        }
        runImport(text);
      });
      const noFile = tr('No file chosen', '未选择文件');
      const fileName = h('span', { class: 'ysrp-file-name', text: noFile });
      const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'ysrp-file-input' });
      const fileBox = h('label', { class: 'ysrp-file', tabIndex: 0, title: tr('Select an export JSON file', '选择要导入的 JSON 文件') },
        h('span', { class: 'ysrp-file-label', text: tr('Choose File', '选择文件') }), fileName, fileInput);
      // T-78: Enter / Space on the focused chooser opens the picker.
      fileBox.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        ev.preventDefault();
        try {
          const picker = fileInput as HTMLInputElement & { showPicker?: () => void };
          if (typeof picker.showPicker === 'function') picker.showPicker();
          else fileInput.click();
        } catch {
          fileInput.click();
        }
      });
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          fileName.textContent = noFile;
          return;
        }
        // Fix T known issue 10: the chosen name stays visible while the file is read.
        fileName.textContent = file.name;
        file.text().then(text => {
          textarea.value = text || '';
          runImport(text || '');
        }).catch(err => {
          importMsg.set(tr('Could not read the file: {message}', '无法读取文件：{message}', { message: errorMessage(err) }), 'error');
        }).finally(() => {
          fileInput.value = '';
          fileName.textContent = noFile;
        });
      });
      const importCard = card({ icon: 'file-arrow-up', title: tr('Import Data', '导入数据'), desc: tr('Restore a previous export to merge or replace your saved records.', '导入之前的导出文件，用于合并或替换记录。') },
        overwriteRow,
        textarea,
        h('div', { class: 'ysrp-actions' }, importBtn, fileBox),
        h('div', { class: 'ysrp-hint', text: tr('Imports records into the currently selected backend.', '将记录导入到当前选择的存储后端。') }),
        importMsg.el
      );

      pane.append(backendCard, exportCard, importCard);
    },
    onShow() {
      refreshSettingsHeader();
    }
  };
}
