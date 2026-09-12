/**
 * La barra — SPEC §3.2 y UX-REVISION-1 §C y §F.
 *
 * Pantalla caliente: cinco segundos por interacción, manos mojadas, cola de
 * seis. Nada de diálogos de confirmación; se sirve y se ofrece «Deshacer».
 *
 * La cabecera tiene una sola salida terminal —«Cerrar barra»— y una salida
 * blanda —«‹ Eventos»—, que no cierra nada. «Pausar» no existía para el
 * barista: no se distinguía de cerrar.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { ChevronLeft, Moon, Sun, Zap } from 'lucide-preact';
import {
  addOrder,
  listOrders,
  replaceOrderLines,
  resetEvent,
  undoResetEvent,
  unvoidOrder,
  voidOrder,
} from '../data/repo';
import {
  VOID_DESHACER,
  VOID_EDITADO,
  type Category,
  type ModifierOption,
  type Order,
  type Product,
} from '../data/types';
import { enPausa, eventConsumption, eventStats } from '../domain/stats';
import { formatInt, formatQty, formatRate, formatTime } from '../domain/format';
import { Button, HojaAbajo, HojaFila, Sheet, Tile } from '../ui/components';
import { useIr } from '../ui/navegar';
import { clearToasts, showToast, TOAST_ACTION_MS } from '../ui/toast';
import {
  CATEGORY_COLOR,
  ExtrasRow,
  LineSheet,
  PaymentSheet,
  TicketHoja,
  TicketPanel,
  type PaymentResult,
} from '../ui/barra-parts';
import { fraseDePartes, ultimosPedidos, type UltimoPedido } from '../ui/ultimos';
import { categoriasDe, ordenarTiles } from '../ui/orden';
import { Pasos } from '../ui/pasos';
import { ResumenContenido } from './resumen';
import {
  activeProducts,
  eventById,
  ingredients,
  modifierGroups,
  modifierOptions,
  oneTap,
  optionsById,
  pausarServicio,
  reanudarServicio,
  refreshEvents,
  setOneTap,
  setTheme,
} from '../ui/store';
import { theme } from '../ui/theme';
import {
  addLine,
  buildLine,
  clearTicket,
  contentFor,
  detachTicket,
  devolverTicketA,
  editingOrderId,
  lastLine,
  lineContent,
  loadTicket,
  replaceLine,
  restoreTicket,
  setEditingOrder,
  setQty,
  ticket,
  ticketDrinks,
  ticketTotal,
  toggleOption,
  undoLast,
  vaciarTicketDe,
  type TicketLine,
} from '../ui/ticket';
import { PanelReinicio } from '../ui/reinicio';
import { barMode, esMovil } from '../ui/layout';

const SERVE_FADE_MS = 180;

/** El fundido de la fila que se acaba de repetir. Sin ventanas emergentes. */
const REPEAT_FLASH_MS = 600;

export function Barra() {
  const route = useIr();
  const { params } = useRoute();
  const eventId = params['id'];
  const event = eventById(eventId);

  const [orders, setOrders] = useState<Order[]>([]);
  /**
   * La línea cuyos extras enseña la fila. Es una preferencia, no la verdad: si
   * la línea desaparece (al servir, al deshacer, al recargar) manda la última
   * por orden de llegada, que es lo que el barista acaba de tocar.
   */
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  /**
   * Modo Rápido: el pedido ya servido que la fila puede seguir editando durante
   * los 8 s que vive su «Deshacer».
   */
  const [quickEdit, setQuickEdit] = useState<{
    orderId: string;
    productId: string;
    productName: string;
    optionIds: string[];
    note: string;
  } | null>(null);
  const [editing, setEditing] = useState<TicketLine | null>(null);
  const [paying, setPaying] = useState(false);
  const [serving, setServing] = useState(false);
  /** Copia del ticket recién servido, solo para el fundido de 180 ms. */
  const [fading, setFading] = useState<TicketLine[]>([]);
  const [tick, setTick] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** La hoja de Resumen. `'pedidos'` la abre directamente en su lista de pedidos. */
  const [resumenOpen, setResumenOpen] = useState<'todo' | 'pedidos' | null>(null);
  /**
   * La hoja «Más» del móvil. En un iPhone no caben en la cabecera los cuatro
   * controles que no son servir; aquí abajo sí, y con sitio para explicarlos.
   */
  const [masOpen, setMasOpen] = useState(false);
  /**
   * El panel de «Empezar de cero», desplegado dentro de la hoja «Más». Es la
   * primera de las dos validaciones: dice qué se anula antes de ofrecer el
   * botón que hay que mantener pulsado.
   */
  const [reinicioAbierto, setReinicioAbierto] = useState(false);
  /** El pedido que se acaba de repetir, para el fundido de su fila. */
  const [repetido, setRepetido] = useState<string | null>(null);
  /** La fila de «Últimos pedidos» desplegada. Solo una a la vez. */
  const [abierto, setAbierto] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

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

  /**
   * Grid continuo: un solo flujo de tiles ordenado por categoría y `sortOrder`,
   * sin filas de encabezado. Las seis categorías con encabezado medían 871 px
   * en un hueco de 652; así caben las catorce bebidas en cuatro filas.
   */
  const tiles = useMemo(() => ordenarTiles(products), [products]);
  const categorias = useMemo(() => categoriasDe(products), [products]);
  /**
   * Pestaña activa del grid. `null` es «Todas», que es lo que ve el barista al
   * abrir: con catorce bebidas caben todas, y filtrar es para cuando la carta
   * crezca o para buscar rápido dentro de un grupo.
   */
  const [categoriaActiva, setCategoriaActiva] = useState<Category | null>(null);
  const tilesVisibles = useMemo(
    () => (categoriaActiva === null ? tiles : tiles.filter((p) => p.category === categoriaActiva)),
    [tiles, categoriaActiva],
  );

  if (!event || event.status !== 'live') {
    return (
      <section class="stack" style={{ padding: 'var(--s-6)' }}>
        <h1 class="display">Esta barra no está abierta</h1>
        <p class="meta">Ábrela desde la lista de eventos para registrar bebidas.</p>
        <div class="row">
          <Button variant="primary" onClick={() => route('/')}>
            Ir a Eventos
          </Button>
        </div>
      </section>
    );
  }

  const lines = ticket.value;
  /**
   * El pedido servido que se está corrigiendo. Sale de un signal persistido, no
   * de un `useState`: recargar la página en medio de una corrección tiene que
   * devolver la cabecera «Editando el pedido de 09:54», no un pedido nuevo con
   * las líneas de uno viejo dentro.
   */
  const editandoId = editingOrderId.value;
  const editando: Order | null = editandoId
    ? (orders.find((o) => o.id === editandoId) ?? null)
    : null;
  /** Corrigiendo, el modo Rápido queda en pausa: hay que montar y luego servir. */
  const rapido = oneTap.value && editandoId === null;
  /**
   * Servicio parado. El evento sigue abierto —una boda va en dos turnos y la
   * parada de la cena no es el final de la barra—, pero no se puede tocar una
   * bebida: en el bolsillo o en la bandeja, un toque suelto es una bebida que
   * nadie sirvió. Lo demás —Resumen, «Últimos pedidos»— se sigue pudiendo ver,
   * y el pedido a medias que hubiera se conserva tal cual.
   */
  const pausado = enPausa(event);
  const stats = eventStats(event, orders, products, now);
  const consumption = eventConsumption(orders);

  /* ---- La bebida actual y sus extras ---- */

  /**
   * La línea que la fila de extras está editando. `currentLineId` es lo que el
   * barista eligió; si esa línea ya no está, la actual es la última que llegó.
   */
  const currentLine: TicketLine | null =
    lines.find((l) => l.id === currentLineId) ?? lastLine(lines);

  /** La bebida que enseña la fila: la del pedido en curso, o la recién servida. */
  const actual = quickEdit
    ? { productName: quickEdit.productName, optionIds: quickEdit.optionIds }
    : currentLine
      ? { productName: currentLine.productName, optionIds: currentLine.optionIds }
      : null;
  const actualProductId = quickEdit?.productId ?? currentLine?.productId;
  const actualProduct = actualProductId
    ? products.find((p) => p.id === actualProductId)
    : undefined;

  function optionsOf(ids: string[]): ModifierOption[] {
    return ids
      .map((id) => optionsById.value.get(id))
      .filter((o): o is ModifierOption => o !== undefined);
  }

  /**
   * Tocar un extra. En modo normal cambia esa línea del pedido (y si al hacerlo
   * coincide con otra, se fusionan). En modo Rápido reescribe las líneas del
   * pedido ya guardado, sin crear otro.
   */
  function onExtra(option: ModifierOption): void {
    if (quickEdit) {
      void aplicarAServido(option);
      return;
    }
    const line = currentLine;
    if (!line) return;
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    const nextIds = toggleOption(line.optionIds, option, modifierGroups.value, modifierOptions.value);
    const { content } = contentFor(
      product,
      optionsOf(nextIds),
      ingredients.value,
      modifierGroups.value,
      line.note,
    );
    const resultId = replaceLine(line.id, { ...lineContent(line), ...content });
    setCurrentLineId(resultId);
  }

  /** Modo Rápido: el extra entra en el pedido que se acaba de guardar. */
  async function aplicarAServido(option: ModifierOption): Promise<void> {
    const target = quickEdit;
    if (!target) return;
    const product = products.find((p) => p.id === target.productId);
    if (!product) return;
    const nextIds = toggleOption(
      target.optionIds,
      option,
      modifierGroups.value,
      modifierOptions.value,
    );
    const { content } = contentFor(
      product,
      optionsOf(nextIds),
      ingredients.value,
      modifierGroups.value,
      target.note,
    );
    setQuickEdit({ ...target, optionIds: content.optionIds });
    await replaceOrderLines(target.orderId, [
      {
        productId: content.productId,
        productName: content.productName,
        modifiers: content.modifiers,
        qty: 1,
        unitPrice: content.unitPrice,
        unitCost: content.unitCost,
        usage: content.usage,
        note: content.note,
      },
    ]);
    await reloadOrders();
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
    corrige: Order | null = null,
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
      // Corregir conserva la hora del original: la bebida se sirvió cuando se
      // sirvió, y moverla al presente falsearía las franjas de media hora y el
      // ritmo de la última hora. `createdAt` sí es ahora: es cuando se escribió.
      ...(corrige ? { servedAt: corrige.servedAt, replacesOrderId: corrige.id } : {}),
    });
  }

  /** Deshacer: anula el pedido y devuelve las líneas al ticket. */
  function undoServe(order: Order, served: TicketLine[], restore: boolean): void {
    void (async () => {
      await voidOrder(order.id, VOID_DESHACER);
      await reloadOrders();
      // Un pedido anulado ya no se puede editar desde la fila.
      setQuickEdit((prev) => (prev?.orderId === order.id ? null : prev));
      if (restore) {
        restoreTicket(served);
        setCurrentLineId(null);
      }
      showToast('Pedido deshecho');
    })();
  }

  /**
   * Deshacer una corrección: se anula el pedido nuevo y **vuelve** el original,
   * con su hora, su cobro y sus líneas de antes. Nada se borra: las dos filas
   * siguen en la base y en el Resumen.
   */
  function undoEdit(nuevo: Order, original: Order): void {
    void (async () => {
      await voidOrder(nuevo.id, VOID_DESHACER);
      await unvoidOrder(original.id);
      await reloadOrders();
      setAbierto(null);
      showToast('Corrección deshecha');
    })();
  }

  async function serve(
    toServe: TicketLine[],
    payment: PaymentResult | null,
    corrige: Order | null = null,
  ): Promise<void> {
    // Sin candado: en modo rápido hay que aguantar tres toques seguidos sin
    // perder ninguno. Cada pedido es una fila con su uuid, no se pisan.
    if (toServe.length === 0) return;
    const drinks = toServe.reduce((sum, l) => sum + l.qty, 0);
    const order = await persistOrder(toServe, payment, corrige);
    // El original se anula **después** de escribir el nuevo: si algo fallara en
    // medio, lo que queda es el pedido de siempre, no un hueco.
    if (corrige) await voidOrder(corrige.id, VOID_EDITADO);
    await reloadOrders();
    // Entra un pedido nuevo: la fila desplegada se cierra. La lista se reordena
    // debajo y, si no, quedaría abierto un pedido distinto del que se miraba.
    // Va aquí y no en `serveTicket` para que valga también en modo Rápido.
    setAbierto(null);
    pulse();

    if (corrige) {
      showToast('Pedido corregido', {
        label: 'Deshacer',
        onAction: () => undoEdit(order, corrige),
      });
      return;
    }

    // Modo Rápido con una sola bebida: la fila la sigue editando mientras vive
    // el «Deshacer». Pasados los 8 s vuelve al estado vacío.
    const única = toServe.length === 1 && toServe[0]!.qty === 1 ? toServe[0]! : null;
    if (oneTap.value && única) {
      setQuickEdit({
        orderId: order.id,
        productId: única.productId,
        productName: única.productName,
        optionIds: única.optionIds,
        note: única.note,
      });
      later(
        () => setQuickEdit((prev) => (prev?.orderId === order.id ? null : prev)),
        TOAST_ACTION_MS,
      );
    }

    showToast(`${formatInt(drinks)} ${drinks === 1 ? 'bebida servida' : 'bebidas servidas'}`, {
      label: 'Deshacer',
      onAction: () => undoServe(order, toServe, !oneTap.value),
    });
  }

  /**
   * Servir el ticket. Se vacía al instante —una bebida tocada durante el fundido
   * no se puede perder— y lo que se desvanece durante 180 ms es una copia.
   */
  async function serveTicket(payment: PaymentResult | null): Promise<void> {
    const toServe = lines;
    if (toServe.length === 0) return;
    // Se captura antes de vaciar: `clearTicket` cierra también la corrección.
    const corrige = editando;
    setFading(toServe);
    setServing(true);
    setSheetOpen(false);
    clearTicket();
    // Servido el pedido, la fila de extras vuelve al estado vacío.
    setCurrentLineId(null);
    later(() => {
      setServing(false);
      setFading([]);
    }, SERVE_FADE_MS);
    await serve(toServe, payment, corrige);
  }

  /* ---- Tocar un producto ---- */

  /**
   * Tocar una bebida. Ya no arrastra ningún prefijo: la bebida entra tal cual y
   * pasa a ser la actual, así que sus extras aparecen arriba para el toque
   * siguiente.
   */
  function onTile(product: Product): void {
    // Con el servicio parado no se registra nada: el botón ya sale apagado,
    // pero el estado manda sobre el botón.
    if (pausado) return;
    const { line } = buildLine(product, [], ingredients.value, modifierGroups.value);
    // Corrigiendo un pedido, el toque **no** sirve aunque Rápido esté puesto:
    // la corrección se monta entera y se confirma con «Servir».
    if (rapido) void serve([line], null);
    else setCurrentLineId(addLine(line));
  }

  /* ---- Cabecera ---- */

  const stockCafe = event.stockStart['cafe'] ?? 0;
  const usedCafe = consumption['cafe'] ?? 0;
  const remainingCafe = Math.max(0, stockCafe - usedCafe);
  const cafePct = stockCafe > 0 ? (remainingCafe / stockCafe) * 100 : 0;
  const meterState = cafePct < 10 ? 'danger' : cafePct < 25 ? 'warn' : 'ok';

  const ultimos = ultimosPedidos(orders);

  /**
   * Reconstruye las líneas de un pedido servido para volver a pedirlo.
   *
   * Se recalculan la receta, el coste y el precio con la carta de **ahora**:
   * repetir es pedir lo mismo otra vez, no clonar un cobro antiguo. Si una
   * bebida ya no está activa en la carta, esa línea se cae; el pedido se repite
   * con lo que quede y, si no queda nada, se avisa y no pasa nada más.
   */
  function lineasDe(pedidoId: string): TicketLine[] {
    const order = orders.find((o) => o.id === pedidoId);
    if (!order) return [];
    const out: TicketLine[] = [];
    for (const l of order.lines) {
      const product = products.find((p) => p.id === l.productId);
      if (!product) continue;
      const { line } = buildLine(
        product,
        optionsOf(l.modifiers.map((m) => m.optionId)),
        ingredients.value,
        modifierGroups.value,
        l.note,
      );
      out.push({ ...line, qty: l.qty });
    }
    return out;
  }

  /**
   * «Repetir». En modo normal las líneas caen en el pedido actual y se agrupan
   * con lo que ya hubiera; en Rápido se sirven al momento, con su «Deshacer»,
   * porque en ese modo no hay pedido en el que dejarlas.
   */
  function onRepetir(pedido: UltimoPedido): void {
    const nuevas = lineasDe(pedido.id);
    if (nuevas.length === 0) {
      showToast('Esa bebida ya no está en la carta');
      return;
    }
    setRepetido(pedido.id);
    later(() => setRepetido((prev) => (prev === pedido.id ? null : prev)), REPEAT_FLASH_MS);

    if (rapido) {
      void serve(nuevas, null);
      return;
    }
    let ultimo: string | null = null;
    for (const line of nuevas) ultimo = addLine(line);
    setCurrentLineId(ultimo);
  }

  /**
   * «Editar»: las líneas del pedido servido caen en el pedido actual —receta,
   * coste y precio recalculados con la carta de ahora, igual que «Repetir»— y
   * la cabecera pasa a «Editando el pedido de 09:54».
   *
   * El pedido original **no se toca** hasta confirmar: si el barista cancela o
   * cierra la barra, lo servido sigue tal cual estaba.
   */
  function onEditarPedido(pedido: UltimoPedido): void {
    // El botón ya sale deshabilitado, pero el estado manda sobre el botón:
    // mezclar una corrección con un pedido a medias serviría las dos cosas
    // juntas y anularía el original por el camino.
    if (lines.length > 0) return;
    const nuevas = lineasDe(pedido.id);
    if (nuevas.length === 0) {
      showToast('Esa bebida ya no está en la carta');
      return;
    }
    let ultimo: string | null = null;
    for (const line of nuevas) ultimo = addLine(line);
    setCurrentLineId(ultimo);
    // Después de añadir las líneas: con el ticket vacío, la corrección se cierra
    // sola (es un estado imposible).
    setEditingOrder(pedido.id);
    setAbierto(null);
  }

  /** «Anular» desde la fila desplegada. Nunca borra: `voidedAt` y su motivo. */
  function onAnularPedido(pedido: UltimoPedido, motivoId: string): void {
    void (async () => {
      await voidOrder(pedido.id, motivoId);
      // Corregir un pedido que se acaba de anular no significa nada.
      if (editingOrderId.value === pedido.id) clearTicket();
      await reloadOrders();
      setAbierto(null);
      showToast(`Anulado · ${fraseDePartes(pedido.partes)}`, {
        label: 'Deshacer',
        onAction: () => {
          void (async () => {
            await unvoidOrder(pedido.id);
            await reloadOrders();
            showToast('Anulación deshecha');
          })();
        },
      });
    })();
  }

  /**
   * «Empezar de cero». No borra nada: los pedidos vivos quedan anulados con
   * motivo `reinicio` y el reloj de la barra vuelve a ahora. La carga, las
   * notas y los datos del evento no se tocan.
   *
   * Tercera red de seguridad, después del panel y de la pulsación mantenida:
   * ocho segundos de «Deshacer» que devuelven los pedidos, el reloj, los tramos
   * de pausa y el pedido que estuviera a medias.
   */
  function reiniciarEvento(): void {
    void (async () => {
      setMasOpen(false);
      setReinicioAbierto(false);
      const guardado = vaciarTicketDe(event!.id);
      const antes = await resetEvent(event!.id);
      await reloadOrders();
      await refreshEvents();
      setCurrentLineId(null);
      setQuickEdit(null);
      setAbierto(null);
      showToast('Evento reiniciado', {
        label: 'Deshacer',
        onAction: () => {
          void (async () => {
            await undoResetEvent(event!.id, antes);
            devolverTicketA(event!.id, guardado);
            await reloadOrders();
            await refreshEvents();
            showToast('Reinicio deshecho');
          })();
        },
      });
    })();
  }

  const editingProduct = editing ? products.find((p) => p.id === editing.productId) : undefined;
  const drinks = ticketDrinks(lines);
  /**
   * El último pedido servido, que en el móvil ocupa la barra de abajo mientras
   * el pedido actual está vacío: es lo que el barista se pregunta cuando
   * levanta la cabeza, y ahí no hacía falta un «(0)».
   */
  const ultimo = ultimos[0] ?? null;
  const verUltimo = esMovil.value && !pausado && !editando && !rapido && drinks === 0;

  /**
   * Servir (o cobrar). Corrigiendo en modo venta y con el **mismo total**, no
   * se vuelve a abrir la hoja de cobro: ya está cobrado y el método era el que
   * era. Si el total cambia sí hay que preguntar, con el método del original
   * ya marcado.
   */
  function onServeButton(): void {
    if (event!.mode !== 'venta') {
      void serveTicket(null);
      return;
    }
    const mismoTotal = editando !== null && Math.abs(ticketTotal(lines) - editando.subtotal) < 0.005;
    if (editando && mismoTotal && editando.payment) {
      void serveTicket({
        payment: editando.payment,
        tip: editando.tip,
        cashGiven: editando.cashGiven,
      });
      return;
    }
    setPaying(true);
  }

  const ticketProps = {
    lines,
    displayLines: serving && lines.length === 0 ? fading : lines,
    mode: event.mode,
    oneTap: oneTap.value,
    ultimos,
    repetido,
    abierto,
    onAbrir: setAbierto,
    now,
    onRepetir,
    onEditar: onEditarPedido,
    onAnular: onAnularPedido,
    onVerTodos: () => setResumenOpen('pedidos'),
    editandoDe: editando?.servedAt ?? null,
    onCancelarEdicion: () => {
      clearTicket();
      setCurrentLineId(null);
    },
    serving,
    pausado,
    onReanudar: () => {
      void reanudarServicio(event.id);
      showToast('Servicio reanudado');
    },
    currentLineId: currentLine?.id ?? null,
    onSelect: (line: TicketLine) => setCurrentLineId(line.id),
    onEdit: (line: TicketLine) => setEditing(line),
    onQty: setQty,
    onUndoLast: () => {
      undoLast();
      // La fila pasa a la línea anterior: el id que había ya no existe y manda
      // la última por orden de llegada.
      setCurrentLineId(null);
    },
    onServe: onServeButton,
  };

  return (
    <div class="barra">
      <header class={['barra__header', pausado ? 'is-pausa' : ''].filter(Boolean).join(' ')}>
        {/* En móvil se queda solo el chevrón: la etiqueta accesible sigue
            diciendo a dónde lleva, que es lo que lee VoiceOver. */}
        <Button class="barra__salir" aria-label="Volver a Eventos" onClick={() => route('/')}>
          <ChevronLeft size={20} strokeWidth={1.75} />
          <span class="solo-ancho">Eventos</span>
        </Button>

        <div class="barra__ident">
          <span class="barra__event" title={event.name}>
            {event.name}
          </span>
          <Pasos eventId={event.id} status={event.status} compact />
        </div>

        {/* La cifra es tocable: abre el Resumen en su lista de pedidos, que es
            el histórico entero con su «Anular». Sigue leyéndose como una cifra
            —no como un botón— pero mide 44 px y responde al toque: quien mira
            el número es justo quien quiere saber qué hay detrás. */}
        <button
          type="button"
          class="barra__count"
          aria-label="Ver el histórico de bebidas servidas"
          onClick={() => setResumenOpen('pedidos')}
        >
          <span class={['barra__count-value', 'num', tick ? 'is-tick' : ''].filter(Boolean).join(' ')}>
            {formatInt(stats.served)}
          </span>
          <span class="barra__count-label">servidas</span>
        </button>

        {/* En pausa el ritmo caería solo hasta cero sin que pase nada: decirlo
            es más honesto que enseñar un número que se desmorona. */}
        {pausado ? (
          <span class="barra__pausa" title="El servicio está parado; el evento sigue abierto">
            En pausa
          </span>
        ) : (
          <span class="barra__rate num" title="Bebidas de espresso en los últimos 60 minutos">
            {formatRate(stats.lastHourRate)}
          </span>
        )}

        {stockCafe > 0 ? (
          // `title` no existe en un móvil: no hay ratón que se pare encima. Los
          // gramos, que en móvil se esconden para que la cabecera quepa en una
          // fila, solo los diría el `title` a quien pudiera verlo. Con
          // `aria-label` los dice también VoiceOver.
          <div
            class={`meter meter--${meterState}`}
            title={`Café restante: ${formatQty(remainingCafe, 'g')}`}
            aria-label={`Café restante: ${formatQty(remainingCafe, 'g')}, el ${String(Math.round(cafePct))} % de la carga`}
          >
            <span class="meter__track">
              <span
                class="meter__fill"
                style={{ '--pct': Math.max(0, Math.min(100, cafePct)) / 100 }}
              />
            </span>
            {/* En móvil el medidor se queda en la barra corta y el porcentaje:
                los gramos no caben en una cabecera de una sola fila y el
                `title` los sigue diciendo. */}
            <span class="meter__value num">
              <span class="solo-ancho">{`${formatQty(remainingCafe, 'g')} · `}</span>
              {`${String(Math.round(cafePct))} %`}
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
            class="switch switch--stacked"
            aria-pressed={oneTap.value}
            onClick={() => {
              setQuickEdit(null);
              void setOneTap(!oneTap.value);
            }}
          >
            <Zap size={20} strokeWidth={1.75} />
            <span class="switch__text">
              <span class="switch__label">Rápido</span>
              {/* Corto a propósito: el ancho de la cabecera es el que es y el
                  subtítulo sube de 13 a 15 px (DESIGN.md: nada por debajo de 15
                  en la barra). «Un toque, una bebida» dice lo mismo en menos
                  sitio y a un tamaño que se lee a 75 cm. Lo que hacen los
                  extras en este modo lo explica la propia fila. */}
              <span class="switch__hint">un toque, una bebida</span>
            </span>
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
          <Button onClick={() => setResumenOpen('todo')}>Resumen</Button>
          <Button class="barra__cerrar" onClick={() => route(`/evento/${event.id}/cerrar`)}>
            Cerrar barra
          </Button>
        </div>

        {/* Solo en móvil (lo esconde el CSS por encima de 560 px): lo que no
            cabe en una cabecera de una fila vive en una hoja de abajo. */}
        <Button class="barra__mas" aria-haspopup="dialog" onClick={() => setMasOpen(true)}>
          Más
        </Button>
      </header>

      <div class="barra__cols">
        <div class="barra__work">
          {/* Los extras van después de la bebida, no antes: la fila enseña los
              de la última tocada y solo los que esa bebida admite. */}
          <ExtrasRow
            actual={actual}
            product={actualProduct}
            groups={modifierGroups.value}
            options={modifierOptions.value}
            oneTap={oneTap.value}
            {...(oneTap.value && quickEdit ? { ayuda: 'servida' } : {})}
            onToggle={onExtra}
          />

          {/* Pestañas de la carta: «Todas» primero y por defecto. Filtran el
              grid en el sitio; el punto de color dice de qué categoría es cada
              tile cuando están todas juntas. */}
          {/* `aria-controls` apunta al grid, que es el panel que filtran: una
              pestaña que no dice qué gobierna no es una pestaña para un lector
              de pantalla, es un botón suelto. */}
          <div class="cat-tabs" role="tablist" aria-label="Categorías de la carta">
            <button
              type="button"
              role="tab"
              class="cat-tabs__item"
              aria-selected={categoriaActiva === null}
              aria-controls="carta-grid"
              onClick={() => setCategoriaActiva(null)}
            >
              Todas
            </button>
            {categorias.map((category) => (
              <button
                type="button"
                role="tab"
                class="cat-tabs__item"
                key={category}
                aria-selected={categoriaActiva === category}
                aria-controls="carta-grid"
                onClick={() => setCategoriaActiva(category)}
              >
                <span class="cat-tabs__punto" style={{ '--cat': CATEGORY_COLOR[category] }} />
                {category}
              </button>
            ))}
          </div>

          {/* Un solo grid continuo: los tiles miden lo mismo en toda la
              pantalla, van ordenados por categoría y no hay huecos raros. */}
          <div
            class="grid-wrap"
            ref={gridRef}
            id="carta-grid"
            role="tabpanel"
            aria-label={categoriaActiva === null ? 'Todas las bebidas' : `Bebidas de ${categoriaActiva}`}
          >
            <div class="tile-grid">
              {tilesVisibles.map((product) => (
                <Tile
                  key={product.id}
                  label={product.shortName}
                  accent={CATEGORY_COLOR[product.category]}
                  data-cat={product.category}
                  disabled={pausado}
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

      {/* Vertical o pantalla estrecha: barra inferior de 72 px que se despliega.
          Con la hoja abierta se esconde: si no, su «Servir» asoma por detrás
          del de la hoja y quedan dos botones iguales, uno de ellos muerto. */}
      <div class={['ticket-bar', sheetOpen ? 'is-oculta' : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          class={['ticket-bar__label', verUltimo ? 'is-ultimo' : ''].filter(Boolean).join(' ')}
          onClick={() => {
            // Tocando el último pedido, la hoja se abre con ese pedido ya
            // desplegado: «Últimos pedidos» lo desplaza a la vista al montarse.
            if (verUltimo && ultimo) setAbierto(ultimo.id);
            setSheetOpen(true);
          }}
        >
          <span class="ticket-bar__texto">
            {pausado ? (
              `Servicio en pausa${drinks > 0 ? ` · pedido (${formatInt(drinks)}) guardado` : ''}`
            ) : editando ? (
              `Editando el de ${formatTime(editando.servedAt)}`
            ) : rapido ? (
              'Modo rápido activo'
            ) : verUltimo ? (
              // Con el pedido vacío, «Pedido actual (0)» no dice nada que el
              // botón de al lado no diga ya. En su sitio, lo último servido.
              ultimo ? (
                <>
                  <span class="ticket-bar__cuando">Último · {formatTime(ultimo.servedAt)} · </span>
                  {fraseDePartes(ultimo.partes)}
                </>
              ) : (
                'Sin pedidos todavía'
              )
            ) : (
              // El mismo nombre que en la cabecera del ticket que abre: era la
              // misma cosa llamada de dos maneras en dos pantallas, y «actual»
              // es justo lo que la distingue de «Últimos pedidos».
              `Pedido actual (${formatInt(drinks)})`
            )}
            {!pausado && event.mode === 'venta' && drinks > 0
              ? ` · ${ticketTotal(lines).toFixed(2).replace('.', ',')} €`
              : ''}
          </span>
        </button>
        {/* En pausa, la acción principal de la pantalla es volver a abrir: va
            en el sitio del botón de servir, que es donde llega el pulgar.
            En móvil el botón dice la cuenta entera —«Servir 3 bebidas»—. Por
            encima del corte se queda en «Servir», como estaba. */}
        {pausado ? (
          <Button
            variant="primary"
            action
            class="ticket-bar__reanudar"
            onClick={() => {
              void reanudarServicio(event.id);
              showToast('Servicio reanudado');
            }}
          >
            Reanudar servicio
          </Button>
        ) : (
          <Button variant="primary" action disabled={drinks === 0} onClick={onServeButton}>
            {drinks === 0
              ? 'Toca una bebida'
              : event.mode === 'venta'
                ? 'Cobrar'
                : esMovil.value
                  ? `Servir ${formatInt(drinks)} ${drinks === 1 ? 'bebida' : 'bebidas'}`
                  : 'Servir'}
          </Button>
        )}
      </div>

      {sheetOpen ? (
        <>
          <div class="sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <TicketHoja {...ticketProps} onCollapse={() => setSheetOpen(false)} />
        </>
      ) : null}

      {/* La hoja «Más» del móvil: cada acción en su fila, con su nombre y qué
          hace. «Cerrar barra» va la última y separada, que es la única de las
          cuatro que termina el evento. */}
      {masOpen ? (
        <HojaAbajo
          title="Más"
          onClose={() => {
            setMasOpen(false);
            setReinicioAbierto(false);
          }}
        >
          <p class="hoja-abajo__dato">
            <span class="num">{formatRate(stats.lastHourRate)}</span> en la última hora
            {stockCafe > 0 ? (
              <>
                {' · café '}
                <span class="num">{formatQty(remainingCafe, 'g')}</span>
              </>
            ) : null}
          </p>
          <HojaFila
            nombre="Rápido"
            /* La misma frase que el interruptor de la cabecera. Eran dos
               redacciones del mismo concepto —una por pantalla— y quien lee la
               hoja en el móvil y el interruptor en el iPad tiene que reconocer
               que hablan de lo mismo. */
            pista="un toque, una bebida"
            estado={oneTap.value ? 'Puesto' : 'Quitado'}
            puesto={oneTap.value}
            onClick={() => {
              setQuickEdit(null);
              void setOneTap(!oneTap.value);
            }}
          />
          <HojaFila
            nombre="Noche"
            pista="pantalla oscura cuando deslumbra"
            estado={theme.value === 'night' ? 'Puesto' : 'Quitado'}
            puesto={theme.value === 'night'}
            onClick={() => void setTheme(theme.value === 'night' ? 'light' : 'night')}
          />
          <HojaFila
            nombre="Resumen"
            pista="bebidas, insumos y todos los pedidos"
            onClick={() => {
              setMasOpen(false);
              setResumenOpen('todo');
            }}
          />
          <div class="hoja-abajo__sep" />
          {/* Parar no es cerrar, y por eso va antes de la línea que separa lo
              terminal: el evento sigue abierto y se reanuda de un toque. */}
          <HojaFila
            nombre={pausado ? 'Reanudar servicio' : 'Pausar servicio'}
            pista={
              pausado
                ? 'vuelve a servir donde lo dejaste'
                : 'el evento sigue abierto; nadie pierde nada'
            }
            onClick={() => {
              setMasOpen(false);
              void (pausado ? reanudarServicio(event.id) : pausarServicio(event.id));
              showToast(pausado ? 'Servicio reanudado' : 'Servicio en pausa');
            }}
          />
          <div class="hoja-abajo__sep" />
          <HojaFila
            nombre="Cerrar barra"
            pista="recuento de lo que queda y resultados"
            tono="terminal"
            onClick={() => {
              setMasOpen(false);
              route(`/evento/${event.id}/cerrar`);
            }}
          />
          {/* Separada de «Cerrar barra» por su propia línea: las dos son
              destructivas, pero cerrar termina el evento y esta lo deja en el
              punto de salida. Un toque no hace nada: despliega el panel. */}
          <div class="hoja-abajo__sep" />
          <HojaFila
            nombre="Empezar de cero"
            pista="anula lo servido y pone el reloj a cero"
            tono="terminal"
            onClick={() => setReinicioAbierto((abierto) => !abierto)}
          />
          {reinicioAbierto ? (
            <PanelReinicio
              servidas={stats.served}
              enCurso={drinks}
              onReiniciar={reiniciarEvento}
              onCancelar={() => setReinicioAbierto(false)}
            />
          ) : null}
        </HojaAbajo>
      ) : null}

      {resumenOpen ? (
        <Sheet
          title="Resumen"
          wide
          onClose={() => setResumenOpen(null)}
          {...(resumenOpen === 'pedidos' ? { anclaId: 'resumen-pedidos' } : {})}
        >
          <ResumenContenido event={event} orders={orders} onOrdersChange={setOrders} />
        </Sheet>
      ) : null}

      {editing && editingProduct ? (
        <LineSheet
          line={editing}
          product={editingProduct}
          groups={modifierGroups.value}
          options={modifierOptions.value}
          ingredients={ingredients.value}
          onClose={() => setEditing(null)}
          onSaved={setCurrentLineId}
        />
      ) : null}

      {paying ? (
        <PaymentSheet
          subtotal={ticketTotal(lines)}
          drinks={drinks}
          {...(editando?.payment ? { metodoInicial: editando.payment } : {})}
          {...(editando
            ? { titulo: `Corregir el cobro de las ${formatTime(editando.servedAt)}` }
            : {})}
          onClose={() => setPaying(false)}
          onConfirm={(result) => {
            setPaying(false);
            void serveTicket(result);
          }}
        />
      ) : null}

      {/* Se anuncia solo cuando cambia el número: con la hora dentro, un lector
          de pantalla repetiría lo mismo cada 30 segundos. */}
      <span class="visually-hidden" role="status" aria-live="polite">
        {formatInt(stats.served)} bebidas servidas
      </span>
    </div>
  );
}
