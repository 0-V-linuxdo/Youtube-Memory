// Transcript plugin (N-4.6/N-4.7): endpoint settings in its plugin settings dialog (N-5.7.2; L-6..L-32), mapped
// onto YSRP_TranscriptSettings (N-5.7.6), and the record-card transcript button opening the transcript dialog
// (N-5.4.6; R-49..R-62).

import { openDialog } from '../../api/dialogs';
import { definePlugin } from '../../api/plugins';
import { urlVideoId } from '../../api/player';
import { recordChanges } from '../../api/records';
import type { RowContext } from '../../api/rows';
import { currentStatus, type VideoStatus } from '../../api/titles';
import { button, copyText, iconButton, textArea } from '../../api/ui';
import { EVT_VIDEO_STATUS, UNKNOWN_TITLE } from '../../utils/constants';
import { h } from '../../utils/dom';
import { tr } from '../../utils/i18n';
import { errorMessage } from '../../utils/text';
import { cachedTranscript, DEFAULTS, fetchTranscript, forgetTranscript, getSettings, timeoutMinutes, updateSettings } from './service';

/** N-5.7.2 custom panel "Current video": title and video ID lines, kept up to date while shown. */
function renderCurrentVideo(el: HTMLElement): () => void {
  const titleValue = h('span', { class: 'ysrp-transcript-video-title' });
  const idValue = h('span', { class: 'ysrp-mono' });
  const idLine = h('div', {}, tr('Video ID: ', '视频 ID：'), idValue);
  const update = (status: VideoStatus | null) => {
    const id = (status && status.videoId) || urlVideoId();
    if (!id) {
      titleValue.textContent = tr('No active video detected', '未检测到可用的影片');
      idLine.style.display = 'none';
      return;
    }
    titleValue.textContent = status && status.videoId === id && !status.isLoading ? status.title : (status && status.videoId === id ? tr('Loading title…', '正在获取标题…') : UNKNOWN_TITLE);
    idValue.textContent = id;
    idLine.style.display = '';
  };
  update(currentStatus());
  const onStatus = (ev: Event) => update((ev as CustomEvent).detail || null);
  document.addEventListener(EVT_VIDEO_STATUS, onStatus);
  el.appendChild(h('div', { class: 'ysrp-info-lines ysrp-transcript-current' }, h('div', {}, tr('Title: ', '标题：'), titleValue), idLine));
  // Fix L-Q10: the status listener is removed with the dialog.
  return () => document.removeEventListener(EVT_VIDEO_STATUS, onStatus);
}

/** N-5.4.6: large dialog with the status, a read-only text area, Refresh and Copy. Fetch rules R-49..R-62. */
function openTranscriptDialog(ctx: RowContext): void {
  const status = h('div', { class: 'ysrp-transcript-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const area = textArea({ readOnly: true, placeholder: tr('Transcript will appear here…', '字幕内容加载后会显示在这里…'), cls: 'ysrp-transcript-text' });
  const refresh = button(tr('Refresh', '刷新'), { variant: 'secondary', cls: 'ysrp-transcript-refresh' });
  const copy = button(tr('Copy', '复制'), { variant: 'primary', cls: 'ysrp-transcript-copy' });
  copy.disabled = true;
  let loaded = false;
  let busy = false;
  const dlg = openDialog({
    title: tr('Transcript', '字幕'),
    desc: ctx.title(),
    size: 'lg',
    cls: 'ysrp-transcript-dialog',
    content: [status, area],
    footer: [refresh, copy]
  });
  const setStatus = (text: string, tone: 'neutral' | 'success' | 'error' = 'neutral') => {
    status.textContent = text;
    status.classList.toggle('is-error', tone === 'error');
    status.classList.toggle('is-success', tone === 'success');
  };
  const show = (text: string) => {
    area.value = text;
    copy.disabled = !text.trim();
    area.style.opacity = text.trim() ? '1' : '0.7';
  };
  const load = (force: boolean) => {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    // Fix R-Q10: first fetch says "loading", later ones "refreshing".
    setStatus(loaded ? tr('Refreshing…', '正在重新获取…') : tr('Loading…', '正在获取…'));
    fetchTranscript(ctx.videoId, { force, videoUrl: ctx.url }).then(text => {
      if (!dlg.isOpen()) return;
      show(text);
      loaded = true;
      setStatus(tr('Updated ({time})', '已更新（{time}）', { time: new Date().toLocaleTimeString() }), 'success');
    }).catch(err => {
      if (dlg.isOpen()) setStatus(tr('Failed: {message}', '获取失败：{message}', { message: errorMessage(err) }), 'error');
    }).finally(() => {
      busy = false;
      refresh.disabled = false;
    });
  };
  refresh.addEventListener('click', () => load(true));
  copy.addEventListener('click', () => {
    const text = area.value.trim();
    if (!text) {
      setStatus(tr('No transcript content to copy.', '暂无字幕内容可复制。'));
      return;
    }
    copyText(text)
      .then(() => setStatus(tr('Copied.', '已复制。'), 'success'))
      .catch(err => setStatus(tr('Copy failed: {message}', '复制失败：{message}', { message: errorMessage(err) }), 'error'));
  });
  // R-58/R-59: cached text first; otherwise fetch automatically.
  const cached = cachedTranscript(ctx.videoId);
  if (cached) {
    show(cached);
    loaded = true;
    setStatus(tr('Loaded from cache.', '来自缓存。'));
  } else {
    show('');
    load(false);
  }
}

export default definePlugin({
  name: 'Transcript',
  displayName: { en: 'Transcript', zh: '字幕' },
  description: {
    en: 'Transcript endpoint settings plus fetching and copying transcripts from the records list.',
    zh: '字幕接口设置，以及在记录列表中获取、复制字幕。'
  },
  authors: ['0_V'],
  icon: 'closed-captioning',
  enabledByDefault: true,
  // N-5.7.2 / N-5.7.6: values stay in YSRP_TranscriptSettings with part one's normalisation.
  settings: {
    endpoint: {
      type: 'text',
      default: DEFAULTS.endpoint,
      label: { en: 'API endpoint', zh: '接口地址' },
      description: { en: 'OpenAI-compatible chat/completions URL; a bare host gets the path added.', zh: '兼容 OpenAI 的 chat/completions 地址；只填域名时自动补全路径。' },
      placeholder: 'https://example.com/v1/chat/completions',
      get: () => getSettings().endpoint,
      set: value => { updateSettings({ endpoint: String(value ?? '') }); }
    },
    model: {
      type: 'text',
      default: DEFAULTS.model,
      label: { en: 'Model', zh: '模型' },
      placeholder: 'transcript',
      get: () => getSettings().model,
      set: value => { updateSettings({ model: String(value ?? '') }); }
    },
    apiKey: {
      type: 'text',
      secret: true,
      default: DEFAULTS.apiKey,
      label: { en: 'API key', zh: 'API 密钥' },
      description: { en: 'Leave empty to send no key.', zh: '留空则不发送密钥。' },
      placeholder: 'sk-***',
      get: () => getSettings().apiKey,
      set: value => { updateSettings({ apiKey: String(value ?? '') }); }
    },
    timeout: {
      type: 'number',
      default: timeoutMinutes(DEFAULTS.timeoutMs),
      label: { en: 'Timeout (minutes)', zh: '超时（分钟）' },
      description: { en: '1–60 minutes.', zh: '1–60 分钟。' },
      placeholder: '10',
      min: 1,
      max: 60,
      step: 1,
      get: () => Math.min(60, Math.max(1, timeoutMinutes(getSettings().timeoutMs))),
      set: value => {
        const mins = Number(value);
        if (Number.isFinite(mins) && mins > 0) updateSettings({ timeoutMinutes: mins });
      }
    },
    currentVideo: {
      type: 'custom',
      label: { en: 'Current video', zh: '当前视频' },
      render: renderCurrentVideo
    }
  },
  start(ctx) {
    ctx.addRowButton({
      id: 'transcript',
      order: 10,
      create: rowCtx => ({ button: iconButton('closed-captioning', tr('Transcript', '字幕'), 'is-transcript', () => openTranscriptDialog(rowCtx)) })
    });
    // Fix R-Q19: deleting a record also drops its cached transcript.
    ctx.onDispose(recordChanges.on(change => { if (change.kind === 'delete') forgetTranscript(change.videoId); }));
  }
});
