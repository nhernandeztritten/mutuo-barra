/**
 * La tira del pedido en curso, solo en el móvil.
 *
 * Nicolas, probándola en la boda: «por encimita del pedido actual, que al
 * apretar se puede ver lo que se lleva del pedido, arriba de eso, que aparezca
 * cuáles bebidas voy cargando, al menos la última clickeada, con posibilidad de
 * deshacer o borrarla. Queda un espacio ahí».
 *
 * Lo que había: para saber qué llevas montado hay que **abrir la hoja**. En un
 * iPad el pedido está siempre a la vista en su columna de 360 px; en un iPhone
 * está detrás de un toque, y con la cola delante ese toque no se da. El hueco
 * entre la última fila de bebidas y la barra del pedido estaba vacío.
 *
 * Reglas de la tira:
 *
 * - **El mismo orden que la hoja**: la más reciente la última, pegada a la
 *   barra, que es donde mira el ojo cuando se acaba de tocar una bebida.
 * - **Filas de 44 px**: nombre con sus extras y una «×» de 44 × 44 que quita la
 *   línea (una unidad si hay más de una). Tocar el nombre la convierte en la
 *   bebida actual, igual que en la hoja.
 * - **Cuántas filas caben lo decide el hueco, no el diseño.** `ranurasDe` mide
 *   lo que sobra de verdad entre la última bebida y la barra; con las catorce
 *   bebidas de hoy son dos filas a 402 × 874 y una a 402 × 781. El grid **no**
 *   se toca: la tira vive de lo que sobra y nunca empuja una bebida fuera de la
 *   pantalla.
 * - Si no caben todas, un rótulo **«+N más · ver todo»** encima abre la hoja del
 *   pedido. Ocupa una ranura, así que solo sale cuando queda sitio para él.
 */
import { useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { formatInt } from '../domain/format';
import type { TicketLine } from './ticket';

/** Alto de una fila: 44 px de objetivo táctil más la línea que la separa. */
export const TIRA_FILA = 45;

/** Tope de filas a la vista. Más que esto ya es la hoja del pedido. */
export const TIRA_MAX_FILAS = 4;

/**
 * Cuántas ranuras de 44 px caben en el hueco libre. Una como mínimo —«al menos
 * la última clickeada»— y cinco como mucho: las cuatro filas y el rótulo.
 */
export function ranurasDe(libre: number): number {
  if (!Number.isFinite(libre)) return 1;
  const caben = Math.floor((libre + 1) / TIRA_FILA);
  return Math.max(1, Math.min(TIRA_MAX_FILAS + 1, caben));
}

export interface RepartoTira {
  /** Filas a la vista. La lista se desplaza dentro de sí misma si hay más. */
  filas: number;
  /** Cuántas líneas quedan fuera; 0 si no hay rótulo que enseñar. */
  sobran: number;
}

/**
 * Reparte las ranuras entre las filas y el rótulo.
 *
 * Con una sola ranura no hay rótulo: enseñar «+3 más» y ninguna bebida sería
 * cambiar el dato por el aviso de que hay un dato. La cuenta entera sigue en la
 * barra de abajo, «Pedido actual (4)», que está justo debajo y abre la hoja.
 */
export function repartoTira(lineas: number, ranuras: number): RepartoTira {
  const sinRotulo = Math.min(TIRA_MAX_FILAS, ranuras);
  if (lineas <= sinRotulo) return { filas: Math.max(1, lineas), sobran: 0 };
  if (ranuras <= 1) return { filas: 1, sobran: 0 };
  const filas = Math.min(TIRA_MAX_FILAS, ranuras - 1);
  return { filas, sobran: lineas - filas };
}

/** «Latte con avena»: lo que dice la etiqueta accesible de la «×». */
export function etiquetaDeLinea(line: TicketLine): string {
  if (line.modifiers.length === 0) return line.productName;
  return `${line.productName} con ${line.modifiers.map((m) => m.label.toLowerCase()).join(', ')}`;
}

export interface TiraPedidoProps {
  lineas: TicketLine[];
  /** Filas a la vista, de `repartoTira`. */
  filas: number;
  /** Líneas que quedan fuera; con 0 no se dibuja el rótulo. */
  sobran: number;
  /** La línea cuyos extras enseña la fila de arriba. */
  currentLineId: string | null;
  onSelect: (line: TicketLine) => void;
  onQuitar: (line: TicketLine) => void;
  /** «Ver todo»: abre la hoja del pedido actual. */
  onVerTodo: () => void;
}

export function TiraPedido({
  lineas,
  filas,
  sobran,
  currentLineId,
  onSelect,
  onQuitar,
  onVerTodo,
}: TiraPedidoProps) {
  const listaRef = useRef<HTMLDivElement>(null);
  const cuantas = lineas.length;

  // La bebida que se acaba de tocar es la última: la tira se desplaza sola
  // hasta ella. Dentro de la lista, nunca la página.
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTop = lista.scrollHeight;
  }, [cuantas]);

  return (
    <section class="tira" aria-label="Bebidas del pedido en curso">
      {sobran > 0 ? (
        <button type="button" class="tira__mas" onClick={onVerTodo}>
          {`+${formatInt(sobran)} más · ver todo`}
        </button>
      ) : null}
      <div
        class="tira__lista"
        ref={listaRef}
        style={{ '--tira-filas': String(filas) }}
      >
        {lineas.map((line) => {
          const mods = line.modifiers.map((m) => m.label.toLowerCase()).join(' · ');
          return (
            <div
              class={['tira__fila', line.id === currentLineId ? 'is-actual' : '']
                .filter(Boolean)
                .join(' ')}
              key={line.id}
            >
              <button
                type="button"
                class="tira__nombre"
                aria-pressed={line.id === currentLineId}
                onClick={() => onSelect(line)}
              >
                {/* El espacio entre la cantidad y el nombre es un nodo de
                    texto, no solo el hueco del CSS: sin él, VoiceOver lee
                    «dos por Cortado» de corrido, pegado. */}
                {line.qty > 1 ? (
                  <>
                    <span class="tira__qty num">{`${formatInt(line.qty)} ×`}</span>{' '}
                  </>
                ) : null}
                <span class="tira__bebida">{line.productName}</span>
                {mods ? <span class="tira__mods">{` · ${mods}`}</span> : null}
                {line.note ? <span class="tira__mods">{` · ${line.note}`}</span> : null}
              </button>
              <button
                type="button"
                class="tira__quitar"
                aria-label={`Quitar ${etiquetaDeLinea(line)} del pedido`}
                onClick={() => onQuitar(line)}
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
