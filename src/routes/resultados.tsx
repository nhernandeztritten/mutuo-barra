/**
 * Resultados — SPEC §3.5. Pensado para el ordenador, funciona en el iPad.
 *
 * Es la única pantalla que compara eventos entre sí: qué boda gastó más por
 * bebida, a qué hora se forma la cola, cuánta avena hay que subir al carro.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Download, Upload } from 'lucide-preact';
import {
  exportAllConsumptionCsv,
  exportAllLinesCsv,
  exportJson,
  importJson,
  listAllOrders,
} from '../data/repo';
import type { BarEvent, Category, Order } from '../data/types';
import { closeStats, eventStats } from '../domain/stats';
import {
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
  formatMoneyPlain,
  formatPct,
} from '../domain/format';
import { Button } from '../ui/components';
import { guardarArchivo, nombreConFecha, pedirArchivo } from '../ui/archivos';
import { BarraApilada, Columnas, Curva, Grafico } from '../ui/graficos';
import { ordenarPor, siguienteOrden, type Direccion } from '../ui/orden';
import { Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import { closedEvents, ingredients, products, refreshEvents } from '../ui/store';
import { TYPE_LABEL } from './eventos';

/**
 * Orden de los colores de categoría en las barras apiladas. No es el orden de
 * la carta: es el que deja separables los seis colores de marca (violeta y azul
 * no pueden tocarse). Comprobado con el validador de paleta.
 */
const ORDEN_CATEGORIA: Category[] = [
  'Espresso',
  'Fríos',
  'Con leche',
  'Filtro',
  'Otros',
  'Especiales',
];

const COLOR_CATEGORIA: Record<Category, string> = {
  Espresso: 'var(--cat-espresso)',
  'Con leche': 'var(--cat-con-leche)',
  Filtro: 'var(--cat-filtro)',
  Fríos: 'var(--cat-frios)',
  Especiales: 'var(--cat-especiales)',
  Otros: 'var(--cat-otros)',
};

const COLOR_LECHE = {
  vaca: 'var(--cat-filtro)',
  avena: 'var(--cat-con-leche)',
  sin_lactosa: 'var(--cat-especiales)',
} as const;

interface Row {
  event: BarEvent;
  fecha: string;
  nombre: string;
  tipo: string;
  invitados: number;
  bebidas: number;
  porInvitado: number;
  costePorBebida: number;
  pico: number;
  ingresos: number;
  propinas: number;
}

type ColKey = keyof Omit<Row, 'event'>;

const COLUMNAS: { key: ColKey; label: string; num: boolean }[] = [
  { key: 'fecha', label: 'Fecha', num: false },
  { key: 'nombre', label: 'Evento', num: false },
  { key: 'tipo', label: 'Tipo', num: false },
  { key: 'invitados', label: 'Invitados', num: true },
  { key: 'bebidas', label: 'Bebidas', num: true },
  { key: 'porInvitado', label: 'Beb./invitado', num: true },
  { key: 'costePorBebida', label: 'Coste/bebida (€)', num: true },
  { key: 'pico', label: 'Pico (beb./h)', num: true },
  { key: 'ingresos', label: 'Ingresos (€)', num: true },
  { key: 'propinas', label: 'Propinas (€)', num: true },
];

export function Resultados() {
  const { route } = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [conEjemplos, setConEjemplos] = useState(false);
  const [orden, setOrden] = useState<{ key: ColKey; dir: Direccion }>({
    key: 'fecha',
    dir: 'desc',
  });
  const [busy, setBusy] = useState(false);

  async function recargar(): Promise<void> {
    setOrders(await listAllOrders());
  }

  useEffect(() => {
    void recargar();
  }, []);

  const cerrados = closedEvents.value.filter((e) => conEjemplos || !e.isDemo);
  const hayEjemplos = closedEvents.value.some((e) => e.isDemo);

  const rows = useMemo<Row[]>(() => {
    return cerrados.map((event) => {
      const ordersOf = orders.filter((o) => o.eventId === event.id);
      const stats = eventStats(event, ordersOf, products.value);
      const close = closeStats(event, ordersOf, ingredients.value);
      return {
        event,
        fecha: event.date,
        nombre: event.name,
        tipo: TYPE_LABEL[event.type],
        invitados: event.guestsReal ?? event.guestsExpected,
        bebidas: stats.served,
        porInvitado: stats.drinksPerGuest,
        costePorBebida: close.costPerDrink,
        pico: stats.peakRate15,
        ingresos: stats.revenue,
        propinas: stats.tips,
      };
    });
  }, [cerrados.map((e) => e.id).join(','), orders]);

  const ordenadas = useMemo(() => ordenarPor(rows, orden.key, orden.dir), [rows, orden]);

  function alTocarCabecera(key: ColKey): void {
    const col = COLUMNAS.find((c) => c.key === key);
    setOrden((prev) => siguienteOrden(prev, key, !(col?.num ?? false)));
  }

  /* ---- Comparativas ---- */

  const porEvento = rows.map((r) => ({
    label: r.nombre.length > 14 ? `${r.nombre.slice(0, 13)}…` : r.nombre,
    value: r.bebidas,
    text: formatInt(r.bebidas),
  }));

  const coste = rows.map((r) => ({
    label: r.nombre.length > 14 ? `${r.nombre.slice(0, 13)}…` : r.nombre,
    value: r.costePorBebida,
    text: formatMoneyPlain(r.costePorBebida),
  }));
  const costeMedio =
    rows.length > 0 ? rows.reduce((s, r) => s + r.costePorBebida, 0) / rows.length : 0;

  const mix = useMemo(() => {
    const total = new Map<Category, number>();
    for (const event of cerrados) {
      const stats = eventStats(event, orders.filter((o) => o.eventId === event.id), products.value);
      for (const c of stats.byCategory) {
        const key = c.category as Category;
        total.set(key, (total.get(key) ?? 0) + c.qty);
      }
    }
    const suma = [...total.values()].reduce((s, v) => s + v, 0);
    return ORDEN_CATEGORIA.filter((c) => (total.get(c) ?? 0) > 0).map((c) => ({
      label: c,
      value: total.get(c) ?? 0,
      color: COLOR_CATEGORIA[c],
      text: `${formatPct(suma > 0 ? ((total.get(c) ?? 0) / suma) * 100 : 0)} · ${formatInt(total.get(c) ?? 0)}`,
    }));
  }, [cerrados.map((e) => e.id).join(','), orders]);

  const lechesTotal = useMemo(() => {
    let vaca = 0;
    let avena = 0;
    let sinLactosa = 0;
    for (const event of cerrados) {
      const stats = eventStats(event, orders.filter((o) => o.eventId === event.id), products.value);
      vaca += stats.byMilk.vaca;
      avena += stats.byMilk.avena;
      sinLactosa += stats.byMilk.sin_lactosa;
    }
    const suma = vaca + avena + sinLactosa;
    return (
      [
        ['vaca', 'Vaca', vaca],
        ['avena', 'Avena', avena],
        ['sin_lactosa', 'Sin lactosa', sinLactosa],
      ] as const
    )
      .filter(([, , v]) => v > 0)
      .map(([key, label, v]) => ({
        label,
        value: v,
        color: COLOR_LECHE[key],
        text: `${formatPct(suma > 0 ? (v / suma) * 100 : 0)} · ${formatInt(v)}`,
      }));
  }, [cerrados.map((e) => e.id).join(','), orders]);

  /** Media por franja de 30 min desde la apertura, entre todos los eventos. */
  const curva = useMemo(() => {
    const suma: number[] = [];
    const cuenta: number[] = [];
    for (const event of cerrados) {
      const stats = eventStats(event, orders.filter((o) => o.eventId === event.id), products.value);
      stats.perHalfHour.forEach((slot, i) => {
        suma[i] = (suma[i] ?? 0) + slot.qty;
        cuenta[i] = (cuenta[i] ?? 0) + 1;
      });
    }
    return suma.map((total, i) => {
      const media = total / (cuenta[i] ?? 1);
      return {
        label: `${Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}`,
        value: Math.round(media * 10) / 10,
        text: formatDecimal(media, 1),
      };
    });
  }, [cerrados.map((e) => e.id).join(','), orders]);

  /* ---- Exportar e importar ---- */

  async function exportarTodo(): Promise<void> {
    setBusy(true);
    const ids = cerrados.map((e) => e.id);
    const lineas = await exportAllLinesCsv(ids);
    await guardarArchivo({
      nombre: nombreConFecha('pedidos', 'csv'),
      contenido: lineas,
      mime: 'text/csv',
    });
    const consumo = await exportAllConsumptionCsv(ids);
    await guardarArchivo({
      nombre: nombreConFecha('consumo', 'csv'),
      contenido: consumo,
      mime: 'text/csv',
    });
    const json = await exportJson();
    await guardarArchivo({
      nombre: nombreConFecha('copia', 'json'),
      contenido: JSON.stringify(json, null, 2),
      mime: 'application/json',
    });
    setBusy(false);
    showToast('Tres archivos: pedidos, consumo y copia completa');
  }

  async function importar(): Promise<void> {
    const texto = await pedirArchivo();
    if (texto === null) return;
    setBusy(true);
    try {
      const resumen = await importJson(JSON.parse(texto));
      await refreshEvents();
      await recargar();
      const ev = resumen.events.added;
      const pe = resumen.orders.added;
      showToast(
        `${formatInt(ev)} ${ev === 1 ? 'evento' : 'eventos'} y ${formatInt(pe)} ${pe === 1 ? 'pedido' : 'pedidos'} nuevos`,
      );
    } catch {
      showToast('Ese archivo no es una copia de Mutuo · Barra');
    }
    setBusy(false);
  }

  const vacio = rows.length === 0;

  return (
    <section class="resultados">
      <header class="row">
        <h1 class="display">Resultados</h1>
        <div class="spacer" />
        {hayEjemplos ? (
          <button
            type="button"
            class="switch"
            aria-pressed={conEjemplos}
            onClick={() => setConEjemplos(!conEjemplos)}
          >
            Incluir ejemplos
          </button>
        ) : null}
        <Button disabled={busy} onClick={() => void importar()}>
          <Upload size={20} strokeWidth={1.75} /> Importar
        </Button>
        <Button variant="primary" disabled={busy || vacio} onClick={() => void exportarTodo()}>
          <Download size={20} strokeWidth={1.75} /> Exportar todo
        </Button>
      </header>

      {vacio ? (
        <div class="empty">
          <p class="card__title">Todavía no hay eventos cerrados</p>
          <p class="meta">
            Aquí se compara un evento con otro: cuántas bebidas por invitado salieron, cuánto costó
            cada una y a qué hora se juntó la cola. Aparece en cuanto cierres la primera barra.
            {hayEjemplos && !conEjemplos
              ? ' Tienes un evento de ejemplo cerrado: enciende «Incluir ejemplos» para verlo.'
              : ''}
          </p>
          <div class="row">
            <Button variant="primary" onClick={() => route('/')}>
              Ir a Eventos
            </Button>
            <Button disabled={busy} onClick={() => void importar()}>
              Importar una copia
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div class="tabla-wrap">
            <table class="tabla tabla--eventos">
              <caption class="visually-hidden">
                Eventos cerrados, ordenables por cualquier columna
              </caption>
              <thead>
                <tr>
                  {COLUMNAS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      class={col.num ? 'tabla__num' : ''}
                      aria-sort={
                        orden.key === col.key
                          ? orden.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button type="button" class="tabla__sort" onClick={() => alTocarCabecera(col.key)}>
                        {col.label}
                        <span class="tabla__arrow" aria-hidden="true">
                          {orden.key === col.key ? (orden.dir === 'asc' ? '▲' : '▼') : '·'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((r) => (
                  <tr key={r.event.id}>
                    <td class="tabla__num">{formatDate(`${r.fecha}T12:00:00`)}</td>
                    <th scope="row">
                      <a href={`/evento/${r.event.id}`}>{r.nombre}</a>
                      {r.event.isDemo ? <Etiqueta>Ejemplo</Etiqueta> : null}
                    </th>
                    <td>{r.tipo}</td>
                    <td class="tabla__num">{formatInt(r.invitados)}</td>
                    <td class="tabla__num">{formatInt(r.bebidas)}</td>
                    <td class="tabla__num">{formatDecimal(r.porInvitado, 2)}</td>
                    <td class="tabla__num">{formatMoneyPlain(r.costePorBebida)}</td>
                    <td class="tabla__num">{formatInt(r.pico)}</td>
                    <td class="tabla__num">{formatMoneyPlain(r.ingresos)}</td>
                    <td class="tabla__num">{formatMoneyPlain(r.propinas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div class="graficos">
            <Grafico titulo="Bebidas por evento">
              <Columnas data={porEvento} fuente={14} />
            </Grafico>

            <Grafico
              titulo="Coste por bebida"
              nota={`La línea es la media: ${formatMoney(costeMedio)}.`}
            >
              <Columnas
                data={coste}
                umbral={costeMedio}
                umbralLabel={`media ${formatMoneyPlain(costeMedio)} €`}
                fuente={14}
              />
            </Grafico>

            <Grafico titulo="Mix por categoría" nota="Suma de todos los eventos incluidos.">
              <BarraApilada data={mix} />
            </Grafico>

            <Grafico titulo="Leches" nota="Suma de todos los eventos incluidos.">
              <BarraApilada data={lechesTotal} />
            </Grafico>

            <Grafico
              titulo="Curva horaria media"
              nota="Bebidas por media hora desde que se abre la barra, promediadas."
            >
              <Curva data={curva} />
            </Grafico>
          </div>
        </>
      )}
    </section>
  );
}
