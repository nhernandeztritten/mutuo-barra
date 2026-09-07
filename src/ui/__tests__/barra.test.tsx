/**
 * La barra montada de verdad: tocar tiles, chips que no aplican, servir,
 * deshacer y recargar la página. Comprueba lo que ve el barista, no la interna.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider, Route, Router } from 'preact-iso';
import { initDb, resetDb } from '../../data/db';
import { createEvent, listOrders, openEvent, saveProduct } from '../../data/repo';
import type { EventMode } from '../../data/types';
import { Barra } from '../../routes/barra';
import { ToastHost } from '../components';
import { loadCatalog, loadSettings, products, refreshEvents } from '../store';
import { clearToasts } from '../toast';
import { detachTicket } from '../ticket';

function BarraHarness() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/evento/:id" component={Barra} />
        <Route default component={() => <p>Fuera de ruta</p>} />
      </Router>
      <ToastHost />
    </LocationProvider>
  );
}

/** Botón de producto del grid único, por su nombre corto. */
function tile(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.tile-grid .tile')].find(
    (el) => el.textContent?.trim().startsWith(name),
  );
  if (!found) throw new Error(`No hay tile «${name}» en la categoría abierta`);
  return found;
}

/** Un extra de la fila contextual, por su nombre exacto. */
function extra(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.extras button')].find(
    (el) => el.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No hay extra «${name}» en la fila`);
  return found;
}

/** Todos los extras que ofrece la fila ahora mismo, en orden. */
function extrasVisibles(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.extras button')].map(
    (el) => el.textContent?.trim() ?? '',
  );
}

/** La bebida cuyos extras enseña la fila, o null si está en reposo. */
function bebidaDeLaFila(): string | null {
  return document.querySelector('.extras__bebida')?.textContent?.trim() ?? null;
}

/** El botón «Más» de una línea del ticket: abre su hoja lateral. */
function masDe(index = 0): HTMLButtonElement {
  const found = document.querySelectorAll<HTMLButtonElement>('.ticket__row .btn--mas')[index];
  if (!found) throw new Error(`No hay botón «Más» en la línea ${index}`);
  return found;
}

/** La línea marcada como actual. */
function lineaActual(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ticket__row.is-current');
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ticket__row')];
}

function serveButton(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.ticket__foot .btn--action');
  if (!found) throw new Error('No hay botón de servir');
  return found;
}

function servedCount(): string {
  return document.querySelector('.barra__count-value')?.textContent ?? '';
}

/* ---- «Últimos pedidos» ---- */

function ultimosFilas(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ultimos__fila')];
}

/** La frase de cada fila, sin la hora ni el botón: lo que lee el barista. */
function ultimosFrases(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.ultimos__frase')].map(
    (el) => el.textContent?.trim() ?? '',
  );
}

function repetirDe(index = 0): HTMLButtonElement {
  const found = ultimosFilas()[index]?.querySelector<HTMLButtonElement>('.ultimos__repetir');
  if (!found) throw new Error(`No hay «Repetir» en la fila ${index}`);
  return found;
}

/** El interruptor «Rápido» de la cabecera. */
function rapido(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.switch--stacked');
  if (!found) throw new Error('No hay interruptor Rápido');
  return found;
}

/** El aviso más reciente. Los de 8 s con «Deshacer» siguen vivos: no vale el primero. */
function ultimoToast(): string {
  const todos = [...document.querySelectorAll('.toast')];
  return todos[todos.length - 1]?.textContent ?? '';
}

/** Sirve el pedido en curso y espera a que el contador llegue a `total`. */
async function servirYEsperar(total: number): Promise<void> {
  fireEvent.click(serveButton());
  await waitFor(() => expect(servedCount()).toBe(String(total)));
}

async function setupBar(mode: EventMode = 'incluido'): Promise<string> {
  cleanup();
  clearToasts();
  localStorage.clear();
  detachTicket();
  await resetDb();
  await initDb();
  await Promise.all([loadCatalog(), loadSettings()]);
  const event = await createEvent({
    name: 'Boda de prueba',
    mode,
    guestsExpected: 100,
    stockStart: { cafe: 3000 },
  });
  await openEvent(event.id);
  await refreshEvents();
  history.replaceState({}, '', `/evento/${event.id}`);
  render(<BarraHarness />);
  await screen.findByText('Boda de prueba');
  return event.id;
}

beforeEach(() => {
  cleanup();
});

describe('tocar un producto', () => {
  it('agrupa dos toques de la misma bebida en una línea con cantidad 2', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Cortado'));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.querySelector('.ticket__qty')?.textContent).toBe('2');
    expect(serveButton().textContent).toContain('Servir 2 bebidas');
  });

  it('la bebida entra limpia y pasa a ser la actual', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(bebidaDeLaFila()).toBe('Latte');
    expect(lineaActual()?.textContent).toContain('Latte');
  });
});

describe('la fila de extras es de la última bebida tocada', () => {
  it('en reposo dice dónde van a salir los extras', async () => {
    await setupBar();
    expect(document.querySelector('.extras__pista')?.textContent).toBe(
      'Toca una bebida; sus extras salen aquí',
    );
    expect(bebidaDeLaFila()).toBeNull();
  });

  it('tras tocar «Latte» enseña su nombre y todos sus extras', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Latte'));
    expect(extrasVisibles()).toEqual([
      'Vaca',
      'Avena',
      'Sin lactosa',
      'Desca',
      'Doble',
      'Iced',
      'Sirope',
      'Tapa',
    ]);
    // La leche es un segmento de opción única con «Vaca» marcada de salida.
    expect(document.querySelectorAll('.seg .seg__opt')).toHaveLength(3);
    expect(extra('Vaca').getAttribute('aria-pressed')).toBe('true');
  });

  it('tocar «Avena» lo aplica a esa línea y marca el chip en violeta', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(1));

    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));
    expect(rows()[0]?.textContent).toContain('Latte');
    expect(extra('Avena').getAttribute('aria-pressed')).toBe('true');
    expect(extra('Vaca').getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar «Sin lactosa» sustituye a la avena: la leche es de opción única', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));

    fireEvent.click(extra('Sin lactosa'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('sin lactosa'));
    expect(rows()[0]?.textContent).not.toContain('avena');
    expect(extra('Avena').getAttribute('aria-pressed')).toBe('false');
    expect(extra('Sin lactosa').getAttribute('aria-pressed')).toBe('true');
  });

  it('volver a tocar el extra lo quita', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Tapa'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('tapa'));
    fireEvent.click(extra('Tapa'));
    await waitFor(() => expect(rows()[0]?.textContent).not.toContain('tapa'));
  });

  it('«Vaca» devuelve la línea a la leche normal sin dejar etiqueta', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));

    fireEvent.click(extra('Vaca'));
    await waitFor(() => expect(rows()[0]?.querySelector('.ticket__mods')).toBeNull());
    // Y sigue siendo una sola línea: «Vaca» no es un modificador que guardar.
    expect(rows()).toHaveLength(1);
  });
});

describe('un extra que no aplica ya no se enseña', () => {
  it('el Espresso solo ofrece Desca, Doble, Iced y Tapa', async () => {
    await setupBar();
    fireEvent.click(tile('Espresso'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Espresso'));
    expect(extrasVisibles()).toEqual(['Desca', 'Doble', 'Iced', 'Tapa']);
    expect(document.querySelector('.seg')).toBeNull();
  });

  it('el Americano y el Flat white no ofrecen «Doble»: ya salen dobles', async () => {
    await setupBar();
    fireEvent.click(tile('Americano'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Americano'));
    expect(extrasVisibles()).toEqual(['Desca', 'Iced', 'Tapa']);

    fireEvent.click(tile('Flat white'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Flat white'));
    expect(extrasVisibles()).not.toContain('Doble');
    expect(extrasVisibles()).toEqual(['Vaca', 'Avena', 'Sin lactosa', 'Desca', 'Iced', 'Sirope', 'Tapa']);
  });

  it('ya no hay nada que sacudir: la fila no ofrece extras imposibles', async () => {
    await setupBar();
    fireEvent.click(tile('Espresso'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Espresso'));
    expect(extrasVisibles()).not.toContain('Avena');
    expect(document.querySelector('.chip--shake')).toBeNull();
  });
});

describe('dos bebidas iguales que acaban igual se agrupan', () => {
  it('dos Lattes con avena tocados por separado quedan en una línea con cantidad 2', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));

    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(extra('Avena'));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.querySelector('.ticket__qty')?.textContent).toBe('2');
    expect(rows()[0]?.textContent).toContain('avena');
    // La línea superviviente es la actual: la fila sigue editando lo tocado.
    expect(lineaActual()).not.toBeNull();
    expect(extra('Avena').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('elegir qué línea edita la fila', () => {
  it('tocar el nombre de una línea la convierte en la actual', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Latte'));

    fireEvent.click(rows()[0]!.querySelector<HTMLButtonElement>('.ticket__name')!);
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Cortado'));
    expect(lineaActual()?.textContent).toContain('Cortado');
  });

  it('«Deshacer último» quita la línea y la fila pasa a la anterior', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Latte'));

    fireEvent.click(
      [...document.querySelectorAll<HTMLButtonElement>('.ticket__foot .btn')].find((b) =>
        b.textContent?.includes('Deshacer'),
      )!,
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(bebidaDeLaFila()).toBe('Cortado');
  });
});

describe('servir y deshacer', () => {
  it('servir sube el contador, vacía el ticket y ofrece deshacer', async () => {
    const eventId = await setupBar();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));

    fireEvent.click(serveButton());

    await waitFor(() => expect(servedCount()).toBe('1'));
    await waitFor(() => expect(rows()).toHaveLength(0));

    const orders = await listOrders(eventId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.lines[0]?.productName).toBe('Cortado');
    // Coste y receta congelados en la línea.
    expect(orders[0]?.lines[0]?.usage['cafe']).toBe(18);
    expect(orders[0]?.lines[0]?.unitCost).toBeCloseTo(0.7428, 4);

    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toContain('1 bebida servida');
    expect(toast?.textContent).toContain('Deshacer');

    // Servido el pedido, la fila de extras vuelve al estado vacío.
    expect(bebidaDeLaFila()).toBeNull();
    expect(document.querySelector('.extras__pista')).not.toBeNull();
  });

  it('un Americano servido descuenta 36 g de café, no 18', async () => {
    const eventId = await setupBar();
    fireEvent.click(tile('Americano'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(serveButton());
    await waitFor(() => expect(servedCount()).toBe('1'));

    const orders = await listOrders(eventId);
    expect(orders[0]?.lines[0]?.usage['cafe']).toBe(36);
    expect(orders[0]?.lines[0]?.unitCost).toBeCloseTo(1.2542, 4);
  });

  it('deshacer anula el pedido y devuelve la línea al ticket', async () => {
    const eventId = await setupBar();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));

    fireEvent.click(serveButton());
    await waitFor(() => expect(servedCount()).toBe('1'));

    const undo = document.querySelector<HTMLButtonElement>('.toast__action');
    expect(undo).not.toBeNull();
    fireEvent.click(undo!);

    await waitFor(() => expect(servedCount()).toBe('0'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.textContent).toContain('avena');

    const orders = await listOrders(eventId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.voidedAt).not.toBeNull();
    expect(orders[0]?.voidReason).toBe('deshacer');
  });

  it('el ticket vacío deshabilita el botón con el texto «Toca una bebida»', async () => {
    await setupBar();
    expect(serveButton().textContent).toContain('Toca una bebida');
    expect(serveButton().disabled).toBe(true);
  });
});

describe('recargar la página en medio del evento', () => {
  it('el ticket sigue ahí y la fila enseña la última línea como actual', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(2));

    // Recargar = desmontar y volver a montar leyendo lo persistido.
    cleanup();
    detachTicket();
    render(<BarraHarness />);
    await screen.findByText('Boda de prueba');

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]?.textContent).toContain('avena');
    // La fila no arranca vacía: la última línea del pedido es la actual.
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Latte'));
    expect(lineaActual()?.textContent).toContain('Latte');
  });
});

describe('modo Rápido: los extras llegan justo después de servir', () => {
  it('tocar «Cortado» sirve al instante y la fila sigue editando ese pedido', async () => {
    const eventId = await setupBar();
    fireEvent.click(rapido());
    await waitFor(() => expect(rapido().getAttribute('aria-pressed')).toBe('true'));
    // La fila explica el modo, porque en la cabecera no cabe.
    expect(document.querySelector('.extras__pista')?.textContent).toBe(
      'Toca una bebida: se sirve al momento y sus extras salen aquí',
    );

    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(servedCount()).toBe('1'));
    // Se sirvió sin pasar por el ticket, y la fila enseña la bebida servida.
    expect(rows()).toHaveLength(0);
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Cortado'));
    // Y dice que ya está servida, junto al nombre para que no se salga.
    expect(document.querySelector('.extras__ayuda')?.textContent).toBe('· servida');

    fireEvent.click(extra('Avena'));
    await waitFor(async () => {
      const orders = await listOrders(eventId);
      expect(orders[0]?.lines[0]?.modifiers[0]?.label).toBe('Avena');
    });

    // El pedido es el mismo: no se crea otro ni se anula ninguno.
    const orders = await listOrders(eventId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.voidedAt).toBeNull();
    expect(orders[0]?.lines).toHaveLength(1);
    // Y la receta y el coste se recalculan con la avena dentro.
    expect(orders[0]?.lines[0]?.usage['avena']).toBe(120);
    expect(orders[0]?.lines[0]?.usage['leche']).toBeUndefined();
    expect(orders[0]?.lines[0]?.unitPrice).toBe(2.7);
    expect(orders[0]?.subtotal).toBe(2.7);
    expect(servedCount()).toBe('1');
  });

  it('deshacer el pedido cierra la ventana de edición', async () => {
    await setupBar();
    fireEvent.click(rapido());
    await waitFor(() => expect(rapido().getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(bebidaDeLaFila()).toBe('Cortado'));

    fireEvent.click(document.querySelector<HTMLButtonElement>('.toast__action')!);
    await waitFor(() => expect(servedCount()).toBe('0'));
    // Un pedido anulado ya no se edita desde la fila.
    await waitFor(() => expect(bebidaDeLaFila()).toBeNull());
  });
});

describe('«Últimos pedidos»: qué me acaban de pedir', () => {
  it('la barra recién abierta dice que todavía no hay pedidos', async () => {
    await setupBar();
    expect(document.querySelector('.ultimos__titulo')?.textContent).toBe('Últimos pedidos');
    expect(document.querySelector('.ultimos__vacio')?.textContent).toBe(
      'Todavía no hay pedidos servidos',
    );
    expect(ultimosFilas()).toHaveLength(0);
  });

  it('la lista se anuncia sin interrumpir: es una región polite', async () => {
    await setupBar();
    const lista = document.querySelector('.ultimos__lista')!;
    expect(lista.getAttribute('aria-live')).toBe('polite');
  });

  it('está también en modo Rápido: es un solo componente para los dos', async () => {
    await setupBar();
    fireEvent.click(rapido());
    await waitFor(() => expect(rapido().getAttribute('aria-pressed')).toBe('true'));
    expect(document.querySelector('.ultimos__titulo')).not.toBeNull();
    // Y la lista vieja de «Últimas servidas» ya no existe.
    expect(document.querySelector('.recent')).toBeNull();
  });

  it('el pedido servido aparece arriba con su hora y su frase', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(2));

    await servirYEsperar(3);

    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));
    expect(ultimosFrases()[0]).toBe('Latte · avena, 2 × Cortado');
    // Hora en tabular, como manda DESIGN.md para las cifras.
    expect(ultimosFilas()[0]?.querySelector('.ultimos__hora')?.textContent).toMatch(
      /^\d{2}:\d{2}$/,
    );
  });

  it('el pedido más nuevo se pone el primero', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(tile('Espresso'));
    await servirYEsperar(2);

    await waitFor(() => expect(ultimosFilas()).toHaveLength(2));
    expect(ultimosFrases()).toEqual(['Espresso', 'Latte']);
  });

  it('con seis pedidos solo se ven cinco', async () => {
    await setupBar();
    for (let i = 1; i <= 6; i += 1) {
      fireEvent.click(tile('Cortado'));
      await servirYEsperar(i);
    }
    await waitFor(() => expect(ultimosFilas()).toHaveLength(5));
  });

  it('deshacer devuelve el pedido al ticket y lo quita de la lista', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(document.querySelector<HTMLButtonElement>('.toast__action')!);
    await waitFor(() => expect(servedCount()).toBe('0'));
    // Fuera de la lista —lo anulado no se repite— y de vuelta en el pedido.
    await waitFor(() => expect(ultimosFilas()).toHaveLength(0));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain('Cortado');
  });
});

describe('«Repetir» un pedido', () => {
  it('en modo normal devuelve las líneas al pedido actual, sin servir nada', async () => {
    const eventId = await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(repetirDe());

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.textContent).toContain('Latte');
    expect(rows()[0]?.textContent).toContain('avena');
    // Repetir no sirve: el contador y los pedidos guardados no se mueven.
    expect(servedCount()).toBe('1');
    expect(await listOrders(eventId)).toHaveLength(1);
  });

  it('agrupa con lo que ya hubiera en el pedido en vez de abrir otra línea', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    // Ya hay un Cortado en el pedido actual cuando se repite el de antes.
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));

    fireEvent.click(repetirDe());

    await waitFor(() => expect(rows()[0]?.querySelector('.ticket__qty')?.textContent).toBe('2'));
    expect(rows()).toHaveLength(1);
    expect(serveButton().textContent).toContain('Servir 2 bebidas');
  });

  it('respeta la cantidad y los modificadores del pedido original', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Cortado'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.querySelector('.ticket__qty')?.textContent).toBe('2'));
    await servirYEsperar(2);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));
    expect(ultimosFrases()[0]).toBe('2 × Cortado · avena');

    fireEvent.click(repetirDe());

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.querySelector('.ticket__qty')?.textContent).toBe('2');
    expect(rows()[0]?.textContent).toContain('avena');
  });

  it('la fila hace un fundido breve, sin ventana emergente', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(repetirDe());
    await waitFor(() => expect(ultimosFilas()[0]?.className).toContain('is-repetida'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en modo Rápido sirve el pedido al instante y lo pone arriba', async () => {
    const eventId = await setupBar();
    fireEvent.click(tile('Latte'));
    fireEvent.click(extra('Avena'));
    await waitFor(() => expect(rows()[0]?.textContent).toContain('avena'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(rapido());
    await waitFor(() => expect(rapido().getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(repetirDe());

    await waitFor(() => expect(servedCount()).toBe('2'));
    await waitFor(() => expect(ultimosFilas()).toHaveLength(2));
    // El nuevo va arriba, con la misma frase que el que se repitió.
    expect(ultimosFrases()).toEqual(['Latte · avena', 'Latte · avena']);

    const orders = await listOrders(eventId);
    expect(orders).toHaveLength(2);
    expect(orders[1]?.lines[0]?.modifiers[0]?.label).toBe('Avena');
    // Y con su «Deshacer», como cualquier otra cosa servida en este modo.
    expect(ultimoToast()).toContain('1 bebida servida');
    expect(ultimoToast()).toContain('Deshacer');
  });

  it('en modo venta el precio vuelve a salir de la carta de ahora', async () => {
    await setupBar('venta');
    fireEvent.click(tile('Espresso')); // 2,00
    await waitFor(() => expect(rows()).toHaveLength(1));

    // En venta, servir pasa por la hoja de cobro.
    fireEvent.click(serveButton());
    const cobro = await screen.findByRole('dialog');
    fireEvent.click(
      [...cobro.querySelectorAll<HTMLButtonElement>('.btn')].find((b) =>
        b.textContent?.includes('Confirmar y servir'),
      )!,
    );
    await waitFor(() => expect(servedCount()).toBe('1'));
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(repetirDe());

    await waitFor(() => expect(rows()).toHaveLength(1));
    // El importe se recalcula, no se clona el cobro viejo.
    expect(serveButton().textContent).toContain('Cobrar 2,00 €');
  });

  it('una bebida que ya no está en la carta avisa en vez de repetir a medias', async () => {
    await setupBar();
    fireEvent.click(tile('Latte'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    const latte = products.value.find((p) => p.id === 'latte')!;
    await saveProduct({ ...latte, active: false });
    await loadCatalog();
    await waitFor(() => expect(document.querySelectorAll('.tile-grid .tile')).toHaveLength(13));

    fireEvent.click(repetirDe());

    await waitFor(() => expect(ultimoToast()).toContain('Esa bebida ya no está en la carta'));
    // Y no repite nada a medias: el pedido actual sigue vacío. Se mira el botón
    // y no las filas porque durante los 180 ms del fundido lo que se pinta es
    // la copia congelada del pedido servido, no el pedido de verdad.
    expect(serveButton().disabled).toBe(true);
    expect(serveButton().textContent).toContain('Toca una bebida');
  });
});

describe('«Ver todos» lleva a la lista de pedidos del Resumen', () => {
  it('abre la hoja de Resumen con sus pedidos y su «Anular»', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    await servirYEsperar(1);
    await waitFor(() => expect(ultimosFilas()).toHaveLength(1));

    fireEvent.click(document.querySelector<HTMLButtonElement>('.ultimos__vertodos')!);

    const hoja = await screen.findByRole('dialog');
    expect(hoja.getAttribute('aria-label')).toBe('Resumen');
    const pedidos = hoja.querySelector('#resumen-pedidos');
    expect(pedidos).not.toBeNull();
    expect(pedidos?.textContent).toContain('Pedidos (1)');
    expect(pedidos?.textContent).toContain('Anular');
  });
});

describe('modo venta', () => {
  it('el botón dice «Cobrar» y la hoja de cobro calcula el cambio', async () => {
    await setupBar('venta');
    fireEvent.click(tile('Espresso')); // 2,00
    fireEvent.click(tile('Americano')); // 2,50
    await waitFor(() => expect(rows()).toHaveLength(2));

    expect(serveButton().textContent).toContain('Cobrar 4,50 €');
    fireEvent.click(serveButton());

    const sheet = await screen.findByRole('dialog');
    expect(sheet.querySelector('.pay__amount')?.textContent).toBe('4,50 €');

    const ten = [...sheet.querySelectorAll<HTMLButtonElement>('.pay__quick .btn')].find(
      (b) => b.textContent?.trim() === '10,00 €',
    );
    expect(ten).toBeDefined();
    fireEvent.click(ten!);
    await waitFor(() =>
      expect(sheet.querySelector('.pay__change-value')?.textContent).toBe('5,50 €'),
    );
  });
});

describe('grid continuo con leyenda de categorías', () => {
  it('enseña las catorce bebidas de la carta a la vez, sin pestañas ni encabezados de fila', async () => {
    await setupBar();
    expect(document.querySelectorAll('.tile-grid .tile')).toHaveLength(14);
    // Las filas de encabezado se fueron: no cabían las seis categorías.
    expect(document.querySelectorAll('.tile-grid .grupo__title')).toHaveLength(0);
    expect(document.querySelectorAll('.tab')).toHaveLength(0);
  });

  it('los tiles van ordenados por categoría y llevan su color', async () => {
    await setupBar();
    const cats = [...document.querySelectorAll('.tile-grid .tile')].map((el) =>
      el.getAttribute('data-cat'),
    );
    expect(cats).toEqual([
      'Espresso',
      'Espresso',
      'Con leche',
      'Con leche',
      'Con leche',
      'Con leche',
      'Filtro',
      'Fríos',
      'Fríos',
      'Fríos',
      'Especiales',
      'Especiales',
      'Otros',
      'Otros',
    ]);
    expect(document.querySelectorAll('.tile-grid .tile__dot').length).toBe(14);
  });

  it('la leyenda nombra las seis categorías, en el orden de la carta', async () => {
    await setupBar();
    const nombres = [...document.querySelectorAll('.leyenda-cat__item')].map((el) =>
      el.textContent?.trim(),
    );
    expect(nombres).toEqual(['Espresso', 'Con leche', 'Filtro', 'Fríos', 'Especiales', 'Otros']);
  });

  it('con el grid entero a la vista, tocar una categoría resalta sus tiles', async () => {
    await setupBar();
    const frios = [...document.querySelectorAll<HTMLButtonElement>('.leyenda-cat__item')].find(
      (el) => el.textContent?.trim() === 'Fríos',
    )!;
    fireEvent.click(frios);
    await waitFor(() => expect(document.querySelectorAll('.tile--flash').length).toBe(3));
    expect(
      [...document.querySelectorAll('.tile--flash')].every(
        (el) => el.getAttribute('data-cat') === 'Fríos',
      ),
    ).toBe(true);
  });

  it('una bebida desactivada desaparece del grid, y su categoría de la leyenda si se queda vacía', async () => {
    await setupBar();
    const te = products.value.find((p) => p.id === 'te')!;
    const agua = products.value.find((p) => p.id === 'agua_botella')!;
    await saveProduct({ ...te, active: false });
    await saveProduct({ ...agua, active: false });
    await loadCatalog();

    await waitFor(() => expect(document.querySelectorAll('.tile-grid .tile')).toHaveLength(12));
    const nombres = [...document.querySelectorAll('.leyenda-cat__item')].map((el) =>
      el.textContent?.trim(),
    );
    expect(nombres).not.toContain('Otros');
    expect(document.querySelector('.tile-grid')?.textContent).not.toContain('Té');
  });

  it('los nombres largos del tile ya no se abrevian', async () => {
    await setupBar();
    const textos = [...document.querySelectorAll('.tile-grid .tile')].map((el) =>
      el.textContent?.trim(),
    );
    expect(textos).toContain('Espresso tonic');
    expect(textos.some((t) => t?.startsWith('Esp. '))).toBe(false);
  });
});

describe('cabecera de la barra', () => {
  it('sale a Eventos sin cerrar y ofrece un único terminal: Cerrar barra', async () => {
    await setupBar();
    const cabecera = document.querySelector('.barra__header')!;
    expect(cabecera.textContent).toContain('Eventos');
    expect(cabecera.textContent).toContain('Cerrar barra');
    // «Pausar» desaparece: no se distinguía de cerrar.
    expect(cabecera.textContent).not.toContain('Pausar');
  });

  it('el interruptor se llama Rápido y explica qué hace', async () => {
    await setupBar();
    const cabecera = document.querySelector('.barra__header')!;
    expect(cabecera.textContent).toContain('Rápido');
    expect(cabecera.textContent).toContain('cada toque sirve una bebida');
    expect(cabecera.textContent).not.toContain('Un toque');
  });

  it('dice en qué paso del evento estás', async () => {
    await setupBar();
    expect(document.querySelector('.pasos-linea')?.textContent).toContain('Paso 2 de 4');
    expect(document.querySelector('.pasos-linea')?.textContent).toContain('Servir');
  });
});

describe('las hojas se comportan como diálogos', () => {
  it('la hoja de una línea se anuncia como diálogo modal', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(masDe());
    const hoja = await screen.findByRole('dialog');
    expect(hoja.getAttribute('aria-modal')).toBe('true');
    expect(hoja.getAttribute('aria-label')).toBe('Cortado');
  });

  it('al abrirla el foco entra dentro, y al cerrarla vuelve a donde estaba', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    const mas = masDe();
    mas.focus();
    fireEvent.click(mas);

    const hoja = await screen.findByRole('dialog');
    await waitFor(() => expect(hoja.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(mas);
  });

  it('Escape cierra la hoja sin guardar cambios', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(masDe());
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // La línea sigue tal cual: sin modificadores.
    expect(document.querySelector('.ticket__mods')).toBeNull();
  });

  it('Tab da la vuelta dentro de la hoja en vez de salirse a la barra', async () => {
    await setupBar();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(masDe());
    const hoja = await screen.findByRole('dialog');

    const enfocables = [...hoja.querySelectorAll<HTMLElement>('button, input, textarea, [href]')];
    const ultimo = enfocables[enfocables.length - 1]!;
    ultimo.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(hoja.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(enfocables[0]);
  });
});
