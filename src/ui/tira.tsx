/**
 * La tira que vive entre el grid de bebidas y la barra del pedido, solo en el
 * móvil. Tiene **dos estados** y siempre dice cuál de los dos está enseñando.
 *
 * Nicolas, probándola en la boda (fase 12): «por encimita del pedido actual,
 * que al apretar se puede ver lo que se lleva del pedido, arriba de eso, que
 * aparezca cuáles bebidas voy cargando, al menos la última clickeada, con
 * posibilidad de deshacer o borrarla. Queda un espacio ahí».
 *
 * Y después de usarla con el pedido ya servido (fase 13): «una vez realizado el
 * pedido, me gustaría que se viera directamente dónde se iban acumulando los
 * pedidos. De forma que si me olvido de algo, a simple vista pueda repasarlo».
 *
 * - **Estado «Pedido actual»**: las líneas que se están montando, con su «×» y
 *   su «Deshacer». Es lo vivo: tarjeta blanca (`--surface`) y texto en tinta.
 * - **Estado «Ya servidos»**: con el pedido vacío, los pedidos ya servidos, el
 *   más reciente pegado a la barra. Es historia: sin tarjeta —fondo `--bg` con
 *   un filo de 1 px— y texto en `--ink-2`, con la hora delante y **sin «×»**
 *   (anular es destructivo y se queda en la hoja). Tocar una fila la abre.
 *
 * Lo que separa de verdad los dos estados es el **rótulo**, no el color: una
 * tira que cambia de significado sin avisar es una trampa.
 *
 * Reglas comunes:
 *
 * - **El mismo orden en los dos**: lo más reciente abajo, pegado a la barra,
 *   que es donde mira el ojo.
 * - **Filas de 44 px** de objetivo táctil.
 * - **Cuántas filas caben lo decide el hueco, no el diseño.** `ranurasDe` mide
 *   lo que sobra de verdad entre la última bebida y la barra, ya descontado el
 *   rótulo. El grid **no** se toca: la tira vive de lo que sobra y nunca empuja
 *   una bebida fuera de la pantalla.
 * - Si no caben todas, un **«+N más · ver todo»** encima abre la hoja del
 *   pedido. Ocupa una ranura, así que solo sale cuando queda sitio para él.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { formatInt, formatTime } from '../domain/format';
import type { TicketLine } from './ticket';
import { fraseDePartes, type UltimoPedido } from './ultimos';

/** Alto de una fila: 44 px de objetivo táctil más la línea que la separa. */
export const TIRA_FILA = 45;

/** Tope de filas a la vista. Más que esto ya es la hoja del pedido. */
export const TIRA_MAX_FILAS = 4;

/**
 * Lo que ocupa el rótulo que nombra el estado («Pedido actual» / «Ya
 * servidos»), en píxeles.
 *
 * **Catorce, y no veinte, es una cifra medida.** El presupuesto del estado
 * «Pedido actual» es de 103 px a 402 × 874 y de 62 a 402 × 781 (el iPhone
 * instalado), y ahí dentro dos filas son 89 px y una 44. Con un rótulo de 20 px
 * el de 874 se queda en una fila y el de 781 se pasa 2 px del hueco —empujaría
 * el grid, que es la única cosa que la tira no puede hacer—. Con 14 px entran
 * las mismas filas que antes de esta fase en los dos tamaños. Son 15 px de
 * letra en una caja de 14: una línea de rótulo, sin holgura que regalar.
 *
 * El estado «Ya servidos» no tiene este problema —con el pedido vacío el bloque
 * de extras se repliega y sobran 211 px a 874 y 170 a 781—, pero el rótulo mide
 * lo mismo en los dos: lo que cambia entre estados es la palabra, no el sitio.
 */
export const TIRA_ROTULO = 14;

/**
 * Cuántas ranuras de 44 px caben en el hueco libre, **ya sin el rótulo**. Una
 * como mínimo —«al menos la última clickeada»— y cinco como mucho: las cuatro
 * filas y el «+N más».
 */
export function ranurasDe(libre: number): number {
  if (!Number.isFinite(libre)) return 1;
  const caben = Math.floor((libre - TIRA_ROTULO + 1) / TIRA_FILA);
  return Math.max(1, Math.min(TIRA_MAX_FILAS + 1, caben));
}

/**
 * Si la tira cabe siquiera con una fila: el rótulo más una fila de 44 px.
 *
 * Por debajo de eso no se dibuja y la barra de abajo se queda con el texto del
 * último pedido, que es lo que había antes de esta fase. Una tira que se pasa
 * del hueco le quita sitio al grid, y ahí es donde están las bebidas.
 */
export function cabeLaTira(libre: number): boolean {
  if (!Number.isFinite(libre)) return true;
  return libre >= TIRA_ROTULO + TIRA_FILA - 1;
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

/**
 * Lo que ocupa la tira, en píxeles, a partir del reparto: el rótulo del estado,
 * las filas y, si lo hay, el «+N más».
 *
 * Lo necesita el aviso: «Deshacer» es un control de verdad y no puede caer
 * encima de otro (decisión 98), y desde la fase 12 debajo del aviso hay una
 * fila de «×». Se calcula, no se mide: así el aviso sabe dónde ponerse en el
 * mismo repintado en el que la tira cambia de tamaño.
 */
export function altoDeLaTira(reparto: RepartoTira): number {
  return (
    TIRA_ROTULO + TIRA_FILA * reparto.filas - 1 + (reparto.sobran > 0 ? TIRA_FILA - 1 : 0)
  );
}

/** «Latte con avena»: lo que dice la etiqueta accesible de la «×». */
export function etiquetaDeLinea(line: TicketLine): string {
  if (line.modifiers.length === 0) return line.productName;
  return `${line.productName} con ${line.modifiers.map((m) => m.label.toLowerCase()).join(', ')}`;
}

/** Lo que dice cada estado. El rótulo manda: el color solo acompaña. */
export const TIRA_ROTULO_PEDIDO = 'Pedido actual';
export const TIRA_ROTULO_SERVIDOS = 'Ya servidos';

interface TiraCajaProps {
  /** El estado que se está enseñando. Cambia el rótulo y la superficie. */
  modo: 'pedido' | 'servidos';
  /** Descripción larga, para quien no ve la pantalla. */
  descripcion: string;
  /** Filas a la vista, de `repartoTira`. */
  filas: number;
  /** Cuántas quedan fuera; con 0 no se dibuja el «+N más». */
  sobran: number;
  /** «Ver todo»: abre la hoja del pedido. */
  onVerTodo: () => void;
  /** Se desplaza sola hasta lo más reciente, que está abajo. */
  alFinal: unknown;
  children: ComponentChildren;
}

/**
 * El armazón que comparten los dos estados: el rótulo que los nombra, el
 * «+N más» y la lista con su alto medido. Lo único que cambia son las filas.
 */
function TiraCaja({ modo, descripcion, filas, sobran, onVerTodo, alFinal, children }: TiraCajaProps) {
  const listaRef = useRef<HTMLDivElement>(null);

  // Lo más reciente es lo último: la tira se desplaza sola hasta ello. Dentro
  // de la lista, nunca la página.
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTop = lista.scrollHeight;
  }, [alFinal]);

  return (
    <section class={`tira tira--${modo}`} aria-label={descripcion}>
      {/* El rótulo va siempre, en los dos estados y en el mismo sitio: lo que
          cambia es la palabra. Sin él, la tira cambiaría de significado sin
          avisar justo después de servir. */}
      <p class="tira__rotulo">
        {modo === 'pedido' ? TIRA_ROTULO_PEDIDO : TIRA_ROTULO_SERVIDOS}
      </p>
      {sobran > 0 ? (
        <button type="button" class="tira__mas" onClick={onVerTodo}>
          {`+${formatInt(sobran)} más · ver todo`}
        </button>
      ) : null}
      <div class="tira__lista" ref={listaRef} style={{ '--tira-filas': String(filas) }}>
        {children}
      </div>
    </section>
  );
}

export interface TiraPedidoProps {
  lineas: TicketLine[];
  /** Filas a la vista, de `repartoTira`. */
  filas: number;
  /** Líneas que quedan fuera; con 0 no se dibuja el «+N más». */
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
  return (
    <TiraCaja
      modo="pedido"
      descripcion="Bebidas del pedido en curso"
      filas={filas}
      sobran={sobran}
      onVerTodo={onVerTodo}
      alFinal={lineas.length}
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
              {/* El espacio entre la cantidad y el nombre es un nodo de texto,
                  no solo el hueco del CSS: sin él, VoiceOver lee «dos por
                  Cortado» de corrido, pegado. */}
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
    </TiraCaja>
  );
}

export interface TiraServidosProps {
  /** Los pedidos a la vista, **del más antiguo al más reciente**. */
  pedidos: UltimoPedido[];
  /** Filas a la vista, de `repartoTira`. */
  filas: number;
  /** Pedidos servidos que quedan fuera; con 0 no se dibuja el «+N más». */
  sobran: number;
  /** Tocar una fila: abre la hoja con **ese** pedido desplegado. */
  onAbrir: (pedido: UltimoPedido) => void;
  /** «Ver todo»: abre la hoja del pedido, igual que en el otro estado. */
  onVerTodo: () => void;
}

/**
 * Los pedidos ya servidos, para repasarlos de un vistazo sin abrir nada.
 *
 * Nicolas: «si me olvido de algo, a simple vista pueda repasarlo». Por eso la
 * hora delante —es lo que contesta «¿este es el de hace un momento?»— y la
 * frase del pedido detrás, cortada con elipsis antes que empujar nada.
 *
 * **Sin «×»**: anular es destructivo y se queda donde está, en la hoja, con su
 * «Deshacer». Aquí sólo se mira; tocar una fila la abre desplegada.
 */
export function TiraServidos({ pedidos, filas, sobran, onAbrir, onVerTodo }: TiraServidosProps) {
  return (
    <TiraCaja
      modo="servidos"
      descripcion="Pedidos ya servidos"
      filas={filas}
      sobran={sobran}
      onVerTodo={onVerTodo}
      alFinal={pedidos[pedidos.length - 1]?.id ?? ''}
    >
      {pedidos.map((pedido) => {
        const frase = fraseDePartes(pedido.partes);
        const hora = formatTime(pedido.servedAt);
        return (
          <div class="tira__fila" key={pedido.id}>
            <button
              type="button"
              class="tira__pedido"
              aria-label={`Ver el pedido de las ${hora}: ${frase}`}
              onClick={() => onAbrir(pedido)}
            >
              <span class="tira__hora num">{hora}</span>
              <span class="tira__frase">{frase}</span>
            </button>
          </div>
        );
      })}
    </TiraCaja>
  );
}
