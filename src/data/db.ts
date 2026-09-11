/**
 * IndexedDB through Dexie. Everything the bar needs lives here: the device
 * works with the network off, so this is the only source of truth during an
 * event.
 */
import Dexie, { type Table } from 'dexie';
import {
  CAPACITY_MIGRATIONS,
  DOSE_MIGRATIONS,
  INGREDIENTS,
  METHOD_MIGRATIONS,
  MODIFIER_GROUPS,
  MODIFIER_OPTIONS,
  PRODUCTS,
  SEED_VERSION,
  SHORTNAME_MIGRATIONS,
  TAPA_INGREDIENTS,
  TAPA_OPTION_ID,
  TE_HOJA_QTY,
  TE_RECETA_ANTERIOR,
} from './seed';
import { uuid } from './uuid';
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
  return uuid();
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
  if (found) {
    return {
      ...found,
      installHintDismissed: found.installHintDismissed ?? false,
      ratios: found.ratios ?? {},
    };
  }
  const now = new Date().toISOString();
  const fresh: Settings = {
    id: 'app',
    deviceId: newId(),
    deviceName: 'Barra de Mutuo',
    seedVersion: 0,
    theme: 'light',
    persistentStorage: null,
    installHintDismissed: false,
    oneTapMode: false,
    ratios: {},
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
  // cambios de la semilla: si no, el iPad de Nicolas seguiría con «Esp. tonic»
  // y con el Flat white a 18 g de café.
  if (!seeded && settings.seedVersion < SEED_VERSION) {
    await migrarNombresCortos(database);
    await migrarDosisDeCafe(database);
    await migrarMetodosYVolumenes(database);
    // La última: trabaja sobre el estado final, después de que las anteriores
    // hayan podido materializar listas de opciones que todavía traían la tapa.
    await migrarSinTapa(database);
  }

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

/** Dos recetas son la misma si llevan los mismos insumos en las mismas cantidades. */
function mismaReceta(
  a: { ingredientId: string; qty: number }[],
  b: { ingredientId: string; qty: number }[],
): boolean {
  if (a.length !== b.length) return false;
  const clave = (r: { ingredientId: string; qty: number }[]): string =>
    [...r].sort((x, y) => x.ingredientId.localeCompare(y.ingredientId))
      .map((i) => `${i.ingredientId}:${i.qty}`)
      .join('|');
  return clave(a) === clave(b);
}

/**
 * Sube el Americano y el Flat white a 36 g de café y les quita el modificador
 * «Doble» (semilla v3).
 *
 * El seguro es la receta: si la guardada no es exactamente la que dejó la
 * semilla anterior, Nicolas la editó en Ajustes y no se toca nada. Los
 * modificadores se editan quitando la opción de la lista que haya —no
 * reemplazándola— para no pisar un extra que él haya añadido; si la lista no
 * declaraba opciones (las admitía todas), se materializa con las del grupo
 * menos la que se retira.
 */
async function migrarDosisDeCafe(database: BarraDb): Promise<void> {
  for (const cambio of DOSE_MIGRATIONS) {
    const product = await database.products.get(cambio.id);
    if (!product) continue;
    if (!mismaReceta(product.recipe, cambio.recetaAnterior)) continue;

    const recipe = product.recipe.map((item) =>
      item.ingredientId === 'cafe' ? { ...item, qty: cambio.cafeNuevo } : item,
    );

    const quitar = new Set(cambio.quitarOpciones);
    // De qué grupo es cada opción que se retira, según la base (no por el
    // prefijo del id, que es una convención de la semilla y no una regla).
    const gruposAfectados = new Set<string>();
    for (const optionId of cambio.quitarOpciones) {
      const option = await database.modifierOptions.get(optionId);
      if (option) gruposAfectados.add(option.groupId);
    }

    const allowedModifierGroups = await Promise.all(
      product.allowedModifierGroups.map(async (allowance) => {
        if (!gruposAfectados.has(allowance.groupId)) return allowance;
        const actuales =
          allowance.optionIds ??
          (await database.modifierOptions.where('groupId').equals(allowance.groupId).toArray())
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o) => o.id);
        return { ...allowance, optionIds: actuales.filter((id) => !quitar.has(id)) };
      }),
    );

    await database.products.put({ ...product, recipe, allowedModifierGroups });
  }
}

/**
 * Semilla v4: la carta aprende su método de extracción y su volumen servido.
 *
 * Esta migración **solo añade metadatos**. No toca ninguna dosis, ningún precio
 * y ningún modificador: los costes del escandallo (Cortado 0,7428 €, Flat white
 * 1,277 €…) tienen que salir exactamente iguales antes y después. La única
 * receta que cambia es la del Té, para meterle la hoja que hasta ahora no
 * tenía, y solo si sigue siendo la que dejó la semilla.
 */
async function migrarMetodosYVolumenes(database: BarraDb): Promise<void> {
  // 1. Método y volumen servido, sin pisar lo que ya hubiera.
  for (const cambio of METHOD_MIGRATIONS) {
    const product = await database.products.get(cambio.id);
    if (!product) continue;
    const method = product.method ?? cambio.method;
    const servingMl = typeof product.servingMl === 'number' ? product.servingMl : cambio.servingMl;
    if (product.method === method && product.servingMl === servingMl) continue;
    await database.products.put({ ...product, method, servingMl });
  }

  // 2. Capacidad de los vasos.
  for (const cambio of CAPACITY_MIGRATIONS) {
    const ingredient = await database.ingredients.get(cambio.id);
    if (!ingredient || typeof ingredient.capacityMl === 'number') continue;
    await database.ingredients.put({ ...ingredient, capacityMl: cambio.capacityMl });
  }

  // 3. La hoja de té como insumo, sin costear.
  const semilla = INGREDIENTS.find((i) => i.id === 'te_hoja');
  if (semilla && (await database.ingredients.get('te_hoja')) === undefined) {
    await database.ingredients.put(semilla);
  }

  // 4. Los 2 g de hoja en la receta del Té, solo si nadie la ha tocado.
  const te = await database.products.get('te');
  if (te && mismaReceta(te.recipe, TE_RECETA_ANTERIOR)) {
    await database.products.put({
      ...te,
      recipe: [{ ingredientId: 'te_hoja', qty: TE_HOJA_QTY }, ...te.recipe],
    });
  }
}

/**
 * Semilla v5: la **Tapa** desaparece de la carta (decisión de Nicolas del
 * 11/09/2026).
 *
 * Tres cosas, en este orden:
 *
 * 1. Se quita `extra_tapa` de los `allowedModifierGroups` de todas las bebidas.
 *    Si la lista de opciones de `extra` se queda vacía, el grupo entero deja de
 *    declararse: un grupo sin opciones no pinta nada y solo confunde al leer la
 *    carta en Ajustes.
 * 2. Se borra la fila de la opción. Es lo único que se borra.
 * 3. Los tres insumos de tapa pasan a `trackStock: false` —siguen existiendo en
 *    Ajustes → Insumos— para que no pidan un número en la carga ni en el
 *    recuento del cierre.
 *
 * Lo que **no** toca: ni un pedido. Una línea servida con tapa conserva su
 * receta, su coste y su etiqueta congelados, y la tapa sigue sumando en el
 * consumo de aquel evento. La historia no se reescribe.
 */
async function migrarSinTapa(database: BarraDb): Promise<void> {
  const products = await database.products.toArray();
  for (const product of products) {
    let cambiado = false;
    const allowedModifierGroups = [];
    for (const allowance of product.allowedModifierGroups) {
      if (allowance.optionIds === undefined) {
        // Admite todas las del grupo: borrada la opción, ya no la admite.
        allowedModifierGroups.push(allowance);
        continue;
      }
      if (!allowance.optionIds.includes(TAPA_OPTION_ID)) {
        allowedModifierGroups.push(allowance);
        continue;
      }
      cambiado = true;
      const optionIds = allowance.optionIds.filter((id) => id !== TAPA_OPTION_ID);
      if (optionIds.length > 0) allowedModifierGroups.push({ ...allowance, optionIds });
    }
    if (cambiado) await database.products.put({ ...product, allowedModifierGroups });
  }

  if (await database.modifierOptions.get(TAPA_OPTION_ID)) {
    await database.modifierOptions.delete(TAPA_OPTION_ID);
  }

  for (const id of TAPA_INGREDIENTS) {
    const ingredient = await database.ingredients.get(id);
    if (ingredient && ingredient.trackStock) {
      await database.ingredients.put({ ...ingredient, trackStock: false });
    }
  }
}

/** Wipes everything and reseeds. Only for tests and «empezar de cero» in Settings. */
export async function resetDb(database: BarraDb = db): Promise<void> {
  await database.delete();
  await database.open();
}
