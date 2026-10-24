// Toasts plugin (N-10.5): switches the shared toast stack (api/toast.ts) on, sets its duration and
// which optional toasts are shown. Errors are always shown while the plugin is on.

import { definePlugin, findPlugin, isEnabled, pluginsChanged, type PluginContext } from '../../api/plugins';
import { configureToasts } from '../../api/toast';
import { tr } from '../../utils/i18n';

const cloudOn = (): boolean => {
  const drive = findPlugin('DriveSync');
  return Boolean(drive && isEnabled(drive));
};

function apply(ctx: PluginContext): void {
  configureToasts({
    durationMs: Math.min(10, Math.max(2, Number(ctx.settings.get('duration')) || 4)) * 1000,
    topics: {
      resume: ctx.settings.get<boolean>('resume') !== false,
      cloud: ctx.settings.get<boolean>('cloud') !== false && cloudOn()
    }
  });
}

export default definePlugin({
  name: 'Toasts',
  displayName: { en: 'Toasts', zh: '提示' },
  description: {
    en: 'Short notices at the bottom of the page: restored progress, save and sync errors.',
    zh: '在页面底部弹出简短提示：已恢复进度、保存或同步出错。'
  },
  authors: ['0_V'],
  icon: 'bell',
  enabledByDefault: true,
  settings: {
    resume: {
      type: 'switch',
      default: true,
      label: { en: 'Notify when progress is restored', zh: '恢复进度时提示' }
    },
    cloud: {
      type: 'switch',
      default: true,
      label: { en: 'Notify when cloud progress is applied', zh: '云端进度更新时提示' },
      disabled: () => !cloudOn(),
      disabledReason: { en: 'Requires the Drive sync plugin', zh: '需要开启云同步插件' }
    },
    duration: {
      type: 'slider',
      default: 4,
      min: 2,
      max: 10,
      step: 1,
      label: { en: 'Toast duration (seconds)', zh: '提示停留时间（秒）' },
      format: n => tr('{n} s', '{n} 秒', { n })
    }
  },
  start(ctx) {
    apply(ctx);
    ctx.settings.onChange(() => apply(ctx));
    ctx.onDispose(pluginsChanged.on(() => apply(ctx)));
    ctx.onDispose(() => configureToasts(null));
  }
});
