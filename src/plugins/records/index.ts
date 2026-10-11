// Records plugin (N-4.6, N-5.4): the records list as a custom panel in its large settings dialog, plus the
// note and link card buttons. Turning it off removes the list and its menu entry; saving and restoring
// progress is done by the core Engine and keeps working (N-5.4.9).

import { definePlugin } from '../../api/plugins';
import { linkContribution, noteContribution } from './cardButtons';
import { renderRecordsPanel } from './list';

export default definePlugin({
  name: 'Records',
  displayName: { en: 'Records', zh: '记录' },
  description: {
    en: 'Your saved videos: the one playing now comes first, then the most recently saved. Use the buttons on a card for the link, notes or deletion.',
    zh: '已保存的视频：正在播放的排在最前，其余按保存时间从新到旧。用卡片上的按钮查看链接、编辑笔记或删除。'
  },
  authors: ['0_V'],
  icon: 'clock-rotate-left',
  enabledByDefault: true,
  dialogSize: 'lg',
  settings: {
    list: { type: 'custom', render: renderRecordsPanel }
  },
  start(ctx) {
    ctx.addRowButton(noteContribution);
    ctx.addRowButton(linkContribution);
  }
});
