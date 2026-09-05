/**
 * jsdom implements neither matchMedia nor ResizeObserver, which the shadcn
 * Sidebar (through use-mobile) and Sonner's Toaster both reach for on mount,
 * nor scrollTo, which the router calls when it restores a position on
 * navigation. Stubbed here so component tests exercise the desktop layout, and
 * so a passing run says nothing.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// scrollTo is the odd one out: jsdom does define it, so a guarded stub never
// replaces it, and what it does is log "Not implemented" to the virtual console
// once per navigation. jsdom has no layout, so there is nothing to scroll and
// nothing any test could assert about it.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// cmdk scrolls the selected item into view as the palette opens; jsdom has no
// layout and no scrollIntoView. A default that does nothing, which a test that
// cares (gates.test.tsx) replaces with a spy of its own.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
