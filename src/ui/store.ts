/**
 * Estado compartido de la interfaz. Un solo sitio donde vive el catálogo, los
 * ajustes y la lista de eventos, para que ninguna pantalla vuelva a leer Dexie
 * por su cuenta y para que la barra no dependa de la navegación.
 *
 * Regla: después de cada escritura se recarga lo que cambió. Es más simple y
 * más predecible que `liveQuery` para una app de un solo dispositivo.
 */
import { computed, signal } from '@preact/signals';
import { getSettings, updateSettings } from '../data/db';
import {
  listEvents,
  listIngredients,
  listModifierGroups,
  listModifierOptions,
  listProducts,
} from '../data/repo';
import type {
  BarEvent,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  Product,
  Settings,
  Theme,
} from '../data/types';
import { applyTheme } from './theme';

/* ---------------- Catálogo ---------------- */

export const ingredients = signal<Ingredient[]>([]);
export const products = signal<Product[]>([]);
export const modifierGroups = signal<ModifierGroup[]>([]);
export const modifierOptions = signal<ModifierOption[]>([]);

/** Insumos que aparecen en la carga y en el recuento. */
export const trackedIngredients = computed(() => ingredients.value.filter((i) => i.trackStock));

/** Productos activos, los únicos que se pintan en la barra. */
export const activeProducts = computed(() => products.value.filter((p) => p.active));

export const optionsById = computed(() => new Map(modifierOptions.value.map((o) => [o.id, o])));

export async function loadCatalog(): Promise<void> {
  const [ing, prod, groups, options] = await Promise.all([
    listIngredients(),
    listProducts(),
    listModifierGroups(),
    listModifierOptions(),
  ]);
  ingredients.value = ing;
  products.value = prod;
  modifierGroups.value = groups;
  modifierOptions.value = options;
}

/* ---------------- Ajustes ---------------- */

export const settings = signal<Settings | null>(null);

/** Modo un toque: cada tile registra y sirve al instante (SPEC §3.2 regla 6). */
export const oneTap = computed(() => settings.value?.oneTapMode ?? false);

export async function loadSettings(): Promise<Settings> {
  const s = await getSettings();
  settings.value = s;
  return s;
}

export async function setTheme(next: Theme): Promise<void> {
  applyTheme(next);
  settings.value = await updateSettings({ theme: next });
}

export async function setOneTap(next: boolean): Promise<void> {
  settings.value = await updateSettings({ oneTapMode: next });
}

export async function setDeviceName(next: string): Promise<void> {
  settings.value = await updateSettings({ deviceName: next });
}

/**
 * Pide a Safari que no tire la base de datos. Sin esto, iPadOS puede vaciarla a
 * los siete días sin usarla, que es justo lo que pasa entre boda y boda.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean | null> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  let granted: boolean | null = null;
  try {
    granted = await storage.persist();
  } catch {
    granted = null;
  }
  if (granted !== null) settings.value = await updateSettings({ persistentStorage: granted });
  return granted;
}

/* ---------------- Eventos ---------------- */

export const events = signal<BarEvent[]>([]);

export const liveEvent = computed(() => events.value.find((e) => e.status === 'live'));
/** Próximos: `planned` de la fecha más cercana a la más lejana. */
export const plannedEvents = computed(() =>
  events.value.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
);
/** Pasados: `closed`, del más reciente al más antiguo. */
export const closedEvents = computed(() => events.value.filter((e) => e.status === 'closed'));

export async function refreshEvents(): Promise<void> {
  events.value = await listEvents();
}

export function eventById(id: string | undefined): BarEvent | undefined {
  if (!id) return undefined;
  return events.value.find((e) => e.id === id);
}

/* ---------------- Arranque ---------------- */

export const ready = signal(false);

export async function bootstrap(): Promise<void> {
  const s = await loadSettings();
  applyTheme(s.theme);
  await Promise.all([loadCatalog(), refreshEvents()]);
  ready.value = true;
}
