/**
 * Piezas de la barra: ticket, hoja lateral de una línea y hoja de cobro.
 * Separadas de `routes/barra.tsx` para que cada archivo se lea de una sentada.
 */
import type { RefObject } from 'preact';
import { useMemo, useState } from 'preact/hooks';
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
export const CHIP_LABEL: Record<string, string> = { cafe_descafeinado: 'Desca' };

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

/* ================= Ticket ================= */

export interface RecentDrink {
  id: string;
  label: string;
  servedAt: string;
}

export interface TicketPanelProps {
  lines: TicketLine[];
  /** Lo que se pinta; durante el fundido de «Servir» es la copia del pedido ya guardado. */
  displayLines?: TicketLine[];
  mode: 'incluido' | 'venta';
  oneTap: boolean;
  recent: RecentDrink[];
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
  recent,
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
  const label =
    mode === 'venta'
      ? `Cobrar ${formatMoney(total)}`
      : `Servir ${formatInt(drinks)} ${drinks === 1 ? 'bebida' : 'bebidas'}`;

  return (
    <aside
      {...(sheet ? { ref: hojaRef, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pedido actual' } : {})}
      class={['ticket', sheet ? 'ticket--sheet' : ''].filter(Boolean).join(' ')}
    >
      <header class="ticket__head">
        <span>{oneTap ? 'Modo rápido activo' : `Pedido actual (${formatInt(drinks)})`}</span>
        {onCollapse ? (
          <>
            <span class="spacer" />
            <Button variant="ghost" onClick={onCollapse}>
              Cerrar
            </Button>
          </>
        ) : null}
      </header>

      {oneTap ? (
        <div class="recent">
          <p class="meta">Cada bebida se sirve al tocarla. Últimas servidas:</p>
          {recent.length === 0 ? (
            <p class="meta">Todavía no has servido nada.</p>
          ) : (
            recent.map((r) => (
              <div class="recent__row" key={r.id}>
                <span>{r.label}</span>
                <span class="recent__time">{formatTime(r.servedAt)}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
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

          <div class="ticket__foot">
            <Button variant="ghost" disabled={lines.length === 0} onClick={onUndoLast}>
              <Undo2 size={20} strokeWidth={1.75} /> Deshacer último
            </Button>
            <Button variant="primary" action disabled={lines.length === 0} onClick={onServe}>
              {lines.length === 0 ? 'Toca una bebida' : label}
            </Button>
          </div>
        </>
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
  onClose,
  onConfirm,
}: {
  subtotal: number;
  drinks: number;
  onClose: () => void;
  onConfirm: (result: PaymentResult) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [tipText, setTipText] = useState('');
  const [cashText, setCashText] = useState('');

  const tip = Math.round(parseAmount(tipText) * 100) / 100;
  const total = Math.round((subtotal + tip) * 100) / 100;
  const given = parseAmount(cashText);
  const change = Math.round((given - total) * 100) / 100;

  const quick = [total, 5, 10, 20].filter((v, i, arr) => v >= total && arr.indexOf(v) === i);

  return (
    <Sheet title={`Cobrar ${formatInt(drinks)} ${drinks === 1 ? 'bebida' : 'bebidas'}`} onClose={onClose}>
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
