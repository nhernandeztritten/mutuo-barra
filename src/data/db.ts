/**
 * IndexedDB through Dexie. Everything the bar needs lives here: the iPad works
 * with the network off, so this is the only source of truth during an event.
 */
import Dexie, { type Table } from 'dexie';
import {
  INGREDIENTS,
  MODIFIER_GROUPS,
  MODIFIER_OPTIONS,
  PRODUCTS,
  SEED_VERSION,
  SHORTNAME_MIGRATIONS,
} from './seed';
import type {
  Event,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  Order,
  Product,
  Settings,
} from './types';

/** Sale de `package.json` vía `vite.config.ts`; en las pruebas no está definida. */
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-test';

export class BarraDb extends Dexie {
  ingredients!: Table<Ingredient, string>;
  products!: Table<Product, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  modifierOptions!: Table<ModifierOption, string>;
  events!: Table<Event, string>;
  orders!: Table<Order, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'mutuo-barra') {
    super(name);
    this.version(1).stores({
      ingredients: 'id, sortOrder',
      products: 'id, category, sortOrder',
      modifierGroups: 'id, sortOrder',
      modifierOptions: 'id, groupId, sortOrder',
      events: 'id, status, date',
      orders: 'id, eventId, servedAt, createdAt',
      settings: 'id',
    });
  }
}

export const db = new BarraDb();

function newId(): string {
  return crypto.randomUUID();
}

/** Asks Safari to keep IndexedDB around; without it iPadOS may evict it after 7 days. */
async function requestPersistence(): Promise<boolean | null> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}

export async function getSettings(database: BarraDb = db): Promise<Settings> {
  const found = await database.settings.get('app');
  // Una base de una versión anterior no trae los campos nuevos; se rellenan
  // aquí para que ninguna pantalla tenga que preguntarse si existen.
  if (found) return { ...found, installHintDismissed: found.installHintDismissed ?? false };
  const now = new Date().toISOString();
  const fresh: Settings = {
    id: 'app',
    deviceId: newId(),
    deviceName: 'iPad de la barra',
    seedVersion: 0,
    theme: 'light',
    persistentStorage: null,
    installHintDismissed: false,
    oneTapMode: false,
    createdAt: now,
    updatedAt: now,
  };
  await database.settings.put(fresh);
  return fresh;
}

export async function updateSettings(
  patch: Partial<Omit<Settings, 'id' | 'createdAt'>>,
  database: BarraDb = db,
): Promise<Settings> {
  const current = await getSettings(database);
  const next: Settings = { ...current, ...patch, id: 'app', updatedAt: new Date().toISOString() };
  await database.settings.put(next);
  return next;
}

export interface InitResult {
  settings: Settings;
  seeded: boolean;
  persisted: boolean | null;
}

/**
 * Opens the database, seeds the catalog the first time and makes sure there is
 * a deviceId. Safe to call on every boot.
 */
export async function initDb(database: BarraDb = db): Promise<InitResult> {
  if (!database.isOpen()) await database.open();

  const settings = await getSettings(database);
  const catalogCount = await database.ingredients.count();
  let seeded = false;

  if (catalogCount === 0) {
    await database.transaction(
      'rw',
      database.ingredients,
      database.products,
      database.modifierGroups,
      database.modifierOptions,
      async () => {
        await database.ingredients.bulkPut(INGREDIENTS);
        await database.products.bulkPut(PRODUCTS);
        await database.modifierGroups.bulkPut(MODIFIER_GROUPS);
        await database.modifierOptions.bulkPut(MODIFIER_OPTIONS);
      },
    );
    seeded = true;
  }

  // Una base ya sembrada no se vuelve a sembrar, pero sí se le llevan los
  // cambios de nombre: si no, el iPad de Nicolas seguiría con «Esp. tonic».
  if (!seeded && settings.seedVersion < SEED_VERSION) await migrarNombresCortos(database);

  const persisted = await requestPersistence();
  const saved = await updateSettings(
    {
      ...(seeded || settings.seedVersion < SEED_VERSION ? { seedVersion: SEED_VERSION } : {}),
      ...(persisted !== null ? { persistentStorage: persisted } : {}),
    },
    database,
  );

  return { settings: saved, seeded, persisted };
}

/**
 * Aplica los cambios de nombre corto de la semilla a una base ya existente.
 * Solo toca el producto si su texto es todavía el que puso la semilla: lo que
 * Nicolas haya escrito en Ajustes no se pisa.
 */
async function migrarNombresCortos(database: BarraDb): Promise<void> {
  for (const cambio of SHORTNAME_MIGRATIONS) {
    const product = await database.products.get(cambio.id);
    if (product && product.shortName === cambio.de) {
      await database.products.put({ ...product, shortName: cambio.a });
    }
  }
}

/** Wipes everything and reseeds. Only for tests and «empezar de cero» in Settings. */
export async function resetDb(database: BarraDb = db): Promise<void> {
  await database.delete();
  await database.open();
}
