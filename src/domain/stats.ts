/**
 * Event maths — SPEC.md §2.4 and §4. Pure functions: no Dexie, no DOM.
 * Voided orders are excluded everywhere (append-only model: they still exist).
 */
import type { Category, Event, Ingredient, Order, Pausa, Product, StockMap } from '../data/types';
import { costOfUsage } from './modifiers';

const MINUTE = 60_000;
const HALF_HOUR = 30 * MINUTE;
const QUARTER = 15 * MINUTE;
/** Drinks per hour a single barista can pull on the `grupo` route. */
export const DRINKS_PER_BARISTA_HOUR = 50;

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

function addQty(map: StockMap, id: string, qty: number): void {
  map[id] = (map[id] ?? 0) + qty;
}

export function isLive(order: Order): boolean {
  return order.voidedAt === null;
}

/** Orders that count, oldest served first. */
function activeOrders(orders: Order[]): Order[] {
  return orders
    .filter(isLive)
    .slice()
    .sort((a, b) => Date.parse(a.servedAt) - Date.parse(b.servedAt));
}

/* ---------------- Pausas del servicio ---------------- */

/** Los tramos parados del evento. No tenerlos es lo mismo que no tener ninguno. */
export function pausasDe(event: Event): Pausa[] {
  return event.pausas ?? [];
}

/** `true` si ahora mismo el servicio está parado: el último tramo sigue abierto. */
export function enPausa(event: Event): boolean {
  const pausas = pausasDe(event);
  return pausas.length > 0 && pausas[pausas.length - 1]!.hasta === null;
}

/**
 * Milisegundos que el servicio estuvo parado, hasta `hasta`.
 *
 * El tramo abierto cuenta hasta ese instante: en una pausa en curso, la
 * duración de la barra tiene que dejar de crecer, no seguir sumando el rato que
 * nadie está sirviendo.
 */
export function msEnPausa(event: Event, hasta: Date = new Date()): number {
  const limite = hasta.getTime();
  let total = 0;
  for (const pausa of pausasDe(event)) {
    const desde = Date.parse(pausa.desde);
    if (Number.isNaN(desde) || desde > limite) continue;
    const fin = pausa.hasta === null ? limite : Date.parse(pausa.hasta);
    if (Number.isNaN(fin)) continue;
    total += Math.max(0, Math.min(fin, limite) - desde);
  }
  return total;
}

/** Minutos de servicio de verdad: de abrir a cerrar, menos lo que estuvo parado. */
export function minutosDeServicio(event: Event, hasta: Date = new Date()): number | null {
  if (!event.openedAt) return null;
  const fin = event.closedAt ? Date.parse(event.closedAt) : hasta.getTime();
  const bruto = fin - Date.parse(event.openedAt);
  if (Number.isNaN(bruto)) return null;
  const parado = msEnPausa(event, event.closedAt ? new Date(fin) : hasta);
  return round(Math.max(0, bruto - parado) / MINUTE, 0);
}

/* ---------------- Consumo ---------------- */

/** Theoretical consumption of the event: Σ lines × qty × usage. Excludes voided. */
export function eventConsumption(orders: Order[]): StockMap {
  const total: StockMap = {};
  for (const order of orders) {
    if (!isLive(order)) continue;
    for (const line of order.lines) {
      for (const [ingredientId, qty] of Object.entries(line.usage)) {
        addQty(total, ingredientId, qty * line.qty);
      }
    }
  }
  for (const id of Object.keys(total)) total[id] = round(total[id] ?? 0, 4);
  return total;
}

/* ---------------- Estadísticas del evento ---------------- */

export interface HalfHourSlot {
  index: number;
  /** ISO datetime of the slot start. */
  start: string;
  qty: number;
}

export interface ProductTally {
  productId: string;
  name: string;
  qty: number;
}

export interface CategoryTally {
  category: Category | string;
  qty: number;
}

export interface ModifierTally {
  optionId: string;
  label: string;
  qty: number;
  /** Share of served drinks, 0-100. */
  pct: number;
}

export interface MilkSplit {
  vaca: number;
  avena: number;
  sin_lactosa: number;
  /** Drinks that carry any milk at all. */
  total: number;
}

export interface EventStats {
  served: number;
  orderCount: number;
  voidedCount: number;
  byProduct: ProductTally[];
  byCategory: CategoryTally[];
  byMilk: MilkSplit;
  byModifier: ModifierTally[];
  perHalfHour: HalfHourSlot[];
  /** Drinks on the `grupo` route in the last 60 min — the real bottleneck. */
  lastHourRate: number;
  /** Busiest 15 min × 4, in drinks/h. */
  peakRate15: number;
  /** `baristas × 50` drinks/h. */
  capacity: number;
  costTheoretical: number;
  /** Cobrado de verdad. Excluye los pedidos servidos como invitación. */
  revenue: number;
  tips: number;
  /** Bebidas regaladas (`payment: 'invitacion'`). */
  compedCount: number;
  /** Lo que habrían valido esas bebidas a precio de carta. */
  compedValue: number;
  drinksPerGuest: number;
}

const MILK_IDS = { vaca: 'leche', avena: 'avena', sin_lactosa: 'sin_lactosa' } as const;

/**
 * @param now reference instant for the last-hour rate. Defaults to the event's
 *   `closedAt` when it is closed, otherwise the wall clock.
 */
export function eventStats(
  event: Event,
  orders: Order[],
  products: Product[],
  now: Date = new Date(),
): EventStats {
  const live = activeOrders(orders);
  const viaOf = new Map(products.map((p) => [p.id, p.via]));
  const categoryOf = new Map(products.map((p) => [p.id, p.category]));
  const productOrder = new Map(products.map((p) => [p.id, p.sortOrder]));

  const reference = event.status === 'closed' && event.closedAt ? new Date(event.closedAt) : now;
  const referenceMs = reference.getTime();

  let served = 0;
  let costTheoretical = 0;
  let revenue = 0;
  let tips = 0;
  let compedCount = 0;
  let compedValue = 0;
  let lastHourRate = 0;

  const byProductMap = new Map<string, ProductTally>();
  const byCategoryMap = new Map<string, number>();
  const byModifierMap = new Map<string, ModifierTally>();
  const milk: MilkSplit = { vaca: 0, avena: 0, sin_lactosa: 0, total: 0 };

  for (const order of live) {
    // Una invitación no es un ingreso. Guarda su precio congelado para saber
    // cuánto se regaló, pero fuera de la caja (decisión pendiente de la fase 2).
    const comped = order.payment === 'invitacion';
    if (comped) compedValue += order.subtotal;
    else revenue += order.subtotal;
    // La propina siempre es dinero recibido, aunque la bebida fuera invitación.
    tips += order.tip;
    const servedMs = Date.parse(order.servedAt);

    for (const line of order.lines) {
      served += line.qty;
      if (comped) compedCount += line.qty;
      costTheoretical += line.unitCost * line.qty;

      const tally = byProductMap.get(line.productId);
      if (tally) tally.qty += line.qty;
      else byProductMap.set(line.productId, { productId: line.productId, name: line.productName, qty: line.qty });

      const category = categoryOf.get(line.productId) ?? 'Otros';
      byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + line.qty);

      for (const mod of line.modifiers) {
        const hit = byModifierMap.get(mod.optionId);
        if (hit) hit.qty += line.qty;
        else byModifierMap.set(mod.optionId, { optionId: mod.optionId, label: mod.label, qty: line.qty, pct: 0 });
      }

      let hasMilk = false;
      for (const [key, ingredientId] of Object.entries(MILK_IDS) as [keyof typeof MILK_IDS, string][]) {
        if ((line.usage[ingredientId] ?? 0) > 0) {
          milk[key] += line.qty;
          hasMilk = true;
        }
      }
      if (hasMilk) milk.total += line.qty;

      // Ritmo: solo la vía `grupo` compite por la máquina y el barista.
      if (viaOf.get(line.productId) === 'grupo' && referenceMs - servedMs < 60 * MINUTE && servedMs <= referenceMs) {
        lastHourRate += line.qty;
      }
    }
  }

  for (const tally of byModifierMap.values()) {
    tally.pct = served > 0 ? round((tally.qty / served) * 100, 1) : 0;
  }

  const startMs = event.openedAt
    ? Date.parse(event.openedAt)
    : live.length > 0
      ? Date.parse(live[0]!.servedAt)
      : referenceMs;
  const endMs = Math.max(
    startMs,
    referenceMs,
    live.length > 0 ? Date.parse(live[live.length - 1]!.servedAt) : startMs,
  );

  const perHalfHour = bucketize(live, startMs, endMs, HALF_HOUR).map((qty, index) => ({
    index,
    start: new Date(startMs + index * HALF_HOUR).toISOString(),
    qty,
  }));

  const quarters = bucketize(live, startMs, endMs, QUARTER);
  const peakRate15 = quarters.length > 0 ? Math.max(...quarters) * 4 : 0;

  const guests = event.guestsReal ?? event.guestsExpected;

  return {
    served,
    orderCount: live.length,
    voidedCount: orders.length - live.length,
    byProduct: [...byProductMap.values()].sort(
      (a, b) => b.qty - a.qty || (productOrder.get(a.productId) ?? 0) - (productOrder.get(b.productId) ?? 0),
    ),
    byCategory: [...byCategoryMap.entries()]
      .map(([category, qty]) => ({ category, qty }))
      .sort((a, b) => b.qty - a.qty),
    byMilk: milk,
    byModifier: [...byModifierMap.values()].sort((a, b) => b.qty - a.qty),
    perHalfHour,
    lastHourRate,
    peakRate15,
    capacity: event.baristas * DRINKS_PER_BARISTA_HOUR,
    costTheoretical: round(costTheoretical, 4),
    revenue: round(revenue, 2),
    tips: round(tips, 2),
    compedCount,
    compedValue: round(compedValue, 2),
    drinksPerGuest: guests > 0 ? round(served / guests, 2) : 0,
  };
}

/** Fixed buckets of `size` ms anchored at `startMs`. */
function bucketize(orders: Order[], startMs: number, endMs: number, size: number): number[] {
  const count = Math.max(1, Math.ceil((endMs - startMs) / size) || 1);
  const buckets = new Array<number>(count).fill(0);
  for (const order of orders) {
    const at = Date.parse(order.servedAt);
    const index = Math.floor((at - startMs) / size);
    if (index < 0 || index >= count) continue;
    let qty = 0;
    for (const line of order.lines) qty += line.qty;
    buckets[index] = (buckets[index] ?? 0) + qty;
  }
  return buckets;
}

/* ---------------- Cierre ---------------- */

export interface IngredientClose {
  ingredientId: string;
  name: string;
  unit: Ingredient['unit'];
  /** What was loaded, in recipe units. */
  loaded: number | null;
  theoretical: number;
  /** Counted consumption when there is a count, theoretical otherwise. */
  real: number;
  remaining: number | null;
  counted: boolean;
  /** (real − teórico) / teórico × 100. */
  deviationPct: number;
}

export interface CloseStats {
  served: number;
  theoreticalConsumption: StockMap;
  realConsumption: StockMap;
  byIngredient: IngredientClose[];
  costTheoretical: number;
  costReal: number;
  costPerDrink: number;
  /** Merma: how much more the real consumption cost than the theoretical one. */
  wastePct: number;
  hasCount: boolean;
  durationMinutes: number | null;
}

export function closeStats(event: Event, orders: Order[], ingredients: Ingredient[]): CloseStats {
  const theoretical = eventConsumption(orders);
  const stockEnd = event.stockEnd ?? {};

  let served = 0;
  for (const order of orders) {
    if (!isLive(order)) continue;
    for (const line of order.lines) served += line.qty;
  }

  const ids = new Set([...Object.keys(event.stockStart), ...Object.keys(theoretical)]);
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const real: StockMap = {};
  const rows: IngredientClose[] = [];
  let hasCount = false;

  for (const id of ids) {
    const ingredient = byId.get(id);
    const loaded = event.stockStart[id] ?? null;
    const remaining = stockEnd[id] ?? null;
    const theo = round(theoretical[id] ?? 0, 4);
    const counted = loaded !== null && remaining !== null;
    if (counted) hasCount = true;
    const consumed = counted ? round(Math.max(0, loaded - remaining), 4) : theo;
    real[id] = consumed;
    rows.push({
      ingredientId: id,
      name: ingredient?.name ?? id,
      unit: ingredient?.unit ?? 'ud',
      loaded,
      theoretical: theo,
      real: consumed,
      remaining,
      counted,
      deviationPct: theo > 0 ? round(((consumed - theo) / theo) * 100, 1) : consumed > 0 ? 100 : 0,
    });
  }

  rows.sort((a, b) => (byId.get(a.ingredientId)?.sortOrder ?? 999) - (byId.get(b.ingredientId)?.sortOrder ?? 999));

  const costTheoretical = costOfUsage(theoretical, ingredients);
  const costReal = costOfUsage(real, ingredients);

  // La duración descuenta lo que el servicio estuvo parado: una boda va en dos
  // turnos y el rato de la cena no es barra abierta. Con `closedAt`, el tramo
  // abierto que hubiera se corta ahí.
  const durationMinutes =
    event.openedAt && event.closedAt ? minutosDeServicio(event, new Date(Date.parse(event.closedAt))) : null;

  return {
    served,
    theoreticalConsumption: theoretical,
    realConsumption: real,
    byIngredient: rows,
    costTheoretical,
    costReal,
    costPerDrink: served > 0 ? round(costReal / served, 4) : 0,
    wastePct: costTheoretical > 0 ? round(((costReal - costTheoretical) / costTheoretical) * 100, 1) : 0,
    hasCount,
    durationMinutes,
  };
}

/* ---------------- Sugerencia de carga ---------------- */

/**
 * Suggested load — SPEC §2.4. Only a suggestion: Nicolas writes what he really
 * loads. Percentages come from the wedding mix of the escandallo.
 */
/**
 * @param cafeDeLotesG gramos de café que piden los lotes declarados del evento
 *   (batch y cold brew). Se suman al café sugerido: la cuenta de arriba solo
 *   contaba las bebidas de la vía del grupo.
 */
export function loadSuggestion(
  guests: number,
  drinksPerGuest: number,
  cafeDeLotesG = 0,
): StockMap {
  const drinks = Math.max(0, guests) * Math.max(0, drinksPerGuest);
  const lotes = Math.max(0, cafeDeLotesG);
  if (drinks === 0) return lotes > 0 ? { cafe: Math.round(lotes) } : {};
  // Cups round up — you cannot load half a cup — but only after clearing the
  // float dust: 200 × 0.55 × 1.1 is 121.00000000000003 in binary, not 122 cups.
  const cups = (fraction: number): number => Math.ceil(round(drinks * fraction * 1.1, 6));
  return {
    cafe: Math.round(drinks * 18 * 1.15 + lotes),
    leche: Math.round(drinks * 120),
    avena: Math.round(drinks * 0.1 * 200),
    vaso_6: cups(0.55),
    vaso_10: cups(0.35),
    vaso_frio: cups(0.1),
    hielo: Math.round(drinks * 30),
  };
}
