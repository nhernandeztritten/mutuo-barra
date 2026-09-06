/**
 * Eventos (inicio) — SPEC §3.1.
 * Tarjeta del evento en curso, próximos con «Abrir barra», pasados con su
 * resumen de una línea y el estado vacío del primer uso.
 */
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { AlertTriangle, CalendarPlus, Coffee, Play } from 'lucide-preact';
import { createEvent, listAllOrders, openEvent } from '../data/repo';
import type { BarEvent, Order } from '../data/types';
import { closeStats, eventStats, loadSuggestion } from '../domain/stats';
import {
  formatDateLong,
  formatInt,
  formatMoney,
  formatRate,
} from '../domain/format';
import { Button } from '../ui/components';
import {
  closedEvents,
  events,
  ingredients,
  liveEvent,
  plannedEvents,
  products,
  refreshEvents,
} from '../ui/store';

/** Qué impide abrir la barra ahora mismo. */
type Blocker = { kind: 'sin-carga'; eventId: string } | { kind: 'otra-barra'; eventId: string; live: BarEvent };

const TYPE_LABEL: Record<BarEvent['type'], string> = {
  boda: 'Boda',
  privado: 'Evento privado',
  activacion: 'Activación',
  rodaje: 'Rodaje',
  mercado: 'Mercado',
  otro: 'Otro',
};

export function Eventos() {
  const { route } = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => setOrders(await listAllOrders()))();
  }, [events.value]);

  const live = liveEvent.value;
  const planned = plannedEvents.value;
  const closed = closedEvents.value;

  const ordersOf = (eventId: string): Order[] => orders.filter((o) => o.eventId === eventId);

  async function goToBar(id: string): Promise<void> {
    setBusy(true);
    await openEvent(id);
    await refreshEvents();
    setBusy(false);
    route(`/evento/${id}`);
  }

  /** Comprueba las dos condiciones de SPEC §3.1 antes de abrir. */
  async function tryOpen(event: BarEvent): Promise<void> {
    const other = liveEvent.value;
    if (other && other.id !== event.id) {
      setBlocker({ kind: 'otra-barra', eventId: event.id, live: other });
      return;
    }
    if (!event.stockStart['cafe']) {
      setBlocker({ kind: 'sin-carga', eventId: event.id });
      return;
    }
    await goToBar(event.id);
  }

  async function createDemo(): Promise<void> {
    setBusy(true);
    const created = await createEvent({
      name: 'Evento de ejemplo',
      type: 'boda',
      guestsExpected: 120,
      drinksPerGuest: 1.2,
      hoursContracted: 4,
      baristas: 2,
      mode: 'incluido',
      venue: 'Valencia',
      // Con carga sugerida: así el ejemplo enseña también la barra de café.
      stockStart: loadSuggestion(120, 1.2),
      isDemo: true,
    });
    await refreshEvents();
    setBusy(false);
    route(`/evento/${created.id}`);
  }

  const isEmpty = !live && planned.length === 0 && closed.length === 0;

  return (
    <section class="eventos">
      <header class="row">
        <h1 class="display">Eventos</h1>
        <div class="spacer" />
        <Button variant="primary" onClick={() => route('/evento/nuevo')}>
          <CalendarPlus size={20} strokeWidth={1.75} /> Nuevo evento
        </Button>
      </header>

      {isEmpty ? (
        <div class="empty">
          <p class="card__title">Sin eventos todavía</p>
          <p class="meta">
            Crea el evento antes de montar la barra: así la carga y la sugerencia ya están hechas
            cuando llegas.
          </p>
          <div class="row">
            <Button variant="primary" onClick={() => route('/evento/nuevo')}>
              <CalendarPlus size={20} strokeWidth={1.75} /> Nuevo evento
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void createDemo()}>
              Probar con un evento de ejemplo
            </Button>
          </div>
        </div>
      ) : null}

      {live ? <LiveCard event={live} orders={ordersOf(live.id)} onGo={() => route(`/evento/${live.id}`)} /> : null}

      {planned.length > 0 ? (
        <div class="eventos__group">
          <h2 class="section-title">Próximos</h2>
          {planned.map((event) => (
            <div key={event.id} class="stack">
              <div class="event-row">
                <div class="event-row__main">
                  <span class="event-row__name">{event.name}</span>
                  <span class="meta">
                    {TYPE_LABEL[event.type]} · {formatDateLong(`${event.date}T12:00:00`)} ·{' '}
                    {formatInt(event.guestsExpected)} invitados
                    {event.stockStart['cafe'] ? '' : ' · sin carga'}
                  </span>
                </div>
                <Button onClick={() => route(`/evento/${event.id}`)}>Editar</Button>
                <Button variant="primary" disabled={busy} onClick={() => void tryOpen(event)}>
                  <Play size={20} strokeWidth={1.75} /> Abrir barra
                </Button>
              </div>
              {blocker && blocker.eventId === event.id ? (
                <BlockerNotice
                  blocker={blocker}
                  busy={busy}
                  onRegister={() => route(`/evento/${event.id}`)}
                  onAnyway={() => {
                    // «Pausar y abrir esta» no se salta el aviso de carga:
                    // vuelve a comprobarla con la otra barra ya descartada.
                    if (blocker.kind === 'otra-barra' && !event.stockStart['cafe']) {
                      setBlocker({ kind: 'sin-carga', eventId: event.id });
                      return;
                    }
                    void goToBar(event.id);
                  }}
                  onDismiss={() => setBlocker(null)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {closed.length > 0 ? (
        <div class="eventos__group">
          <h2 class="section-title">Pasados</h2>
          {closed.map((event) => {
            const stats = closeStats(event, ordersOf(event.id), ingredients.value);
            return (
              <div key={event.id} class="event-row">
                <div class="event-row__main">
                  <span class="event-row__name">{event.name}</span>
                  <span class="meta">
                    {formatDateLong(`${event.date}T12:00:00`)} · {formatInt(stats.served)} bebidas ·{' '}
                    {formatMoney(stats.costPerDrink)} por bebida
                  </span>
                </div>
                <Button onClick={() => route(`/evento/${event.id}`)}>Ver detalle</Button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function LiveCard({ event, orders, onGo }: { event: BarEvent; orders: Order[]; onGo: () => void }) {
  const stats = eventStats(event, orders, products.value);
  return (
    <article class="card card--live">
      <div class="row row--tight">
        <Coffee size={22} strokeWidth={1.75} color="var(--primary)" />
        <span class="section-title" style={{ color: 'var(--primary)' }}>
          En curso
        </span>
      </div>
      <h2 class="display">{event.name}</h2>
      <div class="live-stats">
        <div class="stat">
          <span class="stat__value num">{formatInt(stats.served)}</span>
          <span class="stat__label">bebidas servidas</span>
        </div>
        <div class="stat">
          <span class="stat__value num">{formatRate(stats.lastHourRate)}</span>
          <span class="stat__label">última hora</span>
        </div>
      </div>
      <div class="row">
        <Button variant="primary" onClick={onGo}>
          Volver a la barra
        </Button>
      </div>
    </article>
  );
}

function BlockerNotice({
  blocker,
  busy,
  onRegister,
  onAnyway,
  onDismiss,
}: {
  blocker: Blocker;
  busy: boolean;
  onRegister: () => void;
  onAnyway: () => void;
  onDismiss: () => void;
}) {
  return (
    <div class="notice" role="alert">
      <span class="notice__text">
        <AlertTriangle size={20} strokeWidth={1.75} class="notice__icon" />
        {blocker.kind === 'sin-carga'
          ? 'Sin carga registrada: la barra de café restante no se mostrará.'
          : `Ya hay una barra abierta: ${blocker.live.name}`}
      </span>
      <div class="row">
        {blocker.kind === 'sin-carga' ? (
          <>
            <Button variant="primary" onClick={onRegister}>
              Registrar carga
            </Button>
            <Button disabled={busy} onClick={onAnyway}>
              Abrir igual
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={busy} onClick={onAnyway}>
            Pausar y abrir esta
          </Button>
        )}
        <Button variant="ghost" onClick={onDismiss}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
