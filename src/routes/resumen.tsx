/**
 * Resumen del evento — SPEC §3.3.
 *
 * Se abre como hoja lateral sobre la propia barra (sin cambiar de pantalla,
 * UX-REVISION-1 §C) y también como página para un evento ya cerrado.
 */
import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { listOrders, voidOrder } from '../data/repo';
import { VOID_EDITADO, type BarEvent, type Ingredient, type Order } from '../data/types';
import { DRINKS_PER_BARISTA_HOUR, enPausa, eventConsumption, eventStats } from '../domain/stats';
import {
  formatInt,
  formatMoney,
  formatPct,
  formatQty,
  formatRate,
  formatTime,
} from '../domain/format';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { BarraApilada, BarrasHorizontales, Columnas, Grafico, Medidor } from '../ui/graficos';
import { Pasos } from '../ui/pasos';
import { PAGO_LABEL } from '../ui/etiquetas';
import { VOID_MANUAL, etiquetaDeAnulacion } from '../ui/motivos';
import { Cifra, Fila } from '../ui/piezas';
import { eventById, ingredients, products } from '../ui/store';
import { showToast } from '../ui/toast';

/** Media hora de una persona a 50 bebidas/h. */
const POR_FRANJA_Y_BARISTA = DRINKS_PER_BARISTA_HOUR / 2;

/** Colores de las leches. Orden verificado para que se distingan entre sí. */
const COLOR_LECHE = {
  vaca: 'var(--cat-filtro)',
  avena: 'var(--cat-con-leche)',
  sin_lactosa: 'var(--cat-especiales)',
} as const;

/**
 * Modificadores que interesa seguir, en el orden del informe.
 *
 * La Tapa salió de la lista con la semilla v5: retirada de la carta, un «30 %
 * pidió tapa» en «lo que más se pide cambiar» invita a decidir sobre algo que
 * ya no se puede ofrecer. El dato no se pierde —sigue en la línea congelada del
 * pedido y en la exportación CSV—, solo deja de encabezar un informe.
 */
const MODS_SEGUIDOS = ['cafe_descafeinado', 'extra_iced', 'extra_doble'];

export function ResumenContenido({
  event,
  orders,
  onOrdersChange,
}: {
  event: BarEvent;
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
}) {

  const stats = eventStats(event, orders, products.value);
  const consumo = eventConsumption(orders);
  const insumos: Ingredient[] = ingredients.value;

  const franjas = stats.perHalfHour.map((slot) => ({
    label: formatTime(slot.start),
    value: slot.qty,
    text: formatInt(slot.qty),
  }));
  const techoFranja = event.baristas * POR_FRANJA_Y_BARISTA;

  const top = stats.byProduct.slice(0, 5).map((p) => ({
    label: p.name,
    value: p.qty,
    text: formatInt(p.qty),
  }));

  const leches = [
    { key: 'vaca', label: 'Vaca', value: stats.byMilk.vaca },
    { key: 'avena', label: 'Avena', value: stats.byMilk.avena },
    { key: 'sin_lactosa', label: 'Sin lactosa', value: stats.byMilk.sin_lactosa },
  ] as const;
  const totalLeche = stats.byMilk.total;

  const mods = MODS_SEGUIDOS.map((id) => stats.byModifier.find((m) => m.optionId === id)).filter(
    (m): m is NonNullable<typeof m> => m !== undefined && m.qty > 0,
  );

  const cargados = insumos
    .filter((ing) => (event.stockStart[ing.id] ?? 0) > 0)
    .map((ing) => {
      const cargado = event.stockStart[ing.id] ?? 0;
      const usado = consumo[ing.id] ?? 0;
      return {
        ing,
        cargado,
        usado,
        pct: cargado > 0 ? (usado / cargado) * 100 : 0,
      };
    });

  const pedidos = [...orders].sort((a, b) => b.servedAt.localeCompare(a.servedAt));

  async function anular(orderId: string, motivo: string): Promise<void> {
    await voidOrder(orderId, motivo);
    onOrdersChange(await listOrders(event.id));
    showToast('Pedido anulado');
  }

  const parado = enPausa(event);

  return (
    <div class="resumen">
      <div class="stat-grid">
        <Cifra value={formatInt(stats.served)} label="bebidas servidas" />
        {/* Parado, el ritmo caería solo hasta cero sin que pase nada: decirlo
            es más honesto que enseñar un número que se desmorona. */}
        <Cifra
          value={parado ? 'en pausa' : formatRate(stats.lastHourRate)}
          label="ritmo última hora"
          hint={
            parado
              ? 'el servicio está parado; el evento sigue abierto'
              : `Techo: ${formatRate(stats.capacity)} con ${formatInt(event.baristas)} baristas`
          }
          {...(!parado && stats.lastHourRate > stats.capacity ? { state: 'warn' as const } : {})}
        />
        <Cifra value={formatRate(stats.peakRate15)} label="pico (15 min)" />
        <Cifra value={formatMoney(stats.costTheoretical)} label="coste teórico" />
        {event.mode === 'venta' ? (
          <Cifra
            value={formatMoney(stats.revenue)}
            label="ingresos"
            hint={
              stats.compedCount > 0
                ? `${formatInt(stats.compedCount)} de invitación (${formatMoney(stats.compedValue)})`
                : `${formatMoney(stats.tips)} de propina`
            }
          />
        ) : null}
      </div>

      <Grafico
        titulo="Bebidas por media hora"
        nota={`La línea marca el techo de la barra: ${formatInt(techoFranja)} por franja con ${formatInt(event.baristas)} baristas.`}
      >
        <Columnas
          data={franjas}
          umbral={techoFranja}
          umbralLabel={`techo ${formatInt(techoFranja)}`}
        />
      </Grafico>

      <Grafico titulo="Lo más servido">
        <BarrasHorizontales data={top} />
      </Grafico>

      <Grafico titulo="Leches" nota={`${formatInt(totalLeche)} bebidas llevan leche.`}>
        <BarraApilada
          data={leches
            .filter((l) => l.value > 0)
            .map((l) => ({
              label: l.label,
              value: l.value,
              color: COLOR_LECHE[l.key],
              text: `${formatPct(totalLeche > 0 ? (l.value / totalLeche) * 100 : 0)} · ${formatInt(l.value)}`,
            }))}
        />
      </Grafico>

      {mods.length > 0 ? (
        <div class="card">
          <h2 class="card__title">Lo que más se pide cambiar</h2>
          {mods.map((m) => (
            <Fila
              key={m.optionId}
              label={m.label}
              value={`${formatPct(m.pct)} · ${formatInt(m.qty)}`}
            />
          ))}
        </div>
      ) : null}

      {cargados.length > 0 ? (
        <div class="card">
          <h2 class="card__title">Consumo sobre la carga</h2>
          <p class="meta">Consumo teórico: lo que suman las recetas de lo servido.</p>
          {cargados.map((row) => (
            <Medidor
              key={row.ing.id}
              label={row.ing.name}
              pct={row.pct}
              detalle={`${formatQty(row.usado, row.ing.unit)} de ${formatQty(row.cargado, row.ing.unit)} · ${Math.round(row.pct)} %`}
            />
          ))}
        </div>
      ) : null}

      {/* `tabIndex` −1 para que «Ver todos» pueda abrir la hoja aquí: el foco y
          el scroll van juntos, y este bloque no entra en el orden de tabulación. */}
      <div class="card" id="resumen-pedidos" tabIndex={-1}>
        <h2 class="card__title">Pedidos ({formatInt(pedidos.length)})</h2>
        {pedidos.length === 0 ? (
          <p class="meta">Todavía no se ha servido nada.</p>
        ) : (
          <ul class="pedidos">
            {pedidos.map((order) => {
              const anulado = order.voidedAt !== null;
              const corregido = anulado && order.voidReason === VOID_EDITADO;
              return (
                <li
                  class={['pedido', anulado ? 'is-anulado' : '', corregido ? 'is-corregido' : '']
                    .filter(Boolean)
                    .join(' ')}
                  key={order.id}
                >
                  <span class="pedido__hora num">{formatTime(order.servedAt)}</span>
                  <span class="pedido__lineas">
                    {order.lines.map((line) => (
                      <span class="pedido__linea" key={line.id}>
                        {line.qty > 1 ? `${formatInt(line.qty)} × ` : ''}
                        {line.productName}
                        {line.modifiers.length > 0 ? (
                          <span class="pedido__mods">
                            {' '}
                            {line.modifiers.map((m) => m.label.toLowerCase()).join(' · ')}
                          </span>
                        ) : null}
                      </span>
                    ))}
                    {/* «Corregido», no «Anulado»: el barista no anuló ese
                        pedido, lo cambió, y en su sitio hay otro con la misma
                        hora. */}
                    {anulado ? (
                      <span class="pedido__motivo">{etiquetaDeAnulacion(order.voidReason)}</span>
                    ) : null}
                  </span>
                  {order.mode === 'venta' ? (
                    <span class="pedido__importe num">
                      {order.payment === 'invitacion'
                        ? 'Invitación'
                        : `${formatMoney(order.total)}${order.payment ? ` · ${PAGO_LABEL[order.payment] ?? ''}` : ''}`}
                    </span>
                  ) : null}
                  {anulado ? null : (
                    <Button variant="ghost" onClick={() => void anular(order.id, VOID_MANUAL)}>
                      Anular
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** `/evento/:id/resumen` — la misma información como página. */
export function Resumen() {
  const route = useIr();
  const { params } = useRoute();
  const event = eventById(params['id']);
  const [orders, setOrders] = useState<Order[]>([]);

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

  return (
    <section class="detalle">
      <header class="stack">
        <h1 class="display">{event.name}</h1>
        <Pasos eventId={event.id} status={event.status} />
        <p class="meta">Resumen de lo servido.</p>
      </header>

      <ResumenContenido event={event} orders={orders} onOrdersChange={setOrders} />

      <div class="row">
        <Button variant="primary" onClick={() => route(`/evento/${event.id}`)}>
          {event.status === 'live' ? 'Volver a la barra' : 'Ver resultados'}
        </Button>
        <Button variant="ghost" onClick={() => route('/')}>
          Ir a Eventos
        </Button>
      </div>
    </section>
  );
}
