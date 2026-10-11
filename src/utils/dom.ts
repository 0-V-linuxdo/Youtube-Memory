// DOM construction helpers. Trusted Types safe: nothing here ever touches innerHTML/outerHTML (N-0.4).

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string;
  style?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  on?: { [type: string]: (ev: any) => void };
  [prop: string]: unknown;
}

const RESERVED = new Set(['class', 'style', 'text', 'attrs', 'dataset', 'on']);

function appendChildren(el: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Create an element with properties and children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.style) el.setAttribute('style', props.style);
    if (props.text !== undefined) el.textContent = props.text;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === null || v === undefined || v === false) continue;
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.on) for (const [type, fn] of Object.entries(props.on)) el.addEventListener(type, fn as EventListener);
    for (const [k, v] of Object.entries(props)) {
      if (RESERVED.has(k) || v === undefined) continue;
      if (k === 'innerHTML' || k === 'outerHTML') throw new Error('innerHTML is not allowed (Trusted Types)');
      (el as unknown as Record<string, unknown>)[k] = v;
    }
  }
  appendChildren(el, children);
  return el;
}

/** Font Awesome 6 icon (C-31), monochrome: it always inherits the text colour (N-5.1). */
export function icon(name: string, extraClass = '', variant: 'solid' | 'regular' = 'solid'): HTMLElement {
  const i = document.createElement('i');
  if (name) i.className = `fa-${variant} fa-${name}${extraClass ? ` ${extraClass}` : ''}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/** Remove all children. */
export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Inject a <style> element; returns it so the caller can remove it again. */
export function addStyle(css: string, id?: string): HTMLStyleElement {
  const style = document.createElement('style');
  if (id) style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return style;
}

/** Wait (without polling) for a selector to match; resolves with the first match. Optional timeout resolves null. */
export function waitFor(selector: string, timeoutMs = 0): Promise<Element | null> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise(resolve => {
    let timer = 0;
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        if (timer) clearTimeout(timer);
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    if (timeoutMs > 0) timer = window.setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}

/** Host element for page-level overlays: never inside the player (S-90). */
export function pageHost(): HTMLElement {
  return (document.querySelector('ytd-app #content') as HTMLElement) ||
    (document.getElementById('content') as HTMLElement) ||
    (document.getElementById('page-manager') as HTMLElement) ||
    document.body;
}

/** Stop an event from reaching the player (and anything else). */
export function swallow(ev: Event): void {
  ev.preventDefault();
  ev.stopImmediatePropagation();
  ev.stopPropagation();
}
