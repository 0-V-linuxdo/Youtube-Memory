// Drive sync plugin (N-7): per-video JSON files in the user's own Google Drive folder.

import { definePlugin } from '../../api/plugins';
import { recordChanges } from '../../api/records';
import { HOMEPAGE_URL, KEY_DRIVE_FULL_SYNC } from '../../utils/constants';
import { h } from '../../utils/dom';
import { tr } from '../../utils/i18n';
import { readSetting } from '../../utils/storage';
import { errorMessage } from '../../utils/text';
import { button, card, field, messageLine, secretInput } from '../_core/settings/ui';
import { readCredentials, saveCredentials } from './drive';
import { DriveSync, type SyncStatus } from './sync';

function statusText(sync: DriveSync, s: SyncStatus): { text: string; tone: 'neutral' | 'success' | 'error' } {
  if (!sync.configured()) return { text: tr('Not configured: fill in the three fields below.', '未配置：请填写下面三项凭据。'), tone: 'neutral' };
  switch (s.state) {
    case 'start':
    case 'progress':
      return { text: s.total ? tr('Syncing ({done} / {total})', '同步中（已完成 {done} / 共 {total}）', { done: s.done, total: s.total }) : tr('Syncing…', '同步中…'), tone: 'neutral' };
    case 'done':
      return { text: tr('Synced ({time})', '已同步（{time}）', { time: new Date(s.at).toLocaleTimeString() }), tone: 'success' };
    case 'deferred':
      return { text: tr('Deferred: the next upload waits a few seconds.', '已推迟：下一次上传稍后进行。'), tone: 'neutral' };
    case 'error':
      return { text: tr('Error: {message}', '出错：{message}', { message: s.message }), tone: 'error' };
    default:
      return { text: tr('Ready.', '已就绪。'), tone: 'neutral' };
  }
}

export default definePlugin({
  name: 'DriveSync',
  displayName: { en: 'Drive sync', zh: '云同步' },
  description: {
    en: 'Syncs every video record to a folder in your own Google Drive. Does nothing until credentials are set.',
    zh: '把每个视频的记录同步到你自己的 Google Drive 文件夹；未填写凭据时不做任何事。'
  },
  authors: ['0_V'],
  icon: 'cloud',
  enabledByDefault: true,
  start(ctx) {
    const sync = new DriveSync();
    ctx.onDispose(() => sync.stop());
    ctx.onDispose(recordChanges.on(change => sync.handleChange(change)));
    // N-7.8 / D-9: pull the remote record before every restore (only when configured).
    ctx.beforeRestore(videoId => (sync.configured() ? sync.pull(videoId) : undefined));

    const statusListeners = new Set<(s: SyncStatus) => void>();
    sync.onStatus = s => statusListeners.forEach(fn => fn(s));
    ctx.onDispose(() => { sync.onStatus = null; statusListeners.clear(); });

    ctx.addTab({
      id: 'drive',
      group: 'plugins',
      order: 30,
      icon: 'cloud',
      label: () => tr('Drive sync', '云同步'),
      render(pane) {
        const creds = readCredentials();
        const clientId = h('input', { class: 'ysrp-input', type: 'text', value: creds.clientId, placeholder: 'xxxx.apps.googleusercontent.com', autocomplete: 'off', spellcheck: false });
        const clientSecret = h('input', { class: 'ysrp-input', type: 'password', value: creds.clientSecret, autocomplete: 'new-password', spellcheck: false });
        const refreshToken = h('input', { class: 'ysrp-input', type: 'password', value: creds.refreshToken, autocomplete: 'new-password', spellcheck: false });
        const labels = { show: tr('Show', '显示'), hide: tr('Hide', '隐藏') };
        const status = messageLine();
        const result = messageLine();
        const renderStatus = (s: SyncStatus) => {
          const { text, tone } = statusText(sync, s);
          status.set(text, tone);
        };
        statusListeners.add(renderStatus);
        renderStatus(sync.status);

        const saveBtn = button(tr('Save & verify', '保存并验证'), { icon: 'check' });
        saveBtn.addEventListener('click', async ev => {
          ev.preventDefault();
          saveCredentials({ clientId: clientId.value, clientSecret: clientSecret.value, refreshToken: refreshToken.value });
          sync.reloadCredentials();
          renderStatus(sync.status);
          if (!sync.configured()) {
            result.set(tr('Please fill in all three fields.', '请填写全部三项。'), 'error');
            return;
          }
          saveBtn.disabled = true;
          result.set(tr('Verifying…', '正在验证…'));
          try {
            await sync.client.accessToken(true);
            result.set(tr('Credentials verified.', '凭据验证成功。'), 'success');
            if (readSetting(KEY_DRIVE_FULL_SYNC) !== '1') sync.requestFullSync();
          } catch (err) {
            result.set(tr('Verification failed: {message}', '验证失败：{message}', { message: errorMessage(err) }), 'error');
          } finally {
            saveBtn.disabled = false;
          }
        });
        const uploadAll = button(tr('Upload all', '全部上传'), { icon: 'cloud-arrow-up' });
        uploadAll.addEventListener('click', ev => {
          ev.preventDefault();
          if (!sync.configured()) {
            result.set(tr('Please save valid credentials first.', '请先保存有效的凭据。'), 'error');
            return;
          }
          result.set('');
          sync.uploadAll();
        });

        pane.append(
          card({ icon: 'cloud', title: tr('Google Drive sync', 'Google Drive 同步'), desc: tr('Each video is stored as "<title>｜<id>.json" in the "[Youtube] Video Memory" folder of your Drive.', '每个视频以“<标题>｜<id>.json”保存在你的云端硬盘“[Youtube] Video Memory”文件夹中。') },
            status.el,
            h('div', { class: 'ysrp-fields' },
              field(tr('Client ID', '客户端 ID'), clientId),
              field(tr('Client secret', '客户端密钥'), secretInput(clientSecret, labels)),
              field(tr('Refresh token', 'Refresh token'), secretInput(refreshToken, labels))
            ),
            h('div', { class: 'ysrp-actions' }, saveBtn, uploadAll),
            result.el
          ),
          card({ icon: 'circle-question', title: tr('How to get credentials', '如何获取凭据') },
            h('ol', { class: 'ysrp-steps' },
              h('li', { text: tr('In Google Cloud Console create a project and an OAuth client (type "Web application"); add https://developers.google.com/oauthplayground as a redirect URI.', '在 Google Cloud Console 新建项目和 OAuth 客户端（类型“Web 应用”），把 https://developers.google.com/oauthplayground 加为重定向 URI。') }),
              h('li', { text: tr('Enable the Google Drive API for the project.', '为该项目启用 Google Drive API。') }),
              h('li', { text: tr('Open the OAuth 2.0 Playground, tick "Use your own OAuth credentials", authorise the https://www.googleapis.com/auth/drive scope and exchange the code for a refresh token.', '打开 OAuth 2.0 Playground，勾选“Use your own OAuth credentials”，授权 https://www.googleapis.com/auth/drive 范围，然后用授权码换取 refresh token。') }),
              h('li', {}, tr('Paste the three values above and click “Save & verify”. More: ', '把三项填到上面并点“保存并验证”。更多说明：'),
                h('a', { href: HOMEPAGE_URL, target: '_blank', rel: 'noopener noreferrer', text: HOMEPAGE_URL }))
            )
          )
        );
        return () => statusListeners.delete(renderStatus);
      }
    });

    sync.start();
  }
});
