/**
 * Everything the UI is allowed to do to the database. Append-only: voiding an
 * order stamps `voidedAt`, it never deletes the row, so a future sync is just a
 * union of sets keyed by uuid.
 */
import { APP_VERSION, db, getSettings, type BarraDb } from './db';
import { closeStats, eventConsumption } from '../domain/stats';
import { uuid } from './uuid';
import type {
  Event,
  EventMode,
  EventStatus,
  EventType,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  Order,
  OrderLine,
  Product,
  Settings,
  StockMap,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return uuid();
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/* ---------------- Catálogo ---------------- */

export async function listIngredients(database: BarraDb = db): Promise<Ingredient[]> {
  return (await database.ingredients.toArray()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listProducts(database: BarraDb = db): Promise<Product[]> {
  return (await database.products.toArray()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listModifierGroups(database: BarraDb = db): Promise<ModifierGroup[]> {
  return (await database.modifierGroups.toArray()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listModifierOptions(database: BarraDb = db): Promise<ModifierOption[]> {
  return (await database.modifierOptions.toArray()).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Guarda un producto de la carta. Los pedidos ya servidos no se tocan: cada
 * línea lleva su receta y su precio congelados (SPEC §2.3).
 */
export async function saveProduct(product: Product, database: BarraDb = db): Promise<Product> {
  await database.products.put(product);
  return product;
}

export async function saveIngredient(
  ingredient: Ingredient,
  database: BarraDb = db,
): Promise<Ingredient> {
  await database.ingredients.put(ingredient);
  return ingredient;
}

export async function saveModifierOption(
  option: ModifierOption,
  database: BarraDb = db,
): Promise<ModifierOption> {
  await database.modifierOptions.put(option);
  return option;
}

/** Id legible a partir del nombre, con sufijo si ya existe. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base === '' ? `id_${Date.now()}` : base;
}

async function freeId(
  table: { get: (id: string) => Promise<unknown> },
  base: string,
): Promise<string> {
  let id = base;
  let n = 2;
  while ((await table.get(id)) !== undefined) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

export async function createProduct(
  input: Omit<Product, 'id'>,
  database: BarraDb = db,
): Promise<Product> {
  const id = await freeId(database.products, slugify(input.name));
  const product: Product = { ...input, id };
  await database.products.put(product);
  return product;
}

export async function createIngredient(
  input: Omit<Ingredient, 'id'>,
  database: BarraDb = db,
): Promise<Ingredient> {
  const id = await freeId(database.ingredients, slugify(input.name));
  const ingredient: Ingredient = { ...input, id };
  await database.ingredients.put(ingredient);
  return ingredient;
}

export async function createModifierOption(
  input: Omit<ModifierOption, 'id'>,
  database: BarraDb = db,
): Promise<ModifierOption> {
  const id = await freeId(database.modifierOptions, `${input.groupId}_${slugify(input.name)}`);
  const option: ModifierOption = { ...input, id };
  await database.modifierOptions.put(option);
  return option;
}

/* ---------------- Eventos ---------------- */

export interface NewEventInput {
  name: string;
  type?: EventType;
  date?: string;
  venue?: string;
  guestsExpected?: number;
  drinksPerGuest?: number;
  hoursContracted?: number;
  baristas?: number;
  mode?: EventMode;
  stockStart?: StockMap;
  notes?: string;
  isDemo?: boolean;
}

export async function createEvent(input: NewEventInput, database: BarraDb = db): Promise<Event> {
  const now = nowIso();
  const event: Event = {
    id: newId(),
    name: input.name,
    type: input.type ?? 'otro',
    date: input.date ?? now.slice(0, 10),
    venue: input.venue ?? '',
    guestsExpected: input.guestsExpected ?? 0,
    drinksPerGuest: input.drinksPerGuest ?? 1.2,
    hoursContracted: input.hoursContracted ?? 4,
    baristas: input.baristas ?? 2,
    mode: input.mode ?? 'incluido',
    status: 'planned',
    openedAt: null,
    closedAt: null,
    stockStart: input.stockStart ?? {},
    stockEnd: null,
    guestsReal: null,
    setupMinutes: null,
    teardownMinutes: null,
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
    isDemo: input.isDemo ?? false,
  };
  await database.events.put(event);
  return event;
}

export async function getEvent(id: string, database: BarraDb = db): Promise<Event | undefined> {
  return database.events.get(id);
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<Event, 'id' | 'createdAt'>>,
  database: BarraDb = db,
): Promise<Event> {
  const current = await database.events.get(id);
  if (!current) throw new Error(`Evento no encontrado: ${id}`);
  const next: Event = { ...current, ...patch, id, createdAt: current.createdAt, updatedAt: nowIso() };
  await database.events.put(next);
  return next;
}

export async function listEvents(status?: EventStatus, database: BarraDb = db): Promise<Event[]> {
  const all = await database.events.toArray();
  const filtered = status ? all.filter((e) => e.status === status) : all;
  return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** There can be only one `live` event. */
export async function getLiveEvent(database: BarraDb = db): Promise<Event | undefined> {
  const live = await database.events.where('status').equals('live').toArray();
  return live[0];
}

/**
 * Opens the bar. Any other live event is paused back to `planned`, keeping its
 * orders; it can be reopened later.
 */
export async function openEvent(id: string, database: BarraDb = db): Promise<Event> {
  return database.transaction('rw', database.events, async () => {
    const target = await database.events.get(id);
    if (!target) throw new Error(`Evento no encontrado: ${id}`);

    const others = await database.events.where('status').equals('live').toArray();
    for (const other of others) {
      if (other.id === id) continue;
      await database.events.put({ ...other, status: 'planned', updatedAt: nowIso() });
    }

    const opened: Event = {
      ...target,
      status: 'live',
      openedAt: target.openedAt ?? nowIso(),
      closedAt: null,
      updatedAt: nowIso(),
    };
    await database.events.put(opened);
    return opened;
  });
}

/** Leaves the bar without closing. Nothing is lost. */
export async function pauseEvent(id: string, database: BarraDb = db): Promise<Event> {
  return updateEvent(id, { status: 'planned' }, database);
}

export interface CloseEventInput {
  stockEnd?: StockMap | null;
  guestsReal?: number | null;
  setupMinutes?: number | null;
  teardownMinutes?: number | null;
  notes?: string;
}

export async function closeEvent(
  id: string,
  input: CloseEventInput = {},
  database: BarraDb = db,
): Promise<Event> {
  const current = await database.events.get(id);
  if (!current) throw new Error(`Evento no encontrado: ${id}`);
  return updateEvent(
    id,
    {
      ...input,
      status: 'closed',
      closedAt: current.closedAt ?? nowIso(),
    },
    database,
  );
}

/** Reopens a closed event to fix the count. It goes back to `planned`. */
export async function reopenEvent(id: string, database: BarraDb = db): Promise<Event> {
  return updateEvent(id, { status: 'planned', closedAt: null }, database);
}

/* ---------------- Pedidos ---------------- */

export type NewOrderLine = Omit<OrderLine, 'id' | 'note'> & { id?: string; note?: string };

export interface NewOrderInput {
  eventId: string;
  lines: NewOrderLine[];
  mode?: EventMode;
  tip?: number;
  payment?: Order['payment'];
  cashGiven?: number | null;
  note?: string;
  servedAt?: string;
  deviceId?: string;
}

export async function addOrder(input: NewOrderInput, database: BarraDb = db): Promise<Order> {
  const settings = await getSettings(database);
  const now = nowIso();
  const lines: OrderLine[] = input.lines.map((line) => ({
    ...line,
    id: line.id ?? newId(),
    note: line.note ?? '',
  }));
  const subtotal = round(
    lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
    2,
  );
  const tip = round(input.tip ?? 0, 2);

  const order: Order = {
    id: newId(),
    eventId: input.eventId,
    createdAt: now,
    servedAt: input.servedAt ?? now,
    deviceId: input.deviceId ?? settings.deviceId,
    mode: input.mode ?? 'incluido',
    lines,
    subtotal,
    tip,
    total: round(subtotal + tip, 2),
    payment: input.payment ?? null,
    cashGiven: input.cashGiven ?? null,
    voidedAt: null,
    voidReason: '',
    note: input.note ?? '',
  };
  await database.orders.put(order);
  return order;
}

/** Voids an order. Never deletes: the row stays for the audit trail and the sync. */
export async function voidOrder(id: string, reason = '', database: BarraDb = db): Promise<Order> {
  const current = await database.orders.get(id);
  if (!current) throw new Error(`Pedido no encontrado: ${id}`);
  const next: Order = { ...current, voidedAt: current.voidedAt ?? nowIso(), voidReason: reason };
  await database.orders.put(next);
  return next;
}

export async function listOrders(eventId: string, database: BarraDb = db): Promise<Order[]> {
  const orders = await database.orders.where('eventId').equals(eventId).toArray();
  return orders.sort((a, b) => a.servedAt.localeCompare(b.servedAt));
}

export async function listAllOrders(database: BarraDb = db): Promise<Order[]> {
  return database.orders.toArray();
}

/* ---------------- Exportar / importar ---------------- */

export interface BackupPayload {
  app: 'mutuo-barra';
  version: string;
  exportedAt: string;
  deviceId: string;
  data: {
    ingredients: Ingredient[];
    products: Product[];
    modifierGroups: ModifierGroup[];
    modifierOptions: ModifierOption[];
    events: Event[];
    orders: Order[];
    settings: Settings[];
  };
}

export async function exportJson(database: BarraDb = db): Promise<BackupPayload> {
  const settings = await getSettings(database);
  const [ingredients, products, modifierGroups, modifierOptions, events, orders] = await Promise.all([
    database.ingredients.toArray(),
    database.products.toArray(),
    database.modifierGroups.toArray(),
    database.modifierOptions.toArray(),
    database.events.toArray(),
    database.orders.toArray(),
  ]);
  return {
    app: 'mutuo-barra',
    version: APP_VERSION,
    exportedAt: nowIso(),
    deviceId: settings.deviceId,
    data: { ingredients, products, modifierGroups, modifierOptions, events, orders, settings: [settings] },
  };
}

export interface ImportSummary {
  events: { added: number; updated: number; skipped: number };
  orders: { added: number; updated: number; skipped: number };
  catalog: { added: number; skipped: number };
}

/**
 * Merges a backup by uuid. Never duplicates:
 * - events: the newer `updatedAt` wins;
 * - orders: immutable, but an incoming void always wins;
 * - catalog: only rows that are missing, so local menu edits survive;
 * - settings: skipped, `deviceId` belongs to this device.
 */
export async function importJson(payload: unknown, database: BarraDb = db): Promise<ImportSummary> {
  const parsed = payload as Partial<BackupPayload>;
  if (!parsed || parsed.app !== 'mutuo-barra' || !parsed.data) {
    throw new Error('El archivo no es una copia de seguridad de Mutuo · Barra');
  }
  const data = parsed.data;
  const summary: ImportSummary = {
    events: { added: 0, updated: 0, skipped: 0 },
    orders: { added: 0, updated: 0, skipped: 0 },
    catalog: { added: 0, skipped: 0 },
  };

  await database.transaction(
    'rw',
    [
      database.ingredients,
      database.products,
      database.modifierGroups,
      database.modifierOptions,
      database.events,
      database.orders,
    ],
    async () => {
      const catalogTables = [
        [database.ingredients, data.ingredients ?? []],
        [database.products, data.products ?? []],
        [database.modifierGroups, data.modifierGroups ?? []],
        [database.modifierOptions, data.modifierOptions ?? []],
      ] as const;

      for (const [table, rows] of catalogTables) {
        for (const row of rows as { id: string }[]) {
          const existing = await table.get(row.id);
          if (existing) {
            summary.catalog.skipped += 1;
            continue;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (table as any).put(row);
          summary.catalog.added += 1;
        }
      }

      for (const incoming of data.events ?? []) {
        const existing = await database.events.get(incoming.id);
        if (!existing) {
          await database.events.put(incoming);
          summary.events.added += 1;
        } else if (incoming.updatedAt > existing.updatedAt) {
          await database.events.put(incoming);
          summary.events.updated += 1;
        } else {
          summary.events.skipped += 1;
        }
      }

      for (const incoming of data.orders ?? []) {
        const existing = await database.orders.get(incoming.id);
        if (!existing) {
          await database.orders.put(incoming);
          summary.orders.added += 1;
        } else if (incoming.voidedAt !== null && existing.voidedAt === null) {
          await database.orders.put({ ...existing, voidedAt: incoming.voidedAt, voidReason: incoming.voidReason });
          summary.orders.updated += 1;
        } else {
          summary.orders.skipped += 1;
        }
      }
    },
  );

  return summary;
}

/* ---------------- CSV ---------------- */

/** `;` separator and comma decimals: that is what Numbers and Excel in es-ES expect. */
const SEP = ';';
const BOM = '﻿';

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value).replace('.', ',') : value;
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null)[][]): string {
  return BOM + rows.map((row) => row.map(cell).join(SEP)).join('\r\n') + '\r\n';
}

function localDate(iso: string): string {
  return iso.slice(0, 10);
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One row per order line. */
export async function exportLinesCsv(eventId: string, database: BarraDb = db): Promise<string> {
  const event = await database.events.get(eventId);
  const orders = await listOrders(eventId, database);
  const rows: (string | number | null)[][] = [
    [
      'evento', 'fecha', 'hora', 'pedido', 'linea', 'producto', 'modificadores', 'cantidad',
      'precio_unitario', 'importe', 'coste_unitario', 'coste', 'modo', 'pago', 'anulado', 'motivo',
    ],
  ];
  for (const order of orders) {
    for (const line of order.lines) {
      rows.push([
        event?.name ?? eventId,
        localDate(order.servedAt),
        localTime(order.servedAt),
        order.id,
        line.id,
        line.productName,
        line.modifiers.map((m) => m.label).join(' + '),
        line.qty,
        round(line.unitPrice, 2),
        round(line.unitPrice * line.qty, 2),
        round(line.unitCost, 4),
        round(line.unitCost * line.qty, 4),
        order.mode,
        order.payment ?? '',
        order.voidedAt ? 'sí' : 'no',
        order.voidReason,
      ]);
    }
  }
  return toCsv(rows);
}

/** One row per ingredient: loaded, theoretical, counted, deviation and cost. */
export async function exportConsumptionCsv(eventId: string, database: BarraDb = db): Promise<string> {
  const event = await database.events.get(eventId);
  if (!event) throw new Error(`Evento no encontrado: ${eventId}`);
  const [orders, ingredients] = await Promise.all([listOrders(eventId, database), listIngredients(database)]);
  const stats = closeStats(event, orders, ingredients);
  const costs = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));

  const rows: (string | number | null)[][] = [
    [
      'evento', 'insumo', 'unidad', 'cargado', 'consumo_teorico', 'queda', 'consumo_real',
      'desviacion_pct', 'coste_unitario', 'coste_real', 'recuento',
    ],
  ];
  for (const row of stats.byIngredient) {
    const unitCost = costs.get(row.ingredientId) ?? 0;
    rows.push([
      event.name,
      row.name,
      row.unit,
      row.loaded,
      row.theoretical,
      row.remaining,
      row.real,
      row.deviationPct,
      unitCost,
      round(row.real * unitCost, 4),
      row.counted ? 'sí' : 'no',
    ]);
  }
  return toCsv(rows);
}

/** Theoretical consumption of one event, straight from its orders. */
export async function eventConsumptionById(eventId: string, database: BarraDb = db): Promise<StockMap> {
  return eventConsumption(await listOrders(eventId, database));
}

/**
 * Una fila por línea de pedido de varios eventos — la exportación de
 * `/resultados`. `eventIds` decide qué entra (por ejemplo, sin los ejemplos).
 */
export async function exportAllLinesCsv(
  eventIds: string[],
  database: BarraDb = db,
): Promise<string> {
  const wanted = new Set(eventIds);
  const [events, orders] = await Promise.all([database.events.toArray(), database.orders.toArray()]);
  const nameOf = new Map(events.map((e) => [e.id, e.name]));
  const rows: (string | number | null)[][] = [
    [
      'evento', 'fecha', 'hora', 'producto', 'modificadores', 'cantidad', 'precio_unitario',
      'coste_unitario', 'metodo', 'anulado', 'motivo',
    ],
  ];
  const ordenados = orders
    .filter((o) => wanted.has(o.eventId))
    .sort((a, b) => a.servedAt.localeCompare(b.servedAt));
  for (const order of ordenados) {
    for (const line of order.lines) {
      rows.push([
        nameOf.get(order.eventId) ?? order.eventId,
        localDate(order.servedAt),
        localTime(order.servedAt),
        line.productName,
        line.modifiers.map((m) => m.label).join(' + '),
        line.qty,
        round(line.unitPrice, 2),
        round(line.unitCost, 4),
        order.payment ?? '',
        order.voidedAt ? 'sí' : 'no',
        order.voidReason,
      ]);
    }
  }
  return toCsv(rows);
}

/** Una fila por evento e insumo: teórico, real y desviación. */
export async function exportAllConsumptionCsv(
  eventIds: string[],
  database: BarraDb = db,
): Promise<string> {
  const ingredients = await listIngredients(database);
  const rows: (string | number | null)[][] = [
    ['evento', 'fecha', 'insumo', 'unidad', 'cargado', 'consumo_teorico', 'consumo_real', 'desviacion_pct', 'recuento'],
  ];
  for (const id of eventIds) {
    const event = await database.events.get(id);
    if (!event) continue;
    const orders = await listOrders(id, database);
    const stats = closeStats(event, orders, ingredients);
    for (const row of stats.byIngredient) {
      rows.push([
        event.name,
        event.date,
        row.name,
        row.unit,
        row.loaded,
        row.theoretical,
        row.real,
        row.deviationPct,
        row.counted ? 'sí' : 'no',
      ]);
    }
  }
  return toCsv(rows);
}
