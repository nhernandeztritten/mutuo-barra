/**
 * Base building blocks only — the screens themselves land in phase 2.
 * Every size here comes from DESIGN.md, not from taste.
 */
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { esMovil } from './layout';
import { dismissToast, toasts } from './toast';

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** 72 px tall, full width: the single confirmation of the bar. */
  action?: boolean;
};

export function Button({ variant = 'secondary', action = false, class: cls, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, action ? 'btn--action' : '', cls ?? ''].filter(Boolean).join(' ');
  return <button type="button" {...rest} class={classes} />;
}

type ChipProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Un chip marcado va en violeta. Desde la fase 5 marca un extra **puesto** en
   * la bebida actual, no uno armado a la espera de una bebida.
   */
  armed?: boolean;
};

export function Chip({ armed = false, class: cls, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={armed}
      class={['chip', cls ?? ''].filter(Boolean).join(' ')}
    />
  );
}

type TileProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  /** Category accent, a 10 px dot in the corner. Never a side stripe. */
  accent?: string;
  price?: string;
};

export function Tile({ label, accent, price, class: cls, ...rest }: TileProps) {
  return (
    <button type="button" {...rest} class={['tile', cls ?? ''].filter(Boolean).join(' ')}>
      {accent ? <span class="tile__dot" style={{ '--cat': accent }} /> : null}
      <span>{label}</span>
      {price ? <span class="tile__price">{price}</span> : null}
    </button>
  );
}

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Numbers get `inputmode="decimal"`; 16 px keeps Safari from zooming. */
  numeric?: boolean;
  hint?: string;
};

export function Field({ label, numeric = false, hint, id, class: cls, ...rest }: InputProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label class="field" for={inputId}>
      <span class="field__label">{label}</span>
      <input
        id={inputId}
        {...(numeric ? { inputMode: 'decimal' as const, type: 'text' } : {})}
        {...rest}
        class={['input', cls ?? ''].filter(Boolean).join(' ')}
      />
      {hint ? <span class="meta">{hint}</span> : null}
    </label>
  );
}

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Cuánto hay que arrastrar una hoja hacia abajo para que se cierre. */
export const ARRASTRE_CIERRE = 80;

/** Lo que hay que mover el dedo antes de que un toque pase a ser un arrastre. */
const ARRASTRE_MARGEN = 12;

/**
 * `true` si nada entre el elemento tocado y la hoja está desplazado.
 *
 * Es la regla que deja convivir el gesto con el scroll interno: con la lista a
 * medio desplazar, el dedo desplaza; solo cuando el contenido está arriba del
 * todo el gesto pasa a ser «cerrar».
 */
function scrollArriba(desde: Element | null, hasta: HTMLElement): boolean {
  let el: Element | null = desde;
  while (el) {
    if (el instanceof HTMLElement && el.scrollTop > 0) return false;
    if (el === hasta) return true;
    el = el.parentElement;
  }
  return true;
}

/**
 * Deslizar la hoja hacia abajo para cerrarla, en el móvil.
 *
 * Nicolas: «al apretar en servidas, te lleva al histórico de pedidos, pero
 * cuesta para volver atrás». El gesto es el segundo camino de salida —el
 * primero es la «X», que desde esta fase ya no se va nunca de la pantalla— y es
 * el que la mano intenta sola en un iPhone.
 *
 * Con `prefers-reduced-motion` la hoja no sigue al dedo: se cierra al soltar si
 * el recorrido pasó del umbral, y nada se mueve por el camino.
 */
function engancharArrastre(caja: HTMLElement, cerrar: () => void): () => void {
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inicio: number | null = null;
  let recorrido = 0;
  let arrastrando = false;
  let puntero: number | null = null;

  function soltar(): void {
    caja.classList.remove('is-arrastrando');
    caja.style.transform = '';
    // jsdom no implementa la captura de puntero; en el navegador sí, y es lo
    // que evita que el arrastre acabe pulsando el botón donde empezó.
    if (puntero !== null && caja.hasPointerCapture?.(puntero)) caja.releasePointerCapture(puntero);
    inicio = null;
    recorrido = 0;
    arrastrando = false;
    puntero = null;
  }

  function alBajar(e: PointerEvent): void {
    if (!e.isPrimary) return;
    const objetivo = e.target instanceof Element ? e.target : null;
    // Desde el asa y desde la cabecera se arrastra siempre: son el tirador.
    const tirador = objetivo?.closest('.hoja__asa, .hoja__cabecera') != null;
    if (!tirador && !scrollArriba(objetivo, caja)) return;
    inicio = e.clientY;
    recorrido = 0;
    arrastrando = false;
    puntero = e.pointerId;
  }

  function alMover(e: PointerEvent): void {
    if (inicio === null) return;
    recorrido = e.clientY - inicio;
    if (!arrastrando) {
      // Hacia arriba no se arrastra: eso es desplazar, y el gesto se abandona.
      if (recorrido < -ARRASTRE_MARGEN) {
        inicio = null;
        return;
      }
      if (recorrido < ARRASTRE_MARGEN) return;
      arrastrando = true;
      caja.classList.add('is-arrastrando');
      caja.setPointerCapture?.(e.pointerId);
    }
    if (!sinMovimiento) caja.style.transform = `translateY(${String(Math.round(recorrido))}px)`;
  }

  function alSoltar(): void {
    const cierra = arrastrando && recorrido > ARRASTRE_CIERRE;
    soltar();
    if (cierra) cerrar();
  }

  caja.addEventListener('pointerdown', alBajar);
  caja.addEventListener('pointermove', alMover);
  caja.addEventListener('pointerup', alSoltar);
  caja.addEventListener('pointercancel', soltar);
  return () => {
    caja.removeEventListener('pointerdown', alBajar);
    caja.removeEventListener('pointermove', alMover);
    caja.removeEventListener('pointerup', alSoltar);
    caja.removeEventListener('pointercancel', soltar);
  };
}

/**
 * Comportamiento de diálogo para una hoja: foco dentro al abrir, Tab que da la
 * vuelta sin salirse, Escape que cierra y el foco devuelto a donde estaba.
 *
 * Sin esto, con el teclado o con VoiceOver se sigue navegando la barra que hay
 * detrás de la hoja, que es como no tener hoja.
 *
 * @returns la ref que hay que poner en el elemento de la hoja.
 */
export function useHoja<T extends HTMLElement>(
  onClose: () => void,
  /**
   * Id de un bloque de dentro por el que abrir la hoja, en vez de por arriba.
   * Sin esto no basta con un `scrollIntoView` desde el contenido: la hoja se
   * lleva el foco al botón «Cerrar» de su cabecera justo después, y ese foco
   * devuelve el scroll al principio.
   */
  anclaId?: string | undefined,
): RefObject<T> {
  const ref = useRef<T>(null);
  // El cierre cambia en cada render; el efecto se monta una sola vez.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    // Sin filtro de visibilidad a propósito: dentro de una hoja no hay nada
    // oculto, y `getClientRects()`/`offsetParent` no miden nada en las pruebas.
    const enfocables = (): HTMLElement[] => [
      ...(ref.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? []),
    ];

    const caja = ref.current;
    const cabecera = caja?.querySelector<HTMLElement>('.hoja__cabecera') ?? null;

    const ancla = anclaId ? caja?.querySelector<HTMLElement>(`#${anclaId}`) : null;
    if (ancla) {
      // El foco y el scroll tienen que ir al mismo sitio: si se enfocara la
      // cabecera y se desplazara el ancla, un lector de pantalla leería una
      // cosa y la pantalla enseñaría otra.
      ancla.focus({ preventScroll: true });
      // La cabecera va pegada arriba: sin este margen, el ancla se desplaza
      // justo debajo de ella y sus primeras líneas quedan tapadas.
      if (cabecera) ancla.style.scrollMarginBlockStart = `${String(cabecera.offsetHeight)}px`;
      const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      ancla.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    } else {
      enfocables()[0]?.focus();
    }

    // La línea de la cabecera solo cuando hay algo desplazado debajo: sin
    // contenido escondido no separa nada y es una raya de más.
    const alDesplazar = (): void => {
      cabecera?.classList.toggle('is-desplazada', (caja?.scrollTop ?? 0) > 1);
    };
    caja?.addEventListener('scroll', alDesplazar, { passive: true });

    // El gesto de cerrar es del móvil: en el iPad la hoja entra por el lado y
    // hay ratón, teclado y sitio de sobra para la «X».
    const soltarArrastre = caja && esMovil.value ? engancharArrastre(caja, () => cerrar.current()) : null;

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const lista = enfocables();
      if (lista.length === 0) return;
      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      const activo = document.activeElement;
      const dentro = ref.current?.contains(activo ?? null) ?? false;
      if (e.shiftKey && (activo === primero || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !dentro)) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      caja?.removeEventListener('scroll', alDesplazar);
      soltarArrastre?.();
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return ref;
}

/**
 * El asa de la hoja: la barra corta de 4 px que todo el mundo reconoce como
 * «esto se arrastra». Solo se dibuja en el móvil, que es donde hay gesto.
 */
export function Asa() {
  return <span class="hoja__asa" aria-hidden="true" />;
}

/** Side sheet, never a centred modal in the serving flow. */
export function Sheet({
  title,
  onClose,
  wide = false,
  anclaId,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Ancha para el resumen: los gráficos necesitan más de 440 px. */
  wide?: boolean;
  /** Abrir la hoja por este bloque, no por arriba («Ver todos» → los pedidos). */
  anclaId?: string | undefined;
  children: ComponentChildren;
}) {
  const ref = useHoja<HTMLElement>(onClose, anclaId);
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <aside
        ref={ref}
        class={['sheet', wide ? 'sheet--wide' : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Pegada arriba: el título y la «X» no se van de la pantalla se haya
            desplazado lo que se haya desplazado. Antes, abriendo el Resumen por
            el ancla de «Pedidos», la única salida quedaba fuera de la vista. */}
        <header class="hoja__cabecera sheet__head">
          <Asa />
          <h2 class="sheet__title">{title}</h2>
          <span class="spacer" />
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X size={22} strokeWidth={1.75} />
          </Button>
        </header>
        {children}
      </aside>
    </>
  );
}

/**
 * Hoja que sube desde abajo. Es el idioma de iOS y, sobre todo, no es un modal
 * centrado: DESIGN.md los prohíbe en el flujo de servir porque tapan la mano y
 * obligan a apuntar al medio de la pantalla. Aquí todo queda a la altura del
 * pulgar y se cierra tocando fuera, con Escape o con «Cerrar».
 */
export function HojaAbajo({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const ref = useHoja<HTMLElement>(onClose);
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <aside
        ref={ref}
        class="hoja-abajo"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header class="hoja__cabecera hoja-abajo__head">
          <Asa />
          <h2 class="sheet__title">{title}</h2>
          <span class="spacer" />
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X size={22} strokeWidth={1.75} />
          </Button>
        </header>
        {children}
      </aside>
    </>
  );
}

/**
 * Una fila de la hoja: 56 px, el nombre y debajo qué hace. Con `estado` es un
 * interruptor —«Rápido», «Noche»— y con él vacío, una acción.
 */
export function HojaFila({
  nombre,
  pista,
  estado,
  puesto,
  tono,
  onClick,
}: {
  nombre: string;
  pista: string;
  /** Lo que se lee a la derecha en un interruptor: «Puesto» / «Quitado». */
  estado?: string | undefined;
  puesto?: boolean | undefined;
  /** `terminal` para la única salida que cierra el evento. Contorno, no relleno. */
  tono?: 'terminal' | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={['hoja-fila', tono ? `hoja-fila--${tono}` : ''].filter(Boolean).join(' ')}
      {...(puesto === undefined ? {} : { 'aria-pressed': puesto })}
      onClick={onClick}
    >
      <span class="hoja-fila__texto">
        <span class="hoja-fila__nombre">{nombre}</span>
        <span class="hoja-fila__pista">{pista}</span>
      </span>
      {estado ? <span class="hoja-fila__estado">{estado}</span> : null}
    </button>
  );
}

/** Mount once in the shell. */
export function ToastHost() {
  return (
    <div class="toast-layer" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <div class="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                toast.action?.onAction();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
