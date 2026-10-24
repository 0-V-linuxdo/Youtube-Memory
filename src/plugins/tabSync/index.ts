// Tab sync plugin (N-11): YouTube tabs of the same origin tell each other about record and settings
// writes over a BroadcastChannel, so lists, plugin choices and the interface language stay in step and
// a paused stale tab never overwrites newer progress (the engine's guard, N-11.4).

import { reloadPluginChoices, definePlugin, settingsChanged } from '../../api/plugins';
import { applyRemoteChange, recordChanges, type ChangeKind } from '../../api/records';
import { KEY_LANGUAGE, KEY_PLUGINS, KEY_STORAGE_MODE } from '../../utils/constants';
import { reloadPreference } from '../../utils/i18n';
import { onSettingWrite, reloadMode } from '../../utils/storage';

const CHANNEL = 'ysrp-video-memory';
const KINDS: ChangeKind[] = ['content', 'meta', 'sync', 'delete', 'bulk'];

type Message =
  | { tab: string; type: 'record'; videoId: string; kind: ChangeKind }
  | { tab: string; type: 'setting'; key: string };

function receive(msg: Message): void {
  if (msg.type === 'record') {
    if (typeof msg.videoId !== 'string' || !KINDS.includes(msg.kind)) return;
    applyRemoteChange(msg.videoId, msg.kind);
    return;
  }
  if (msg.type !== 'setting' || typeof msg.key !== 'string' || !msg.key.startsWith('YSRP_')) return;
  switch (msg.key) {
    case KEY_PLUGINS:
      reloadPluginChoices();
      break;
    case KEY_LANGUAGE:
      reloadPreference();
      break;
    case KEY_STORAGE_MODE:
      reloadMode();
      applyRemoteChange('', 'bulk');
      break;
    default:
      // Transcript / Drive settings are read from storage on every use; open dialogs redraw.
      settingsChanged.emit({ plugin: '*', key: msg.key });
  }
}

export default definePlugin({
  name: 'TabSync',
  displayName: { en: 'Tab sync', zh: '多标签页同步' },
  description: {
    en: 'Keeps records, settings and the interface language in step across open YouTube tabs; a paused tab never overwrites newer progress.',
    zh: '在打开的多个 YouTube 标签页之间同步记录、设置和界面语言；暂停的旧标签页不会覆盖更新的进度。'
  },
  authors: ['0_V'],
  icon: 'clone',
  enabledByDefault: true,
  start(ctx) {
    if (typeof BroadcastChannel !== 'function') return;
    const tab = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const channel = new BroadcastChannel(CHANNEL);
    ctx.onDispose(() => channel.close());
    const post = (msg: Message) => {
      try { channel.postMessage(msg); } catch (err) { console.warn('[Video Memory] Tab sync post failed:', err); }
    };
    // Applying a remote change can itself write (e.g. a plugin starting); those writes are not echoed back.
    let applying = false;
    channel.onmessage = ev => {
      const msg = ev.data as Message | null;
      if (!msg || typeof msg !== 'object' || msg.tab === tab) return;
      applying = true;
      try { receive(msg); } catch (err) { console.error('[Video Memory] Tab sync failed:', err); } finally { applying = false; }
    };
    ctx.onDispose(recordChanges.on(change => {
      if (change.remote || applying) return;
      post({ tab, type: 'record', videoId: change.videoId, kind: change.kind });
    }));
    ctx.onDispose(onSettingWrite(key => {
      if (!applying && key.startsWith('YSRP_')) post({ tab, type: 'setting', key });
    }));
  }
});
