/** Shared test fixtures built straight from the real seed. */
import { INGREDIENTS, MODIFIER_GROUPS, MODIFIER_OPTIONS, PRODUCTS } from '../../data/seed';
import type { Event, Order, OrderLine, Product, ModifierOption } from '../../data/types';
import { applyModifiers } from '../modifiers';

export function product(id: string): Product {
  const found = PRODUCTS.find((p) => p.id === id);
  if (!found) throw new Error(`Producto de prueba inexistente: ${id}`);
  return found;
}

export function option(id: string): ModifierOption {
  const found = MODIFIER_OPTIONS.find((o) => o.id === id);
  if (!found) throw new Error(`Modificador de prueba inexistente: ${id}`);
  return found;
}

export function options(...ids: string[]): ModifierOption[] {
  return ids.map(option);
}

export function apply(productId: string, ...optionIds: string[]) {
  return applyModifiers(product(productId), options(...optionIds), INGREDIENTS, MODIFIER_GROUPS);
}

export function line(productId: string, qty = 1, ...optionIds: string[]): OrderLine {
  const p = product(productId);
  const result = apply(productId, ...optionIds);
  return {
    id: `line-${productId}-${optionIds.join('-')}-${qty}`,
    productId: p.id,
    productName: p.name,
    modifiers: options(...optionIds).map((o) => ({ groupId: o.groupId, optionId: o.id, label: o.name })),
    qty,
    unitPrice: result.unitPrice,
    unitCost: result.unitCost,
    usage: result.usage,
    note: '',
  };
}

export function order(id: string, servedAt: string, lines: OrderLine[], patch: Partial<Order> = {}): Order {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return {
    id,
    eventId: 'ev-1',
    createdAt: servedAt,
    servedAt,
    deviceId: 'dev-1',
    mode: 'incluido',
    lines,
    subtotal: Math.round(subtotal * 100) / 100,
    tip: 0,
    total: Math.round(subtotal * 100) / 100,
    payment: null,
    cashGiven: null,
    voidedAt: null,
    voidReason: '',
    note: '',
    ...patch,
  };
}

export function event(patch: Partial<Event> = {}): Event {
  return {
    id: 'ev-1',
    name: 'Boda Ana y Marc',
    type: 'boda',
    date: '2026-09-12',
    venue: 'Alquería',
    guestsExpected: 100,
    drinksPerGuest: 1.2,
    hoursContracted: 5,
    baristas: 2,
    mode: 'incluido',
    status: 'live',
    openedAt: '2026-09-12T18:00:00.000Z',
    closedAt: null,
    stockStart: {},
    stockEnd: null,
    guestsReal: null,
    setupMinutes: null,
    teardownMinutes: null,
    notes: '',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    isDemo: false,
    ...patch,
  };
}

export { INGREDIENTS, PRODUCTS, MODIFIER_GROUPS, MODIFIER_OPTIONS };
