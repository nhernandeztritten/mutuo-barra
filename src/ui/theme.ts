/** Light / night theme. Persisted per device in settings; the bar toggles it by hand. */
import { signal } from '@preact/signals';
import type { Theme } from '../data/types';

export const theme = signal<Theme>('light');

/** Espejo síncrono para que `index.html` pinte el tema antes de arrancar. */
const CLAVE = 'mutuo-barra:theme';

/** Writes the attribute the tokens hang off, plus the browser chrome colour. */
export function applyTheme(next: Theme): void {
  theme.value = next;
  const root = document.documentElement;
  root.dataset['theme'] = next;
  root.style.colorScheme = next === 'night' ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'night' ? '#1c1c1b' : '#f5f4f3');
  try {
    localStorage.setItem(CLAVE, next);
  } catch {
    // Sin localStorage solo se pierde el color del primer pintado.
  }
}
