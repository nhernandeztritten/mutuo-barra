import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BarraDb, getSettings, initDb } from '../db';
import {
  addOrder,
  closeEvent,
  createEvent,
  exportConsumptionCsv,
  exportJson,
  exportLinesCsv,
  getLiveEvent,
  importJson,
  listEvents,
  listOrders,
  openEvent,
  pauseEvent,
  reopenEvent,
  voidOrder,
} from '../repo';
import { INGREDIENTS, MODIFIER_GROUPS, MODIFIER_OPTIONS, PRODUCTS } from '../seed';
import { applyModifiers } from '../../domain/modifiers';
import type { NewOrderLine } from '../repo';

let n = 0;
let db: BarraDb;

async function fresh(): Promise<BarraDb> {
  const instance = new BarraDb(`barra-test-${++n}`);
  await initDb(instance);
  return instance;
}

function latteConAvena(): NewOrderLine {
  const product = PRODUCTS.find((p) => p.id === 'latte')!;
  const avena = MODIFIER_OPTIONS.find((o) => o.id === 'leche_avena')!;
  const r = applyModifiers(product, [avena], INGREDIENTS, MODIFIER_GROUPS);
  return {
    productId: product.id,
    productName: product.name,
    modifiers: [{ groupId: avena.groupId, optionId: avena.id, label: avena.name }],
    qty: 2,
    unitPrice: r.unitPrice,
    unitCost: r.unitCost,
    usage: r.usage,
  };
}

beforeEach(async () => {
  db = await fresh();
});

afterEach(async () => {
  await db.delete();
});

describe('initDb', () => {
  it('siembra la carta completa la primera vez', async () => {
    expect(await db.ingredients.count()).toBe(19);
    expect(await db.products.count()).toBe(14);
    expect(await db.modifierGroups.count()).toBe(3);
    expect(await db.modifierOptions.count()).toBe(9);
  });

  it('guarda deviceId y seedVersion', async () => {
    const settings = await getSettings(db);
    expect(settings.deviceId).toMatch(/[0-9a-f-]{8,}/);
    expect(settings.seedVersion).toBe(1);
  });

  it('arrancar de nuevo no duplica nada', async () => {
    const before = await getSettings(db);
    await initDb(db);
    await initDb(db);
    expect(await db.ingredients.count()).toBe(19);
    expect(await db.products.count()).toBe(14);
    expect((await getSettings(db)).deviceId).toBe(before.deviceId);
  });

  it('los insumos sin costear se quedan a 0 y marcados', async () => {
    const sinCostear = (await db.ingredients.toArray()).filter((i) => i.costSource === 'sin-costear');
    expect(sinCostear.map((i) => i.id).sort()).toEqual(['licor', 'pajita', 'sirope', 'tonica']);
    expect(sinCostear.every((i) => i.costPerUnit === 0)).toBe(true);
  });

  it('todos los precios de la carta nacen provisionales', async () => {
    const products = await db.products.toArray();
    expect(products.every((p) => p.priceProvisional)).toBe(true);
  });
});

describe('ciclo de vida del evento', () => {
  it('solo puede haber un evento en curso', async () => {
    const a = await createEvent({ name: 'Boda Ana y Marc' }, db);
    const b = await createEvent({ name: 'Rodaje' }, db);
    await openEvent(a.id, db);
    await openEvent(b.id, db);

    const live = await db.events.where('status').equals('live').toArray();
    expect(live).toHaveLength(1);
    expect(live[0]?.id).toBe(b.id);
    expect((await db.events.get(a.id))?.status).toBe('planned');
  });

  it('abrir sella openedAt y pausar no lo borra', async () => {
    const e = await createEvent({ name: 'Mercado' }, db);
    const opened = await openEvent(e.id, db);
    expect(opened.openedAt).not.toBeNull();
    const paused = await pauseEvent(e.id, db);
    expect(paused.status).toBe('planned');
    expect(paused.openedAt).toBe(opened.openedAt);
    expect(await getLiveEvent(db)).toBeUndefined();
  });

  it('cerrar y reabrir conserva los pedidos', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    await openEvent(e.id, db);
    await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);

    const closed = await closeEvent(e.id, { guestsReal: 90, stockEnd: { cafe: 2800 } }, db);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(closed.guestsReal).toBe(90);

    const reopened = await reopenEvent(e.id, db);
    expect(reopened.status).toBe('planned');
    expect(reopened.closedAt).toBeNull();
    expect(await listOrders(e.id, db)).toHaveLength(1);
  });

  it('lista los eventos por fecha descendente', async () => {
    await createEvent({ name: 'Antiguo', date: '2026-01-10' }, db);
    await createEvent({ name: 'Reciente', date: '2026-09-12' }, db);
    expect((await listEvents(undefined, db)).map((e) => e.name)).toEqual(['Reciente', 'Antiguo']);
  });
});

describe('pedidos', () => {
  it('calcula subtotal y total y estampa el deviceId', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder({ eventId: e.id, lines: [latteConAvena()], tip: 0.6 }, db);
    // Latte 3,20 + avena 0,50 = 3,70 × 2
    expect(order.subtotal).toBe(7.4);
    expect(order.total).toBe(8);
    expect(order.deviceId).toBe((await getSettings(db)).deviceId);
    expect(order.voidedAt).toBeNull();
  });

  it('anular marca voidedAt y nunca borra la fila', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const voided = await voidOrder(order.id, 'devuelto', db);
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidReason).toBe('devuelto');
    expect(await db.orders.count()).toBe(1);
  });

  it('lista los pedidos de un evento en orden de servicio', async () => {
    const a = await createEvent({ name: 'A' }, db);
    const b = await createEvent({ name: 'B' }, db);
    await addOrder({ eventId: a.id, lines: [latteConAvena()], servedAt: '2026-09-12T19:00:00.000Z' }, db);
    await addOrder({ eventId: a.id, lines: [latteConAvena()], servedAt: '2026-09-12T18:00:00.000Z' }, db);
    await addOrder({ eventId: b.id, lines: [latteConAvena()] }, db);

    const orders = await listOrders(a.id, db);
    expect(orders).toHaveLength(2);
    expect(orders[0]?.servedAt).toBe('2026-09-12T18:00:00.000Z');
  });
});

describe('exportar e importar', () => {
  it('importar en una base vacía trae todo y repetir no duplica', async () => {
    const e = await createEvent({ name: 'Boda Ana y Marc', guestsExpected: 100 }, db);
    await openEvent(e.id, db);
    await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const backup = await exportJson(db);

    const target = new BarraDb(`barra-test-import-${++n}`);
    await target.open();

    const first = await importJson(backup, target);
    expect(first.events.added).toBe(1);
    expect(first.orders.added).toBe(1);
    expect(first.catalog.added).toBe(19 + 14 + 3 + 9);

    const second = await importJson(backup, target);
    expect(second.events.added).toBe(0);
    expect(second.orders.added).toBe(0);
    expect(second.orders.skipped).toBe(1);
    expect(second.catalog.added).toBe(0);

    expect(await target.events.count()).toBe(1);
    expect(await target.orders.count()).toBe(1);
    expect(await target.products.count()).toBe(14);
    await target.delete();
  });

  it('una anulación llegada por importación gana sobre el pedido vivo', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const backup = await exportJson(db);
    backup.data.orders = backup.data.orders.map((o) => ({
      ...o,
      voidedAt: '2026-09-12T20:00:00.000Z',
      voidReason: 'error',
    }));

    const summary = await importJson(backup, db);
    expect(summary.orders.updated).toBe(1);
    expect((await db.orders.get(order.id))?.voidedAt).toBe('2026-09-12T20:00:00.000Z');
  });

  it('rechaza un archivo que no es una copia de la app', async () => {
    await expect(importJson({ app: 'otra-cosa' }, db)).rejects.toThrow(/copia de seguridad/);
  });
});

describe('CSV', () => {
  it('el CSV de líneas trae una fila por línea con coma decimal', async () => {
    const e = await createEvent({ name: 'Boda Ana y Marc' }, db);
    await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const csv = await exportLinesCsv(e.id, db);
    const rows = csv.trim().split('\r\n');

    expect(rows[0]).toContain('producto;modificadores;cantidad');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Latte;Avena;2;3,7;7,4');
    expect(rows[1]).toContain('Boda Ana y Marc');
  });

  it('el CSV de consumo trae el recuento y la desviación', async () => {
    const e = await createEvent({ name: 'Boda', stockStart: { cafe: 3000 } }, db);
    await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    await closeEvent(e.id, { stockEnd: { cafe: 2900 } }, db);

    const csv = await exportConsumptionCsv(e.id, db);
    const cafe = csv.split('\r\n').find((r) => r.includes('Café;'));
    expect(cafe).toContain('3000;36;2900;100');
    expect(cafe).toContain('sí');
  });
});
