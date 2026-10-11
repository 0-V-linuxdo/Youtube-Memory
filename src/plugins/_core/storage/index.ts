// Storage core plugin (N-4.6, N-5.7.1): storage backend switch and migration, export, import. Its settings
// are three custom panels; the backend itself stays in YSRP_StorageMode (N-5.7.6).

import { definePlugin } from '../../../api/plugins';
import { renderExportPanel, renderImportPanel, renderLocationPanel } from './panels';

export default definePlugin({
  name: 'Storage',
  displayName: { en: 'Storage', zh: '存储' },
  description: {
    en: 'Choose where progress is stored, and back it up or restore it as JSON.',
    zh: '选择进度的存储位置，并以 JSON 备份或恢复记录。'
  },
  authors: ['0_V'],
  icon: 'database',
  required: true,
  settings: {
    location: { type: 'custom', render: renderLocationPanel },
    export: { type: 'custom', render: renderExportPanel },
    import: { type: 'custom', render: renderImportPanel }
  },
  start() {
    // Reading and writing records is done by the engine; this plugin only provides the panels.
  }
});
