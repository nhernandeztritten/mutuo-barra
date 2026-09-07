import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Tampoco `matchMedia`. Sin él, cualquier rama que consulte
// `prefers-reduced-motion` revienta en las pruebas aunque funcione en el iPad.
// Contesta que no: la preferencia por defecto es la animación completa.
if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// Tampoco `window.scrollTo`, que preact-iso llama al cambiar de ruta.
if (typeof globalThis.scrollTo !== 'function' || !('__stub' in globalThis.scrollTo)) {
  const stub = (): void => undefined;
  (stub as unknown as { __stub: boolean }).__stub = true;
  Object.defineProperty(globalThis, 'scrollTo', { configurable: true, writable: true, value: stub });
}

// jsdom no implementa `scrollIntoView`. No es un hueco del producto —existe en
// todos los navegadores— pero sin él, «Ver todos» reventaría en las pruebas.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no hay layout que desplazar */
  };
}

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
