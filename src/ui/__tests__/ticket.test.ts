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
  editingOrderId,
  isOptionActive,
  lastLine,
  lineContent,
  loadTicket,
  replaceLine,
  restoreTicket,
  setEditingOrder,
  setQty,
  ticket,
  ticketDrinks,
  ticketTotal,
  toggleOption,
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

describe('corregir un pedido servido sobrevive a la recarga', () => {
  it('vuelve con sus líneas y sabiendo a qué pedido corrige', () => {
    add('latte');
    setEditingOrder('pedido-de-las-9-54');
    expect(editingOrderId.value).toBe('pedido-de-las-9-54');

    detachTicket();
    expect(editingOrderId.value).toBeNull();

    loadTicket(EVENT);
    expect(ticket.value).toHaveLength(1);
    expect(editingOrderId.value).toBe('pedido-de-las-9-54');
  });

  it('cada evento guarda su corrección aparte', () => {
    add('latte');
    setEditingOrder('pedido-de-las-9-54');
    detachTicket();
    loadTicket('otro-evento');
    expect(editingOrderId.value).toBeNull();
  });

  it('vaciar el pedido cancela la corrección: sin líneas no hay nada que servir', () => {
    add('latte');
    setEditingOrder('pedido-de-las-9-54');
    clearTicket();
    expect(editingOrderId.value).toBeNull();

    detachTicket();
    loadTicket(EVENT);
    expect(editingOrderId.value).toBeNull();
  });

  it('quitar la última línea a mano también la cancela', () => {
    add('latte');
    setEditingOrder('pedido-de-las-9-54');
    undoLast();
    expect(ticket.value).toHaveLength(0);
    expect(editingOrderId.value).toBeNull();
  });

  it('un id guardado sin líneas no resucita: se descarta al cargar', () => {
    localStorage.setItem(`mutuo-barra:editando:${EVENT}`, 'pedido-fantasma');
    detachTicket();
    loadTicket(EVENT);
    expect(editingOrderId.value).toBeNull();
    expect(localStorage.getItem(`mutuo-barra:editando:${EVENT}`)).toBeNull();
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

describe('la opción por defecto no se guarda', () => {
  it('«Vaca» no entra en la línea ni impide agrupar', () => {
    const a = add('cortado');
    const b = add('cortado', 'leche_vaca');
    expect(b.line.optionIds).toEqual([]);
    expect(b.line.modifiers).toEqual([]);
    // Y por eso las dos son la misma línea.
    expect(ticket.value).toHaveLength(1);
    expect(ticket.value[0]?.qty).toBe(2);
    expect(a.line.productId).toBe('cortado');
  });

  it('está marcada mientras no haya otra opción de su grupo', () => {
    const vaca = MODIFIER_OPTIONS.find((o) => o.id === 'leche_vaca')!;
    const avena = MODIFIER_OPTIONS.find((o) => o.id === 'leche_avena')!;
    expect(isOptionActive([], vaca, MODIFIER_OPTIONS)).toBe(true);
    expect(isOptionActive(['leche_avena'], vaca, MODIFIER_OPTIONS)).toBe(false);
    expect(isOptionActive(['leche_avena'], avena, MODIFIER_OPTIONS)).toBe(true);
  });
});

describe('encender y apagar un extra', () => {
  const opt = (id: string) => MODIFIER_OPTIONS.find((o) => o.id === id)!;

  it('un grupo de opción única solo admite una: la nueva desplaza a la anterior', () => {
    const uno = toggleOption([], opt('leche_avena'), MODIFIER_GROUPS, MODIFIER_OPTIONS);
    expect(uno).toEqual(['leche_avena']);
    const dos = toggleOption(uno, opt('leche_sin_lactosa'), MODIFIER_GROUPS, MODIFIER_OPTIONS);
    expect(dos).toEqual(['leche_sin_lactosa']);
  });

  it('elegir la opción por defecto deja el grupo sin nada marcado', () => {
    const conAvena = ['leche_avena', 'extra_tapa'];
    expect(toggleOption(conAvena, opt('leche_vaca'), MODIFIER_GROUPS, MODIFIER_OPTIONS)).toEqual([
      'extra_tapa',
    ]);
  });

  it('un grupo múltiple acumula, y el segundo toque quita', () => {
    const uno = toggleOption([], opt('extra_iced'), MODIFIER_GROUPS, MODIFIER_OPTIONS);
    const dos = toggleOption(uno, opt('extra_tapa'), MODIFIER_GROUPS, MODIFIER_OPTIONS);
    expect(dos).toEqual(['extra_iced', 'extra_tapa']);
    expect(toggleOption(dos, opt('extra_iced'), MODIFIER_GROUPS, MODIFIER_OPTIONS)).toEqual([
      'extra_tapa',
    ]);
  });
});

describe('cambiar los extras de una línea', () => {
  it('devuelve el id de la línea resultante y fusiona con la gemela', () => {
    const conAvena = add('latte', 'leche_avena');
    const sola = add('latte');
    expect(ticket.value).toHaveLength(2);

    const built = buildLine(
      PRODUCTS.find((p) => p.id === 'latte')!,
      MODIFIER_OPTIONS.filter((o) => o.id === 'leche_avena'),
      INGREDIENTS,
      MODIFIER_GROUPS,
    );
    const id = replaceLine(sola.line.id, {
      ...lineContent(sola.line),
      optionIds: built.line.optionIds,
      modifiers: built.line.modifiers,
      unitPrice: built.line.unitPrice,
      unitCost: built.line.unitCost,
      usage: built.line.usage,
    });

    expect(ticket.value).toHaveLength(1);
    expect(id).toBe(conAvena.line.id);
    expect(ticket.value[0]?.qty).toBe(2);
  });

  it('devuelve null si la línea ya no está', () => {
    const { line } = add('cortado');
    clearTicket();
    expect(replaceLine(line.id, lineContent(line))).toBeNull();
  });
});

describe('cuál es la bebida actual', () => {
  it('es la última que llegó, y tras deshacer la anterior', () => {
    add('cortado');
    const latte = add('latte');
    expect(lastLine()?.id).toBe(latte.line.id);
    undoLast();
    expect(lastLine()?.productId).toBe('cortado');
  });

  it('con el pedido vacío no hay ninguna', () => {
    expect(lastLine()).toBeNull();
  });
});
