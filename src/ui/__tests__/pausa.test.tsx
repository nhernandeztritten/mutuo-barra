/**
 * Pausar y reanudar el servicio.
 *
 * Una boda va en dos turnos —café después de la comida, parada durante la cena,
 * otra vez en la fiesta—, así que hace falta parar **sin cerrar el evento**.
 * Parar no es cerrar: el `status` sigue siendo `live`, nada se borra y el
 * pedido a medias sigue ahí cuando se vuelve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider, Route, Router } from 'preact-iso';
import { initDb, resetDb } from '../../data/db';
import {
  closeEvent,
  createEvent,
  getEvent,
  openEvent,
  pauseService,
  resumeService,
} from '../../data/repo';
import type { Event } from '../../data/types';
import { closeStats, enPausa, minutosDeServicio, msEnPausa, pausasDe } from '../../domain/stats';
import { Barra } from '../../routes/barra';
import { ToastHost } from '../components';
import { esMovil } from '../layout';
import { loadCatalog, loadSettings, refreshEvents } from '../store';
import { clearToasts } from '../toast';
import { detachTicket } from '../ticket';

const MINUTO = 60_000;

/** Un evento de mentira, con las horas puestas a mano para medir duraciones. */
function eventoCon(parcial: Partial<Event>): Event {
  return {
    id: 'e1',
    name: 'Boda de prueba',
    type: 'boda',
    date: '2026-09-12',
    venue: '',
    guestsExpected: 100,
    drinksPerGuest: 1.2,
    hoursContracted: 4,
    baristas: 2,
    mode: 'incluido',
    status: 'live',
    openedAt: null,
    closedAt: null,
    stockStart: {},
    stockEnd: null,
    guestsReal: null,
    setupMinutes: null,
    teardownMinutes: null,
    notes: '',
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    isDemo: false,
    ...parcial,
  };
}

/* ================= La base ================= */

describe('pausar y reanudar en el repositorio', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
  });

  async function eventoAbierto(): Promise<string> {
    const event = await createEvent({ name: 'Boda de prueba', stockStart: { cafe: 3000 } });
    await openEvent(event.id);
    return event.id;
  }

  it('pausar abre un tramo y el evento sigue abierto', async () => {
    const id = await eventoAbierto();
    const parado = await pauseService(id);

    expect(parado.status).toBe('live');
    expect(parado.pausas).toHaveLength(1);
    expect(parado.pausas?.[0]?.hasta).toBeNull();
    expect(enPausa(parado)).toBe(true);
  });

  it('pausar y reanudar dos veces deja dos tramos, los dos cerrados', async () => {
    const id = await eventoAbierto();
    await pauseService(id);
    await resumeService(id);
    await pauseService(id);
    const final = await resumeService(id);

    expect(final.pausas).toHaveLength(2);
    expect(final.pausas?.every((p) => p.hasta !== null)).toBe(true);
    expect(enPausa(final)).toBe(false);
  });

  it('nada se borra: cada tramo conserva su principio y su final', async () => {
    const id = await eventoAbierto();
    const abierto = await pauseService(id);
    const desde = abierto.pausas?.[0]?.desde;
    const cerrado = await resumeService(id);

    expect(cerrado.pausas?.[0]?.desde).toBe(desde);
    expect(cerrado.pausas?.[0]?.hasta).not.toBeNull();
    // Y sigue ahí después de leerlo de la base, no solo en lo que devolvió.
    const leido = await getEvent(id);
    expect(leido?.pausas).toHaveLength(1);
  });

  it('pausar dos veces seguidas no abre un tramo de cero segundos', async () => {
    const id = await eventoAbierto();
    await pauseService(id);
    const otra = await pauseService(id);
    expect(otra.pausas).toHaveLength(1);
  });

  it('reanudar lo que ya está andando no cambia nada', async () => {
    const id = await eventoAbierto();
    const igual = await resumeService(id);
    expect(pausasDe(igual)).toHaveLength(0);
    expect(enPausa(igual)).toBe(false);
  });
});

/* ================= La cuenta del tiempo ================= */

describe('la duración de la barra descuenta lo que estuvo parada', () => {
  it('suma los tramos cerrados', () => {
    const event = eventoCon({
      openedAt: '2026-09-12T16:00:00.000Z',
      closedAt: '2026-09-12T22:00:00.000Z',
      status: 'closed',
      pausas: [
        // Dos horas de cena.
        { desde: '2026-09-12T18:00:00.000Z', hasta: '2026-09-12T20:00:00.000Z' },
        // Y media hora más de parada tonta.
        { desde: '2026-09-12T21:00:00.000Z', hasta: '2026-09-12T21:30:00.000Z' },
      ],
    });
    // Con la hora del cierre: un tramo posterior a `hasta` no se cuenta, que
    // es justo lo que hace falta para que una pausa en curso no infle nada.
    expect(msEnPausa(event, new Date('2026-09-12T22:00:00.000Z')) / MINUTO).toBe(150);
    // Seis horas de reloj menos dos y media paradas: tres y media de servicio.
    expect(minutosDeServicio(event)).toBe(210);
    expect(closeStats(event, [], []).durationMinutes).toBe(210);
  });

  it('sin pausas, la duración es la de siempre', () => {
    const event = eventoCon({
      openedAt: '2026-09-12T16:00:00.000Z',
      closedAt: '2026-09-12T20:00:00.000Z',
      status: 'closed',
    });
    expect(closeStats(event, [], []).durationMinutes).toBe(240);
  });

  it('en una pausa en curso, la duración deja de crecer', () => {
    const event = eventoCon({
      openedAt: '2026-09-12T16:00:00.000Z',
      pausas: [{ desde: '2026-09-12T18:00:00.000Z', hasta: null }],
    });
    const aLasOcho = new Date('2026-09-12T20:00:00.000Z');
    const aLasNueve = new Date('2026-09-12T21:00:00.000Z');
    // Dos horas de servicio a las 18:00, y las mismas dos horas una hora después.
    expect(minutosDeServicio(event, aLasOcho)).toBe(120);
    expect(minutosDeServicio(event, aLasNueve)).toBe(120);
  });

  it('cerrar con una pausa abierta la corta en el cierre, no en «ahora»', () => {
    const event = eventoCon({
      openedAt: '2026-09-12T16:00:00.000Z',
      closedAt: '2026-09-12T19:00:00.000Z',
      status: 'closed',
      pausas: [{ desde: '2026-09-12T18:00:00.000Z', hasta: null }],
    });
    expect(closeStats(event, [], []).durationMinutes).toBe(120);
  });

  it('un evento de antes de la fase 9, sin el campo, cuenta como sin pausas', () => {
    const viejo = eventoCon({
      openedAt: '2026-09-12T16:00:00.000Z',
      closedAt: '2026-09-12T20:00:00.000Z',
      status: 'closed',
    });
    delete viejo.pausas;
    expect(pausasDe(viejo)).toEqual([]);
    expect(enPausa(viejo)).toBe(false);
    expect(msEnPausa(viejo)).toBe(0);
    expect(closeStats(viejo, [], []).durationMinutes).toBe(240);
  });

  it('el tiempo parado sobrevive al cierre del evento', async () => {
    await resetDb();
    await initDb();
    const event = await createEvent({ name: 'Boda de prueba', stockStart: { cafe: 3000 } });
    await openEvent(event.id);
    await pauseService(event.id);
    await resumeService(event.id);
    const cerrado = await closeEvent(event.id);
    expect(cerrado.pausas).toHaveLength(1);
    expect(cerrado.status).toBe('closed');
  });
});

/* ================= La barra ================= */

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

function botonMas(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.barra__mas');
  if (!found) throw new Error('No hay botón «Más»');
  return found;
}

/** Una fila de la hoja «Más», por cómo empieza su nombre. */
function filaDeLaHoja(nombre: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.hoja-abajo .hoja-fila')].find(
    (f) => f.textContent?.startsWith(nombre),
  );
  if (!found) throw new Error(`No hay fila «${nombre}» en la hoja`);
  return found;
}

/** El botón grande de la columna del ticket: el que sirve, o el que reanuda. */
function botonGrande(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.ticket__foot .btn--action');
  if (!found) throw new Error('No hay botón grande');
  return found;
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ticket__row')];
}

async function setupBarra(): Promise<string> {
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
  esMovil.value = true;
  render(<BarraHarness />);
  await screen.findByText('Boda de prueba');
  return event.id;
}

/** Para el servicio desde la hoja «Más» y espera a que la barra lo diga. */
async function pausarDesdeLaHoja(): Promise<void> {
  fireEvent.click(botonMas());
  await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
  fireEvent.click(filaDeLaHoja('Pausar servicio'));
  await waitFor(() => expect(document.querySelector('.barra__pausa')).not.toBeNull());
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  esMovil.value = false;
  vi.unstubAllGlobals();
});

describe('la barra con el servicio en pausa', () => {
  it('lo dice en la cabecera, donde antes iba el ritmo', async () => {
    await setupBarra();
    expect(document.querySelector('.barra__rate')).not.toBeNull();

    await pausarDesdeLaHoja();

    expect(document.querySelector('.barra__pausa')?.textContent).toBe('En pausa');
    // El ritmo caería solo hasta cero; decir «en pausa» es más honesto.
    expect(document.querySelector('.barra__rate')).toBeNull();
  });

  it('no se puede tocar una bebida: un toque suelto en el bolsillo no es un pedido', async () => {
    await setupBarra();
    await pausarDesdeLaHoja();

    expect(tile('Cortado').disabled).toBe(true);
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(0));
  });

  it('la acción principal pasa a ser «Reanudar servicio», en el sitio de servir', async () => {
    await setupBarra();
    await pausarDesdeLaHoja();

    expect(botonGrande().textContent).toBe('Reanudar servicio');
    expect(document.querySelector('.ticket-bar__reanudar')?.textContent).toBe('Reanudar servicio');
  });

  it('el pedido a medias se conserva y vuelve al reanudar', async () => {
    await setupBarra();
    fireEvent.click(tile('Cortado'));
    fireEvent.click(tile('Latte'));
    await waitFor(() => expect(rows()).toHaveLength(2));

    await pausarDesdeLaHoja();
    expect(rows()).toHaveLength(2);
    expect(document.querySelector('.ticket-bar__label')?.textContent).toContain(
      'pedido (2) guardado',
    );

    fireEvent.click(botonGrande());
    await waitFor(() => expect(document.querySelector('.barra__pausa')).toBeNull());
    expect(rows()).toHaveLength(2);
    expect(botonGrande().textContent).toContain('Servir 2 bebidas');
  });

  it('«Últimos pedidos» y el Resumen se siguen pudiendo ver', async () => {
    await setupBarra();
    await pausarDesdeLaHoja();

    expect(document.querySelector('.ultimos')).not.toBeNull();
    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    fireEvent.click(filaDeLaHoja('Resumen'));
    await waitFor(() => expect(document.querySelector('.sheet')).not.toBeNull());
  });

  it('reanudar devuelve el botón de servir y la bebida se vuelve a poder tocar', async () => {
    const id = await setupBarra();
    await pausarDesdeLaHoja();
    fireEvent.click(botonGrande());
    await waitFor(() => expect(document.querySelector('.barra__pausa')).toBeNull());

    expect(tile('Cortado').disabled).toBe(false);
    fireEvent.click(tile('Cortado'));
    await waitFor(() => expect(rows()).toHaveLength(1));

    const guardado = await getEvent(id);
    expect(guardado?.status).toBe('live');
    expect(guardado?.pausas).toHaveLength(1);
    expect(guardado?.pausas?.[0]?.hasta).not.toBeNull();
  });

  it('la hoja «Más» ofrece reanudar cuando ya está parado', async () => {
    await setupBarra();
    await pausarDesdeLaHoja();

    fireEvent.click(botonMas());
    await waitFor(() => expect(document.querySelector('.hoja-abajo')).not.toBeNull());
    expect(filaDeLaHoja('Reanudar servicio')).toBeTruthy();
    expect(
      [...document.querySelectorAll('.hoja-abajo .hoja-fila')].some((f) =>
        f.textContent?.startsWith('Pausar servicio'),
      ),
    ).toBe(false);
  });
});
