/**
 * La barra — SPEC §3.2, las once reglas.
 *
 * Pantalla caliente: cinco segundos por interacción, manos mojadas, cola de
 * seis. Nada de diálogos de confirmación; se sirve y se ofrece «Deshacer».
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Moon, Pause, Sun, Zap } from 'lucide-preact';
import { addOrder, listOrders, pauseEvent, voidOrder } from '../data/repo';
import type { Category, Order, Product } from '../data/types';
import { eventConsumption, eventStats } from '../domain/stats';
import { formatInt, formatQty, formatRate, formatTime } from '../domain/format';
import { Button, Chip, Tile } from '../ui/components';
import { clearToasts, showToast } from '../ui/toast';
import {
  CATEGORY_COLOR,
  LineSheet,
  PaymentSheet,
  TicketPanel,
  type PaymentResult,
  type RecentDrink,
} from '../ui/barra-parts';
import {
  activeProducts,
  eventById,
  ingredients,
  modifierGroups,
  modifierOptions,
  oneTap,
  optionsById,
  refreshEvents,
  setOneTap,
  setTheme,
} from '../ui/store';
import { theme } from '../ui/theme';
import {
  addLine,
  buildLine,
  clearTicket,
  detachTicket,
  loadTicket,
  restoreTicket,
  setQty,
  ticket,
  ticketDrinks,
  ticketTotal,
  undoLast,
  type TicketLine,
} from '../ui/ticket';
import { barMode } from '../ui/layout';

/** Chips rápidos de la fila de 56 px, en el orden de SPEC §3.2. */
const QUICK_CHIPS = [
  'leche_avena',
  'leche_sin_lactosa',
  'cafe_descafeinado',
  'extra_doble',
  'extra_iced',
  'extra_sirope',
  'extra_tapa',
] as const;

/**
 * Etiqueta corta solo en la fila de chips: siete chips de 56 px tienen que
 * caber sin scroll. «Descafeinado» es la palabra completa en el resto de la app.
 */
const CHIP_LABEL: Record<string, string> = { cafe_descafeinado: 'Desca' };

const SHAKE_MS = 220;
const SERVE_FADE_MS = 180;

export function Barra() {
  const { route } = useLocation();
  const { params } = useRoute();
  const eventId = params['id'];
  const event = eventById(eventId);

  const [orders, setOrders] = useState<Order[]>([]);
  const [armed, setArmed] = useState<string[]>([]);
  const [shaking, setShaking] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [editing, setEditing] = useState<TicketLine | null>(null);
  const [paying, setPaying] = useState(false);
  const [serving, setServing] = useState(false);
  /** Copia del ticket recién servido, solo para el fundido de 180 ms. */
  const [fading, setFading] = useState<TicketLine[]>([]);
  const [tick, setTick] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ---- Ciclo de vida ---- */

  useEffect(() => {
    barMode.value = true;
    return () => {
      barMode.value = false;
      detachTicket();
      // El «Deshacer» de un toast muerto apuntaría a un ticket que ya no existe.
      clearToasts();
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    loadTicket(eventId);
    void (async () => setOrders(await listOrders(eventId)))();
  }, [eventId]);

  // El ritmo de la última hora se mueve solo aunque nadie toque nada.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  function later(fn: () => void, ms: number): void {
    timers.current.push(setTimeout(fn, ms));
  }

  const products = activeProducts.value;

  const categories = useMemo(() => {
    const seen: Category[] = [];
    for (const p of products) if (!seen.includes(p.category)) seen.push(p.category);
    return seen;
  }, [products]);

  const currentCategory = category ?? categories[0] ?? null;

  if (!event || event.status !== 'live') {
    return (
      <section class="stack" style={{ padding: 'var(--s-6)' }}>
        <h1 class="display">Esta barra no está abierta</h1>
        <p class="meta">Abre el evento desde la lista para empezar a registrar bebidas.</p>
        <div class="row">
          <Button variant="primary" onClick={() => route('/')}>
            Ir a Eventos
          </Button>
        </div>
      </section>
    );
  }

  const lines = ticket.value;
  const stats = eventStats(event, orders, products, now);
  const consumption = eventConsumption(orders);

  /* ---- Chips ---- */

  const chipOptions = QUICK_CHIPS.map((id) => optionsById.value.get(id)).filter(
    (o): o is NonNullable<typeof o> => o !== undefined,
  );

  /** Interruptor: segundo toque desarma; dentro de un grupo `single` solo uno. */
  function toggleChip(optionId: string): void {
    const option = optionsById.value.get(optionId);
    if (!option) return;
    setArmed((prev) => {
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId);
      const group = modifierGroups.value.find((g) => g.id === option.groupId);
      const cleaned =
        group?.type === 'single'
          ? prev.filter((id) => optionsById.value.get(id)?.groupId !== option.groupId)
          : prev;
      return [...cleaned, optionId];
    });
  }

  function shake(ids: string[]): void {
    if (ids.length === 0) return;
    setShaking(ids);
    later(() => setShaking([]), SHAKE_MS);
  }

  /* ---- Servir ---- */

  function pulse(): void {
    setTick(true);
    later(() => setTick(false), 260);
  }

  async function reloadOrders(): Promise<Order[]> {
    const fresh = await listOrders(event!.id);
    setOrders(fresh);
    // Sin esto, `now` se queda en el instante del montaje y el ritmo de la
    // última hora ignora lo que se acaba de servir hasta el siguiente tic.
    setNow(new Date());
    return fresh;
  }

  async function persistOrder(
    toServe: TicketLine[],
    payment: PaymentResult | null,
  ): Promise<Order> {
    return addOrder({
      eventId: event!.id,
      mode: event!.mode,
      lines: toServe.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        modifiers: l.modifiers,
        qty: l.qty,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        usage: l.usage,
        note: l.note,
      })),
      ...(payment
        ? { payment: payment.payment, tip: payment.tip, cashGiven: payment.cashGiven }
        : {}),
    });
  }

  /** Deshacer: anula el pedido y devuelve las líneas al ticket. */
  function undoServe(order: Order, served: TicketLine[], restore: boolean): void {
    void (async () => {
      await voidOrder(order.id, 'deshacer');
      await reloadOrders();
      if (restore) restoreTicket(served);
      showToast('Pedido deshecho', null, 4000);
    })();
  }

  async function serve(toServe: TicketLine[], payment: PaymentResult | null): Promise<void> {
    // Sin candado: en modo un toque hay que aguantar tres toques seguidos sin
    // perder ninguno. Cada pedido es una fila con su uuid, no se pisan.
    if (toServe.length === 0) return;
    const drinks = toServe.reduce((sum, l) => sum + l.qty, 0);
    const order = await persistOrder(toServe, payment);
    await reloadOrders();
    pulse();
    showToast(
      `${formatInt(drinks)} ${drinks === 1 ? 'bebida servida' : 'bebidas servidas'}`,
      { label: 'Deshacer', onAction: () => undoServe(order, toServe, !oneTap.value) },
      8000,
    );
  }

  /**
   * Servir el ticket. Se vacía al instante —una bebida tocada durante el fundido
   * no se puede perder— y lo que se desvanece durante 180 ms es una copia.
   */
  async function serveTicket(payment: PaymentResult | null): Promise<void> {
    const toServe = lines;
    if (toServe.length === 0) return;
    setFading(toServe);
    setServing(true);
    setSheetOpen(false);
    clearTicket();
    later(() => {
      setServing(false);
      setFading([]);
    }, SERVE_FADE_MS);
    await serve(toServe, payment);
  }

  /* ---- Tocar un producto ---- */

  function onTile(product: Product): void {
    const options = armed
      .map((id) => optionsById.value.get(id))
      .filter((o): o is NonNullable<typeof o> => o !== undefined);
    const { line, ignored } = buildLine(product, options, ingredients.value, modifierGroups.value);
    shake(ignored.map((i) => i.optionId));
    setArmed([]);
    if (oneTap.value) void serve([line], null);
    else addLine(line);
  }

  /* ---- Cabecera ---- */

  const stockCafe = event.stockStart['cafe'] ?? 0;
  const usedCafe = consumption['cafe'] ?? 0;
  const remainingCafe = Math.max(0, stockCafe - usedCafe);
  const cafePct = stockCafe > 0 ? (remainingCafe / stockCafe) * 100 : 0;
  const meterState = cafePct < 10 ? 'danger' : cafePct < 25 ? 'warn' : 'ok';

  const recent: RecentDrink[] = orders
    .filter((o) => o.voidedAt === null)
    .slice(-5)
    .reverse()
    .map((o) => ({
      id: o.id,
      label: o.lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ''}${l.productName}`).join(', '),
      servedAt: o.servedAt,
    }));

  async function pause(): Promise<void> {
    setBusy(true);
    await pauseEvent(event!.id);
    await refreshEvents();
    setBusy(false);
    route('/');
  }

  const editingProduct = editing ? products.find((p) => p.id === editing.productId) : undefined;
  const drinks = ticketDrinks(lines);

  function onServeButton(): void {
    if (event!.mode === 'venta') setPaying(true);
    else void serveTicket(null);
  }

  const ticketProps = {
    lines,
    displayLines: serving && lines.length === 0 ? fading : lines,
    mode: event.mode,
    oneTap: oneTap.value,
    recent,
    serving,
    onEdit: (line: TicketLine) => setEditing(line),
    onQty: setQty,
    onUndoLast: undoLast,
    onServe: onServeButton,
  };

  return (
    <div class="barra">
      <header class="barra__header">
        <span class="wordmark">Mutuo.</span>
        <span class="barra__event">{event.name}</span>

        <div class="barra__count">
          <span class={['barra__count-value', 'num', tick ? 'is-tick' : ''].filter(Boolean).join(' ')}>
            {formatInt(stats.served)}
          </span>
          <span class="barra__count-label">servidas</span>
        </div>

        <span class="barra__rate num" title="Bebidas de espresso en los últimos 60 minutos">
          {formatRate(stats.lastHourRate)}
        </span>

        {stockCafe > 0 ? (
          <div class={`meter meter--${meterState}`} title={`Café restante: ${formatQty(remainingCafe, 'g')}`}>
            <span class="meter__track">
              <span class="meter__fill" style={{ width: `${Math.max(0, Math.min(100, cafePct))}%` }} />
            </span>
            <span class="meter__value num">
              {formatQty(remainingCafe, 'g')} · {Math.round(cafePct)} %
            </span>
          </div>
        ) : (
          <button type="button" class="barra__nostock" onClick={() => route(`/evento/${event.id}`)}>
            Sin carga registrada
          </button>
        )}

        <div class="barra__actions">
          <button
            type="button"
            class="switch"
            aria-pressed={oneTap.value}
            onClick={() => void setOneTap(!oneTap.value)}
          >
            <Zap size={20} strokeWidth={1.75} /> Un toque
          </button>
          <button
            type="button"
            class="switch"
            aria-pressed={theme.value === 'night'}
            onClick={() => void setTheme(theme.value === 'night' ? 'light' : 'night')}
          >
            {theme.value === 'night' ? (
              <Moon size={20} strokeWidth={1.75} />
            ) : (
              <Sun size={20} strokeWidth={1.75} />
            )}{' '}
            Noche
          </button>
          <Button onClick={() => route(`/evento/${event.id}/resumen`)}>Resumen</Button>
          <Button disabled={busy} onClick={() => void pause()}>
            <Pause size={20} strokeWidth={1.75} /> Pausar
          </Button>
          <Button onClick={() => route(`/evento/${event.id}/cerrar`)}>Cerrar evento</Button>
        </div>
      </header>

      <div class="barra__cols">
        <div class="barra__work">
          <div class="chips" role="group" aria-label="Modificadores rápidos">
            {chipOptions.map((option) => (
              <Chip
                key={option.id}
                armed={armed.includes(option.id)}
                shake={shaking.includes(option.id)}
                onClick={() => toggleChip(option.id)}
              >
                {CHIP_LABEL[option.id] ?? option.name}
              </Chip>
            ))}
          </div>

          <div class="tabs" role="tablist" aria-label="Categorías">
            {categories.map((cat) => (
              <button
                type="button"
                class="tab"
                key={cat}
                role="tab"
                aria-selected={cat === currentCategory}
                style={{ '--cat': CATEGORY_COLOR[cat] }}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div class="grid-wrap">
            <div class="tile-grid">
              {products
                .filter((p) => p.category === currentCategory)
                .map((product) => (
                  <Tile
                    key={product.id}
                    label={product.shortName}
                    accent={CATEGORY_COLOR[product.category]}
                    {...(event.mode === 'venta'
                      ? { price: `${product.price.toFixed(2).replace('.', ',')} €` }
                      : {})}
                    onClick={() => onTile(product)}
                  />
                ))}
            </div>
          </div>
        </div>

        <TicketPanel {...ticketProps} />
      </div>

      {/* Vertical o pantalla estrecha: barra inferior de 72 px que se despliega. */}
      <div class="ticket-bar">
        <button type="button" class="ticket-bar__label" onClick={() => setSheetOpen(true)}>
          {oneTap.value ? 'Modo un toque activo' : `Pedido (${formatInt(drinks)})`}
          {event.mode === 'venta' && drinks > 0
            ? ` · ${ticketTotal(lines).toFixed(2).replace('.', ',')} €`
            : ''}
        </button>
        <Button variant="primary" action disabled={drinks === 0} onClick={onServeButton}>
          {drinks === 0 ? 'Toca una bebida' : event.mode === 'venta' ? 'Cobrar' : 'Servir'}
        </Button>
      </div>

      {sheetOpen ? (
        <>
          <div class="sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <TicketPanel {...ticketProps} sheet onCollapse={() => setSheetOpen(false)} />
        </>
      ) : null}

      {editing && editingProduct ? (
        <LineSheet
          line={editing}
          product={editingProduct}
          groups={modifierGroups.value}
          options={modifierOptions.value}
          ingredients={ingredients.value}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {paying ? (
        <PaymentSheet
          subtotal={ticketTotal(lines)}
          drinks={drinks}
          onClose={() => setPaying(false)}
          onConfirm={(result) => {
            setPaying(false);
            void serveTicket(result);
          }}
        />
      ) : null}

      <span class="visually-hidden" aria-live="polite">
        {formatInt(stats.served)} bebidas servidas a las {formatTime(now)}
      </span>
    </div>
  );
}
