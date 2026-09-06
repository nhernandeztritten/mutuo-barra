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

/** Chip rápido de la fila superior, por su nombre exacto. */
function chip(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.chips .chip')].find(
    (el) => el.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No hay chip «${name}»`);
  return found;
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

  it('un chip armado se aplica y se desarma tras añadir', async () => {
    await setupBar();
    fireEvent.click(chip('Avena'));
    expect(chip('Avena').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));

    expect(rows()[0]?.textContent).toContain('Cortado');
    expect(rows()[0]?.textContent).toContain('avena');
    expect(chip('Avena').getAttribute('aria-pressed')).toBe('false');
  });

  it('el chip es un interruptor: el segundo toque lo desarma', async () => {
    await setupBar();
    fireEvent.click(chip('Avena'));
    fireEvent.click(chip('Avena'));
    expect(chip('Avena').getAttribute('aria-pressed')).toBe('false');
  });

  it('dentro de un grupo single, armar una opción desarma la otra', async () => {
    await setupBar();
    fireEvent.click(chip('Avena'));
    fireEvent.click(chip('Sin lactosa'));
    expect(chip('Avena').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Sin lactosa').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('chip que no aplica al producto', () => {
  it('sacude ese chip y la línea sale sin el modificador', async () => {
    await setupBar();
    fireEvent.click(chip('Avena'));
    fireEvent.click(tile('Espresso'));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.textContent).toContain('Espresso');
    expect(rows()[0]?.textContent).not.toContain('avena');

    const shaken = [...document.querySelectorAll('.chip--shake')];
    expect(shaken).toHaveLength(1);
    expect(shaken[0]?.textContent?.trim()).toBe('Avena');
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
  });

  it('deshacer anula el pedido y devuelve la línea al ticket', async () => {
    const eventId = await setupBar();
    fireEvent.click(chip('Avena'));
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));

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
  it('el ticket en curso sigue ahí y los chips vuelven desarmados', async () => {
    await setupBar();
    fireEvent.click(chip('Avena'));
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(chip('Desca'));
    expect(chip('Desca').getAttribute('aria-pressed')).toBe('true');

    // Recargar = desmontar y volver a montar leyendo lo persistido.
    cleanup();
    detachTicket();
    render(<BarraHarness />);
    await screen.findByText('Boda de prueba');

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]?.textContent).toContain('avena');
    expect(document.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(0);
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

describe('grid único agrupado por categoría', () => {
  it('pinta un encabezado por categoría, en el orden de la carta', async () => {
    await setupBar();
    const titulos = [...document.querySelectorAll('.tile-grid .grupo__title')].map((el) =>
      el.textContent?.trim(),
    );
    expect(titulos).toEqual(['Espresso', 'Con leche', 'Filtro', 'Fríos', 'Especiales', 'Otros']);
  });

  it('enseña las catorce bebidas de la carta a la vez, sin pestañas', async () => {
    await setupBar();
    expect(document.querySelectorAll('.tile-grid .tile')).toHaveLength(14);
    // Con 14 productos las pestañas no aparecen: sobran.
    expect(document.querySelectorAll('.tab')).toHaveLength(0);
  });

  it('una bebida desactivada desaparece del grid y su categoría también si se queda vacía', async () => {
    await setupBar();
    const te = products.value.find((p) => p.id === 'te')!;
    const agua = products.value.find((p) => p.id === 'agua_botella')!;
    await saveProduct({ ...te, active: false });
    await saveProduct({ ...agua, active: false });
    await loadCatalog();

    await waitFor(() => expect(document.querySelectorAll('.tile-grid .tile')).toHaveLength(12));
    const titulos = [...document.querySelectorAll('.tile-grid .grupo__title')].map((el) =>
      el.textContent?.trim(),
    );
    expect(titulos).not.toContain('Otros');
    expect(document.querySelector('.tile-grid')?.textContent).not.toContain('Té');
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
