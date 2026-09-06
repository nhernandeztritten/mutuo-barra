import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDeviation,
  formatDuration,
  formatMoney,
  formatPct,
  formatQty,
  formatRate,
  formatTime,
} from '../format';

describe('formatMoney', () => {
  it('siempre dos decimales con coma y el euro detrás', () => {
    expect(formatMoney(1.5)).toBe('1,50 €');
    expect(formatMoney(0)).toBe('0,00 €');
    expect(formatMoney(0.743)).toBe('0,74 €');
  });

  it('separa los miles con punto a partir de cinco cifras, como manda es-ES', () => {
    expect(formatMoney(12345.5)).toBe('12.345,50 €');
    // CLDR español no agrupa los números de cuatro cifras.
    expect(formatMoney(1234.5)).toBe('1234,50 €');
  });
});

describe('formatQty', () => {
  it('promociona los gramos a kilos', () => {
    expect(formatQty(3250, 'g')).toBe('3,25 kg');
  });

  it('promociona los mililitros a litros sin ceros de relleno', () => {
    expect(formatQty(17500, 'ml')).toBe('17,5 L');
  });

  it('deja las unidades como están', () => {
    expect(formatQty(180, 'ud')).toBe('180 ud');
  });

  it('por debajo de mil mantiene la unidad de receta', () => {
    expect(formatQty(120, 'ml')).toBe('120 ml');
    expect(formatQty(12.5, 'g')).toBe('12,5 g');
  });
});

describe('formatRate', () => {
  it('redondea las bebidas por hora', () => {
    expect(formatRate(47.3)).toBe('47/h');
    expect(formatRate(47.6)).toBe('48/h');
    expect(formatRate(0)).toBe('0/h');
  });
});

describe('porcentajes', () => {
  it('un decimal como máximo', () => {
    expect(formatPct(12.34)).toBe('12,3 %');
    expect(formatPct(0)).toBe('0 %');
  });

  it('las desviaciones llevan signo', () => {
    expect(formatDeviation(32.9)).toBe('+32,9 %');
    expect(formatDeviation(-4.25)).toBe('−4,3 %');
    expect(formatDeviation(0)).toBe('0 %');
  });
});

describe('fechas y horas', () => {
  it('la hora va en 24 h', () => {
    expect(formatTime(new Date(2026, 8, 12, 18, 30))).toBe('18:30');
    expect(formatTime(new Date(2026, 8, 12, 0, 5))).toBe('00:05');
  });

  it('la fecha va en formato es-ES', () => {
    expect(formatDate(new Date(2026, 8, 12))).toBe('12/09/2026');
  });

  it('la duración se lee en horas y minutos', () => {
    expect(formatDuration(275)).toBe('4 h 35 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(45)).toBe('45 min');
  });
});
