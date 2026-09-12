import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BarraDb, getSettings, initDb, updateSettings } from '../db';
import {
  addOrder,
  closeEvent,
  createEvent,
  eventConsumptionById,
  exportConsumptionCsv,
  exportJson,
  exportLinesCsv,
  getLiveEvent,
  importJson,
  listEvents,
  listOrders,
  openEvent,
  pauseEvent,
  replaceOrderLines,
  reopenEvent,
  resetEvent,
  undoResetEvent,
  unvoidOrder,
  updateEvent,
  voidOrder,
} from '../repo';
import { INGREDIENTS, MODIFIER_GROUPS, MODIFIER_OPTIONS, PRODUCTS, SEED_VERSION } from '../seed';
import { applyModifiers } from '../../domain/modifiers';
import type { NewOrderLine } from '../repo';
import type { ModifierOption } from '../types';

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
    expect(await db.ingredients.count()).toBe(20);
    expect(await db.products.count()).toBe(14);
    expect(await db.modifierGroups.count()).toBe(3);
    expect(await db.modifierOptions.count()).toBe(8);
  });

  it('guarda deviceId y seedVersion', async () => {
    const settings = await getSettings(db);
    expect(settings.deviceId).toMatch(/[0-9a-f-]{8,}/);
    expect(settings.seedVersion).toBe(SEED_VERSION);
  });

  it('una base vieja recibe los nombres cortos nuevos sin volver a sembrarse', async () => {
    // Simula el iPad de Nicolas: sembrado con la v1 y con «Esp. tonic».
    const tonic = (await db.products.get('espresso_tonic'))!;
    await db.products.put({ ...tonic, shortName: 'Esp. tonic' });
    await updateSettings({ seedVersion: 1 }, db);

    await initDb(db);

    expect((await db.products.get('espresso_tonic'))?.shortName).toBe('Espresso tonic');
    expect((await getSettings(db)).seedVersion).toBe(SEED_VERSION);
    expect(await db.products.count()).toBe(14);
  });

  it('un nombre corto que Nicolas haya editado no se pisa', async () => {
    const tonic = (await db.products.get('espresso_tonic'))!;
    await db.products.put({ ...tonic, shortName: 'Tonic de la casa' });
    await updateSettings({ seedVersion: 1 }, db);

    await initDb(db);

    expect((await db.products.get('espresso_tonic'))?.shortName).toBe('Tonic de la casa');
  });

  it('arrancar de nuevo no duplica nada', async () => {
    const before = await getSettings(db);
    await initDb(db);
    await initDb(db);
    expect(await db.ingredients.count()).toBe(20);
    expect(await db.products.count()).toBe(14);
    expect((await getSettings(db)).deviceId).toBe(before.deviceId);
  });

  it('los insumos sin costear se quedan a 0 y marcados', async () => {
    const sinCostear = (await db.ingredients.toArray()).filter((i) => i.costSource === 'sin-costear');
    expect(sinCostear.map((i) => i.id).sort()).toEqual(['licor', 'pajita', 'sirope', 'te_hoja', 'tonica']);
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

describe('empezar el evento de cero', () => {
  it('anula lo servido con motivo «reinicio» y no borra ninguna fila', async () => {
    const e = await createEvent({ name: 'Boda', stockStart: { cafe: 3000 }, notes: 'Sin gluten' }, db);
    await openEvent(e.id, db);
    const uno = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const dos = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);

    const antes = await resetEvent(e.id, db);

    const orders = await listOrders(e.id, db);
    expect(orders).toHaveLength(2);
    for (const o of orders) {
      expect(o.voidedAt).not.toBeNull();
      expect(o.voidReason).toBe('reinicio');
    }
    expect(new Set(antes.orderIds)).toEqual(new Set([uno.id, dos.id]));
  });

  it('pone el reloj a cero y vacía las pausas, y conserva la carga y los datos', async () => {
    const e = await createEvent(
      { name: 'Boda', stockStart: { cafe: 3000, leche_vaca: 12000 }, notes: 'Dos turnos', guestsExpected: 120 },
      db,
    );
    await openEvent(e.id, db);
    // Reloj puesto a una hora concreta del pasado: así se ve que el reinicio lo
    // mueve, sin depender de que dos `new Date()` seguidos caigan en
    // milisegundos distintos.
    const viejo = '2026-09-11T18:00:00.000Z';
    await updateEvent(
      e.id,
      {
        openedAt: viejo,
        pausas: [{ desde: '2026-09-11T20:00:00.000Z', hasta: '2026-09-11T21:00:00.000Z' }],
      },
      db,
    );

    await resetEvent(e.id, db);

    const tras = (await db.events.get(e.id))!;
    expect(tras.pausas).toEqual([]);
    expect(tras.openedAt).not.toBe(viejo);
    expect(tras.openedAt).not.toBeNull();
    expect(Date.parse(tras.openedAt!)).toBeGreaterThan(Date.parse(viejo));
    expect(tras.status).toBe('live');
    // Lo que no se toca: reiniciar no es volver a preparar el evento.
    expect(tras.stockStart).toEqual({ cafe: 3000, leche_vaca: 12000 });
    expect(tras.notes).toBe('Dos turnos');
    expect(tras.guestsExpected).toBe(120);
  });

  it('deshacer devuelve los pedidos, el reloj y las pausas exactamente como estaban', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const abierto = await openEvent(e.id, db);
    const pausas = [{ desde: '2026-09-12T20:00:00.000Z', hasta: null }];
    await updateEvent(e.id, { pausas }, db);
    const uno = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);

    const antes = await resetEvent(e.id, db);
    await undoResetEvent(e.id, antes, db);

    const vuelto = (await db.orders.get(uno.id))!;
    expect(vuelto.voidedAt).toBeNull();
    expect(vuelto.voidReason).toBe('');
    const tras = (await db.events.get(e.id))!;
    expect(tras.openedAt).toBe(abierto.openedAt);
    expect(tras.pausas).toEqual(pausas);
  });

  it('un pedido ya anulado antes del reinicio no se toca al deshacer', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    await openEvent(e.id, db);
    const viejo = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    const vivo = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    await voidOrder(viejo.id, 'anulado', db);
    const anuladoEn = (await db.orders.get(viejo.id))!.voidedAt;

    const antes = await resetEvent(e.id, db);
    expect(antes.orderIds).toEqual([vivo.id]);

    await undoResetEvent(e.id, antes, db);

    // El que ya estaba anulado sigue anulado, con su hora y su motivo.
    const sigue = (await db.orders.get(viejo.id))!;
    expect(sigue.voidedAt).toBe(anuladoEn);
    expect(sigue.voidReason).toBe('anulado');
    expect((await db.orders.get(vivo.id))!.voidedAt).toBeNull();
  });

  it('reiniciar dos veces seguidas no anula por segunda vez lo ya anulado', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    await openEvent(e.id, db);
    await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);

    await resetEvent(e.id, db);
    const segundo = await resetEvent(e.id, db);
    expect(segundo.orderIds).toEqual([]);
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

  it('reemplazar las líneas conserva el id, la hora y la propina', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder(
      { eventId: e.id, lines: [latteConAvena()], tip: 0.6, servedAt: '2026-09-12T19:00:00.000Z' },
      db,
    );

    // Lo que hace la fila de extras en modo Rápido: la misma bebida, con avena
    // y en cantidad 1 (aquí, un solo Latte sin avena).
    const latte = PRODUCTS.find((p) => p.id === 'latte')!;
    const plano = applyModifiers(latte, [], INGREDIENTS, MODIFIER_GROUPS);
    const updated = await replaceOrderLines(
      order.id,
      [
        {
          productId: latte.id,
          productName: latte.name,
          modifiers: [],
          qty: 1,
          unitPrice: plano.unitPrice,
          unitCost: plano.unitCost,
          usage: plano.usage,
        },
      ],
      db,
    );

    expect(updated.id).toBe(order.id);
    expect(updated.servedAt).toBe('2026-09-12T19:00:00.000Z');
    expect(updated.lines).toHaveLength(1);
    expect(updated.subtotal).toBe(3.2);
    expect(updated.tip).toBe(0.6);
    expect(updated.total).toBe(3.8);
    // No se crea otro pedido ni se borra el anterior.
    expect(await db.orders.count()).toBe(1);
  });

  it('un pedido anulado no se puede reescribir', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder({ eventId: e.id, lines: [latteConAvena()] }, db);
    await voidOrder(order.id, 'deshacer', db);
    const after = await replaceOrderLines(order.id, [], db);
    expect(after.lines).toHaveLength(1);
    expect(after.voidedAt).not.toBeNull();
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

describe('corregir un pedido ya servido', () => {
  /** Un Latte plano, la bebida a la que se corrige. */
  function lattePlano(qty = 1): NewOrderLine {
    const latte = PRODUCTS.find((p) => p.id === 'latte')!;
    const r = applyModifiers(latte, [], INGREDIENTS, MODIFIER_GROUPS);
    return {
      productId: latte.id,
      productName: latte.name,
      modifiers: [],
      qty,
      unitPrice: r.unitPrice,
      unitCost: r.unitCost,
      usage: r.usage,
    };
  }

  it('el pedido nuevo conserva la hora del original y apunta a quién sustituye', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const original = await addOrder(
      { eventId: e.id, lines: [lattePlano()], servedAt: '2026-09-12T09:54:00.000Z' },
      db,
    );

    const corregido = await addOrder(
      {
        eventId: e.id,
        lines: [latteConAvena()],
        servedAt: original.servedAt,
        replacesOrderId: original.id,
      },
      db,
    );
    const anulado = await voidOrder(original.id, 'editado', db);

    // La hora es la de siempre: las franjas de media hora y el ritmo de la
    // última hora no se mueven porque el barista corrigiera media hora después.
    expect(corregido.servedAt).toBe('2026-09-12T09:54:00.000Z');
    expect(corregido.createdAt).not.toBe(corregido.servedAt);
    expect(corregido.replacesOrderId).toBe(original.id);
    expect(anulado.voidReason).toBe('editado');
    // Append-only: las dos filas siguen ahí.
    expect(await db.orders.count()).toBe(2);
  });

  it('el original queda fuera del consumo y solo cuenta el corregido', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const original = await addOrder({ eventId: e.id, lines: [lattePlano()] }, db);
    await addOrder(
      {
        eventId: e.id,
        lines: [latteConAvena()],
        servedAt: original.servedAt,
        replacesOrderId: original.id,
      },
      db,
    );
    await voidOrder(original.id, 'editado', db);

    const consumo = await eventConsumptionById(e.id, db);
    // Dos lattes de avena (220 ml × 2) y ni una gota de la leche del original.
    expect(consumo['avena']).toBe(440);
    expect(consumo['leche'] ?? 0).toBe(0);
  });

  it('un pedido normal no arrastra el campo: no lleva `replacesOrderId`', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder({ eventId: e.id, lines: [lattePlano()] }, db);
    expect('replacesOrderId' in order).toBe(false);
  });

  it('deshacer la anulación devuelve el pedido a la vida sin tocar nada más', async () => {
    const e = await createEvent({ name: 'Boda' }, db);
    const order = await addOrder(
      { eventId: e.id, lines: [latteConAvena()], tip: 0.6, servedAt: '2026-09-12T09:54:00.000Z' },
      db,
    );
    await voidOrder(order.id, 'error', db);

    const vivo = await unvoidOrder(order.id, db);
    expect(vivo.voidedAt).toBeNull();
    expect(vivo.voidReason).toBe('');
    // Y sigue siendo el mismo pedido: hora, líneas y propina intactas.
    expect(vivo.id).toBe(order.id);
    expect(vivo.servedAt).toBe('2026-09-12T09:54:00.000Z');
    expect(vivo.tip).toBe(0.6);
    expect(vivo.lines).toHaveLength(1);
    expect(await db.orders.count()).toBe(1);
  });

  it('deshacer la anulación de un pedido que no existe falla en vez de crear uno', async () => {
    await expect(unvoidOrder('no-existe', db)).rejects.toThrow('Pedido no encontrado');
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
    expect(first.catalog.added).toBe(20 + 14 + 3 + 8);

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

  it('una copia vieja no devuelve la Tapa a la carta', async () => {
    const backup = await exportJson(db);
    // Lo que traería una copia hecha antes de la semilla v5.
    backup.data.modifierOptions = [
      ...backup.data.modifierOptions,
      {
        id: 'extra_tapa', groupId: 'extra', name: 'Tapa', isDefault: false,
        effects: [{ kind: 'lid', byCup: { vaso_6: 'tapa_6' } }],
        priceDelta: 0, sortOrder: 40,
      } as unknown as ModifierOption,
    ];

    const target = new BarraDb(`barra-test-import-tapa-${++n}`);
    await target.open();
    await importJson(backup, target);

    // El resto del catálogo sí entra; la opción con un efecto que esta versión
    // no sabe aplicar, no: sería un chip que se toca y no hace nada.
    expect(await target.modifierOptions.get('extra_tapa')).toBeUndefined();
    expect(await target.modifierOptions.count()).toBe(8);
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
