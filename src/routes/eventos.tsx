/**
 * Eventos (inicio) — SPEC §3.1 y UX-REVISION-1 §D.
 *
 * Es la portada de la app: qué barra está abierta, qué evento toca preparar y
 * qué resultados hay para mirar. En el primer uso explica los cuatro pasos
 * antes de pedir nada.
 */
import { useEffect, useState } from 'preact/hooks';
import { AlertTriangle, CalendarPlus, ChevronRight, Coffee, Play, Smartphone } from 'lucide-preact';
import { createEvent, listAllOrders, openEvent } from '../data/repo';
import type { BarEvent, Order } from '../data/types';
import { closeStats, eventStats, loadSuggestion } from '../domain/stats';
import { formatDateLong, formatInt, formatMoney, formatRate } from '../domain/format';
import { Button } from '../ui/components';
import { conBase, useIr } from '../ui/navegar';
import { estaInstalada } from '../ui/instalacion';
import { ComoFunciona, Etiqueta } from '../ui/piezas';
import {
  closedEvents,
  descartarAvisoInstalacion,
  events,
  ingredients,
  liveEvent,
  plannedEvents,
  products,
  refreshEvents,
  settings,
} from '../ui/store';

/** Qué impide abrir la barra ahora mismo. */
type Blocker = { kind: 'sin-carga'; eventId: string } | { kind: 'otra-barra'; eventId: string; live: BarEvent };

export const TYPE_LABEL: Record<BarEvent['type'], string> = {
  boda: 'Boda',
  privado: 'Evento privado',
  activacion: 'Activación',
  rodaje: 'Rodaje',
  mercado: 'Mercado',
  otro: 'Otro',
};

export function Eventos() {
  const route = useIr();
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
  // Solo en Safari y solo si no se ha dicho «Ahora no».
  const avisarInstalacion = !estaInstalada() && settings.value?.installHintDismissed !== true;

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
        <>
          <ComoFunciona />
          <div class="row">
            <Button variant="primary" onClick={() => route('/evento/nuevo')}>
              <CalendarPlus size={20} strokeWidth={1.75} /> Nuevo evento
            </Button>
            <Button disabled={busy} onClick={() => void createDemo()}>
              Probar con un ejemplo
            </Button>
          </div>
        </>
      ) : null}

      {avisarInstalacion ? (
        <AvisoInstalacion
          onComo={() => route('/ajustes#instalar')}
          onDismiss={() => void descartarAvisoInstalacion()}
        />
      ) : null}

      {live ? (
        <LiveCard
          event={live}
          orders={ordersOf(live.id)}
          onGo={() => route(`/evento/${live.id}`)}
          onClose={() => route(`/evento/${live.id}/cerrar`)}
        />
      ) : null}

      {planned.length > 0 ? (
        <div class="eventos__group">
          <h2 class="section-title">Próximos</h2>
          {planned.map((event) => {
            const conCarga = Boolean(event.stockStart['cafe']);
            return (
              <div key={event.id} class="stack">
                <div class="event-row">
                  <div class="event-row__main">
                    <span class="event-row__name">
                      {event.name}
                      {event.isDemo ? <Etiqueta>Ejemplo</Etiqueta> : null}
                    </span>
                    <span class="meta">
                      {TYPE_LABEL[event.type]} · {formatDateLong(`${event.date}T12:00:00`)} ·{' '}
                      {formatInt(event.guestsExpected)} invitados
                    </span>
                    <span class="event-row__step">
                      {conCarga ? 'Paso 1 de 4 · listo para abrir' : 'Paso 1 de 4 · falta la carga'}
                    </span>
                  </div>
                  {conCarga ? (
                    <>
                      <Button onClick={() => route(`/evento/${event.id}`)}>Ver datos</Button>
                      <Button variant="primary" disabled={busy} onClick={() => void tryOpen(event)}>
                        <Play size={20} strokeWidth={1.75} /> Abrir barra
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button disabled={busy} onClick={() => void tryOpen(event)}>
                        Abrir barra
                      </Button>
                      <Button variant="primary" onClick={() => route(`/evento/${event.id}`)}>
                        Preparar carga
                      </Button>
                    </>
                  )}
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
            );
          })}
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
                  <span class="event-row__name">
                    {event.name}
                    {event.isDemo ? <Etiqueta>Ejemplo</Etiqueta> : null}
                  </span>
                  <span class="meta">
                    {formatDateLong(`${event.date}T12:00:00`)} · {formatInt(stats.served)} bebidas ·{' '}
                    {formatMoney(stats.costPerDrink)} por bebida
                  </span>
                  <span class="event-row__step">Paso 4 de 4 · cerrado</span>
                </div>
                <Button variant="primary" onClick={() => route(`/evento/${event.id}`)}>
                  Ver resultados <ChevronRight size={20} strokeWidth={1.75} />
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!isEmpty ? (
        <p class="meta">
          ¿Primera vez? <a href={conBase('/ajustes')}>Carta y ajustes</a> explica los cuatro pasos.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Discreto y una sola vez: no es una alerta, es una recomendación con una
 * consecuencia real detrás (sin instalar, Safari puede tirar los datos).
 */
function AvisoInstalacion({ onComo, onDismiss }: { onComo: () => void; onDismiss: () => void }) {
  return (
    <div class="instalar">
      <span class="instalar__texto">
        <Smartphone size={20} strokeWidth={1.75} class="instalar__icono" />
        Instala la app en el iPad para usarla sin internet: en Safari, Compartir → Añadir a
        pantalla de inicio.
      </span>
      <div class="row">
        <Button onClick={onComo}>Cómo hacerlo</Button>
        <Button variant="ghost" onClick={onDismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}

/**
 * La barra abierta manda en la portada: es el único estado en el que hay algo
 * que se está perdiendo si nadie mira el iPad.
 */
function LiveCard({
  event,
  orders,
  onGo,
  onClose,
}: {
  event: BarEvent;
  orders: Order[];
  onGo: () => void;
  onClose: () => void;
}) {
  const stats = eventStats(event, orders, products.value);
  return (
    <article class="card card--live">
      <div class="row row--tight">
        <Coffee size={22} strokeWidth={1.75} color="var(--primary)" />
        <span class="section-title" style={{ color: 'var(--primary)' }}>
          Barra abierta
        </span>
        {event.isDemo ? <Etiqueta>Ejemplo</Etiqueta> : null}
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
          Seguir sirviendo
        </Button>
        <Button onClick={onClose}>Cerrar barra</Button>
      </div>
      <p class="meta">Puedes salir y volver; la barra sigue abierta hasta que la cierres.</p>
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
            Dejar aquella y abrir esta
          </Button>
        )}
        <Button variant="ghost" onClick={onDismiss}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
