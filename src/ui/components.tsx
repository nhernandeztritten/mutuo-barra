/**
 * Base building blocks only — the screens themselves land in phase 2.
 * Every size here comes from DESIGN.md, not from taste.
 */
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
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

    const ancla = anclaId ? ref.current?.querySelector<HTMLElement>(`#${anclaId}`) : null;
    if (ancla) {
      // El foco y el scroll tienen que ir al mismo sitio: si se enfocara la
      // cabecera y se desplazara el ancla, un lector de pantalla leería una
      // cosa y la pantalla enseñaría otra.
      ancla.focus({ preventScroll: true });
      const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      ancla.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    } else {
      enfocables()[0]?.focus();
    }

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
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return ref;
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
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 class="sheet__title">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X size={22} strokeWidth={1.75} />
          </Button>
        </header>
        {children}
      </aside>
    </>
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
