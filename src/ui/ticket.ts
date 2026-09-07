/**
 * Pedido en curso de la barra.
 *
 * Vive en memoria (signals) y se copia a `localStorage` por evento en cada
 * cambio: recargar la página en medio de una boda no puede perder el pedido que
 * el barista tiene a medias (SPEC §3.2 reglas 9 y 11). Se usa `localStorage` y
 * no Dexie porque la escritura es síncrona: si Safari mata la pestaña entre el
 * toque y el `await`, la línea ya está guardada.
 */
import { signal } from '@preact/signals';
import { applyModifiers, type IgnoredModifier } from '../domain/modifiers';
import { uuid } from '../data/uuid';
import type {
  AppliedModifier,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  Product,
  StockMap,
} from '../data/types';

export interface TicketLine {
  id: string;
  productId: string;
  /** Congelado al añadir: editar la carta después no reescribe la historia. */
  productName: string;
  /** Opciones seleccionadas, para poder recalcular la línea al editarla. */
  optionIds: string[];
  modifiers: AppliedModifier[];
  qty: number;
  unitPrice: number;
  unitCost: number;
  usage: StockMap;
  note: string;
  /** Orden de llegada; «Deshacer último» quita el mayor. */
  seq: number;
}

export const ticket = signal<TicketLine[]>([]);
/** Evento al que pertenece el pedido cargado ahora mismo. */
export const ticketEventId = signal<string | null>(null);

const STORAGE_PREFIX = 'mutuo-barra:ticket:';
let seqCounter = 0;

function storageKey(eventId: string): string {
  return `${STORAGE_PREFIX}${eventId}`;
}

function newId(): string {
  return uuid();
}

/** Dos líneas se agrupan si son el mismo producto, los mismos modificadores y la misma nota. */
export function lineKey(line: Pick<TicketLine, 'productId' | 'optionIds' | 'note'>): string {
  return `${line.productId}|${[...line.optionIds].sort().join(',')}|${line.note}`;
}

/* ---------------- Persistencia ---------------- */

function persist(): void {
  const eventId = ticketEventId.value;
  if (eventId === null) return;
  try {
    const lines = ticket.value;
    if (lines.length === 0) localStorage.removeItem(storageKey(eventId));
    else localStorage.setItem(storageKey(eventId), JSON.stringify(lines));
  } catch {
    // Safari en modo privado puede negar el almacenamiento: el pedido sigue en
    // memoria, solo pierde la red de seguridad de la recarga.
  }
}

function write(lines: TicketLine[]): void {
  ticket.value = lines;
  persist();
}

/** Carga el pedido guardado de un evento. Llamar al montar la barra. */
export function loadTicket(eventId: string): TicketLine[] {
  ticketEventId.value = eventId;
  let lines: TicketLine[] = [];
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) lines = parsed as TicketLine[];
    }
  } catch {
    lines = [];
  }
  seqCounter = lines.reduce((max, l) => Math.max(max, l.seq), 0);
  ticket.value = lines;
  return lines;
}

/** Olvida el pedido en memoria sin tocar lo guardado (al desmontar la barra). */
export function detachTicket(): void {
  ticketEventId.value = null;
  ticket.value = [];
}

/* ---------------- Construir una línea ---------------- */

export interface BuiltLine {
  line: TicketLine;
  ignored: IgnoredModifier[];
}

/**
 * Aplica los modificadores armados sobre el producto y devuelve la línea lista,
 * más las opciones que no se pudieron aplicar (la barra sacude ese chip).
 */
export function buildLine(
  product: Product,
  options: ModifierOption[],
  allIngredients: Ingredient[],
  groups: ModifierGroup[],
  note = '',
): BuiltLine {
  const result = applyModifiers(product, options, allIngredients, groups);
  const ignoredIds = new Set(result.ignored.map((i) => i.optionId));
  const applied = options.filter((o) => !ignoredIds.has(o.id));
  const modifiers: AppliedModifier[] = applied
    .filter((o) => !o.isDefault)
    .map((o) => ({ groupId: o.groupId, optionId: o.id, label: o.name }));

  return {
    line: {
      id: newId(),
      productId: product.id,
      productName: product.name,
      optionIds: applied.map((o) => o.id),
      modifiers,
      qty: 1,
      unitPrice: result.unitPrice,
      unitCost: result.unitCost,
      usage: result.usage,
      note,
      seq: ++seqCounter,
    },
    ignored: result.ignored,
  };
}

/* ---------------- Operaciones ---------------- */

/** Añade una línea; si ya existe la misma bebida con los mismos extras, sube la cantidad. */
export function addLine(line: TicketLine): void {
  const key = lineKey(line);
  const existing = ticket.value.find((l) => lineKey(l) === key);
  if (existing) {
    write(
      ticket.value.map((l) =>
        l.id === existing.id ? { ...l, qty: l.qty + line.qty, seq: line.seq } : l,
      ),
    );
    return;
  }
  write([...ticket.value, line]);
}

export function setQty(lineId: string, qty: number): void {
  if (qty <= 0) {
    write(ticket.value.filter((l) => l.id !== lineId));
    return;
  }
  write(ticket.value.map((l) => (l.id === lineId ? { ...l, qty } : l)));
}

/** Quita la última línea añadida (o baja una unidad si se agrupó). */
export function undoLast(): void {
  if (ticket.value.length === 0) return;
  const last = ticket.value.reduce((best, l) => (l.seq > best.seq ? l : best), ticket.value[0]!);
  if (last.qty > 1) setQty(last.id, last.qty - 1);
  else write(ticket.value.filter((l) => l.id !== last.id));
}

/**
 * Reemplaza los modificadores de una línea. Si el resultado coincide con otra
 * línea ya presente, se fusionan.
 */
export function replaceLine(lineId: string, next: Omit<TicketLine, 'id' | 'qty' | 'seq'>): void {
  const current = ticket.value.find((l) => l.id === lineId);
  if (!current) return;
  const updated: TicketLine = { ...current, ...next, id: current.id, qty: current.qty, seq: current.seq };
  const key = lineKey(updated);
  const twin = ticket.value.find((l) => l.id !== lineId && lineKey(l) === key);
  if (twin) {
    write(
      ticket.value
        .filter((l) => l.id !== lineId)
        .map((l) => (l.id === twin.id ? { ...l, qty: l.qty + updated.qty } : l)),
    );
    return;
  }
  write(ticket.value.map((l) => (l.id === lineId ? updated : l)));
}

/** Contenido de una línea sin su identidad: lo que `replaceLine` sabe sustituir. */
export function lineContent(line: TicketLine): Omit<TicketLine, 'id' | 'qty' | 'seq'> {
  return {
    productId: line.productId,
    productName: line.productName,
    optionIds: line.optionIds,
    modifiers: line.modifiers,
    unitPrice: line.unitPrice,
    unitCost: line.unitCost,
    usage: line.usage,
    note: line.note,
  };
}

export function clearTicket(): void {
  write([]);
}

/** Devuelve las líneas de un pedido deshecho al ticket. */
export function restoreTicket(lines: TicketLine[]): void {
  const restored = lines.map((l) => ({ ...l, seq: ++seqCounter }));
  let next = ticket.value;
  for (const line of restored) {
    const key = lineKey(line);
    const existing = next.find((l) => lineKey(l) === key);
    next = existing
      ? next.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + line.qty } : l))
      : [...next, line];
  }
  write(next);
}

/** Total de bebidas del pedido. */
export function ticketDrinks(lines: TicketLine[] = ticket.value): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Importe del pedido, sin propina. */
export function ticketTotal(lines: TicketLine[] = ticket.value): number {
  const raw = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}
