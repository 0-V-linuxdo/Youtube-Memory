// Ambient declarations for the userscript environment.

/** Version string injected by build.ts (e.g. "[20261010] v2.2.0"). */
declare const __VERSION__: string;

declare module '*.css' {
  const css: string;
  export default css;
}

interface GMXhrResponse {
  status: number;
  responseText: string;
  responseHeaders?: string;
}

interface GMXhrDetails {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload?: (res: GMXhrResponse) => void;
  onerror?: (err: unknown) => void;
  ontimeout?: () => void;
  onabort?: () => void;
}

declare function GM_getValue(key: string, defaultValue?: unknown): unknown;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];
declare function GM_xmlhttpRequest(details: GMXhrDetails): unknown;
