/**
 * El reparto de la tira del pedido: cuántas filas caben en el hueco medido y
 * cuándo aparece el rótulo «+N más · ver todo».
 *
 * La medida de verdad la toma el navegador (`scripts/capturas-fase-12.mjs`);
 * aquí se prueba la aritmética, que es la que decide qué se ve.
 */
import { describe, expect, it } from 'vitest';
import {
  altoDeLaTira,
  cabeLaTira,
  etiquetaDeLinea,
  ranurasDe,
  repartoTira,
  TIRA_FILA,
  TIRA_MAX_FILAS,
  TIRA_ROTULO,
} from '../tira';
import type { TicketLine } from '../ticket';

function linea(parcial: Partial<TicketLine> = {}): TicketLine {
  return {
    id: 'l1',
    productId: 'latte',
    productName: 'Latte',
    optionIds: [],
    modifiers: [],
    qty: 1,
    unitPrice: 0,
    unitCost: 0,
    usage: {},
    note: '',
    seq: 1,
    ...parcial,
  };
}

describe('ranurasDe: el hueco manda, no el diseño', () => {
  it('una fila mide 45 px: 44 de objetivo táctil y la línea que la separa', () => {
    expect(TIRA_FILA).toBe(45);
    expect(TIRA_MAX_FILAS).toBe(4);
  });

  it('el rótulo del estado cuesta 14 px, y sale del hueco antes que las filas', () => {
    expect(TIRA_ROTULO).toBe(14);
    // Con 20 px el estado «Pedido actual» perdería una fila a 402 × 874.
    expect(ranurasDe(103)).toBe(2);
    expect(Math.floor((103 - 20 + 1) / TIRA_FILA)).toBe(1);
  });

  it('sin hueco sigue habiendo una ranura: «al menos la última clickeada»', () => {
    expect(ranurasDe(0)).toBe(1);
    expect(ranurasDe(-40)).toBe(1);
    expect(ranurasDe(10)).toBe(1);
  });

  it('«Pedido actual»: el hueco medido es 103 px a 402 × 874 y 62 a 402 × 781', () => {
    expect(ranurasDe(103)).toBe(2);
    expect(ranurasDe(62)).toBe(1);
  });

  it('«Ya servidos»: con los extras replegados sobran 211 px a 874 y 170 a 781', () => {
    expect(ranurasDe(211)).toBe(4);
    expect(ranurasDe(170)).toBe(3);
  });

  it('nunca pasa de cinco: las cuatro filas y el «+N más»', () => {
    expect(ranurasDe(1000)).toBe(5);
  });

  it('una medida rota cae del lado prudente: una fila, que nunca empuja el grid', () => {
    expect(ranurasDe(Number.NaN)).toBe(1);
    expect(ranurasDe(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('cabeLaTira: cuándo no se dibuja y manda la barra de abajo', () => {
  it('hace falta sitio para el rótulo y una fila entera', () => {
    expect(cabeLaTira(TIRA_ROTULO + TIRA_FILA - 1)).toBe(true);
    expect(cabeLaTira(TIRA_ROTULO + TIRA_FILA - 2)).toBe(false);
  });

  it('en los dos tamaños medidos cabe, en los dos estados', () => {
    for (const libre of [62, 103, 170, 211]) expect(cabeLaTira(libre)).toBe(true);
  });

  it('sin medida (jsdom) se da por buena: ahí manda el diseño', () => {
    expect(cabeLaTira(Number.NaN)).toBe(true);
  });
});

describe('altoDeLaTira: lo que la tira le quita al aviso', () => {
  it('el rótulo, las filas y su línea de separación', () => {
    expect(altoDeLaTira({ filas: 1, sobran: 0 })).toBe(14 + 44);
    expect(altoDeLaTira({ filas: 2, sobran: 0 })).toBe(14 + 89);
  });

  it('con «+N más» se suma su ranura', () => {
    expect(altoDeLaTira({ filas: 2, sobran: 3 })).toBe(14 + 89 + 44);
  });

  it('cabe en el hueco medido de cada estado y tamaño', () => {
    // «Pedido actual»: 402 × 874 (103 px) y 402 × 781 (62 px).
    expect(altoDeLaTira(repartoTira(2, ranurasDe(103)))).toBeLessThanOrEqual(103);
    expect(altoDeLaTira(repartoTira(5, ranurasDe(103)))).toBeLessThanOrEqual(103);
    expect(altoDeLaTira(repartoTira(5, ranurasDe(62)))).toBeLessThanOrEqual(62);
    // «Ya servidos»: 211 px y 170 px.
    expect(altoDeLaTira(repartoTira(9, ranurasDe(211)))).toBeLessThanOrEqual(211);
    expect(altoDeLaTira(repartoTira(9, ranurasDe(170)))).toBeLessThanOrEqual(170);
  });
});

describe('repartoTira: filas y rótulo', () => {
  it('con sitio de sobra se ven todas las líneas y no hay rótulo', () => {
    expect(repartoTira(3, 5)).toEqual({ filas: 3, sobran: 0 });
  });

  it('cuatro es el tope: con cinco líneas y cinco ranuras, el rótulo dice una', () => {
    expect(repartoTira(5, 5)).toEqual({ filas: 4, sobran: 1 });
  });

  it('con dos ranuras y cinco líneas, el rótulo se queda una y deja una fila', () => {
    expect(repartoTira(5, 2)).toEqual({ filas: 1, sobran: 4 });
  });

  it('con una sola ranura manda la bebida, no el aviso de que hay bebidas', () => {
    expect(repartoTira(5, 1)).toEqual({ filas: 1, sobran: 0 });
  });

  it('con una línea y una ranura no sobra nada', () => {
    expect(repartoTira(1, 1)).toEqual({ filas: 1, sobran: 0 });
  });
});

describe('etiquetaDeLinea: lo que dice la «×» a VoiceOver', () => {
  it('sin extras, el nombre a secas', () => {
    expect(etiquetaDeLinea(linea())).toBe('Latte');
  });

  it('con extras, «Latte con avena»', () => {
    const l = linea({
      modifiers: [{ groupId: 'leche', optionId: 'avena', label: 'Avena' }],
    });
    expect(etiquetaDeLinea(l)).toBe('Latte con avena');
  });

  it('con varios extras los enumera', () => {
    const l = linea({
      modifiers: [
        { groupId: 'leche', optionId: 'avena', label: 'Avena' },
        { groupId: 'cafe', optionId: 'desca', label: 'Descafeinado' },
      ],
    });
    expect(etiquetaDeLinea(l)).toBe('Latte con avena, descafeinado');
  });
});
