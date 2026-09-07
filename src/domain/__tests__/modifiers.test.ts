import { describe, expect, it } from 'vitest';
import { apply } from './fixtures';

/** Tolerance of the escandallo: ±0,005 €. */
const CENT = 0.005;

describe('escandallo: los costes cuadran con SPEC §2.1-2.2', () => {
  it('un Cortado cuesta 0,743 € con el menaje dentro', () => {
    // 18 g café 0,5346 + 120 ml leche 0,1152 + vaso 6 oz 0,062 + menaje 0,031
    expect(apply('cortado').unitCost).toBeCloseTo(0.743, 2);
    expect(Math.abs(apply('cortado').unitCost - 0.743)).toBeLessThanOrEqual(CENT);
  });

  it('un Latte con avena cuesta 1,144 €', () => {
    // 0,5346 + 220 ml avena 0,4818 + vaso 10 oz 0,097 + menaje 0,031
    expect(Math.abs(apply('latte', 'leche_avena').unitCost - 1.144)).toBeLessThanOrEqual(CENT);
  });

  it('el menaje va en todas las recetas', () => {
    for (const id of ['espresso', 'latte', 'filtro', 'cold_brew', 'te', 'agua_botella']) {
      expect(apply(id).usage['menaje']).toBe(1);
    }
  });
});

describe('doble dosis del Americano y el Flat white (07/09/2026)', () => {
  it('los dos llevan 36 g de café; el resto de la carta sigue con 18', () => {
    expect(apply('americano').usage['cafe']).toBe(36);
    expect(apply('flat_white').usage['cafe']).toBe(36);
    for (const id of ['espresso', 'cortado', 'cappuccino', 'latte', 'espresso_tonic', 'cremaet', 'carajillo']) {
      expect(apply(id).usage['cafe']).toBe(18);
    }
  });

  it('un Flat white cuesta 1,277 €: los 0,743 de antes más 18 g de café', () => {
    // 36 g café 1,0692 + 120 ml leche 0,1152 + vaso 6 oz 0,062 + menaje 0,031
    expect(apply('flat_white').unitCost).toBeCloseTo(1.2774, 4);
    expect(Math.abs(apply('flat_white').unitCost - (0.7428 + 0.5346))).toBeLessThanOrEqual(CENT);
  });

  it('un Americano cuesta 1,254 €: los 0,720 de antes más 18 g de café', () => {
    // 36 g café 1,0692 + 150 ml agua 0,057 + vaso 10 oz 0,097 + menaje 0,031
    expect(apply('americano').unitCost).toBeCloseTo(1.2542, 4);
    expect(Math.abs(apply('americano').unitCost - (0.7196 + 0.5346))).toBeLessThanOrEqual(CENT);
  });

  it('ninguno de los dos admite ya «Doble»: sumarlo daría 54 g', () => {
    for (const id of ['americano', 'flat_white']) {
      const r = apply(id, 'extra_doble');
      expect(r.ignored[0]).toMatchObject({ optionId: 'extra_doble', reason: 'opcion-no-admitida' });
      expect(r.usage['cafe']).toBe(36);
      expect(r.labels).toEqual([]);
    }
  });

  it('el Flat white conserva sus otros extras y su leche', () => {
    const r = apply('flat_white', 'leche_avena', 'extra_sirope', 'extra_tapa');
    expect(r.ignored).toHaveLength(0);
    expect(r.usage['avena']).toBe(120);
    expect(r.usage['sirope']).toBe(10);
    expect(r.usage['tapa_6']).toBe(1);
  });

  it('el Americano conserva Iced y Tapa, y el descafeinado dobla también', () => {
    const iced = apply('americano', 'extra_iced', 'extra_tapa');
    expect(iced.ignored).toHaveLength(0);
    expect(iced.usage['tapa_fria']).toBe(1);
    expect(apply('americano', 'cafe_descafeinado').usage['cafe_desca']).toBe(36);
  });
});

describe('grupo leche', () => {
  it('Avena sustituye la leche por la misma cantidad', () => {
    const r = apply('latte', 'leche_avena');
    expect(r.usage['leche']).toBeUndefined();
    expect(r.usage['avena']).toBe(220);
    expect(r.unitPrice).toBe(3.7);
    expect(r.labels).toEqual(['Avena']);
  });

  it('Sin lactosa sustituye la leche y suma 0,30', () => {
    const r = apply('cortado', 'leche_sin_lactosa');
    expect(r.usage['sin_lactosa']).toBe(120);
    expect(r.usage['leche']).toBeUndefined();
    expect(r.unitPrice).toBe(2.5);
    expect(r.unitCost).toBeCloseTo(0.7956, 4);
  });

  it('Vaca es el defecto: no cambia nada ni aparece como etiqueta', () => {
    const r = apply('cortado', 'leche_vaca', 'cafe_normal');
    expect(r.usage['leche']).toBe(120);
    expect(r.unitPrice).toBe(2.2);
    expect(r.labels).toEqual([]);
    expect(r.ignored).toEqual([]);
  });

  it('Avena en un Espresso se ignora: el grupo no está admitido', () => {
    const r = apply('espresso', 'leche_avena');
    expect(r.ignored).toHaveLength(1);
    expect(r.ignored[0]).toMatchObject({ optionId: 'leche_avena', reason: 'grupo-no-admitido' });
    expect(r.unitPrice).toBe(2);
    expect(r.usage['avena']).toBeUndefined();
  });

  it('Avena en un Matcha latte sustituye su leche', () => {
    const r = apply('matcha_latte', 'leche_avena');
    expect(r.usage['avena']).toBe(200);
    expect(r.unitPrice).toBe(4.3);
    expect(r.unitCost).toBeCloseTo(0.793, 3);
  });
});

describe('grupo cafe', () => {
  it('Descafeinado sustituye el café sin tocar el precio', () => {
    const r = apply('cortado', 'cafe_descafeinado');
    expect(r.usage['cafe']).toBeUndefined();
    expect(r.usage['cafe_desca']).toBe(18);
    expect(r.unitPrice).toBe(2.2);
    expect(r.labels).toEqual(['Descafeinado']);
  });

  it('Descafeinado también vale en un Cremaet', () => {
    expect(apply('cremaet', 'cafe_descafeinado').usage['cafe_desca']).toBe(18);
  });

  it('Descafeinado en un Té se ignora', () => {
    const r = apply('te', 'cafe_descafeinado');
    expect(r.ignored[0]?.reason).toBe('grupo-no-admitido');
  });
});

describe('extra · Doble', () => {
  it('suma 18 g al café normal', () => {
    const r = apply('latte', 'extra_doble');
    expect(r.usage['cafe']).toBe(36);
    expect(r.unitPrice).toBe(4);
  });

  it('suma 18 g del café descafeinado cuando el pedido lo lleva', () => {
    const r = apply('cortado', 'cafe_descafeinado', 'extra_doble');
    expect(r.usage['cafe_desca']).toBe(36);
    expect(r.usage['cafe']).toBeUndefined();
    expect(r.unitPrice).toBe(3);
  });

  it('el orden en que llegan los chips no cambia el resultado', () => {
    const a = apply('cortado', 'cafe_descafeinado', 'extra_doble');
    const b = apply('cortado', 'extra_doble', 'cafe_descafeinado');
    expect(b.usage).toEqual(a.usage);
    expect(b.unitPrice).toBe(a.unitPrice);
  });

  it('vale en un Espresso tonic', () => {
    const r = apply('espresso_tonic', 'extra_doble');
    expect(r.usage['cafe']).toBe(36);
    expect(r.unitPrice).toBe(4.6);
    expect(r.unitCost).toBeCloseTo(1.2842, 4);
  });

  it('se ignora en un Filtro: la opción no está admitida', () => {
    const r = apply('filtro', 'extra_doble');
    expect(r.ignored[0]).toMatchObject({ optionId: 'extra_doble', reason: 'opcion-no-admitida' });
    expect(r.usage['cafe']).toBe(12);
    expect(r.unitPrice).toBe(2.8);
  });
});

describe('extra · Iced', () => {
  it('cambia el vaso de 10 oz por el frío y añade 120 g de hielo', () => {
    const r = apply('latte', 'extra_iced');
    expect(r.usage['vaso_10']).toBeUndefined();
    expect(r.usage['vaso_frio']).toBe(1);
    expect(r.usage['hielo']).toBe(120);
    expect(r.unitPrice).toBe(3.5);
  });

  it('cambia también el vaso de 6 oz', () => {
    const r = apply('americano', 'extra_iced');
    expect(r.usage['vaso_frio']).toBe(1);
    expect(r.usage['hielo']).toBe(120);
  });

  it('se ignora en un Cold brew: ya viene frío y no lo admite', () => {
    const r = apply('cold_brew', 'extra_iced');
    expect(r.ignored[0]?.reason).toBe('opcion-no-admitida');
    expect(r.usage['hielo']).toBe(120);
  });
});

describe('extra · Tapa', () => {
  it('elige la tapa de 6 oz', () => {
    expect(apply('cortado', 'extra_tapa').usage['tapa_6']).toBe(1);
  });

  it('elige la tapa de 10 oz', () => {
    const r = apply('latte', 'extra_tapa');
    expect(r.usage['tapa_10']).toBe(1);
    expect(r.usage['tapa_6']).toBeUndefined();
  });

  it('con Iced elige la tapa fría, no la del vaso original', () => {
    const r = apply('latte', 'extra_iced', 'extra_tapa');
    expect(r.usage['tapa_fria']).toBe(1);
    expect(r.usage['tapa_10']).toBeUndefined();
  });

  it('con Iced pedido después de Tapa el resultado es el mismo', () => {
    const r = apply('latte', 'extra_tapa', 'extra_iced');
    expect(r.usage['tapa_fria']).toBe(1);
    expect(r.usage['tapa_10']).toBeUndefined();
  });

  it('en un Cold brew pone la tapa fría', () => {
    expect(apply('cold_brew', 'extra_tapa').usage['tapa_fria']).toBe(1);
  });

  it('no cambia el precio', () => {
    expect(apply('te', 'extra_tapa').unitPrice).toBe(2);
  });
});

describe('extra · Sirope', () => {
  it('añade 10 ml y 0,40 €', () => {
    const r = apply('cortado', 'extra_sirope');
    expect(r.usage['sirope']).toBe(10);
    expect(r.unitPrice).toBe(2.6);
  });

  it('se ignora en un Espresso: no está en su lista de extras', () => {
    const r = apply('espresso', 'extra_sirope');
    expect(r.ignored[0]?.reason).toBe('opcion-no-admitida');
    expect(r.usage['sirope']).toBeUndefined();
  });
});

describe('combinaciones y etiquetas', () => {
  it('las etiquetas salen en orden de aplicación leche → cafe → extra', () => {
    const r = apply('cortado', 'extra_tapa', 'leche_avena', 'cafe_descafeinado');
    expect(r.labels).toEqual(['Avena', 'Descafeinado', 'Tapa']);
  });

  it('el pedido completo suma todos los deltas', () => {
    const r = apply('latte', 'leche_avena', 'extra_doble', 'extra_iced', 'extra_sirope');
    expect(r.unitPrice).toBe(3.2 + 0.5 + 0.8 + 0.3 + 0.4);
    expect(r.usage['avena']).toBe(220);
    expect(r.usage['cafe']).toBe(36);
    expect(r.usage['vaso_frio']).toBe(1);
    expect(r.usage['sirope']).toBe(10);
  });

  it('un modificador ignorado no suma precio ni etiqueta', () => {
    const r = apply('filtro', 'leche_avena', 'extra_doble', 'extra_tapa');
    expect(r.unitPrice).toBe(2.8);
    expect(r.labels).toEqual(['Tapa']);
    expect(r.ignored.map((i) => i.optionId)).toEqual(['leche_avena', 'extra_doble']);
  });

  it('el Matcha no admite Doble', () => {
    expect(apply('matcha_latte', 'extra_doble').ignored[0]?.reason).toBe('opcion-no-admitida');
  });

  it('las cantidades no arrastran basura de coma flotante', () => {
    const r = apply('cold_brew');
    expect(r.usage['cafe']).toBe(12.5);
  });
});
