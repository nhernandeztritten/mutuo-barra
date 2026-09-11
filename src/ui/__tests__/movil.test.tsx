/**
 * La barra en un móvil (≤ 560 px). Lo que aquí se comprueba es lo que el CSS
 * no puede decidir solo: qué controles se van a la hoja «Más», qué dice el
 * botón de servir y que la hoja del pedido sigue llevando dentro «Últimos
 * pedidos».
 *
 * Lo que sí es CSS —tres columnas, el alto del tile, que las catorce bebidas
 * quepan de una— no se puede medir en jsdom, que no hace layout: eso lo
 * comprueba `scripts/capturas-fase-9.mjs` en un navegador de verdad.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider, Route, Router } from 'preact-iso';
import { initDb, resetDb } from '../../data/db';
import { createEvent, openEvent } from '../../data/repo';
import { Barra } from '../../routes/barra';
import { ToastHost } from '../components';
import { dispositivo, esteDispositivo } from '../instalacion';
import { esMovil, MOVIL_MAX, observarMovil } from '../layout';
import { loadCatalog, loadSettings, refreshEvents } from '../store';
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

function tile(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.tile-grid .tile')].find((el) =>
    el.textContent?.trim().startsWith(name),
  );
  if (!found) throw new Error(`No hay tile «${name}»`);
  return found;
}

/** El botón «Más» de la cabecera: el que abre la hoja de abajo. */
function botonMas(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.barra__mas');
  if (!found) throw new Error('No hay botón «Más» en la cabecera');
  return found;
}

/** Las filas de la hoja «Más», en orden, con su nombre y su explicación. */
function filasDeLaHoja(): { nombre: string; pista: string }[] {
  return [...document.querySelectorAll('.hoja-abajo .hoja-fila')].map((f) => ({
    nombre: f.querySelector('.hoja-fila__nombre')?.textContent?.trim() ?? '',
    pista: f.querySelector('.hoja-fila__pista')?.textContent?.trim() ?? '',
  }));
}

function barraInferior(): string {
  return document.querySelector('.ticket-bar')?.textContent?.trim() ?? '';
}

async function setupMovil(): Promise<string> {
  cleanup();
  clearToasts();
  localStorage.clear();
  detachTicket();
  await resetDb();
  await initDb();
  await Promise.all([loadCatalog(), loadSettings()]);
  const event = await createEvent({
    name: 'Boda de prueba',
    mode: 'incluido',
    guestsExpected: 100,
    stockStart: { cafe: 3000 },
  });
  await openEvent(event.id);
  await refreshEvents();
  history.replaceState({}, '', `/evento/${event.id}`);
  // jsdom no mide nada: la señal se pone a mano, que es justo lo que hace
  // `observarMovil` en el navegador cuando el ancho baja de 560.
  esMovil.value = true;
  render(<BarraHarness />);
  await screen.findByText('Boda de prueba');
  return event.id;
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  esMovil.value = false;
  vi.unstubAllGlobals();
});

describe('la señal de móvil', () => {
  it('el corte está en 560 px: un iPhone entra y un iPad no', () => {
    expect(MOVIL_MAX).toBe(560);
    // 402 y 393 (iPhone), 375 (el prestado) por debajo; el iPad, por encima.
    for (const ancho of [375, 393, 402, 430]) expect(ancho).toBeLessThanOrEqual(MOVIL_MAX);
    for (const ancho of [820, 1024, 1180]) expect(ancho).toBeGreaterThan(MOVIL_MAX);
  });

  it('se engancha al ancho real y se suelta al desmontar', () => {
    const oyentes: ((e: MediaQueryListEvent) => void)[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => oyentes.push(fn),
      removeEventListener: () => oyentes.pop(),
    }));
    const soltar = observarMovil();
    expect(esMovil.value).toBe(true);
    oyentes[0]?.({ matches: false } as MediaQueryListEvent);
    expect(esMovil.value).toBe(false);
    soltar();
    expect(oyentes).toHaveLength(0);
  });

  it('sin `matchMedia` no revienta y se queda en la disposición de iPad', () => {
    vi.stubGlobal('matchMedia', undefined);
    esMovil.value = false;
    expect(() => observarMovil()()).not.toThrow();
    expect(esMovil.value).toBe(false);
  });
});

describe('la cabecera de la barra en móvil', () => {
  it('los cuatro controles que no son servir viven en la hoja «Más»', async () => {
    await setupMovil();
    expect(document.querySelector('.hoja-abajo')).toBeNull();

    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const filas = filasDeLaHoja();
    expect(filas.map((f) => f.nombre)).toEqual(['Rápido', 'Noche', 'Resumen', 'Cerrar barra']);
    // Cada acción dice qué hace: en la cabecera del iPad no cabía.
    expect(filas[0]?.pista).toBe('cada toque sirve una bebida');
  });

  it('«Cerrar barra» va la última y separada del resto', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const hijos = [...(document.querySelector('.hoja-abajo')?.children ?? [])];
    const separador = hijos.findIndex((el) => el.classList.contains('hoja-abajo__sep'));
    const cerrar = hijos.findIndex((el) => el.classList.contains('hoja-fila--terminal'));
    expect(separador).toBeGreaterThan(-1);
    expect(cerrar).toBe(separador + 1);
    expect(cerrar).toBe(hijos.length - 1);
  });

  it('la hoja es de abajo y se cierra con Escape', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    // No es un modal centrado: DESIGN.md los prohíbe en el flujo de servir.
    expect(document.querySelector('.hoja-abajo')?.getAttribute('role')).toBe('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).toBeNull());
  });

  it('«Rápido» se pone desde la hoja y la barra de abajo lo dice', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const rapido = [...document.querySelectorAll<HTMLButtonElement>('.hoja-abajo .hoja-fila')].find(
      (f) => f.textContent?.startsWith('Rápido'),
    );
    expect(rapido?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(rapido!);
    await waitFor(() => expect(rapido?.getAttribute('aria-pressed')).toBe('true'));
    expect(barraInferior()).toContain('Modo rápido activo');
  });

  it('el botón de volver conserva su etiqueta aunque se quede sin rótulo', async () => {
    await setupMovil();
    expect(document.querySelector('.barra__salir')?.getAttribute('aria-label')).toBe(
      'Volver a Eventos',
    );
  });
});

describe('la barra inferior del pedido', () => {
  it('dice la cuenta entera: «Pedido (N)» y «Servir N bebidas»', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido (2)'));
    expect(document.querySelector('.ticket-bar .btn--action')?.textContent).toBe('Servir 2 bebidas');
  });

  it('vacía invita a empezar, sin cifras que no existen', async () => {
    await setupMovil();
    expect(barraInferior()).toContain('Pedido (0)');
    expect(document.querySelector('.ticket-bar .btn--action')?.textContent).toBe('Toca una bebida');
  });

  it('al desplegarla, la hoja del pedido lleva dentro «Últimos pedidos»', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido (1)'));

    const etiqueta = document.querySelector<HTMLButtonElement>('.ticket-bar__label');
    fireEvent.click(etiqueta!);
    await waitFor(() => expect(document.querySelector('.ticket--sheet')).not.toBeNull());

    const hoja = document.querySelector('.ticket--sheet');
    expect(hoja?.querySelector('.ultimos')).not.toBeNull();
    expect(hoja?.textContent).toContain('Últimos pedidos');
    expect(hoja?.textContent).toContain('Deshacer último');
    // El botón grande, el último de la hoja: no se mueve nunca de sitio.
    expect(hoja?.querySelector('.ticket__foot .btn--action')?.textContent).toBe('Servir 1 bebida');
  });
});

describe('el copy nombra el aparato que tienes delante', () => {
  it('en un iPhone dice «este iPhone»', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    expect(dispositivo()).toBe('iPhone');
    expect(esteDispositivo()).toBe('este iPhone');
  });

  it('en un iPad dice «este iPad», también cuando Safari se hace pasar por un Mac', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' });
    expect(dispositivo()).toBe('iPad');
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    });
    expect(dispositivo()).toBe('iPad');
  });

  it('en un Mac de verdad, o si no hay manera de saberlo, dice «este dispositivo»', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 0,
    });
    expect(esteDispositivo()).toBe('este dispositivo');
    vi.stubGlobal('navigator', undefined);
    expect(dispositivo()).toBe('dispositivo');
  });
});
