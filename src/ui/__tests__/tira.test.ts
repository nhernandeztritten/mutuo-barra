/**
 * El reparto de la tira del pedido: cuántas filas caben en el hueco medido y
 * cuándo aparece el rótulo «+N más · ver todo».
 *
 * La medida de verdad la toma el navegador (`scripts/capturas-fase-12.mjs`);
 * aquí se prueba la aritmética, que es la que decide qué se ve.
 */
import { describe, expect, it } from 'vitest';
import { etiquetaDeLinea, ranurasDe, repartoTira, TIRA_FILA, TIRA_MAX_FILAS } from '../tira';
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

  it('sin hueco sigue habiendo una ranura: «al menos la última clickeada»', () => {
    expect(ranurasDe(0)).toBe(1);
    expect(ranurasDe(-40)).toBe(1);
    expect(ranurasDe(10)).toBe(1);
  });

  it('el hueco medido a 402 × 874 (95 px) da dos ranuras', () => {
    expect(ranurasDe(95)).toBe(2);
  });

  it('el hueco medido a 402 × 781 (54 px) da una', () => {
    expect(ranurasDe(54)).toBe(1);
  });

  it('nunca pasa de cinco: las cuatro filas y el rótulo', () => {
    expect(ranurasDe(1000)).toBe(5);
  });

  it('una medida rota cae del lado prudente: una fila, que nunca empuja el grid', () => {
    expect(ranurasDe(Number.NaN)).toBe(1);
    expect(ranurasDe(Number.POSITIVE_INFINITY)).toBe(1);
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
