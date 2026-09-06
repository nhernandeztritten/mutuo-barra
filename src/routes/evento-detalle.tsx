/**
 * Detalle de un evento cerrado. Vista simple de fase 2: datos, estadísticas
 * básicas y «Reabrir». El resumen y el cierre completos son fase 3.
 */
import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { RotateCcw } from 'lucide-preact';
import { listOrders, reopenEvent } from '../data/repo';
import type { BarEvent, Order } from '../data/types';
import { closeStats, eventStats } from '../domain/stats';
import {
  formatDateLong,
  formatDecimal,
  formatDuration,
  formatInt,
  formatMoney,
  formatQty,
  formatRate,
} from '../domain/format';
import { Button } from '../ui/components';
import { eventById, ingredients, products, refreshEvents } from '../ui/store';

const TYPE_LABEL: Record<BarEvent['type'], string> = {
  boda: 'Boda',
  privado: 'Evento privado',
  activacion: 'Activación',
  rodaje: 'Rodaje',
  mercado: 'Mercado',
  otro: 'Otro',
};

export function EventoDetalle() {
  const { route } = useLocation();
  const { params } = useRoute();
  const event = eventById(params['id']);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    void (async () => setOrders(await listOrders(event.id)))();
  }, [event?.id]);

  if (!event) {
    return (
      <section class="stack">
        <h1 class="display">Evento no encontrado</h1>
        <div class="row">
          <Button onClick={() => route('/')}>Volver a Eventos</Button>
        </div>
      </section>
    );
  }

  const stats = eventStats(event, orders, products.value);
  const close = closeStats(event, orders, ingredients.value);

  async function reopen(): Promise<void> {
    setBusy(true);
    await reopenEvent(event!.id);
    await refreshEvents();
    setBusy(false);
    route('/');
  }

  return (
    <section class="detalle">
      <header class="stack">
        <h1 class="display">{event.name}</h1>
        <p class="meta">
          {TYPE_LABEL[event.type]} · {formatDateLong(`${event.date}T12:00:00`)}
          {event.venue ? ` · ${event.venue}` : ''} · {formatInt(event.guestsReal ?? event.guestsExpected)}{' '}
          invitados
        </p>
      </header>

      <div class="stat-grid">
        <div class="stat">
          <span class="stat__value num">{formatInt(stats.served)}</span>
          <span class="stat__label">bebidas servidas</span>
        </div>
        <div class="stat">
          <span class="stat__value num">{formatDecimal(stats.drinksPerGuest, 2)}</span>
          <span class="stat__label">por invitado</span>
        </div>
        <div class="stat">
          <span class="stat__value num">{formatRate(stats.peakRate15)}</span>
          <span class="stat__label">pico (15 min)</span>
        </div>
        <div class="stat">
          <span class="stat__value num">{formatMoney(close.costPerDrink)}</span>
          <span class="stat__label">coste por bebida{close.hasCount ? '' : ' (teórico)'}</span>
        </div>
        <div class="stat">
          <span class="stat__value num">{formatMoney(close.costReal)}</span>
          <span class="stat__label">coste total</span>
        </div>
        <div class="stat">
          <span class="stat__value num">
            {close.durationMinutes === null ? '—' : formatDuration(close.durationMinutes)}
          </span>
          <span class="stat__label">duración real</span>
        </div>
        {event.mode === 'venta' ? (
          <div class="stat">
            <span class="stat__value num">{formatMoney(stats.revenue)}</span>
            <span class="stat__label">ingresos · {formatMoney(stats.tips)} propina</span>
          </div>
        ) : null}
      </div>

      {stats.byProduct.length > 0 ? (
        <div class="card">
          <h2 class="card__title">Lo más servido</h2>
          {stats.byProduct.slice(0, 5).map((row) => (
            <div class="recent__row" key={row.productId}>
              <span>{row.name}</span>
              <span class="num">{formatInt(row.qty)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {close.byIngredient.length > 0 ? (
        <div class="card">
          <h2 class="card__title">Consumo teórico</h2>
          {close.byIngredient.map((row) => (
            <div class="recent__row" key={row.ingredientId}>
              <span>{row.name}</span>
              <span class="num">{formatQty(row.theoretical, row.unit)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div class="row">
        <Button variant="primary" disabled={busy} onClick={() => void reopen()}>
          <RotateCcw size={20} strokeWidth={1.75} /> Reabrir
        </Button>
        <Button onClick={() => route(`/evento/${event.id}/resumen`)}>Resumen</Button>
        <Button variant="ghost" onClick={() => route('/')}>
          Volver a Eventos
        </Button>
      </div>
    </section>
  );
}
