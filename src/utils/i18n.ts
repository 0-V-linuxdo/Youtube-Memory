// Interface language: preference, browser detection, translation table, bilingual pick (C-40..C-56, L-47..L-50).

import { EVT_LANGUAGE, KEY_LANGUAGE } from './constants';
import { readSetting, writeSetting } from './storage';

export type LanguagePref = 'auto' | 'zh' | 'en';
export type Language = 'zh' | 'en';
export type Params = Record<string, unknown>;
export interface Bilingual { en: string | ((p: Params) => string); zh: string | ((p: Params) => string); }

export const LANGUAGE_OPTIONS: readonly LanguagePref[] = ['auto', 'zh', 'en'];

/** C-41 normalisation. */
export function normalizePreference(value: unknown): LanguagePref {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'auto') return 'auto';
  if (s.startsWith('zh')) return 'zh';
  if (s.startsWith('en')) return 'en';
  return 'auto';
}

/**
 * C-42 browser language. Fixes C-Q18: the first candidate that is Chinese or English wins,
 * instead of only looking at the very first candidate.
 */
export function detectBrowserLanguage(): Language {
  const candidates: string[] = [];
  try {
    const nav = navigator as Navigator & { userLanguage?: string };
    if (Array.isArray(nav.languages)) candidates.push(...nav.languages);
    if (nav.language) candidates.push(nav.language);
    if (nav.userLanguage) candidates.push(nav.userLanguage);
  } catch { /* ignore */ }
  for (const c of candidates) {
    const s = String(c || '').trim().toLowerCase();
    if (!s) continue;
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('en')) return 'en';
  }
  return 'en';
}

let preference: LanguagePref = normalizePreference(readSetting(KEY_LANGUAGE));

export function getPreference(): LanguagePref { return preference; }

export function getLanguage(): Language {
  return preference === 'auto' ? detectBrowserLanguage() : preference;
}

/** C-48: change the preference, persist to both stores, broadcast. */
export function setPreference(value: unknown): boolean {
  const next = normalizePreference(value);
  if (next === preference) return false;
  preference = next;
  writeSetting(KEY_LANGUAGE, next);
  try {
    document.dispatchEvent(new CustomEvent(EVT_LANGUAGE, { detail: { preference: next, resolved: getLanguage() } }));
  } catch { /* ignore */ }
  return true;
}

/** C-52 template interpolation. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{([^{}]*)\}/g, (_m, name: string) => {
    const key = name.trim();
    if (!key || !(key in params)) return '';
    const v = params[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

function resolveValue(v: unknown, params?: Params): string | null {
  let out = v;
  if (typeof out === 'function') {
    try { out = (out as (p: Params) => unknown)(params || {}); } catch { out = ''; }
  }
  return typeof out === 'string' ? out : null;
}

/**
 * C-53 bilingual pick. Fixes C-Q17: an empty string counts as missing here too,
 * consistent with key-based translation.
 */
export function pick(obj: Bilingual | null | undefined, params?: Params): string {
  if (!obj || typeof obj !== 'object') return '';
  const lang = getLanguage();
  const order: Language[] = lang === 'zh' ? ['zh', 'en'] : ['en', 'zh'];
  for (const l of order) {
    const s = resolveValue(obj[l], params);
    if (s) return interpolate(s, params);
  }
  return '';
}

/** Shorthand: tr('English {x}', '中文 {x}', { x }). */
export function tr(en: string, zh: string, params?: Params): string {
  return pick({ en, zh }, params);
}

/* ----------------------------------------------------------- key-based table (C-50, C-51) */

type Table = { [key: string]: string | Table };
const tables: Record<Language, Table> = { en: {}, zh: {} };

function deepMerge(target: Table, source: Table): void {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k] as Table, v);
    } else {
      target[k] = v;
    }
  }
}

export function extend(bundle: Record<string, Table>): void {
  for (const [lang, table] of Object.entries(bundle)) {
    deepMerge(tables[lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'], table);
  }
}

function lookup(table: Table, path: string): string | null {
  let cur: string | Table | undefined = table;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  return typeof cur === 'string' && cur !== '' ? cur : null;
}

export function t(path: string, fallback?: string, params?: Params): string {
  if (!path) return fallback !== undefined ? interpolate(fallback, params) : path;
  const lang = getLanguage();
  const hit = lookup(tables[lang], path) ?? lookup(tables.en, path) ?? lookup(tables.zh, path);
  if (hit !== null) return interpolate(hit, params);
  if (fallback !== undefined) return interpolate(fallback, params);
  return path;
}

// C-54..C-56 built-in entries for the language panel.
extend({
  en: {
    language: {
      tabLabel: 'Display',
      heading: 'Language',
      description: 'Choose how the script UI should appear.',
      options: { auto: 'Auto', zh: 'Chinese', en: 'English' },
      optionHints: { auto: 'Match the browser language automatically.', zh: 'Always use Simplified Chinese.', en: 'Always use English.' },
      badges: { auto: 'Auto', zh: 'ZH', en: 'EN' }
    }
  },
  zh: {
    language: {
      tabLabel: '界面',
      heading: '界面语言',
      description: '为脚本 UI 选择显示语言。',
      options: { auto: '自动', zh: '中文', en: '英文' },
      optionHints: { auto: '自动跟随浏览器语言。', zh: '始终使用简体中文。', en: '始终使用英文。' },
      badges: { auto: '自动', zh: '中文', en: '英文' }
    }
  }
});

/** Display name of a language code (U-12). */
export function languageName(code: string): string {
  return code === 'zh' ? tr('Chinese', '中文') : tr('English', '英文');
}
