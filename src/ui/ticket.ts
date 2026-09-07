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

/**
 * El pedido ya servido que se está corrigiendo, o `null`.
 *
 * Se guarda junto al ticket y por el mismo motivo: recargar la página en medio
 * de una corrección no puede dejar las líneas del pedido viejo en el ticket
 * como si fueran un pedido nuevo. Con el id puesto, la cabecera sigue diciendo
 * «Editando el pedido de 09:54» y «Servir» sabe a quién sustituye.
 */
export const editingOrderId = signal<string | null>(null);

const STORAGE_PREFIX = 'mutuo-barra:ticket:';
const EDIT_PREFIX = 'mutuo-barra:editando:';
let seqCounter = 0;

function storageKey(eventId: string): string {
  return `${STORAGE_PREFIX}${eventId}`;
}

function editKey(eventId: string): string {
  return `${EDIT_PREFIX}${eventId}`;
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
  // Un ticket vacío con una corrección abierta es un estado imposible: la
  // cabecera diría «Editando el pedido de 09:54» sin nada que servir. Quitar la
  // última línea de una corrección la cancela, y la cabecera vuelve a «Pedido
  // actual».
  if (lines.length === 0 && editingOrderId.value !== null) setEditingOrder(null);
}

/**
 * Marca (o deja de marcar) que el ticket está corrigiendo un pedido servido.
 * Se persiste al momento, igual que las líneas.
 */
export function setEditingOrder(orderId: string | null): void {
  editingOrderId.value = orderId;
  const eventId = ticketEventId.value;
  if (eventId === null) return;
  try {
    if (orderId === null) localStorage.removeItem(editKey(eventId));
    else localStorage.setItem(editKey(eventId), orderId);
  } catch {
    // Igual que con las líneas: sin almacenamiento se pierde solo la red de
    // seguridad de la recarga, no la corrección en curso.
  }
}

/** Carga el pedido guardado de un evento. Llamar al montar la barra. */
export function loadTicket(eventId: string): TicketLine[] {
  ticketEventId.value = eventId;
  let lines: TicketLine[] = [];
  let editando: string | null = null;
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) lines = parsed as TicketLine[];
    }
    editando = localStorage.getItem(editKey(eventId));
  } catch {
    lines = [];
  }
  seqCounter = lines.reduce((max, l) => Math.max(max, l.seq), 0);
  ticket.value = lines;
  // Sin líneas no hay corrección que retomar: un id suelto apuntaría a un
  // pedido que se serviría sin nada dentro.
  editingOrderId.value = lines.length > 0 ? editando : null;
  if (lines.length === 0 && editando !== null) setEditingOrder(null);
  return lines;
}

/** Olvida el pedido en memoria sin tocar lo guardado (al desmontar la barra). */
export function detachTicket(): void {
  ticketEventId.value = null;
  ticket.value = [];
  editingOrderId.value = null;
}

/* ---------------- Construir una línea ---------------- */

export interface BuiltLine {
  line: TicketLine;
  ignored: IgnoredModifier[];
}

/** Contenido de una línea a partir de un producto y unas opciones, sin identidad. */
export interface BuiltContent {
  content: LineContent;
  ignored: IgnoredModifier[];
}

export type LineContent = Omit<TicketLine, 'id' | 'qty' | 'seq'>;

/**
 * Calcula la receta, el precio y las etiquetas de una bebida con unas opciones.
 * Es lo que comparten añadir una línea y cambiarle un extra desde la fila.
 *
 * Las opciones **por defecto** (Vaca, Normal) no se guardan en `optionIds`: son
 * un no-op deliberado y, si se guardaran, dos líneas idénticas —una con «Vaca»
 * marcado y otra sin marcar— dejarían de agruparse aunque en el vaso sean la
 * misma bebida.
 */
export function contentFor(
  product: Product,
  options: ModifierOption[],
  allIngredients: Ingredient[],
  groups: ModifierGroup[],
  note = '',
): BuiltContent {
  const result = applyModifiers(product, options, allIngredients, groups);
  const ignoredIds = new Set(result.ignored.map((i) => i.optionId));
  const applied = options.filter((o) => !ignoredIds.has(o.id) && !o.isDefault);
  const modifiers: AppliedModifier[] = applied.map((o) => ({
    groupId: o.groupId,
    optionId: o.id,
    label: o.name,
  }));

  return {
    content: {
      productId: product.id,
      productName: product.name,
      optionIds: applied.map((o) => o.id),
      modifiers,
      unitPrice: result.unitPrice,
      unitCost: result.unitCost,
      usage: result.usage,
      note,
    },
    ignored: result.ignored,
  };
}

/**
 * Aplica los modificadores sobre el producto y devuelve la línea lista, más las
 * opciones que no se pudieron aplicar.
 */
export function buildLine(
  product: Product,
  options: ModifierOption[],
  allIngredients: Ingredient[],
  groups: ModifierGroup[],
  note = '',
): BuiltLine {
  const { content, ignored } = contentFor(product, options, allIngredients, groups, note);
  return {
    line: { ...content, id: newId(), qty: 1, seq: ++seqCounter },
    ignored,
  };
}

/**
 * Enciende o apaga una opción sobre una selección.
 *
 * - Un grupo `single` admite una sola opción: encender una apaga la otra.
 * - La opción por defecto del grupo (Vaca, Normal) **no se guarda**: elegirla es
 *   dejar el grupo sin ninguna opción marcada, que es exactamente lo mismo.
 */
export function toggleOption(
  optionIds: string[],
  option: ModifierOption,
  groups: ModifierGroup[],
  allOptions: ModifierOption[],
): string[] {
  const sinGrupo = optionIds.filter(
    (id) => allOptions.find((o) => o.id === id)?.groupId !== option.groupId,
  );
  if (option.isDefault) return sinGrupo;
  if (optionIds.includes(option.id)) return optionIds.filter((id) => id !== option.id);
  const group = groups.find((g) => g.id === option.groupId);
  const base = group?.type === 'single' ? sinGrupo : optionIds;
  return [...base, option.id];
}

/**
 * Si una opción cuenta como marcada. La opción por defecto de un grupo `single`
 * está marcada cuando no hay ninguna otra de su grupo: es el estado de reposo.
 */
export function isOptionActive(
  optionIds: string[],
  option: ModifierOption,
  allOptions: ModifierOption[],
): boolean {
  if (!option.isDefault) return optionIds.includes(option.id);
  return !optionIds.some((id) => allOptions.find((o) => o.id === id)?.groupId === option.groupId);
}

/* ---------------- Operaciones ---------------- */

/**
 * Añade una línea; si ya existe la misma bebida con los mismos extras, sube la
 * cantidad.
 *
 * @returns el id de la línea que queda en el pedido —la nueva, o aquella con la
 *   que se agrupó—. La fila de extras necesita saber cuál es la bebida actual.
 */
export function addLine(line: TicketLine): string {
  const key = lineKey(line);
  const existing = ticket.value.find((l) => lineKey(l) === key);
  if (existing) {
    write(
      ticket.value.map((l) =>
        l.id === existing.id ? { ...l, qty: l.qty + line.qty, seq: line.seq } : l,
      ),
    );
    return existing.id;
  }
  write([...ticket.value, line]);
  return line.id;
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
 *
 * @returns el id de la línea resultante (la fusionada, si hubo fusión), o
 *   `null` si la línea ya no existía.
 */
export function replaceLine(
  lineId: string,
  next: Omit<TicketLine, 'id' | 'qty' | 'seq'>,
): string | null {
  const current = ticket.value.find((l) => l.id === lineId);
  if (!current) return null;
  const updated: TicketLine = { ...current, ...next, id: current.id, qty: current.qty, seq: current.seq };
  const key = lineKey(updated);
  const twin = ticket.value.find((l) => l.id !== lineId && lineKey(l) === key);
  if (twin) {
    write(
      ticket.value
        .filter((l) => l.id !== lineId)
        // El `seq` del superviviente no se toca: sigue siendo el orden de
        // llegada, que es lo que mira «Deshacer último». Cuál es la bebida
        // actual lo decide la barra con el id que devuelve esta función.
        .map((l) => (l.id === twin.id ? { ...l, qty: l.qty + updated.qty } : l)),
    );
    return twin.id;
  }
  write(ticket.value.map((l) => (l.id === lineId ? updated : l)));
  return updated.id;
}

/** La línea añadida o modificada más recientemente, que es la «bebida actual». */
export function lastLine(lines: TicketLine[] = ticket.value): TicketLine | null {
  if (lines.length === 0) return null;
  return lines.reduce((best, l) => (l.seq > best.seq ? l : best), lines[0]!);
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

/** Vacía el pedido en curso. `write` se encarga de cerrar la corrección abierta. */
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
