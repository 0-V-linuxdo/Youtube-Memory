// Network helper: GM_xmlhttpRequest when available (needed for @connect hosts), otherwise fetch (N-7.12).

export interface HttpResponse {
  status: number;
  ok: boolean;
  text: string;
  json<T = unknown>(): T;
}

export interface HttpRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Force the page's own fetch even when GM_xmlhttpRequest exists. */
  preferFetch?: boolean;
}

function wrap(status: number, text: string): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    text,
    json<T>() { return JSON.parse(text) as T; }
  };
}

export function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  const method = req.method || 'GET';
  if (!req.preferFetch && typeof GM_xmlhttpRequest === 'function') {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method,
          url: req.url,
          headers: req.headers,
          data: req.body,
          timeout: req.timeoutMs,
          onload: res => resolve(wrap(res.status, res.responseText || '')),
          onerror: err => reject(new Error(`Network error: ${String((err as { error?: string })?.error || 'request failed')}`)),
          ontimeout: () => reject(new Error('Request timed out')),
          onabort: () => reject(new Error('Request aborted'))
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = 0;
  if (controller && req.timeoutMs) timer = window.setTimeout(() => controller.abort(), req.timeoutMs);
  return fetch(req.url, {
    method,
    headers: req.headers,
    body: req.body,
    credentials: 'omit',
    cache: 'no-store',
    signal: controller ? controller.signal : undefined
  }).then(async res => {
    const text = await res.text();
    return wrap(res.status, text);
  }).finally(() => { if (timer) clearTimeout(timer); });
}
