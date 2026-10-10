// Entry point: storage mode, startup cleanup, shared theme, then the plugins (L-78, N-4.3).

import { cleanupRecords } from './api/records';
import { startPlugins } from './api/plugins';
import themeCss from './api/theme.css';
import { plugins } from './generated/plugins';
import { VERSION } from './utils/constants';
import { addStyle } from './utils/dom';
import { getMode } from './utils/storage';

function bootstrap(): void {
  const root = document.documentElement;
  if (root.dataset.ysrpVideoMemory) return; // already running in this document
  root.dataset.ysrpVideoMemory = VERSION;
  getMode();
  try {
    cleanupRecords();
  } catch (err) {
    console.error('[Video Memory] Startup cleanup failed:', err);
  }
  addStyle(themeCss, 'ysrp-theme');
  startPlugins(plugins);
}

bootstrap();
