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

/** Font Awesome 6 solid icon (C-31). Unknown names give an empty <i>. */
export function icon(name: string, extraClass = ''): HTMLElement {
  const i = document.createElement('i');
  if (name) i.className = `fa-solid fa-${name}${extraClass ? ` ${extraClass}` : ''}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEARROW_PATHS: Array<[string, string]> = [
  ['#1213BD', 'M36 18.302c0 4.981-2.46 9.198-5.655 12.462s-7.323 5.152-12.199 5.152s-9.764-1.112-12.959-4.376S0 23.283 0 18.302s2.574-9.38 5.769-12.644S13.271 0 18.146 0s9.394 2.178 12.589 5.442C33.931 8.706 36 13.322 36 18.302z'],
  ['#88c9f9', 'm 30.394282,18.410186 c 0,3.468849 -1.143025,6.865475 -3.416513,9.137917 -2.273489,2.272442 -5.670115,2.92874 -9.137918,2.92874 -3.467803,0 -6.373515,-1.147212 -8.6470033,-3.419654 -2.2734888,-2.272442 -3.5871299,-5.178154 -3.5871299,-8.647003 0,-3.46885 0.9420533,-6.746149 3.2144954,-9.0196379 2.2724418,-2.2734888 5.5507878,-3.9513905 9.0196378,-3.9513905 3.46885,0 6.492841,1.9322561 8.76633,4.204698 2.273489,2.2724424 3.788101,5.2974804 3.788101,8.7663304 z'],
  ['#0a62a5', 'm 23.95823,17.818306 c 0,3.153748 -2.644888,5.808102 -5.798635,5.808102 -3.153748,0 -5.599825,-2.654354 -5.599825,-5.808102 0,-3.153747 2.446077,-5.721714 5.599825,-5.721714 3.153747,0 5.798635,2.567967 5.798635,5.721714 z']
];

/** DeArrow logo (C-33, appendix A). */
export function dearrowIcon(size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('role', 'img');
  for (const [fill, d] of DEARROW_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
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
