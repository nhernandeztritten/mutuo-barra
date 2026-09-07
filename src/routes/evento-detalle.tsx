/**
 * Resultados de un evento cerrado — paso 4 del ciclo.
 *
 * Todo lo que pasó entre abrir y cerrar la barra: cuánto se sirvió, a qué
 * ritmo, qué se consumió de verdad y cuánto costó.
 */
import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { Download, RotateCcw } from 'lucide-preact';
import { exportJson, exportLinesCsv, listOrders, reopenEvent } from '../data/repo';
import type { Order } from '../data/types';
import { closeStats, eventStats } from '../domain/stats';
import {
  formatDateLong,
  formatDecimal,
  formatDeviation,
  formatDuration,
  formatInt,
  formatMoney,
  formatPct,
  formatQty,
  formatRate,
  formatTime,
} from '../domain/format';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { guardarArchivo, nombreConFecha } from '../ui/archivos';
import { BarraApilada, BarrasHorizontales, Columnas, Grafico } from '../ui/graficos';
import { Pasos } from '../ui/pasos';
import { Cifra, Etiqueta, Fila } from '../ui/piezas';
import { showToast } from '../ui/toast';
import { eventById, ingredients, products, refreshEvents } from '../ui/store';
import { TYPE_LABEL } from './eventos';

const COLOR_LECHE = {
  vaca: 'var(--cat-filtro)',
  avena: 'var(--cat-con-leche)',
  sin_lactosa: 'var(--cat-especiales)',
} as const;

function tono(pct: number): 'warn' | 'danger' | undefined {
  const abs = Math.abs(pct);
  if (abs > 20) return 'danger';
  if (abs > 8) return 'warn';
  return undefined;
}

export function EventoDetalle() {
  const route = useIr();
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
        <h1 class="display">Este evento ya no está</h1>
        <div class="row">
          <Button variant="primary" onClick={() => route('/')}>
            Ir a Eventos
          </Button>
        </div>
      </section>
    );
  }

  const stats = eventStats(event, orders, products.value);
  const close = closeStats(event, orders, ingredients.value);

  const franjas = stats.perHalfHour.map((slot) => ({
    label: formatTime(slot.start),
    value: slot.qty,
    text: formatInt(slot.qty),
  }));
  const techoFranja = event.baristas * 25;

  const top = stats.byProduct.slice(0, 8).map((p) => ({
    label: p.name,
    value: p.qty,
    text: formatInt(p.qty),
  }));

  const leches = (
    [
      ['vaca', 'Vaca', stats.byMilk.vaca],
      ['avena', 'Avena', stats.byMilk.avena],
      ['sin_lactosa', 'Sin lactosa', stats.byMilk.sin_lactosa],
    ] as const
  )
    .filter(([, , qty]) => qty > 0)
    .map(([key, label, qty]) => ({
      label,
      value: qty,
      color: COLOR_LECHE[key],
      text: `${formatPct(stats.byMilk.total > 0 ? (qty / stats.byMilk.total) * 100 : 0)} · ${formatInt(qty)}`,
    }));

  async function reabrir(): Promise<void> {
    setBusy(true);
    await reopenEvent(event!.id);
    await refreshEvents();
    setBusy(false);
    showToast('Evento reabierto');
    route(`/evento/${event!.id}`);
  }

  async function exportar(): Promise<void> {
    setBusy(true);
    const csv = await exportLinesCsv(event!.id);
    const base = event!.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await guardarArchivo({
      nombre: nombreConFecha(`${base || 'evento'}-pedidos`, 'csv'),
      contenido: csv,
      mime: 'text/csv',
    });
    const json = await exportJson();
    await guardarArchivo({
      nombre: nombreConFecha(`${base || 'evento'}-copia`, 'json'),
      contenido: JSON.stringify(json, null, 2),
      mime: 'application/json',
    });
    setBusy(false);
    showToast('Dos archivos guardados: los pedidos (CSV) y la copia de seguridad (JSON)');
  }

  return (
    <section class="detalle">
      <header class="stack">
        <h1 class="display">
          {event.name}
          {event.isDemo ? <Etiqueta>Ejemplo</Etiqueta> : null}
        </h1>
        <Pasos eventId={event.id} status={event.status} />
        <p class="meta">
          {TYPE_LABEL[event.type]} · {formatDateLong(`${event.date}T12:00:00`)}
          {event.venue ? ` · ${event.venue}` : ''} · {formatInt(event.guestsReal ?? event.guestsExpected)}{' '}
          invitados
          {event.guestsReal === null ? ' previstos' : ' reales'}
        </p>
      </header>

      <div class="stat-grid">
        <Cifra value={formatInt(stats.served)} label="bebidas servidas" />
        <Cifra value={formatDecimal(stats.drinksPerGuest, 2)} label="por invitado" />
        <Cifra value={formatRate(stats.peakRate15)} label="pico (15 min)" />
        <Cifra
          value={formatMoney(close.costPerDrink)}
          label="coste por bebida"
          hint={close.hasCount ? 'con recuento' : 'teórico: nada contado'}
        />
        <Cifra
          value={close.durationMinutes === null ? '—' : formatDuration(close.durationMinutes)}
          label="duración de la barra"
        />
        {event.mode === 'venta' ? (
          <Cifra
            value={formatMoney(stats.revenue)}
            label="ingresos"
            hint={`${formatMoney(stats.tips)} de propina · ${formatInt(stats.compedCount)} de invitación`}
          />
        ) : null}
      </div>

      <div class="card">
        <h2 class="card__title">Coste</h2>
        <Fila label="Coste teórico" value={formatMoney(close.costTheoretical)} />
        <Fila
          label="Coste real (con recuento)"
          value={close.hasCount ? formatMoney(close.costReal) : 'nada contado'}
        />
        <Fila
          label="Merma"
          value={close.hasCount ? formatDeviation(close.wastePct) : 'nada contado'}
          {...(close.hasCount ? { state: tono(close.wastePct) } : {})}
        />
        {event.mode === 'venta' ? (
          <Fila
            label="Invitaciones"
            value={`${formatInt(stats.compedCount)} · ${formatMoney(stats.compedValue)}`}
            hint="a precio de carta, fuera de los ingresos"
          />
        ) : null}
      </div>

      <Grafico
        titulo="Bebidas por media hora"
        nota={`La línea marca el techo: ${formatInt(techoFranja)} por franja con ${formatInt(event.baristas)} baristas.`}
      >
        <Columnas
          data={franjas}
          umbral={techoFranja}
          umbralLabel={`techo ${formatInt(techoFranja)}`}
          fuente={14}
        />
      </Grafico>

      <Grafico titulo="Lo más servido">
        <BarrasHorizontales data={top} fuente={14} />
      </Grafico>

      {leches.length > 0 ? (
        <Grafico titulo="Leches" nota={`${formatInt(stats.byMilk.total)} bebidas llevan leche.`}>
          <BarraApilada data={leches} />
        </Grafico>
      ) : null}

      {close.byIngredient.length > 0 ? (
        <div class="card">
          <h2 class="card__title">Consumo real contra teórico</h2>
          <p class="meta">
            {close.hasCount
              ? 'El real sale del recuento del cierre; donde no contaste, se usa el teórico.'
              : 'No hubo recuento: el consumo real es el teórico de las recetas.'}
          </p>
          <div class="tabla-wrap">
            <table class="tabla">
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col" class="tabla__num">Cargado</th>
                  <th scope="col" class="tabla__num">Teórico</th>
                  <th scope="col" class="tabla__num">Real</th>
                  <th scope="col" class="tabla__num">Desviación</th>
                </tr>
              </thead>
              <tbody>
                {close.byIngredient.map((row) => (
                  <tr key={row.ingredientId}>
                    <th scope="row">{row.name}</th>
                    <td class="tabla__num">
                      {row.loaded === null ? '—' : formatQty(row.loaded, row.unit)}
                    </td>
                    <td class="tabla__num">{formatQty(row.theoretical, row.unit)}</td>
                    <td class="tabla__num">{formatQty(row.real, row.unit)}</td>
                    <td class={['tabla__num', row.counted ? `is-${tono(row.deviationPct) ?? 'ok'}` : ''].join(' ')}>
                      {row.counted ? formatDeviation(row.deviationPct) : 'no contado'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div class="card">
        <h2 class="card__title">Notas del evento</h2>
        <Fila
          label="Montaje"
          value={event.setupMinutes === null ? '—' : formatDuration(event.setupMinutes)}
        />
        <Fila
          label="Desmontaje"
          value={event.teardownMinutes === null ? '—' : formatDuration(event.teardownMinutes)}
        />
        <p class="meta">{event.notes.trim() === '' ? 'Sin incidencias anotadas.' : event.notes}</p>
      </div>

      <div class="stack">
        <div class="row">
          <Button variant="primary" disabled={busy} onClick={() => void exportar()}>
            <Download size={20} strokeWidth={1.75} /> Exportar este evento
          </Button>
          <Button onClick={() => route(`/evento/${event.id}/resumen`)}>Ver los pedidos</Button>
          <Button disabled={busy} onClick={() => void reabrir()}>
            <RotateCcw size={20} strokeWidth={1.75} /> Reabrir
          </Button>
        </div>
        <p class="meta">
          Reabrir devuelve el evento al paso 1 conservando los pedidos y el recuento, para corregir
          algo y volver a cerrarlo.
        </p>
      </div>
    </section>
  );
}
