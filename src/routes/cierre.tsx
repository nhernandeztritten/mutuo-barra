/**
 * Cerrar la barra — SPEC §3.4.
 *
 * Tres bloques: recuento de lo que queda, notas del evento y el resultado en
 * vivo. El recuento es opcional: sin él se usa el consumo teórico y se dice.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { AlertTriangle } from 'lucide-preact';
import { addOrder, closeEvent, listOrders } from '../data/repo';
import type { BarEvent, Order, StockMap } from '../data/types';
import { closeStats, eventStats } from '../domain/stats';
import {
  formatDecimal,
  formatDeviation,
  formatDuration,
  formatInt,
  formatMoney,
  formatQty,
} from '../domain/format';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { Pasos } from '../ui/pasos';
import { Cifra, Fila } from '../ui/piezas';
import { showToast } from '../ui/toast';
import { clearTicket, loadTicket, ticket, ticketDrinks } from '../ui/ticket';
import { eventById, ingredients, products, refreshEvents, trackedIngredients } from '../ui/store';

/** `"3,25"` → `3.25`. Acepta el punto por si el teclado lo mete. */
function parseNumber(text: string): number {
  const value = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

/** Cuánto se aparta el consumo real del teórico antes de encender un color. */
function tonoDesviacion(pct: number): 'warn' | 'danger' | undefined {
  const abs = Math.abs(pct);
  if (abs > 20) return 'danger';
  if (abs > 8) return 'warn';
  return undefined;
}

export function Cierre() {
  const route = useIr();
  const { params } = useRoute();
  const event = eventById(params['id']);

  const [orders, setOrders] = useState<Order[]>([]);
  /** Lo que queda, escrito en unidad de stock (kg, L, ud). */
  const [queda, setQueda] = useState<Record<string, string>>({});
  const [guestsReal, setGuestsReal] = useState('');
  const [setupMinutes, setSetupMinutes] = useState('');
  const [teardownMinutes, setTeardownMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendiente, setPendiente] = useState(0);

  useEffect(() => {
    if (!event) return;
    void (async () => setOrders(await listOrders(event.id)))();
    setGuestsReal(event.guestsReal === null ? '' : String(event.guestsReal));
    setSetupMinutes(event.setupMinutes === null ? '' : String(event.setupMinutes));
    setTeardownMinutes(event.teardownMinutes === null ? '' : String(event.teardownMinutes));
    setNotes(event.notes);
    const stockEnd = event.stockEnd;
    if (stockEnd) {
      const next: Record<string, string> = {};
      for (const ing of ingredients.value) {
        const qty = stockEnd[ing.id];
        if (qty !== undefined) next[ing.id] = formatDecimal(qty / ing.stockFactor, 2);
      }
      setQueda(next);
    }
    // Un pedido a medias no se puede quedar dentro del iPad sin que nadie lo vea.
    loadTicket(event.id);
    setPendiente(ticketDrinks(ticket.value));
  }, [event?.id]);

  /** El recuento escrito, en unidades de receta, tal y como lo guarda el evento. */
  const stockEnd = useMemo<StockMap>(() => {
    const map: StockMap = {};
    for (const ing of ingredients.value) {
      const text = queda[ing.id];
      if (text === undefined || text.trim() === '') continue;
      map[ing.id] = Math.round(parseNumber(text) * ing.stockFactor * 1000) / 1000;
    }
    return map;
  }, [queda, ingredients.value]);

  if (!event) {
    return (
      <section class="stack">
        <h1 class="display">Este evento ya no está</h1>
        <div class="row">
          <Button variant="primary" onClick={() => route('/')}>
            Ir a Eventos
          </Button>
        </div>
      </section>
    );
  }

  // El resultado se recalcula mientras se escribe: el recuento se ve al momento.
  const previsto: BarEvent = { ...event, stockEnd: Object.keys(stockEnd).length > 0 ? stockEnd : null };
  const close = closeStats(previsto, orders, ingredients.value);
  const stats = eventStats(previsto, orders, products.value);

  const filas = close.byIngredient.filter((row) => row.loaded !== null);
  const duracion =
    event.openedAt !== null ? (Date.now() - Date.parse(event.openedAt)) / 60_000 : null;

  async function servirPendiente(): Promise<void> {
    const lines = ticket.value;
    if (lines.length === 0) return;
    setBusy(true);
    await addOrder({
      eventId: event!.id,
      mode: event!.mode,
      lines: lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        modifiers: l.modifiers,
        qty: l.qty,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        usage: l.usage,
        note: l.note,
      })),
    });
    clearTicket();
    setPendiente(0);
    setOrders(await listOrders(event!.id));
    setBusy(false);
    showToast('Pedido servido');
  }

  function descartarPendiente(): void {
    clearTicket();
    setPendiente(0);
    showToast('Pedido descartado');
  }

  async function cerrar(): Promise<void> {
    setBusy(true);
    await closeEvent(event!.id, {
      stockEnd: Object.keys(stockEnd).length > 0 ? stockEnd : null,
      guestsReal: guestsReal.trim() === '' ? null : Math.round(parseNumber(guestsReal)),
      setupMinutes: setupMinutes.trim() === '' ? null : Math.round(parseNumber(setupMinutes)),
      teardownMinutes:
        teardownMinutes.trim() === '' ? null : Math.round(parseNumber(teardownMinutes)),
      notes,
    });
    await refreshEvents();
    setBusy(false);
    showToast('Barra cerrada');
    route(`/evento/${event!.id}`);
  }

  return (
    <section class="form">
      <header class="stack">
        <h1 class="display">{event.name}</h1>
        {/* El evento sigue `live` hasta pulsar el botón, pero quien está
            aquí está en el paso 3 y el indicador tiene que decirlo. */}
        <Pasos eventId={event.id} status={event.status} paso={3} />
        <p class="meta">
          Escribe cuánto queda de cada insumo y sabrás el consumo real. Lo que no cuentes se calcula con las recetas de las bebidas servidas. Contar solo el café y la leche ya sirve.
        </p>
      </header>

      {pendiente > 0 ? (
        <div class="notice" role="alert">
          <span class="notice__text">
            <AlertTriangle size={20} strokeWidth={1.75} class="notice__icon" />
            Hay {formatInt(pendiente)} {pendiente === 1 ? 'bebida' : 'bebidas'} sin servir en el
            pedido en curso.
          </span>
          <div class="row">
            <Button variant="primary" disabled={busy} onClick={() => void servirPendiente()}>
              Servir ahora
            </Button>
            <Button onClick={descartarPendiente}>Descartar</Button>
          </div>
        </div>
      ) : null}

      <div class="form__block">
        <h2 class="section-title">Recuento</h2>
        {filas.length === 0 ? (
          <p class="meta">
            Este evento no tiene carga registrada, así que no hay nada que contar. El consumo será
            el teórico.
          </p>
        ) : (
          <div class="recuento">
            <div class="recuento__head" aria-hidden="true">
              <span>Insumo</span>
              <span>Cargado</span>
              <span>Teórico</span>
              <span>Queda</span>
              <span>Consumido</span>
              <span>Desviación</span>
            </div>
            {filas.map((row) => {
              const ing = trackedIngredients.value.find((i) => i.id === row.ingredientId);
              const unidad = ing?.stockUnit ?? 'ud';
              return (
                <div class="recuento__row" key={row.ingredientId}>
                  <span class="recuento__name">{row.name}</span>
                  <span class="recuento__cell num" data-label="Cargado">
                    {formatQty(row.loaded ?? 0, row.unit)}
                  </span>
                  <span class="recuento__cell num" data-label="Teórico">
                    {formatQty(row.theoretical, row.unit)}
                  </span>
                  <span class="recuento__input">
                    <input
                      class="input"
                      inputMode="decimal"
                      aria-label={`Queda de ${row.name} en ${unidad}`}
                      placeholder="sin contar"
                      value={queda[row.ingredientId] ?? ''}
                      onInput={(e) =>
                        setQueda((prev) => ({
                          ...prev,
                          [row.ingredientId]: (e.currentTarget as HTMLInputElement).value,
                        }))
                      }
                    />
                    <span class="recuento__unit">{unidad}</span>
                  </span>
                  <span class="recuento__cell num" data-label="Consumido">
                    {row.counted ? formatQty(row.real, row.unit) : '—'}
                  </span>
                  <span
                    class={['recuento__cell', 'num', row.counted ? `is-${tonoDesviacion(row.deviationPct) ?? 'ok'}` : ''].join(' ')}
                    data-label="Desviación"
                  >
                    {row.counted ? formatDeviation(row.deviationPct) : 'no contado'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div class="form__block">
        <h2 class="section-title">Notas</h2>
        <div class="form__grid">
          <label class="field" for="ci-invitados">
            <span class="field__label">Invitados reales</span>
            <input
              id="ci-invitados"
              class="input"
              inputMode="decimal"
              placeholder={String(event.guestsExpected)}
              value={guestsReal}
              onInput={(e) => setGuestsReal((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field" for="ci-montaje">
            <span class="field__label">Montaje (min)</span>
            <input
              id="ci-montaje"
              class="input"
              inputMode="decimal"
              value={setupMinutes}
              onInput={(e) => setSetupMinutes((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field" for="ci-desmontaje">
            <span class="field__label">Desmontaje (min)</span>
            <input
              id="ci-desmontaje"
              class="input"
              inputMode="decimal"
              value={teardownMinutes}
              onInput={(e) => setTeardownMinutes((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
        <label class="field" for="ci-incidencias">
          <span class="field__label">Incidencias</span>
          <textarea
            id="ci-incidencias"
            class="textarea"
            placeholder="Se acabó la avena a las 22:10; el generador falló media hora…"
            value={notes}
            onInput={(e) => setNotes((e.currentTarget as HTMLTextAreaElement).value)}
          />
        </label>
      </div>

      <div class="form__block">
        <h2 class="section-title">Resultado</h2>
        <div class="stat-grid">
          <Cifra value={formatInt(close.served)} label="bebidas servidas" />
          <Cifra value={formatDecimal(stats.drinksPerGuest, 2)} label="por invitado" />
          <Cifra value={`${formatInt(stats.peakRate15)}/h`} label="pico (15 min)" />
          <Cifra
            value={formatMoney(close.costPerDrink)}
            label="coste por bebida"
            hint={close.hasCount ? 'con recuento' : 'teórico: nada contado'}
          />
          <Cifra
            value={duracion === null ? '—' : formatDuration(duracion)}
            label="duración de la barra"
          />
        </div>

        <div class="card">
          <Fila label="Coste teórico" value={formatMoney(close.costTheoretical)} />
          <Fila
            label="Coste real (con recuento)"
            value={close.hasCount ? formatMoney(close.costReal) : 'nada contado'}
          />
          <Fila
            label="Merma"
            value={close.hasCount ? formatDeviation(close.wastePct) : 'nada contado'}
            {...(close.hasCount ? { state: tonoDesviacion(close.wastePct) } : {})}
          />
          {event.mode === 'venta' ? (
            <>
              <Fila label="Ingresos" value={formatMoney(stats.revenue)} />
              <Fila label="Propinas" value={formatMoney(stats.tips)} />
              <Fila
                label="Invitaciones"
                value={`${formatInt(stats.compedCount)} · ${formatMoney(stats.compedValue)}`}
              />
            </>
          ) : null}
        </div>
      </div>

      <div class="stack">
        <Button variant="primary" action disabled={busy} onClick={() => void cerrar()}>
          Cerrar y ver resultados
        </Button>
        <div class="row">
          <Button variant="ghost" onClick={() => route(`/evento/${event.id}`)}>
            Volver a la barra
          </Button>
        </div>
      </div>
    </section>
  );
}
