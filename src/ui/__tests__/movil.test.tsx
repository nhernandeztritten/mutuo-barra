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
import { ARRASTRE_CIERRE, ToastHost } from '../components';
import { dispositivo, esteDispositivo } from '../instalacion';
import { esMovil, MOVIL_MAX, observarMovil } from '../layout';
import { MANTENER_MS } from '../mantener';
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
  it('los controles que no son servir viven en la hoja «Más»', async () => {
    await setupMovil();
    expect(document.querySelector('.hoja-abajo')).toBeNull();

    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const filas = filasDeLaHoja();
    expect(filas.map((f) => f.nombre)).toEqual([
      'Rápido',
      'Noche',
      'Resumen',
      'Pausar servicio',
      'Cerrar barra',
      'Empezar de cero',
    ]);
    // Cada acción dice qué hace: en la cabecera del iPad no cabía.
    expect(filas[0]?.pista).toBe('un toque, una bebida');
    expect(filas[3]?.pista).toBe('el evento sigue abierto; nadie pierde nada');
  });

  it('las tres salidas van separadas por su línea, y «Empezar de cero» la última', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const hijos = [...(document.querySelector('.hoja-abajo')?.children ?? [])];
    const separadores = hijos
      .map((el, i) => (el.classList.contains('hoja-abajo__sep') ? i : -1))
      .filter((i) => i > -1);
    // Tres líneas: una antes de pausar, otra antes de cerrar y otra antes de
    // empezar de cero. Las tres son salidas y ninguna significa lo mismo.
    expect(separadores).toHaveLength(3);
    expect(hijos[separadores[0]! + 1]?.textContent).toContain('Pausar servicio');
    expect(hijos[separadores[1]! + 1]?.textContent).toContain('Cerrar barra');
    expect(hijos[separadores[2]! + 1]?.textContent).toContain('Empezar de cero');
    expect(hijos[hijos.length - 1]?.textContent).toContain('Empezar de cero');
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
  it('dice la cuenta entera: «Pedido actual (N)» y «Servir N bebidas»', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (2)'));
    expect(document.querySelector('.ticket-bar .btn--action')?.textContent).toBe('Servir 2 bebidas');
  });

  it('vacía y sin nada servido lo dice, sin cifras que no existen', async () => {
    await setupMovil();
    // «Pedido actual (0)» no decía nada que el botón de al lado no dijera ya.
    expect(barraInferior()).toContain('Sin pedidos todavía');
    expect(barraInferior()).not.toContain('(0)');
    expect(document.querySelector('.ticket-bar .btn--action')?.textContent).toBe('Toca una bebida');
  });

  it('con el pedido vacío enseña el último servido, y tocarlo lo abre desplegado', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (1)'));
    fireEvent.click(document.querySelector<HTMLButtonElement>('.ticket-bar .btn--action')!);

    // Servido el pedido, la barra pasa a contar el último en vez de un «(0)».
    await waitFor(() => expect(barraInferior()).toContain('Último'));
    expect(barraInferior()).toContain('Cortado');
    expect(document.querySelector('.ticket-bar__cuando')?.textContent).toMatch(
      /^Último · \d{2}:\d{2} · $/,
    );

    fireEvent.click(document.querySelector<HTMLButtonElement>('.ticket-bar__label')!);
    await waitFor(() => expect(document.querySelector('.ticket--sheet')).not.toBeNull());
    // Abierta directamente en «Últimos pedidos», con ese pedido desplegado.
    const fila = document.querySelector('.ticket--sheet .ultimos__fila');
    expect(fila?.classList.contains('is-abierta')).toBe(true);
    expect(fila?.querySelector('.ultimos__cabeza')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('el contador de servidas abre el histórico de pedidos', async () => {
    await setupMovil();
    const contador = document.querySelector<HTMLButtonElement>('.barra__count');
    expect(contador?.tagName).toBe('BUTTON');
    expect(contador?.getAttribute('aria-label')).toBe('Ver el histórico de bebidas servidas');

    fireEvent.click(contador!);
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Resumen"]')).not.toBeNull(),
    );
    expect(document.querySelector('#resumen-pedidos')).not.toBeNull();
  });

  it('al desplegarla, la hoja del pedido lleva dentro «Últimos pedidos»', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (1)'));

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

describe('salir de una hoja', () => {
  /**
   * jsdom no tiene `PointerEvent` —ni `fireEvent.pointerDown` llega a
   * despacharlo—, así que el gesto se manda a mano. En el navegador de verdad
   * lo comprueba `scripts/capturas-fase-12.mjs` arrastrando con el ratón.
   */
  function puntero(el: Element, tipo: string, clientY: number): void {
    const evento = new Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(evento, { pointerId: 1, isPrimary: true, clientY });
    el.dispatchEvent(evento);
  }

  /** Arrastra la hoja hacia abajo `px` píxeles desde su cabecera y suelta. */
  function arrastrar(hoja: Element, px: number, desde?: Element): void {
    const agarre = desde ?? hoja.querySelector('.hoja__cabecera') ?? hoja;
    puntero(agarre, 'pointerdown', 120);
    puntero(agarre, 'pointermove', 120 + px);
    puntero(agarre, 'pointerup', 120 + px);
  }

  it('el umbral de cierre son 80 px', () => {
    expect(ARRASTRE_CIERRE).toBe(80);
  });

  it('la cabecera lleva el título y la «X», y va marcada como pegada', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const cabecera = document.querySelector('.hoja-abajo .hoja__cabecera');
    expect(cabecera).not.toBeNull();
    expect(cabecera?.querySelector('.sheet__title')?.textContent).toBe('Más');
    expect(cabecera?.querySelector('[aria-label="Cerrar"]')).not.toBeNull();
    // El asa, el indicador de que se arrastra. En el iPad el CSS lo esconde.
    expect(cabecera?.querySelector('.hoja__asa')).not.toBeNull();
  });

  it('el histórico se abre por los pedidos y su «X» sigue en la cabecera', async () => {
    await setupMovil();
    fireEvent.click(document.querySelector<HTMLButtonElement>('.barra__count')!);
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Resumen"]')).not.toBeNull(),
    );
    const hoja = document.querySelector('[role="dialog"][aria-label="Resumen"]')!;
    const cabecera = hoja.querySelector('.hoja__cabecera');
    expect(cabecera?.querySelector('[aria-label="Cerrar"]')).not.toBeNull();
    // Abierta por el ancla, y con sitio reservado para la cabecera pegada.
    expect(document.querySelector<HTMLElement>('#resumen-pedidos')?.style.scrollMarginBlockStart)
      .toMatch(/px$/);
  });

  it('deslizar hacia abajo más del umbral la cierra', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    arrastrar(document.querySelector('.hoja-abajo')!, ARRASTRE_CIERRE + 20);
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).toBeNull());
  });

  it('deslizar de menos la devuelve a su sitio, sin cerrarla', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const hoja = document.querySelector<HTMLElement>('.hoja-abajo')!;
    arrastrar(hoja, 40);
    expect(document.querySelector('.hoja-abajo')).not.toBeNull();
    expect(hoja.style.transform).toBe('');
    expect(hoja.classList.contains('is-arrastrando')).toBe(false);
  });

  it('con la lista desplazada, el gesto desplaza: no cierra nada', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());

    const hoja = document.querySelector<HTMLElement>('.hoja-abajo')!;
    const fila = hoja.querySelector('.hoja-fila')!;
    // La hoja está desplazada: lo que toca ahora es seguir desplazando.
    Object.defineProperty(hoja, 'scrollTop', { configurable: true, value: 60 });
    arrastrar(hoja, 200, fila);
    expect(document.querySelector('.hoja-abajo')).not.toBeNull();
  });

  it('en el iPad no se engancha ningún gesto: la hoja se queda donde está', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    // La hoja ya montada en móvil sí lo tiene; lo que se comprueba es que una
    // hoja montada con la señal apagada no reacciona al arrastre.
    fireEvent.click(document.querySelector<HTMLButtonElement>('.hoja-abajo [aria-label="Cerrar"]')!);
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).toBeNull());

    esMovil.value = false;
    fireEvent.click(document.querySelector<HTMLButtonElement>('.barra__count')!);
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-label="Resumen"]')).not.toBeNull(),
    );
    arrastrar(document.querySelector('[role="dialog"][aria-label="Resumen"]')!, 200);
    expect(document.querySelector('[role="dialog"][aria-label="Resumen"]')).not.toBeNull();
  });

  it('Escape y el fondo siguen cerrando', async () => {
    await setupMovil();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).toBeNull());

    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    fireEvent.click(document.querySelector<HTMLElement>('.sheet-backdrop')!);
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).toBeNull());
  });
});

describe('la tira del pedido en curso', () => {
  /** Las filas de la tira, en el orden en que se leen. */
  function filasDeLaTira(): string[] {
    return [...document.querySelectorAll('.tira__fila .tira__nombre')].map((f) =>
      (f.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function quitar(nombre: string): void {
    const fila = [...document.querySelectorAll<HTMLButtonElement>('.tira__quitar')].find((b) =>
      b.getAttribute('aria-label')?.startsWith(`Quitar ${nombre}`),
    );
    if (!fila) throw new Error(`No hay «×» de «${nombre}» en la tira`);
    fireEvent.click(fila);
  }

  it('con el pedido vacío no se dibuja: el hueco se queda como estaba', async () => {
    await setupMovil();
    expect(document.querySelector('.tira')).toBeNull();
  });

  it('enseña las bebidas en el mismo orden que la hoja, la última abajo', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(filasDeLaTira()).toHaveLength(2));
    expect(filasDeLaTira()).toEqual(['Cortado', 'Latte']);
  });

  it('la cantidad va delante y los extras detrás', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(filasDeLaTira()).toEqual(['2 × Cortado']));

    const avena = [...document.querySelectorAll<HTMLButtonElement>('.extras .chip, .extras .seg__opt')].find(
      (c) => c.textContent?.trim() === 'Avena',
    );
    fireEvent.click(avena!);
    await waitFor(() => expect(filasDeLaTira()).toEqual(['2 × Cortado · avena']));
  });

  it('la línea actual se marca, y tocar otra la cambia', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(filasDeLaTira()).toHaveLength(2));

    const filas = [...document.querySelectorAll('.tira__fila')];
    expect(filas[1]?.classList.contains('is-actual')).toBe(true);

    fireEvent.click(filas[0]!.querySelector<HTMLButtonElement>('.tira__nombre')!);
    await waitFor(() =>
      expect(document.querySelectorAll('.tira__fila')[0]?.classList.contains('is-actual')).toBe(true),
    );
    // La fila de extras pasa a esa bebida: es el mismo gesto que en la hoja.
    expect(document.querySelector('.extras__rotulo')?.textContent).toContain('Cortado');
  });

  it('la «×» dice qué quita, y quitarla deja «Deshacer» que la devuelve entera', async () => {
    await setupMovil();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(filasDeLaTira()).toHaveLength(1));

    const avena = [...document.querySelectorAll<HTMLButtonElement>('.extras .seg__opt')].find(
      (c) => c.textContent?.trim() === 'Avena',
    );
    fireEvent.click(avena!);
    await waitFor(() => expect(filasDeLaTira()).toEqual(['Latte · avena']));

    expect(
      [...document.querySelectorAll('.tira__quitar')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Quitar Latte con avena del pedido']);

    quitar('Latte');
    await waitFor(() => expect(document.querySelector('.tira')).toBeNull());
    expect(barraInferior()).not.toContain('Pedido actual (1)');

    const aviso = screen.getByText('Quitada 1 Latte');
    expect(aviso).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    // Vuelve la línea entera, con su extra: no se pierde lo que costó montar.
    await waitFor(() => expect(filasDeLaTira()).toEqual(['Latte · avena']));
  });

  it('con más de una unidad, la «×» quita una y deja la línea', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(filasDeLaTira()).toEqual(['2 × Cortado']));

    quitar('Cortado');
    await waitFor(() => expect(filasDeLaTira()).toEqual(['Cortado']));
    expect(barraInferior()).toContain('Pedido actual (1)');
  });

  it('servido el pedido, el «Deshacer» de lo quitado se retira: no cae en el siguiente', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(filasDeLaTira()).toHaveLength(2));

    quitar('Latte');
    await waitFor(() => expect(filasDeLaTira()).toEqual(['Cortado']));
    expect(screen.queryByText('Quitada 1 Latte')).not.toBeNull();

    fireEvent.click(document.querySelector<HTMLButtonElement>('.ticket-bar .btn--action')!);
    await waitFor(() => expect(screen.queryByText('Quitada 1 Latte')).toBeNull());
    expect(document.querySelector('.tira')).toBeNull();
    // Se espera a que el pedido acabe de escribirse: si no, la consulta que
    // queda en vuelo se estrella contra la base que cierra la prueba siguiente.
    await waitFor(() => expect(barraInferior()).toContain('Último'));
  });

  it('en modo Rápido no se dibuja: ahí el toque sirve y no monta nada', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(document.querySelector('.tira')).not.toBeNull());

    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    const rapido = [...document.querySelectorAll<HTMLButtonElement>('.hoja-abajo .hoja-fila')].find(
      (f) => f.textContent?.startsWith('Rápido'),
    );
    fireEvent.click(rapido!);
    await waitFor(() => expect(document.querySelector('.tira')).toBeNull());
  });

  it('en el iPad no existe: ahí el pedido ya está entero en su columna', async () => {
    await setupMovil();
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(document.querySelector('.tira')).not.toBeNull());
    esMovil.value = false;
    await waitFor(() => expect(document.querySelector('.tira')).toBeNull());
  });
});

describe('«Empezar de cero» desde la hoja «Más»', () => {
  /** Sirve una bebida y deja otra a medias en el pedido actual. */
  async function servirYDejarAMedias(): Promise<void> {
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (1)'));
    fireEvent.click(document.querySelector<HTMLButtonElement>('.ticket-bar .btn--action')!);
    await waitFor(() => expect(barraInferior()).toContain('Último'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (1)'));
  }

  async function abrirPanel(): Promise<void> {
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    const fila = [...document.querySelectorAll<HTMLButtonElement>('.hoja-abajo .hoja-fila')].find(
      (f) => f.textContent?.startsWith('Empezar de cero'),
    );
    fireEvent.click(fila!);
    await waitFor(() => expect(document.querySelector('.reinicio')).not.toBeNull());
  }

  it('un toque en la fila despliega el panel y no reinicia nada', async () => {
    await setupMovil();
    await servirYDejarAMedias();
    await abrirPanel();

    expect(document.querySelector('.reinicio__aviso')?.textContent).toBe(
      'Se anularán 1 bebida servida y el pedido en curso. La carga y los datos del evento se conservan.',
    );
    // Ni el contador ni el pedido se han movido con ese toque.
    expect(document.querySelector('.barra__count-value')?.textContent).toBe('1');
    expect(barraInferior()).toContain('Pedido actual (1)');
  });

  it('«Cancelar» cierra el panel y deja el evento como estaba', async () => {
    await setupMovil();
    await servirYDejarAMedias();
    await abrirPanel();

    fireEvent.click(
      [...document.querySelectorAll<HTMLButtonElement>('.reinicio .btn')].find(
        (b) => b.textContent?.trim() === 'Cancelar',
      )!,
    );
    await waitFor(() => expect(document.querySelector('.reinicio')).toBeNull());
    expect(document.querySelector('.barra__count-value')?.textContent).toBe('1');
  });

  it('mantener pulsado reinicia, y «Deshacer» lo devuelve todo', async () => {
    await setupMovil();
    await servirYDejarAMedias();
    await abrirPanel();

    const mantener = document.querySelector<HTMLButtonElement>('.reinicio .mantener')!;
    // Soltar antes de tiempo: no pasa nada.
    fireEvent.pointerDown(mantener);
    await new Promise((r) => setTimeout(r, 200));
    fireEvent.pointerUp(mantener);
    await new Promise((r) => setTimeout(r, 200));
    expect(document.querySelector('.barra__count-value')?.textContent).toBe('1');

    // Aguantando el segundo y medio sí.
    fireEvent.pointerDown(mantener);
    await new Promise((r) => setTimeout(r, MANTENER_MS + 120));

    await waitFor(() =>
      expect(document.querySelector('.barra__count-value')?.textContent).toBe('0'),
    );
    // El pedido a medias también se va, y la hoja se cierra sola.
    expect(barraInferior()).toContain('Sin pedidos todavía');
    expect(document.querySelector('.hoja-abajo')).toBeNull();

    const aviso = [...document.querySelectorAll('.toast')].pop();
    expect(aviso?.textContent).toContain('Evento reiniciado');
    fireEvent.click(aviso!.querySelector<HTMLButtonElement>('.toast__action')!);

    await waitFor(() =>
      expect(document.querySelector('.barra__count-value')?.textContent).toBe('1'),
    );
    // Y el pedido a medias vuelve entero.
    await waitFor(() => expect(barraInferior()).toContain('Pedido actual (1)'));
  });
});

describe('los extras de la bebida, todos a la vista', () => {
  /** Los controles de la fila envuelta, en orden. */
  function extras(): string[] {
    return [...document.querySelectorAll('.extras--envuelta .chip, .extras--envuelta .seg__opt')].map(
      (b) => b.textContent?.trim() ?? '',
    );
  }

  it('sin bebida, el rótulo lo dice y no hay ninguna fila de extras', async () => {
    await setupMovil();
    expect(document.querySelector('.extras__rotulo')?.textContent).toBe(
      'Toca una bebida; sus extras salen aquí',
    );
    expect(document.querySelector('.extras--envuelta')).toBeNull();
  });

  it('el nombre de la bebida sale de la fila y pasa al rótulo de encima', async () => {
    await setupMovil();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(document.querySelector('.extras--envuelta')).not.toBeNull());

    expect(document.querySelector('.extras__rotulo')?.textContent).toBe('Extras de: Latte');
    expect(document.querySelector('.extras__bebida')?.textContent).toBe('Latte');
    // Y ya no está dentro de la fila de controles, que es lo que la desbordaba.
    expect(document.querySelector('.extras--envuelta .extras__bebida')).toBeNull();
  });

  it('los siete extras del Latte están presentes, con la leche sola en la primera fila', async () => {
    await setupMovil();
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(document.querySelector('.extras--envuelta')).not.toBeNull());

    expect(extras()).toEqual([
      'Vaca',
      'Avena',
      'Sin lactosa',
      'Desca',
      'Doble',
      'Iced',
      'Sirope',
    ]);
    // El salto de ancho completo va justo detrás del segmento de la leche: sin
    // él, «Desca» se colaría en la primera fila y «Sirope» se saldría.
    const fila = document.querySelector('.extras--envuelta');
    const hijos = [...(fila?.children ?? [])];
    const salto = hijos.findIndex((el) => el.classList.contains('extras__salto'));
    const seg = hijos.findIndex((el) => el.classList.contains('seg'));
    expect(seg).toBeGreaterThanOrEqual(0);
    expect(salto).toBe(seg + 1);
    expect(hijos[salto + 1]?.textContent).toBe('Desca');
  });

  it('una bebida sin extras lo dice en el rótulo y no dibuja filas vacías', async () => {
    await setupMovil();
    fireEvent.click(tile('Filtro'));
    await waitFor(() =>
      expect(document.querySelector('.extras__rotulo')?.textContent).toContain('sin extras'),
    );
    expect(document.querySelector('.extras__rotulo')?.textContent).toBe('Filtro · sin extras');
    expect(document.querySelector('.extras--envuelta')).toBeNull();
  });

  it('en el iPad la fila sigue siendo la de siempre, con el nombre dentro', async () => {
    await setupMovil();
    esMovil.value = false;
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(document.querySelector('.extras .extras__bebida')).not.toBeNull());
    expect(document.querySelector('.extras--envuelta')).toBeNull();
    expect(document.querySelector('.extras__rotulo')).toBeNull();
    expect(document.querySelector('.extras__salto')).toBeNull();
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
