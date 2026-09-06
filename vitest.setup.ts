import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom has no crypto.randomUUID in some versions; the data layer relies on it.
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = {};
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  let n = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
}
