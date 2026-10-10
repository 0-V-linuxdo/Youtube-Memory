// "Storage" tab (N-5.7.1 layout; behaviour T-15..T-87): backend drop-down + confirmed migration,
// export (copy / download / iOS share), import with a confirmed overwrite.

import { confirmDialog } from '../../../api/dialogs';
import { countRecords } from '../../../api/records';
import { refreshSettingsHeader, type TabDef } from '../../../api/tabs';
import {
  actions, button, copyText, group, messageLine, selectControl, setButtonLabel, setRowDesc, settingsRow, switchControl, textArea
} from '../../../api/ui';
import { h } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { exportData, getMode, gmAvailable, importData, switchMode, type StorageMode } from '../../../utils/storage';
import { errorMessage } from '../../../utils/text';

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
  return mode === 'gm' ? tr('GM storage', 'GM 存储') : tr('Browser storage', '浏览器本地存储');
}

function modeHint(mode: StorageMode): string {
  if (mode === 'gm') {
    return gmAvailable
      ? tr('Tampermonkey-backed storage that can sync across profiles.', '由 Tampermonkey 提供、可在配置间同步的存储。')
      : tr('GM storage is not available in this userscript manager.', '当前脚本管理器不提供 GM 存储。');
  }
  return tr('Fast storage scoped to this browser profile.', '快速、仅在本浏览器配置中可用的存储。');
}

export function createStorageTab(): TabDef {
  return {
    id: 'storage',
    group: 'main',
    order: 20,
    icon: 'database',
    label: () => tr('Storage', '存储'),
    info: () => tr('Choose where progress is stored, and back it up or restore it as JSON.', '选择进度的存储位置，并以 JSON 备份或恢复记录。'),
    storageBadge: true,
    render(pane) {
      /* ------------------------------------------------ backend */
      const backendMsg = messageLine('ysrp-backend-msg');
      const mode = selectControl([
        { value: 'local', label: tr('Browser storage', '浏览器本地存储') },
        { value: 'gm', label: tr('GM storage', 'GM 存储'), disabled: !gmAvailable }
      ], getMode(), value => {
        backendMsg.set('');
        const desc = modeHint(value === 'gm' ? 'gm' : 'local');
        setRowDesc(locationRow, gmAvailable ? desc : `${desc} ${modeHint('gm')}`.trim());
      }, { cls: 'ysrp-storage-mode', label: tr('Storage location', '存储位置') });
      const locationRow = settingsRow({ title: tr('Storage location', '存储位置'), desc: modeHint(getMode()), control: mode.el });
      if (!gmAvailable) setRowDesc(locationRow, `${modeHint(getMode())} ${modeHint('gm')}`);

      const applyLabel = tr('Apply & migrate', '应用并迁移');
      const applyBtn = button(applyLabel, { variant: 'primary', cls: 'ysrp-apply-migrate', title: tr('Switch storage backend and migrate data.', '切换存储方式并迁移数据。') });
      applyBtn.addEventListener('click', async ev => {
        ev.preventDefault();
        const target: StorageMode = mode.value() === 'gm' ? 'gm' : 'local';
        const from = getMode();
        if (target === from) {
          backendMsg.set(tr('Already using {mode}.', '当前已在使用{mode}。', { mode: modeName(from) }));
          return;
        }
        const count = countRecords();
        const ok = await confirmDialog({
          title: tr('Migrate records', '迁移记录'),
          desc: tr('Move {count} record(s) from {from} to {to}? They are removed from {from} after every record has been copied and verified.',
            '将把 {count} 条记录从{from}移动到{to}。全部复制并校验成功后，才会从{from}中删除。', { count, from: modeName(from), to: modeName(target) }),
          confirmLabel: tr('Migrate', '迁移')
        });
        if (!ok) return;
        applyBtn.disabled = true;
        setButtonLabel(applyBtn, tr('Migrating...', '正在迁移...'));
        try {
          const result = switchMode(target, { migrate: true, clearSource: true });
          if (result.ok) {
            backendMsg.set(tr('Moved {count} record(s) to {mode}.', '已将 {count} 条记录迁移到{mode}。', { count: result.moved, mode: modeName(target) }), 'success');
          } else {
            mode.set(getMode());
            backendMsg.set(tr('Migration failed: {message}', '迁移失败：{message}', { message: result.error || '' }), 'error');
          }
        } catch (err) {
          console.error('[Video Memory] Failed to switch storage:', err);
          mode.set(getMode());
          backendMsg.set(tr('Migration failed: {message}', '迁移失败：{message}', { message: errorMessage(err) }), 'error');
        }
        setRowDesc(locationRow, modeHint(getMode()));
        refreshSettingsHeader();
        window.setTimeout(() => {
          applyBtn.disabled = false;
          setButtonLabel(applyBtn, applyLabel);
        }, 500);
      });
      locationRow.below.style.display = '';
      locationRow.below.append(
        h('div', { class: 'ysrp-note', text: tr('Applying moves every saved record to the selected backend; the old copy is deleted only after all records were verified.', '应用后会把全部记录移动到所选后端；所有记录校验成功后才删除原来的副本。') }),
        actions(applyBtn),
        backendMsg.el
      );

      /* ------------------------------------------------ export */
      const exportMsg = messageLine('ysrp-export-msg');
      const exportJson = () => JSON.stringify(exportData(), null, 2);
      const copyBtn = button(tr('Copy JSON', '复制 JSON'), { variant: 'secondary', cls: 'ysrp-copy-json' });
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
      const downloadBtn = button(tr('Download JSON', '下载 JSON'), { variant: 'primary', cls: 'ysrp-download-json' });
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
              const errName = (err as { name?: string })?.name;
              if (errName === 'AbortError' || errName === 'NotAllowedError') {
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
      const exportRow = settingsRow({
        title: tr('Export data', '导出数据'),
        desc: tr('Exports all saved records from the current backend as JSON.', '把当前存储后端中的所有记录导出为 JSON。'),
        below: [actions(copyBtn, downloadBtn), exportMsg.el]
      });

      /* ------------------------------------------------ import */
      const importMsg = messageLine('ysrp-import-msg');
      const overwrite = switchControl(false, () => importMsg.set(''), { cls: 'ysrp-overwrite', label: tr('Overwrite existing records', '覆盖现有记录') });
      const textarea = textArea({ placeholder: tr('Paste exported JSON here...', '在此粘贴导出的 JSON...'), cls: 'ysrp-import-text' });
      const runImport = async (text: string) => {
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch (err) {
          importMsg.set(tr('Import failed: {message}', '导入失败：{message}', { message: errorMessage(err) }), 'error');
          return;
        }
        if (overwrite.value()) {
          const ok = await confirmDialog({
            title: tr('Overwrite records', '覆盖导入'),
            desc: tr('All {count} record(s) in {mode} are deleted before importing. This cannot be undone.', '导入前会先清空{mode}中的全部 {count} 条记录。此操作无法撤销。', { count: countRecords(), mode: modeName(getMode()) }),
            confirmLabel: tr('Overwrite', '覆盖导入'),
            danger: true
          });
          if (!ok) return;
        }
        try {
          const count = importData(payload, { overwrite: overwrite.value() });
          importMsg.set(tr('Imported {count} record(s).', '已导入 {count} 条记录。', { count }), 'success');
          refreshSettingsHeader();
        } catch (err) {
          console.warn('[Video Memory] Import failed:', err);
          importMsg.set(tr('Import failed: {message}', '导入失败：{message}', { message: errorMessage(err) }), 'error');
        }
      };
      const importBtn = button(tr('Import from text', '从文本导入'), { variant: 'primary', cls: 'ysrp-import-btn' });
      importBtn.addEventListener('click', ev => {
        ev.preventDefault();
        const text = textarea.value.trim();
        if (!text) {
          importMsg.set(tr('Nothing to import.', '没有可导入的内容。'));
          return;
        }
        void runImport(text);
      });
      const noFile = tr('No file chosen', '未选择文件');
      const fileName = h('span', { class: 'ysrp-file-name', text: noFile });
      const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'ysrp-file-input', tabIndex: -1 });
      const chooseBtn = button(tr('Choose file', '选择文件'), { variant: 'secondary', cls: 'ysrp-choose-file', title: tr('Select an export JSON file', '选择要导入的 JSON 文件') });
      chooseBtn.addEventListener('click', ev => {
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
        file.text().then(async text => {
          textarea.value = text || '';
          await runImport(text || '');
        }).catch(err => {
          importMsg.set(tr('Could not read the file: {message}', '无法读取文件：{message}', { message: errorMessage(err) }), 'error');
        }).finally(() => {
          fileInput.value = '';
          fileName.textContent = noFile;
        });
      });
      const overwriteRow = settingsRow({
        title: tr('Overwrite existing records', '覆盖现有记录'),
        desc: tr('Deletes every record of the current backend before importing.', '导入前先删除当前存储后端中的全部记录。'),
        control: overwrite.el
      });
      const importRow = settingsRow({
        title: tr('Import data', '导入数据'),
        desc: tr('Imports records into the current backend.', '把记录导入到当前存储后端。'),
        below: [textarea, actions(importBtn, chooseBtn, fileName, fileInput), importMsg.el]
      });

      pane.appendChild(h('div', { class: 'ysrp-groups' },
        group(tr('Storage backend', '存储后端'), locationRow.el),
        group(tr('Export', '导出'), exportRow.el),
        group(tr('Import', '导入'), overwriteRow.el, importRow.el)
      ));
    },
    onShow() {
      refreshSettingsHeader();
    }
  };
}
