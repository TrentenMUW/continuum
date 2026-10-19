// In-memory IndexedDB for every test environment (D17).
import "fake-indexeddb/auto";

// jsdom has no layout, so ResizeObserver doesn't exist there. Components only need it to exist.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
