/**
 * Pedido en curso: agrupación, deshacer y supervivencia a una recarga.
 * Lógica pura, sin renderizar: lo que la barra hace con las líneas.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { INGREDIENTS, MODIFIER_GROUPS, MODIFIER_OPTIONS, PRODUCTS } from '../../data/seed';
import {
  addLine,
  buildLine,
  clearTicket,
  detachTicket,
  loadTicket,
  restoreTicket,
  setQty,
  ticket,
  ticketDrinks,
  ticketTotal,
  undoLast,
} from '../ticket';

const EVENT = 'evento-de-prueba';

function product(id: string) {
  const found = PRODUCTS.find((p) => p.id === id);
  if (!found) throw new Error(`Producto inexistente en el seed: ${id}`);
  return found;
}

function options(...ids: string[]) {
  return ids.map((id) => {
    const found = MODIFIER_OPTIONS.find((o) => o.id === id);
    if (!found) throw new Error(`Opción inexistente en el seed: ${id}`);
    return found;
  });
}

function add(productId: string, ...optionIds: string[]) {
  const built = buildLine(
    product(productId),
    options(...optionIds),
    INGREDIENTS,
    MODIFIER_GROUPS,
  );
  addLine(built.line);
  return built;
}

beforeEach(() => {
  localStorage.clear();
  detachTicket();
  loadTicket(EVENT);
});

describe('agrupación de líneas', () => {
  it('agrupa la misma bebida con los mismos modificadores', () => {
    add('cortado');
    add('cortado');
    expect(ticket.value).toHaveLength(1);
    expect(ticket.value[0]?.qty).toBe(2);
    expect(ticketDrinks()).toBe(2);
  });

  it('no agrupa si los modificadores cambian', () => {
    add('cortado');
    add('cortado', 'leche_avena');
    expect(ticket.value).toHaveLength(2);
    expect(ticketDrinks()).toBe(2);
  });

  it('agrupa aunque los chips se hayan tocado en distinto orden', () => {
    add('cortado', 'leche_avena', 'extra_tapa');
    add('cortado', 'extra_tapa', 'leche_avena');
    expect(ticket.value).toHaveLength(1);
    expect(ticket.value[0]?.qty).toBe(2);
  });

  it('no agrupa si una línea lleva nota', () => {
    add('cortado');
    const built = buildLine(product('cortado'), [], INGREDIENTS, MODIFIER_GROUPS, 'poca leche');
    addLine(built.line);
    expect(ticket.value).toHaveLength(2);
  });
});

describe('modificadores que no aplican', () => {
  it('Avena en un Espresso se ignora y la línea no lleva etiqueta', () => {
    const { line, ignored } = add('espresso', 'leche_avena');
    expect(ignored.map((i) => i.optionId)).toEqual(['leche_avena']);
    expect(line.modifiers).toHaveLength(0);
    expect(line.optionIds).toHaveLength(0);
    // Tampoco cobra el suplemento de la avena.
    expect(line.unitPrice).toBe(product('espresso').price);
  });

  it('Avena en un Cortado sí aplica', () => {
    const { line, ignored } = add('cortado', 'leche_avena');
    expect(ignored).toHaveLength(0);
    expect(line.modifiers.map((m) => m.label)).toEqual(['Avena']);
    expect(line.usage['avena']).toBe(120);
    expect(line.usage['leche']).toBeUndefined();
  });
});

describe('deshacer y cantidades', () => {
  it('«Deshacer último» quita la última línea añadida', () => {
    add('cortado');
    add('latte');
    undoLast();
    expect(ticket.value.map((l) => l.productId)).toEqual(['cortado']);
  });

  it('«Deshacer último» baja una unidad cuando la línea está agrupada', () => {
    add('cortado');
    add('cortado');
    undoLast();
    expect(ticket.value).toHaveLength(1);
    expect(ticket.value[0]?.qty).toBe(1);
  });

  it('bajar a cero elimina la línea', () => {
    add('cortado');
    setQty(ticket.value[0]!.id, 0);
    expect(ticket.value).toHaveLength(0);
  });
});

describe('devolver un pedido deshecho', () => {
  it('las líneas vuelven al ticket y se agrupan con lo que ya hubiera', () => {
    const { line } = add('cortado');
    clearTicket();
    add('cortado');
    restoreTicket([line]);
    expect(ticket.value).toHaveLength(1);
    expect(ticket.value[0]?.qty).toBe(2);
  });
});

describe('recarga de la página', () => {
  it('el pedido se recupera del almacenamiento del evento', () => {
    add('cortado', 'leche_avena');
    add('latte');
    // Recargar = perder la memoria y volver a leer.
    detachTicket();
    expect(ticket.value).toHaveLength(0);
    loadTicket(EVENT);
    expect(ticket.value).toHaveLength(2);
    expect(ticket.value[0]?.modifiers[0]?.label).toBe('Avena');
    expect(ticketDrinks()).toBe(2);
  });

  it('cada evento tiene su propio pedido', () => {
    add('cortado');
    detachTicket();
    loadTicket('otro-evento');
    expect(ticket.value).toHaveLength(0);
    detachTicket();
    loadTicket(EVENT);
    expect(ticket.value).toHaveLength(1);
  });

  it('servir vacía también lo guardado', () => {
    add('cortado');
    clearTicket();
    detachTicket();
    loadTicket(EVENT);
    expect(ticket.value).toHaveLength(0);
  });
});

describe('importe del pedido', () => {
  it('suma precio unitario por cantidad', () => {
    add('cortado'); // 2,20
    add('cortado'); // agrupa → 4,40
    add('latte'); // 3,20
    expect(ticketTotal()).toBe(7.6);
  });

  it('el suplemento de la avena entra en el importe', () => {
    add('latte', 'leche_avena'); // 3,20 + 0,50
    expect(ticketTotal()).toBe(3.7);
  });
});
