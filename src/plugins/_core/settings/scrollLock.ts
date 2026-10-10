// N-5.1.4 / D-12: stop page scrolling while the modal is open WITHOUT touching html/body overflow
// (replaces S-92/S-93). Wheel, touch and scroll keys are blocked unless a scrollable area inside the
// modal can consume them; that area never chains the scroll to the page.

const SCROLL_KEYS = new Set([' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function canScroll(el: Element, dx: number, dy: number): boolean {
  const style = getComputedStyle(el);
  if (dy !== 0) {
    const scrollableY = /(auto|scroll)/.test(style.overflowY) || el.tagName === 'TEXTAREA';
    if (scrollableY && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (dy < 0 && el.scrollTop > 0) return true;
    }
  }
  if (dx !== 0) {
    const scrollableX = /(auto|scroll)/.test(style.overflowX);
    if (scrollableX && el.scrollWidth > el.clientWidth + 1) {
      if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      if (dx < 0 && el.scrollLeft > 0) return true;
    }
  }
  return false;
}

/** Nearest element between target and root (inclusive) that can scroll in the direction. */
function scrollerFor(target: EventTarget | null, root: Element, dx: number, dy: number): Element | null {
  let el = target instanceof Element ? target : null;
  if (!el || !root.contains(el)) return null;
  while (el) {
    if (canScroll(el, dx, dy)) return el;
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

export interface ScrollLock {
  lock(): void;
  unlock(): void;
}

/**
 * @param getRoot the modal element (scrollable areas must be inside it)
 * @param getKeyTarget the element keyboard scrolling should move (the active pane)
 */
export function createScrollLock(getRoot: () => Element | null, getKeyTarget: () => HTMLElement | null): ScrollLock {
  let locked = false;
  let touchX = 0;
  let touchY = 0;

  const onWheel = (ev: WheelEvent) => {
    const root = getRoot();
    if (!root) return;
    if (!scrollerFor(ev.target, root, ev.deltaX, ev.deltaY)) ev.preventDefault();
  };
  const onTouchStart = (ev: TouchEvent) => {
    const t = ev.touches[0];
    if (t) { touchX = t.clientX; touchY = t.clientY; }
  };
  const onTouchMove = (ev: TouchEvent) => {
    const root = getRoot();
    const t = ev.touches[0];
    if (!root || !t) return;
    const dx = touchX - t.clientX;
    const dy = touchY - t.clientY;
    touchX = t.clientX;
    touchY = t.clientY;
    if (!scrollerFor(ev.target, root, dx, dy)) ev.preventDefault();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(ev.key) || ev.defaultPrevented) return;
    const target = ev.target as Element | null;
    if (isEditable(target)) return;
    if ((ev.key === ' ' || ev.key === 'Spacebar') && target && target.closest('button, a, label, [role="button"], [role="switch"]')) return;
    ev.preventDefault();
    const pane = getKeyTarget();
    const root = getRoot();
    if (!pane || !root) return;
    const page = Math.max(40, pane.clientHeight * 0.9);
    switch (ev.key) {
      case 'ArrowDown': pane.scrollTop += 40; break;
      case 'ArrowUp': pane.scrollTop -= 40; break;
      case 'PageDown': case ' ': case 'Spacebar': pane.scrollTop += ev.shiftKey ? -page : page; break;
      case 'PageUp': pane.scrollTop -= page; break;
      case 'Home': pane.scrollTop = 0; break;
      case 'End': pane.scrollTop = pane.scrollHeight; break;
      default: break;
    }
  };

  return {
    lock() {
      if (locked) return;
      locked = true;
      window.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      window.addEventListener('keydown', onKey, true);
    },
    unlock() {
      if (!locked) return;
      locked = false;
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', onKey, true);
    }
  };
}
