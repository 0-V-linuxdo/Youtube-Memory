// Settings core plugin: modal shell (N-5) with the Records, Storage, Display and Plugins tabs,
// plus the core row buttons (note, link). Delete is built into every row.

import { definePlugin } from '../../../api/plugins';
import { setModalController } from '../../../api/tabs';
import { createDisplayTab } from './displayTab';
import { createPluginsTab } from './pluginsTab';
import { createRecordsTab } from './recordsTab';
import { linkContribution, noteContribution } from './rowParts';
import { SettingsModal } from './shell';
import { createStorageTab } from './storageTab';
import css from './style.css';

export default definePlugin({
  name: 'Settings',
  displayName: { en: 'Settings', zh: '设置弹窗' },
  description: {
    en: 'The settings dialog shell with the Records, Storage, Plugins and Display tabs.',
    zh: '设置弹窗外壳，以及记录、存储、插件、界面标签。'
  },
  authors: ['0_V'],
  icon: 'gear',
  required: true,
  start(ctx) {
    ctx.addStyle(css);
    const modal = new SettingsModal();
    modal.start();
    ctx.onDispose(() => modal.destroy());
    setModalController({
      open: tab => modal.open(tab),
      close: () => modal.close(),
      isOpen: () => modal.isOpen(),
      refreshHeader: () => modal.refreshHeader()
    });
    ctx.onDispose(() => setModalController(null));
    ctx.addTab(createRecordsTab(busy => modal.setBusy(busy)));
    ctx.addTab(createStorageTab());
    ctx.addTab(createDisplayTab());
    ctx.addTab(createPluginsTab((content, onClose) => modal.openDialog(content, onClose)));
    ctx.addRowButton(noteContribution);
    ctx.addRowButton(linkContribution);
  }
});
