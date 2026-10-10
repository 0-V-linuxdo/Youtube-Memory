// Transcript plugin (N-4.6/N-4.7): the Transcript settings tab (L-6..L-32) and the record-row
// transcript button + panel (R-49..R-62).

import { definePlugin } from '../../api/plugins';
import { urlVideoId } from '../../api/player';
import { recordChanges } from '../../api/records';
import type { RowContext } from '../../api/rows';
import { currentStatus, type VideoStatus } from '../../api/titles';
import { EVT_VIDEO_STATUS, UNKNOWN_TITLE } from '../../utils/constants';
import { h } from '../../utils/dom';
import { tr } from '../../utils/i18n';
import { errorMessage } from '../../utils/text';
import { card, field, iconButton, infoRow, secretInput, setIcon } from '../_core/settings/ui';
import { copyText } from '../_core/settings/rowParts';
import { cachedTranscript, fetchTranscript, forgetTranscript, getSettings, timeoutMinutes, updateSettings } from './service';

function renderTab(pane: HTMLElement): () => void {
  const settings = getSettings();
  const endpoint = h('input', { class: 'ysrp-input', type: 'text', value: settings.endpoint, placeholder: 'https://example.com/v1/chat/completions', autocomplete: 'off', spellcheck: false });
  const model = h('input', { class: 'ysrp-input', type: 'text', value: settings.model, placeholder: 'transcript', autocomplete: 'off', spellcheck: false });
  const apiKey = h('input', { class: 'ysrp-input', type: 'password', value: settings.apiKey, placeholder: 'sk-***', autocomplete: 'new-password', spellcheck: false });
  const minutes = Math.min(60, Math.max(1, timeoutMinutes(settings.timeoutMs)));
  const timeout = h('input', { class: 'ysrp-input', type: 'number', min: '1', max: '60', step: '1', value: String(minutes), placeholder: '10' });

  let timer = 0;
  const save = () => {
    const mins = parseFloat(timeout.value);
    updateSettings({
      endpoint: endpoint.value,
      model: model.value,
      apiKey: apiKey.value,
      timeoutMinutes: Number.isFinite(mins) && mins > 0 ? mins : undefined
    });
  };
  // L-19: 250 ms debounce on input/change.
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(save, 250);
  };
  for (const el of [endpoint, model, apiKey, timeout]) {
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  }

  const settingsCard = card({
    icon: 'closed-captioning',
    title: tr('Subtitles · Transcript', '字幕与接口设置'),
    desc: tr('Configure the OpenAI-compatible endpoint used for subtitles. Fetching lives in the Records tab.', '配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。')
  },
    h('div', { class: 'ysrp-fields' },
      field(tr('API Endpoint', 'API 接口路径'), endpoint),
      field(tr('Model', '模型名称'), model),
      field(tr('API Key', 'API 密钥'), secretInput(apiKey, { show: tr('Show', '显示'), hide: tr('Hide', '隐藏') }), tr('Leave empty to send no key.', '留空则不发送密钥。')),
      field(tr('Timeout (minutes)', '超时时长（分钟）'), timeout)
    )
  );

  const titleValue = h('span', { class: 'ysrp-info-value' });
  const idValue = h('span', { class: 'ysrp-info-value ysrp-mono' });
  const idRow = infoRow(tr('Video ID', '视频 ID'), idValue);
  const titleLabel = h('span', { class: 'ysrp-info-label', text: tr('Active video', '当前视频') });
  const update = (status: VideoStatus | null) => {
    const id = (status && status.videoId) || urlVideoId();
    if (!id) {
      titleValue.textContent = tr('No active video detected', '未检测到可用的影片');
      idRow.style.display = 'none';
      return;
    }
    titleValue.textContent = status && status.videoId === id && !status.isLoading ? status.title : (status && status.videoId === id ? tr('Loading title…', '正在获取标题…') : UNKNOWN_TITLE);
    idValue.textContent = id;
    idRow.style.display = '';
  };
  update(currentStatus());
  const onStatus = (ev: Event) => update((ev as CustomEvent).detail || null);
  document.addEventListener(EVT_VIDEO_STATUS, onStatus);

  const statusCard = card({ icon: 'pen-to-square', title: tr('Status & Tips', '状态与提示') },
    h('div', { class: 'ysrp-hint', text: tr('These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.', '设置立即生效，具体字幕获取请在“记录”标签中触发。') }),
    h('div', { class: 'ysrp-info' }, h('div', { class: 'ysrp-info-row' }, titleLabel, titleValue), idRow)
  );
  pane.append(settingsCard, statusCard);
  return () => {
    // Fix L-Q10: the status listener is removed with the pane.
    document.removeEventListener(EVT_VIDEO_STATUS, onStatus);
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
}

/** R-57: status text without the leading "Transcript"/"字幕" (fixes R-Q8: the full message is kept). */
function createRowParts(ctx: RowContext) {
  const ui = ctx.ui;
  const status = h('span', { class: 'ysrp-panel-status' });
  const refreshBtn = iconButton('arrows-rotate', tr('Refresh transcript', '刷新字幕'), 'is-refresh');
  const copyBtn = iconButton('copy', tr('Copy transcript', '复制字幕'), 'is-copy');
  copyBtn.disabled = true;
  const area = h('textarea', { class: 'ysrp-textarea ysrp-transcript-text', readOnly: true, rows: 5, placeholder: tr('Transcript will appear here…', '字幕内容加载后会显示在这里…') });
  const panel = h('div', { class: 'ysrp-panel ysrp-transcript-container' },
    h('div', { class: 'ysrp-panel-head' },
      h('span', { class: 'ysrp-panel-label' }, tr('Transcript', '字幕'), ' ', status),
      h('span', { class: 'ysrp-panel-tools' }, refreshBtn, copyBtn)
    ),
    area
  );
  const button = iconButton('closed-captioning', '', 'is-transcript');
  let loaded = false;
  let busy = false;

  const setStatus = (text: string, tone: 'neutral' | 'success' | 'error' = 'neutral') => {
    status.textContent = text;
    status.classList.toggle('is-error', tone === 'error');
    status.classList.toggle('is-success', tone === 'success');
    area.title = text || area.placeholder;
  };
  const setOpen = (open: boolean) => {
    ui.transcriptOpen = open;
    panel.style.display = open ? 'flex' : 'none';
    const tip = open ? tr('Hide transcript', '隐藏字幕') : tr('Show transcript', '显示字幕');
    button.title = tip;
    button.setAttribute('aria-label', tip);
  };
  const setBusy = (on: boolean) => {
    busy = on;
    button.disabled = false;
    refreshBtn.disabled = on;
    refreshBtn.querySelector('i')?.classList.toggle('fa-spin', on);
  };
  const show = (text: string) => {
    area.value = text;
    copyBtn.disabled = !text.trim();
    area.style.opacity = text.trim() ? '1' : '0.7';
  };
  const load = (force: boolean) => {
    if (busy) return;
    setBusy(true);
    // Fix R-Q10: first fetch says "loading", later ones "refreshing".
    setStatus(loaded ? tr('Refreshing…', '正在重新获取…') : tr('Loading…', '正在获取…'));
    fetchTranscript(ctx.videoId, { force, videoUrl: ctx.url }).then(text => {
      show(text);
      loaded = true;
      setStatus(tr('Updated ({time})', '已更新（{time}）', { time: new Date().toLocaleTimeString() }), 'success');
    }).catch(err => {
      setStatus(tr('Failed: {message}', '获取失败：{message}', { message: errorMessage(err) }), 'error');
    }).finally(() => setBusy(false));
  };

  button.addEventListener('click', ev => {
    ev.preventDefault();
    const open = ui.transcriptOpen !== true;
    setOpen(open);
    if (open && !loaded) load(false);
  });
  refreshBtn.addEventListener('click', ev => {
    ev.preventDefault();
    setOpen(true);
    load(true);
  });
  copyBtn.addEventListener('click', ev => {
    ev.preventDefault();
    const text = area.value.trim();
    if (!text) {
      setStatus(tr('No transcript content to copy.', '暂无字幕内容可复制。'));
      return;
    }
    copyText(text).then(() => {
      setIcon(copyBtn, 'check');
      copyBtn.classList.add('is-success');
      window.setTimeout(() => { setIcon(copyBtn, 'copy'); copyBtn.classList.remove('is-success'); }, 1000);
      setStatus(tr('Copied.', '已复制。'), 'success');
    }).catch(err => setStatus(tr('Copy failed: {message}', '复制失败：{message}', { message: errorMessage(err) }), 'error'));
  });

  // R-58/R-59: restore the open state and cached text.
  const cached = cachedTranscript(ctx.videoId);
  if (cached) {
    show(cached);
    loaded = true;
    setStatus(tr('Loaded from cache.', '来自缓存。'));
  }
  setOpen(ui.transcriptOpen === true);
  if (ui.transcriptOpen === true && !loaded) load(false);
  return { button, panel };
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
  start(ctx) {
    ctx.addTab({
      id: 'transcript',
      group: 'plugins',
      order: 20,
      icon: 'closed-captioning',
      label: () => tr('Transcript', '字幕'),
      render: renderTab
    });
    ctx.addRowButton({ id: 'transcript', order: 10, panelOrder: 20, create: createRowParts });
    // Fix R-Q19: deleting a record also drops its cached transcript.
    ctx.onDispose(recordChanges.on(change => { if (change.kind === 'delete') forgetTranscript(change.videoId); }));
  }
});
