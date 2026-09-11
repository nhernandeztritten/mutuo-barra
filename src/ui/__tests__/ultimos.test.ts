/**
 * «Últimos pedidos»: el orden, el límite de cinco, la exclusión de anulados y
 * la frase que lee el barista cuando se le olvida lo que le han pedido.
 */
import { describe, expect, it } from 'vitest';
import { line, order } from '../../domain/__tests__/fixtures';
import { VOID_EDITADO } from '../../data/types';
import {
  ULTIMOS_MAX,
  fraseDePartes,
  frasePedido,
  haceTexto,
  partesDePedido,
  ultimosPedidos,
} from '../ultimos';

/** Un pedido en el minuto `m` de las 09:00. */
function alMinuto(id: string, m: number, ...lineas: ReturnType<typeof line>[]) {
  const hora = `2026-09-07T09:${String(m).padStart(2, '0')}:00.000Z`;
  return order(id, hora, lineas);
}

describe('el más nuevo arriba', () => {
  it('ordena por hora de servicio, del último al primero', () => {
    const pedidos = [
      alMinuto('a', 5, line('cortado')),
      alMinuto('c', 20, line('latte')),
      alMinuto('b', 11, line('espresso')),
    ];
    expect(ultimosPedidos(pedidos).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('dos pedidos del mismo instante no bailan entre repintados', () => {
    const misma = [alMinuto('a', 5, line('cortado')), alMinuto('b', 5, line('latte'))];
    const primera = ultimosPedidos(misma).map((p) => p.id);
    const segunda = ultimosPedidos([...misma].reverse()).map((p) => p.id);
    expect(primera).toEqual(segunda);
  });
});

describe('solo se ven cinco', () => {
  it('con seis pedidos enseña los cinco más nuevos y deja fuera el más viejo', () => {
    const pedidos = Array.from({ length: 6 }, (_, i) =>
      alMinuto(`p${String(i)}`, i * 3, line('cortado')),
    );
    const vistos = ultimosPedidos(pedidos);
    expect(vistos).toHaveLength(ULTIMOS_MAX);
    expect(vistos.map((p) => p.id)).toEqual(['p5', 'p4', 'p3', 'p2', 'p1']);
  });

  it('el límite se puede bajar sin tocar el orden', () => {
    const pedidos = [alMinuto('a', 1, line('cortado')), alMinuto('b', 2, line('latte'))];
    expect(ultimosPedidos(pedidos, 1).map((p) => p.id)).toEqual(['b']);
  });
});

describe('un pedido anulado no está', () => {
  it('se salta el anulado y coge el siguiente para completar los cinco', () => {
    const pedidos = [
      alMinuto('viejo', 1, line('cortado')),
      ...Array.from({ length: 5 }, (_, i) => alMinuto(`p${String(i)}`, 10 + i, line('latte'))),
    ];
    const anulado = { ...pedidos[3]!, voidedAt: '2026-09-07T09:30:00.000Z', voidReason: 'error' };
    const vistos = ultimosPedidos([...pedidos.slice(0, 3), anulado, ...pedidos.slice(4)]);

    expect(vistos.map((p) => p.id)).not.toContain(pedidos[3]!.id);
    // Y sube el que quedaba fuera: siguen viéndose cinco.
    expect(vistos).toHaveLength(5);
    expect(vistos.map((p) => p.id)).toContain('viejo');
  });

  it('con todo anulado la lista queda vacía', () => {
    const uno = alMinuto('a', 5, line('cortado'));
    expect(ultimosPedidos([{ ...uno, voidedAt: '2026-09-07T09:06:00.000Z' }])).toEqual([]);
  });

  it('un pedido corregido tampoco está: lo que se ve es el que lo sustituye', () => {
    const viejo = alMinuto('viejo', 54, line('latte'));
    const anulado = { ...viejo, voidedAt: '2026-09-07T10:02:00.000Z', voidReason: VOID_EDITADO };
    const nuevo = {
      ...alMinuto('nuevo', 54, line('latte', 1, 'leche_avena')),
      replacesOrderId: 'viejo',
    };

    const vistos = ultimosPedidos([anulado, nuevo]);
    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.id).toBe('nuevo');
    // Y con la hora del original: la corrección no mueve el pedido en el tiempo.
    expect(vistos[0]?.servedAt).toBe(viejo.servedAt);
  });
});

describe('«hace N min», junto a la hora de la fila desplegada', () => {
  const alas = (hhmm: string) => `2026-09-07T${hhmm}:00.000Z`;

  it('por debajo del minuto no inventa un número', () => {
    expect(haceTexto(alas('09:54'), new Date(alas('09:54')))).toBe('ahora mismo');
    expect(haceTexto(alas('09:54'), new Date('2026-09-07T09:54:40.000Z'))).toBe('ahora mismo');
  });

  it('cuenta los minutos enteros', () => {
    expect(haceTexto(alas('09:54'), new Date(alas('09:55')))).toBe('hace 1 min');
    expect(haceTexto(alas('09:54'), new Date(alas('10:12')))).toBe('hace 18 min');
  });

  it('pasada la hora lo dice en horas y minutos, no en 83 minutos', () => {
    expect(haceTexto(alas('09:54'), new Date(alas('11:17')))).toBe('hace 1 h 23 min');
    expect(haceTexto(alas('09:54'), new Date(alas('10:54')))).toBe('hace 1 h');
  });
});

describe('lo que enseña la fila desplegada', () => {
  it('cada bebida lleva su nota y su importe aparte del nombre', () => {
    const conNota = { ...line('latte', 1, 'leche_avena'), note: 'poca leche' };
    const partes = partesDePedido(alMinuto('a', 11, conNota));
    expect(partes[0]?.texto).toBe('Latte');
    expect(partes[0]?.mods).toBe('avena');
    expect(partes[0]?.nota).toBe('poca leche');
    // Latte 3,20 + avena 0,50.
    expect(partes[0]?.importe).toBe(3.7);
  });

  it('lleva el cobro del pedido para poder enseñarlo en modo venta', () => {
    const pedido = order('a', '2026-09-07T09:54:00.000Z', [line('espresso')], {
      mode: 'venta',
      payment: 'tarjeta',
      total: 2,
      note: 'mesa 4',
    });
    const visto = ultimosPedidos([pedido])[0]!;
    expect(visto.mode).toBe('venta');
    expect(visto.payment).toBe('tarjeta');
    expect(visto.total).toBe(2);
    expect(visto.note).toBe('mesa 4');
  });
});

describe('la frase de un pedido', () => {
  it('pone la cantidad delante solo cuando hay más de una', () => {
    const pedido = alMinuto('a', 11, line('latte', 1, 'leche_avena'), line('cortado', 2));
    expect(frasePedido(pedido)).toBe('Latte · avena, 2 × Cortado');
  });

  it('abrevia «Descafeinado» a «desca», que es donde el ancho manda', () => {
    const pedido = alMinuto('a', 11, line('americano', 1, 'cafe_descafeinado'));
    expect(frasePedido(pedido)).toBe('Americano · desca');
  });

  it('encadena varios modificadores de la misma bebida', () => {
    const pedido = alMinuto('a', 11, line('latte', 1, 'leche_avena', 'extra_sirope'));
    expect(frasePedido(pedido)).toBe('Latte · avena · sirope');
  });

  it('separa el nombre de los modificadores para poder apagarlos en pantalla', () => {
    const partes = partesDePedido(alMinuto('a', 11, line('latte', 2, 'leche_avena')));
    expect(partes).toEqual([
      { texto: '2 × Latte', mods: 'avena', nota: '', importe: 7.4 },
    ]);
    expect(fraseDePartes(partes)).toBe('2 × Latte · avena');
  });

  it('una bebida sin extras no arrastra separadores sueltos', () => {
    expect(frasePedido(alMinuto('a', 11, line('espresso')))).toBe('Espresso');
  });
});
