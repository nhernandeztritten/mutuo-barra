/**
 * Piezas de la barra: ticket, hoja lateral de una línea y hoja de cobro.
 * Separadas de `routes/barra.tsx` para que cada archivo se lea de una sentada.
 */
import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Minus, Plus, Undo2 } from 'lucide-preact';
import { applyModifiers } from '../domain/modifiers';
import { formatInt, formatMoney, formatTime } from '../domain/format';
import type {
  Category,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  PaymentMethod,
  Product,
} from '../data/types';
import { Button, Chip, Sheet, useHoja } from './components';
import { CHIP_LABEL, PAGO_LABEL } from './etiquetas';
import { ChipsMotivo } from './motivos';
import { fraseDePartes, haceTexto, type UltimoPedido } from './ultimos';
import {
  isOptionActive,
  lineContent,
  replaceLine,
  ticketDrinks,
  ticketTotal,
  toggleOption,
  type TicketLine,
} from './ticket';

/** Acento por categoría: punto de 10 px y subrayado de la pestaña. Nunca franjas. */
export const CATEGORY_COLOR: Record<Category, string> = {
  Espresso: 'var(--cat-espresso)',
  'Con leche': 'var(--cat-con-leche)',
  Filtro: 'var(--cat-filtro)',
  Fríos: 'var(--cat-frios)',
  Especiales: 'var(--cat-especiales)',
  Otros: 'var(--cat-otros)',
};

/**
 * Etiqueta corta solo en la fila de extras, donde el ancho manda.
 * «Descafeinado» sigue siendo la palabra completa en la hoja, en el ticket y en
 * la exportación (decisión 21).
 */
export { CHIP_LABEL };

/* ================= Fila de extras de la bebida actual ================= */

/** Los grupos que admite un producto, con sus opciones ya filtradas y ordenadas. */
export function gruposDe(
  product: Product,
  groups: ModifierGroup[],
  options: ModifierOption[],
): { group: ModifierGroup; options: ModifierOption[] }[] {
  return product.allowedModifierGroups
    .map((allowance) => {
      const group = groups.find((g) => g.id === allowance.groupId);
      if (!group) return null;
      const groupOptions = options
        .filter((o) => o.groupId === group.id)
        .filter((o) => allowance.optionIds === undefined || allowance.optionIds.includes(o.id));
      return groupOptions.length > 0 ? { group, options: groupOptions } : null;
    })
    .filter((x): x is { group: ModifierGroup; options: ModifierOption[] } => x !== null)
    .sort((a, b) => a.group.sortOrder - b.group.sortOrder);
}

export interface ExtrasRowProps {
  /** La bebida actual: la última tocada. `null` deja la fila en reposo. */
  actual: { productName: string; optionIds: string[] } | null;
  /** El producto de esa bebida; sin él no se sabe qué extras admite. */
  product?: Product | undefined;
  groups: ModifierGroup[];
  options: ModifierOption[];
  /**
   * Modo Rápido. Cambia lo que dice la fila: ahí el toque ya sirve la bebida y
   * lo que se está editando es un pedido guardado, no uno en curso.
   *
   * Esta explicación vive aquí y no en el subtítulo del interruptor porque en
   * la cabecera no cabe: el texto largo empujaba «Cerrar barra» fuera de los
   * 1180 px del iPad.
   */
  oneTap?: boolean;
  /** Texto de ayuda al final de la fila (el modo Rápido lo usa). */
  ayuda?: string | undefined;
  onToggle: (option: ModifierOption) => void;
}

/**
 * La fila de 56 px, ahora **postfija y contextual**: enseña los extras de la
 * última bebida tocada, no un prefijo que armar antes.
 *
 * Consecuencia buscada: un extra que no aplica ya no se muestra, así que el
 * barista no puede armar algo que se va a ignorar y la sacudida del chip
 * sobra. Cada grupo se pinta como lo que es: la leche, opción única en un
 * segmento; el café, un solo interruptor «Desca»; los extras, interruptores.
 */
export function ExtrasRow({
  actual,
  product,
  groups,
  options,
  oneTap = false,
  ayuda,
  onToggle,
}: ExtrasRowProps) {
  const bloques = useMemo(
    () => (product ? gruposDe(product, groups, options) : []),
    [product, groups, options],
  );

  if (!actual || !product) {
    return (
      <div class="extras extras--vacia">
        <p class="extras__pista">
          {oneTap
            ? 'Toca una bebida: se sirve al momento y sus extras salen aquí'
            : 'Toca una bebida; sus extras salen aquí'}
        </p>
      </div>
    );
  }

  const marcada = (option: ModifierOption): boolean =>
    isOptionActive(actual.optionIds, option, options);

  return (
    <div class="extras" role="group" aria-label={`Extras de ${actual.productName}`}>
      <span class="extras__bebida">{actual.productName}</span>
      {/* Va pegado al nombre y no al final: la fila se desplaza a lo ancho y
          cualquier cosa detrás del último extra se sale de la vista. */}
      {ayuda ? <span class="extras__ayuda">· {ayuda}</span> : null}

      {bloques.map(({ group, options: groupOptions }) => {
        const porDefecto = groupOptions.filter((o) => o.isDefault);
        const resto = groupOptions.filter((o) => !o.isDefault);

        // Un grupo de opción única con un solo cambio posible («Normal» o
        // «Descafeinado») no necesita segmento: es un interruptor.
        if (group.type === 'single' && porDefecto.length === 1 && resto.length === 1) {
          const option = resto[0]!;
          return (
            <Chip key={option.id} armed={marcada(option)} onClick={() => onToggle(option)}>
              {CHIP_LABEL[option.id] ?? option.name}
            </Chip>
          );
        }

        if (group.type === 'single') {
          return (
            <div class="seg" role="group" aria-label={group.name} key={group.id}>
              {groupOptions.map((option) => (
                <button
                  type="button"
                  class="seg__opt"
                  key={option.id}
                  aria-pressed={marcada(option)}
                  onClick={() => onToggle(option)}
                >
                  {CHIP_LABEL[option.id] ?? option.name}
                </button>
              ))}
            </div>
          );
        }

        return groupOptions.map((option) => (
          <Chip key={option.id} armed={marcada(option)} onClick={() => onToggle(option)}>
            {CHIP_LABEL[option.id] ?? option.name}
          </Chip>
        ));
      })}
    </div>
  );
}

/* ================= Últimos pedidos ================= */

/** Lo que se lee cuando «Editar» está apagado. Dice también cómo encenderlo. */
export const EDITAR_BLOQUEADO = 'Sirve o vacía el pedido actual para editar';

export interface UltimosPedidosProps {
  pedidos: UltimoPedido[];
  /** El pedido que acaba de repetirse: hace un fundido breve y se apaga solo. */
  repetido?: string | null;
  /** El pedido desplegado, o `null`. Solo hay uno abierto a la vez. */
  abierto?: string | null;
  /** Tocar una fila: abre esa, o cierra la que ya lo estaba. */
  onAbrir?: (pedidoId: string | null) => void;
  /** Referencia de tiempo para el «hace N min». La barra la mueve cada 30 s. */
  now?: Date;
  /** Repite ese pedido: en modo normal lo devuelve al pedido actual; en Rápido lo sirve. */
  onRepetir: (pedido: UltimoPedido) => void;
  /** Carga el pedido en el ticket para corregirlo. Solo con el pedido actual vacío. */
  onEditar?: (pedido: UltimoPedido) => void;
  /** Si se puede editar ahora mismo: el pedido en curso tiene que estar vacío. */
  puedeEditar?: boolean;
  /** Anula el pedido con ese motivo. Nunca borra: `voidedAt` y a la lista del Resumen. */
  onAnular?: (pedido: UltimoPedido, motivoId: string) => void;
  /** «Ver todos»: abre la hoja de Resumen en su lista de pedidos. */
  onVerTodos: () => void;
}

/**
 * Los últimos pedidos servidos, siempre a la vista en los dos modos.
 *
 * Contesta la pregunta que se hace el barista cuando levanta la cabeza: «¿qué
 * me acaban de pedir?». Cada fila se **despliega en el sitio** —nunca una
 * ventana emergente, `DESIGN.md` las prohíbe en el flujo de servir— y enseña el
 * pedido entero, una línea por bebida, con sus tres acciones: repetir,
 * corregir y anular.
 *
 * Solo hay una abierta a la vez: con la columna de 360 px, dos pedidos
 * desplegados dejan la lista sin sitio y el barista sin saber cuál está
 * mirando.
 *
 * `aria-live="polite"` en la lista: el pedido nuevo se anuncia sin interrumpir.
 */
export function UltimosPedidos({
  pedidos,
  repetido = null,
  abierto = null,
  onAbrir,
  now,
  onRepetir,
  onEditar,
  puedeEditar = true,
  onAnular,
  onVerTodos,
}: UltimosPedidosProps) {
  /** Qué fila está preguntando el motivo de la anulación. */
  const [anulando, setAnulando] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Cerrar la fila cancela la pregunta: si no, al volver a abrirla saldrían los
  // chips de motivo como si el barista acabara de tocar «Anular».
  useEffect(() => {
    setAnulando(null);
  }, [abierto]);

  // La fila que se abre tiene que quedar a la vista, sin arrastrar la página:
  // `nearest` desplaza lo justo dentro de la lista y no toca nada más.
  useEffect(() => {
    if (abierto === null) return;
    const fila = listaRef.current?.querySelector<HTMLElement>(
      `.ultimos__fila[data-pedido="${CSS.escape(abierto)}"]`,
    );
    fila?.scrollIntoView({ block: 'nearest' });
  }, [abierto]);

  return (
    <section class="ultimos" aria-labelledby="ultimos-titulo">
      <header class="ultimos__head">
        <h2 class="ultimos__titulo" id="ultimos-titulo">
          Últimos pedidos
        </h2>
        <Button variant="ghost" class="ultimos__vertodos" onClick={onVerTodos}>
          Ver todos
        </Button>
      </header>

      <div
        class="ultimos__lista"
        ref={listaRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {pedidos.length === 0 ? (
          <p class="ultimos__vacio">Todavía no hay pedidos servidos</p>
        ) : (
          pedidos.map((pedido) => {
            const frase = fraseDePartes(pedido.partes);
            const estaAbierta = pedido.id === abierto;
            const venta = pedido.mode === 'venta';
            return (
              <div
                class={[
                  'ultimos__fila',
                  pedido.id === repetido ? 'is-repetida' : '',
                  estaAbierta ? 'is-abierta' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={pedido.id}
                data-pedido={pedido.id}
              >
                {/* La fila entera es el objetivo táctil, no un botón pequeño en
                    una esquina: con las manos mojadas se toca donde se mira. */}
                <button
                  type="button"
                  class="ultimos__cabeza"
                  aria-expanded={estaAbierta}
                  onClick={() => onAbrir?.(estaAbierta ? null : pedido.id)}
                >
                  <span class="ultimos__hora num">{formatTime(pedido.servedAt)}</span>
                  {/* Cerrada, la frase se corta a dos líneas con elipsis.
                      Abierta desaparece: debajo está el pedido entero línea por
                      línea, y repetirla arriba en pequeño solo es ruido. En su
                      sitio va el «hace N min», que es lo que la hora no dice. */}
                  {estaAbierta ? (
                    <span class="ultimos__cuando">{haceTexto(pedido.servedAt, now ?? new Date())}</span>
                  ) : (
                    <span class="ultimos__frase" title={frase}>
                      {pedido.partes.map((parte, i) => (
                        <span class="ultimos__parte" key={`${pedido.id}-${String(i)}`}>
                          {i > 0 ? ', ' : ''}
                          {parte.texto}
                          {parte.mods ? <span class="ultimos__mods"> · {parte.mods}</span> : null}
                        </span>
                      ))}
                    </span>
                  )}
                </button>

                {estaAbierta ? (
                  <div class="ultimos__panel">
                    <div class="ultimos__panel-in">
                      <ul class="ultimos__bebidas">
                        {pedido.partes.map((parte, i) => (
                          <li class="ultimos__bebida" key={`${pedido.id}-det-${String(i)}`}>
                            <span class="ultimos__bebida-nombre">{parte.texto}</span>
                            {parte.mods ? (
                              <span class="ultimos__bebida-mods">{parte.mods}</span>
                            ) : null}
                            {parte.nota ? (
                              <span class="ultimos__bebida-nota">{parte.nota}</span>
                            ) : null}
                            {venta ? (
                              <span class="ultimos__bebida-importe num">
                                {formatMoney(parte.importe)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {pedido.note ? <p class="ultimos__nota">{pedido.note}</p> : null}

                      {venta ? (
                        <p class="ultimos__cobro">
                          <span class="num">{formatMoney(pedido.total)}</span>
                          {pedido.payment ? ` · ${PAGO_LABEL[pedido.payment] ?? pedido.payment}` : ''}
                        </p>
                      ) : null}

                      {anulando === pedido.id ? (
                        <ChipsMotivo
                          etiqueta={`Motivo de la anulación de ${frase}`}
                          onElegir={(motivoId) => {
                            setAnulando(null);
                            onAnular?.(pedido, motivoId);
                          }}
                          onCancelar={() => setAnulando(null)}
                        />
                      ) : (
                        <div class="ultimos__acciones">
                          <Button
                            class="ultimos__repetir"
                            aria-label={`Repetir ${frase}`}
                            onClick={() => onRepetir(pedido)}
                          >
                            Repetir
                          </Button>
                          <Button
                            class="ultimos__editar"
                            disabled={!puedeEditar}
                            {...(puedeEditar ? {} : { title: EDITAR_BLOQUEADO })}
                            aria-label={`Editar ${frase}`}
                            onClick={() => onEditar?.(pedido)}
                          >
                            Editar
                          </Button>
                          <span class="spacer" />
                          <Button
                            variant="ghost"
                            class="ultimos__anular"
                            aria-label={`Anular ${frase}`}
                            onClick={() => setAnulando(pedido.id)}
                          >
                            Anular
                          </Button>
                        </div>
                      )}

                      {puedeEditar ? null : (
                        <p class="ultimos__aviso">{EDITAR_BLOQUEADO}</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* ================= Ticket ================= */

export interface TicketPanelProps {
  lines: TicketLine[];
  /** Lo que se pinta; durante el fundido de «Servir» es la copia del pedido ya guardado. */
  displayLines?: TicketLine[];
  mode: 'incluido' | 'venta';
  oneTap: boolean;
  /** Los cinco últimos pedidos no anulados; la sección vive al pie de la columna. */
  ultimos: UltimoPedido[];
  repetido?: string | null;
  abierto?: string | null;
  onAbrir?: (pedidoId: string | null) => void;
  now?: Date;
  onRepetir: (pedido: UltimoPedido) => void;
  onEditar?: (pedido: UltimoPedido) => void;
  onAnular?: (pedido: UltimoPedido, motivoId: string) => void;
  onVerTodos: () => void;
  /**
   * Hora del pedido que se está corrigiendo. Con esto la cabecera dice
   * «Editando el pedido de 09:54» y aparece «Cancelar».
   */
  editandoDe?: string | null;
  /** Vacía el ticket y vuelve a «Pedido actual», sin tocar el pedido original. */
  onCancelarEdicion?: () => void;
  serving: boolean;
  sheet?: boolean;
  /** Solo la versión desplegada: la ref que atrapa el foco dentro de la hoja. */
  hojaRef?: RefObject<HTMLElement>;
  /** La línea cuyos extras enseña la fila de arriba. */
  currentLineId?: string | null;
  /** Tocar el nombre de una línea la convierte en la actual. */
  onSelect: (line: TicketLine) => void;
  /** «Más»: abre la hoja lateral de esa línea (nota, precio, todos los grupos). */
  onEdit: (line: TicketLine) => void;
  onQty: (lineId: string, qty: number) => void;
  onUndoLast: () => void;
  onServe: () => void;
  onCollapse?: () => void;
}

/**
 * El ticket desplegado en vertical. Es una hoja de verdad: atrapa el foco, se
 * cierra con Escape y devuelve el foco a donde estaba.
 */
export function TicketHoja(props: TicketPanelProps & { onCollapse: () => void }) {
  const ref = useHoja<HTMLElement>(props.onCollapse);
  return <TicketPanel {...props} sheet hojaRef={ref} />;
}

export function TicketPanel({
  lines,
  displayLines,
  mode,
  oneTap,
  ultimos,
  repetido = null,
  abierto = null,
  onAbrir,
  now,
  onRepetir,
  onEditar,
  onAnular,
  onVerTodos,
  editandoDe = null,
  onCancelarEdicion,
  serving,
  sheet = false,
  hojaRef,
  currentLineId = null,
  onSelect,
  onEdit,
  onQty,
  onUndoLast,
  onServe,
  onCollapse,
}: TicketPanelProps) {
  const shown = displayLines ?? lines;
  const drinks = ticketDrinks(lines);
  const total = ticketTotal(lines);
  const editando = editandoDe !== null;
  // Correcting replaces another order: the counter will not move, so the
  // button says what really happens instead of «Servir».
  const label = editando
    ? mode === 'venta'
      ? `Guardar la corrección · ${formatMoney(total)}`
      : 'Guardar la corrección'
    : mode === 'venta'
      ? `Cobrar ${formatMoney(total)}`
      : `Servir ${formatInt(drinks)} ${drinks === 1 ? 'bebida' : 'bebidas'}`;
  /**
   * Corrigiendo, el modo Rápido queda en pausa: el ticket y su botón vuelven,
   * porque una corrección se monta a varios toques y no se puede servir sola.
   */
  const rapido = oneTap && !editando;

  return (
    <aside
      {...(sheet ? { ref: hojaRef, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pedido actual' } : {})}
      class={['ticket', sheet ? 'ticket--sheet' : '', editando ? 'is-editando' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <header class={['ticket__head', editando ? 'is-editando' : ''].filter(Boolean).join(' ')}>
        <span>
          {editando
            ? `Editando el pedido de ${formatTime(editandoDe)}`
            : oneTap
              ? 'Modo rápido activo'
              : `Pedido actual (${formatInt(drinks)})`}
        </span>
        {editando ? (
          <>
            <span class="spacer" />
            <Button class="ticket__cancelar" onClick={() => onCancelarEdicion?.()}>
              Cancelar
            </Button>
          </>
        ) : null}
        {onCollapse ? (
          <>
            {editando ? null : <span class="spacer" />}
            <Button variant="ghost" onClick={onCollapse}>
              Cerrar
            </Button>
          </>
        ) : null}
      </header>

      {rapido ? (
        <p class="ticket__pista">Cada bebida se sirve al tocarla; sus extras salen en la fila de arriba.</p>
      ) : (
        <div class={['ticket__list', serving ? 'is-serving' : ''].filter(Boolean).join(' ')}>
            {shown.length === 0 ? (
              <p class="ticket__empty">El pedido está vacío.</p>
            ) : (
              shown.map((line) => (
                <div
                  class={['ticket__row', line.id === currentLineId ? 'is-current' : '']
                    .filter(Boolean)
                    .join(' ')}
                  key={line.id}
                >
                  <button
                    type="button"
                    class="ticket__name"
                    aria-pressed={line.id === currentLineId}
                    onClick={() => onSelect(line)}
                  >
                    <span class="ticket__product">{line.productName}</span>
                    {line.modifiers.length > 0 ? (
                      <span class="ticket__mods">
                        {line.modifiers.map((m) => m.label.toLowerCase()).join(' · ')}
                      </span>
                    ) : null}
                    {line.note ? <span class="ticket__mods">{line.note}</span> : null}
                  </button>
                  {mode === 'venta' ? (
                    <span class="ticket__mods num">{formatMoney(line.unitPrice * line.qty)}</span>
                  ) : null}
                  <button
                    type="button"
                    class="btn btn--step"
                    aria-label={`Quitar una unidad de ${line.productName}`}
                    onClick={() => onQty(line.id, line.qty - 1)}
                  >
                    <Minus size={20} strokeWidth={1.75} />
                  </button>
                  <span class="ticket__qty num">{formatInt(line.qty)}</span>
                  <button
                    type="button"
                    class="btn btn--step"
                    aria-label={`Añadir una unidad de ${line.productName}`}
                    onClick={() => onQty(line.id, line.qty + 1)}
                  >
                    <Plus size={20} strokeWidth={1.75} />
                  </button>
                  {/* La hoja lateral se abre con un botón, no manteniendo
                      pulsado: con las manos mojadas y cinco segundos por
                      interacción, una pulsación larga es una apuesta. */}
                  <button
                    type="button"
                    class="btn btn--mas"
                    aria-label={`Más opciones de ${line.productName}`}
                    onClick={() => onEdit(line)}
                  >
                    Más
                  </button>
                </div>
              ))
            )}
        </div>
      )}

      {/* La sección va al pie de la columna pero **por encima** del botón de
          servir, no debajo: si fuera debajo, el botón —la única acción de la
          pantalla caliente— cambiaría de sitio cada vez que entra un pedido. */}
      <UltimosPedidos
        pedidos={ultimos}
        repetido={repetido}
        abierto={abierto}
        {...(onAbrir ? { onAbrir } : {})}
        {...(now ? { now } : {})}
        onRepetir={onRepetir}
        {...(onEditar ? { onEditar } : {})}
        {...(onAnular ? { onAnular } : {})}
        puedeEditar={lines.length === 0}
        onVerTodos={onVerTodos}
      />

      {rapido ? null : (
        <div class="ticket__foot">
          <Button variant="ghost" disabled={lines.length === 0} onClick={onUndoLast}>
            <Undo2 size={20} strokeWidth={1.75} /> Deshacer último
          </Button>
          <Button variant="primary" action disabled={lines.length === 0} onClick={onServe}>
            {lines.length === 0 ? 'Toca una bebida' : label}
          </Button>
        </div>
      )}
    </aside>
  );
}

/* ================= Hoja lateral de una línea ================= */

export function LineSheet({
  line,
  product,
  groups,
  options,
  ingredients,
  onClose,
  onSaved,
}: {
  line: TicketLine;
  product: Product;
  groups: ModifierGroup[];
  options: ModifierOption[];
  ingredients: Ingredient[];
  onClose: () => void;
  /** El id de la línea resultante: puede haberse fusionado con otra igual. */
  onSaved?: (lineId: string | null) => void;
}) {
  const [selected, setSelected] = useState<string[]>(line.optionIds);
  const [note, setNote] = useState(line.note);

  /** Grupos que admite el producto, con sus opciones ya filtradas. */
  const allowed = useMemo(
    () => gruposDe(product, groups, options),
    [product, groups, options],
  );

  const selectedOptions = selected
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is ModifierOption => o !== undefined);

  const preview = applyModifiers(product, selectedOptions, ingredients, groups);

  function toggle(option: ModifierOption): void {
    setSelected((prev) => toggleOption(prev, option, groups, options));
  }

  function save(): void {
    // Las opciones por defecto no se guardan: si se guardaran, esta línea
    // dejaría de agruparse con otra idéntica sin «Vaca» marcado.
    const applied = selectedOptions.filter(
      (o) => !o.isDefault && !preview.ignored.some((i) => i.optionId === o.id),
    );
    const resultId = replaceLine(line.id, {
      ...lineContent(line),
      optionIds: applied.map((o) => o.id),
      modifiers: applied.map((o) => ({ groupId: o.groupId, optionId: o.id, label: o.name })),
      unitPrice: preview.unitPrice,
      unitCost: preview.unitCost,
      usage: preview.usage,
      note: note.trim(),
    });
    onSaved?.(resultId);
    onClose();
  }

  return (
    <Sheet title={line.productName} onClose={onClose}>
      {allowed.map(({ group, options: groupOptions }) => (
        <div class="stack" key={group.id}>
          <span class="section-title">{group.name}</span>
          <div class="opt-list">
            {groupOptions.map((option) => (
              <button
                type="button"
                class="opt"
                key={option.id}
                aria-pressed={isOptionActive(selected, option, options)}
                onClick={() => toggle(option)}
              >
                <span>{option.name}</span>
                {option.priceDelta !== 0 ? (
                  <span class="opt__delta">+{formatMoney(option.priceDelta)}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}

      <label class="field" for="linea-nota">
        <span class="field__label">Nota</span>
        <textarea
          id="linea-nota"
          class="textarea"
          value={note}
          placeholder="Poca leche, para llevar…"
          onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)}
        />
      </label>

      <p class="meta">Precio de la línea: {formatMoney(preview.unitPrice)}</p>

      <Button variant="primary" action onClick={save}>
        Guardar cambios
      </Button>
    </Sheet>
  );
}

/* ================= Hoja de cobro ================= */

export interface PaymentResult {
  payment: PaymentMethod;
  tip: number;
  cashGiven: number | null;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'invitacion', label: 'Invitación' },
];

function parseAmount(text: string): number {
  const value = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

export function PaymentSheet({
  subtotal,
  drinks,
  metodoInicial,
  titulo,
  onClose,
  onConfirm,
}: {
  subtotal: number;
  drinks: number;
  /**
   * Método ya marcado al abrir. Al corregir un pedido cobrado con tarjeta,
   * volver a preguntar desde «Efectivo» es hacerle repetir al barista una
   * decisión que ya tomó.
   */
  metodoInicial?: PaymentMethod | undefined;
  /** Encabezado alternativo: corrigiendo no se está cobrando otra vez. */
  titulo?: string | undefined;
  onClose: () => void;
  onConfirm: (result: PaymentResult) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(metodoInicial ?? 'efectivo');
  const [tipText, setTipText] = useState('');
  const [cashText, setCashText] = useState('');

  const tip = Math.round(parseAmount(tipText) * 100) / 100;
  const total = Math.round((subtotal + tip) * 100) / 100;
  const given = parseAmount(cashText);
  const change = Math.round((given - total) * 100) / 100;

  const quick = [total, 5, 10, 20].filter((v, i, arr) => v >= total && arr.indexOf(v) === i);

  return (
    <Sheet
      title={titulo ?? `Cobrar ${formatInt(drinks)} ${drinks === 1 ? 'bebida' : 'bebidas'}`}
      onClose={onClose}
    >
      <div class="pay">
        <div class="pay__total">
          <span class="meta">Total</span>
          <span class="pay__amount num">{formatMoney(total)}</span>
        </div>

        <label class="field" for="pay-propina">
          <span class="field__label">Propina (opcional)</span>
          <input
            id="pay-propina"
            class="input"
            inputMode="decimal"
            value={tipText}
            placeholder="0,00"
            onInput={(e) => setTipText((e.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <div class="pay__methods">
          {METHODS.map((m) => (
            <button
              type="button"
              class="btn btn--secondary"
              key={m.value}
              aria-pressed={method === m.value}
              onClick={() => setMethod(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method === 'efectivo' ? (
          <div class="pay__cash">
            <span class="section-title">Entregado</span>
            <div class="pay__quick">
              {quick.map((amount, index) => (
                <Button key={amount} onClick={() => setCashText(amount.toFixed(2).replace('.', ','))}>
                  {index === 0 ? 'Exacto' : formatMoney(amount)}
                </Button>
              ))}
            </div>
            <label class="field" for="pay-otro">
              <span class="field__label">Otro importe</span>
              <input
                id="pay-otro"
                class="input"
                inputMode="decimal"
                value={cashText}
                placeholder="0,00"
                onInput={(e) => setCashText((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <div class="pay__change">
              <span>Cambio</span>
              <span class="pay__change-value num">{formatMoney(Math.max(0, change))}</span>
            </div>
          </div>
        ) : null}

        <Button
          variant="primary"
          action
          onClick={() =>
            onConfirm({
              payment: method,
              tip,
              cashGiven: method === 'efectivo' && given > 0 ? given : null,
            })
          }
        >
          Confirmar y servir
        </Button>
      </div>
    </Sheet>
  );
}
