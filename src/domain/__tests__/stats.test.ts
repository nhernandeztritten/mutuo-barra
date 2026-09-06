import { describe, expect, it } from 'vitest';
import { closeStats, eventConsumption, eventStats, loadSuggestion } from '../stats';
import { INGREDIENTS, PRODUCTS, event, line, order } from './fixtures';

const OPENED = '2026-09-12T18:00:00.000Z';
const NOW = new Date('2026-09-12T19:55:00.000Z');

/** Turno de ejemplo: 9 bebidas servidas y un pedido anulado de 5 espressos. */
const ORDERS = [
  order('o1', '2026-09-12T18:10:00.000Z', [line('cortado', 2)]),
  order('o2', '2026-09-12T18:15:00.000Z', [line('espresso', 5)], {
    voidedAt: '2026-09-12T18:16:00.000Z',
    voidReason: 'error',
  }),
  order('o3', '2026-09-12T18:20:00.000Z', [line('latte', 1, 'leche_avena')]),
  order('o4', '2026-09-12T18:40:00.000Z', [line('filtro', 1), line('espresso', 1)]),
  order('o5', '2026-09-12T19:05:00.000Z', [line('latte', 3)]),
  order('o6', '2026-09-12T19:50:00.000Z', [line('cold_brew', 1)]),
];

describe('eventConsumption', () => {
  it('suma las líneas por cantidad y excluye los pedidos anulados', () => {
    const usage = eventConsumption(ORDERS);
    // 36 cortados + 12 filtro + 18 espresso + 54 lattes + 18 latte avena + 12,5 cold brew
    expect(usage['cafe']).toBeCloseTo(150.5, 4);
    expect(usage['leche']).toBe(900);
    expect(usage['avena']).toBe(220);
    expect(usage['menaje']).toBe(9);
  });

  it('el anulado habría sumado 90 g de café más', () => {
    const withVoid = eventConsumption(ORDERS.map((o) => ({ ...o, voidedAt: null })));
    expect(withVoid['cafe']).toBeCloseTo(240.5, 4);
  });

  it('sin pedidos devuelve un mapa vacío', () => {
    expect(eventConsumption([])).toEqual({});
  });
});

describe('eventStats', () => {
  const stats = eventStats(event(), ORDERS, PRODUCTS, NOW);

  it('cuenta bebidas servidas sin los anulados', () => {
    expect(stats.served).toBe(9);
    expect(stats.orderCount).toBe(5);
    expect(stats.voidedCount).toBe(1);
  });

  it('agrupa por producto de más a menos', () => {
    expect(stats.byProduct[0]).toMatchObject({ productId: 'latte', qty: 4 });
    expect(stats.byProduct.find((p) => p.productId === 'cortado')?.qty).toBe(2);
    expect(stats.byProduct.find((p) => p.productId === 'espresso')?.qty).toBe(1);
  });

  it('agrupa por categoría', () => {
    expect(stats.byCategory[0]).toEqual({ category: 'Con leche', qty: 6 });
  });

  it('reparte las leches', () => {
    expect(stats.byMilk).toEqual({ vaca: 5, avena: 1, sin_lactosa: 0, total: 6 });
  });

  it('cuenta el porcentaje de cada modificador sobre las bebidas servidas', () => {
    const avena = stats.byModifier.find((m) => m.optionId === 'leche_avena');
    expect(avena).toMatchObject({ qty: 1, label: 'Avena' });
    expect(avena?.pct).toBeCloseTo(11.1, 1);
  });

  it('reparte en franjas de 30 min desde la apertura', () => {
    expect(stats.perHalfHour.map((s) => s.qty)).toEqual([3, 2, 3, 1]);
    expect(stats.perHalfHour[0]?.start).toBe(OPENED);
  });

  it('el ritmo de la última hora solo cuenta la vía grupo', () => {
    // 19:05 → 3 lattes (grupo). El cold brew de las 19:50 es lote_frio.
    expect(stats.lastHourRate).toBe(3);
  });

  it('el pico es el mejor cuarto de hora por cuatro', () => {
    expect(stats.peakRate15).toBe(12);
  });

  it('el techo es baristas × 50', () => {
    expect(stats.capacity).toBe(100);
  });

  it('suma el coste teórico de las líneas vivas', () => {
    expect(stats.costTheoretical).toBeCloseTo(6.9497, 3);
  });

  it('calcula bebidas por invitado con los invitados reales si los hay', () => {
    expect(stats.drinksPerGuest).toBe(0.09);
    const real = eventStats(event({ guestsReal: 90 }), ORDERS, PRODUCTS, NOW);
    expect(real.drinksPerGuest).toBe(0.1);
  });

  it('en modo venta suma ingresos y propinas de los pedidos vivos', () => {
    const venta = [
      order('v1', '2026-09-12T18:10:00.000Z', [line('latte', 2)], { mode: 'venta', tip: 1, total: 7.4 }),
      order('v2', '2026-09-12T18:20:00.000Z', [line('latte', 1)], { mode: 'venta', voidedAt: '2026-09-12T18:21:00.000Z' }),
    ];
    const stats2 = eventStats(event({ mode: 'venta' }), venta, PRODUCTS, NOW);
    expect(stats2.revenue).toBe(6.4);
    expect(stats2.tips).toBe(1);
  });

  it('un evento cerrado mide el ritmo contra su hora de cierre, no contra el reloj', () => {
    const closed = event({ status: 'closed', closedAt: '2026-09-12T23:00:00.000Z' });
    expect(eventStats(closed, ORDERS, PRODUCTS, NOW).lastHourRate).toBe(0);
  });

  it('un evento sin pedidos no rompe', () => {
    const empty = eventStats(event(), [], PRODUCTS, NOW);
    expect(empty.served).toBe(0);
    expect(empty.peakRate15).toBe(0);
    expect(empty.costTheoretical).toBe(0);
  });
});

describe('closeStats', () => {
  const closed = event({
    status: 'closed',
    closedAt: '2026-09-12T20:00:00.000Z',
    stockStart: { cafe: 3000, leche: 5000 },
    stockEnd: { cafe: 2800 },
  });
  const stats = closeStats(closed, ORDERS, INGREDIENTS);

  it('usa el recuento cuando lo hay', () => {
    const cafe = stats.byIngredient.find((i) => i.ingredientId === 'cafe');
    expect(cafe).toMatchObject({ loaded: 3000, remaining: 2800, real: 200, counted: true });
    expect(cafe?.theoretical).toBeCloseTo(150.5, 4);
    expect(cafe?.deviationPct).toBeCloseTo(32.9, 1);
  });

  it('sin recuento el consumo real es el teórico y queda marcado', () => {
    const leche = stats.byIngredient.find((i) => i.ingredientId === 'leche');
    expect(leche).toMatchObject({ loaded: 5000, remaining: null, real: 900, counted: false });
    expect(leche?.deviationPct).toBe(0);
  });

  it('incluye insumos consumidos que no se cargaron', () => {
    expect(stats.byIngredient.find((i) => i.ingredientId === 'avena')?.loaded).toBeNull();
  });

  it('el coste real supera al teórico por los 49,5 g de café de merma', () => {
    expect(stats.costReal - stats.costTheoretical).toBeCloseTo(49.5 * 0.0297, 3);
    expect(stats.wastePct).toBeGreaterThan(0);
  });

  it('reparte el coste real entre las bebidas servidas', () => {
    expect(stats.served).toBe(9);
    expect(stats.costPerDrink).toBeCloseTo(stats.costReal / 9, 4);
  });

  it('mide la duración real del evento', () => {
    expect(stats.durationMinutes).toBe(120);
  });

  it('sin recuento ninguno, real = teórico y hasCount es falso', () => {
    const noCount = closeStats(event({ stockStart: {}, stockEnd: null }), ORDERS, INGREDIENTS);
    expect(noCount.hasCount).toBe(false);
    expect(noCount.costReal).toBeCloseTo(noCount.costTheoretical, 4);
    expect(noCount.wastePct).toBe(0);
  });
});

describe('loadSuggestion', () => {
  it('calcula la carga de 100 invitados a 1,2 bebidas', () => {
    expect(loadSuggestion(100, 1.2)).toEqual({
      cafe: 2484,
      leche: 14400,
      avena: 2400,
      vaso_6: 73,
      vaso_10: 47,
      vaso_frio: 14,
      hielo: 3600,
    });
  });

  it('redondea los vasos hacia arriba: no se carga medio vaso', () => {
    // 10 × 0,55 × 1,1 = 6,05 vasos → 7.
    const s = loadSuggestion(10, 1);
    expect(Number.isInteger(s['vaso_6'])).toBe(true);
    expect(s['vaso_6']).toBe(7);
  });

  it('no añade un vaso de más por basura de coma flotante', () => {
    // 200 × 0,55 × 1,1 son 121 vasos exactos, aunque en binario dé 121,0000000003.
    const s = loadSuggestion(200, 1);
    expect(s['vaso_6']).toBe(121);
    expect(s['vaso_10']).toBe(77);
    expect(s['vaso_frio']).toBe(22);
  });

  it('sin invitados no sugiere nada', () => {
    expect(loadSuggestion(0, 1.2)).toEqual({});
    expect(loadSuggestion(50, 0)).toEqual({});
  });
});
