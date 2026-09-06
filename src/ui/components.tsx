/**
 * Base building blocks only — the screens themselves land in phase 2.
 * Every size here comes from DESIGN.md, not from taste.
 */
import type { ComponentChildren, JSX } from 'preact';
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
  /** Armed chips are violet; they disarm after the drink is added. */
  armed?: boolean;
  /** Shakes once when the chip does not apply to the product. */
  shake?: boolean;
};

export function Chip({ armed = false, shake = false, class: cls, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={armed}
      class={['chip', shake ? 'chip--shake' : '', cls ?? ''].filter(Boolean).join(' ')}
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

/** Side sheet, never a centred modal in the serving flow. */
export function Sheet({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Ancha para el resumen: los gráficos necesitan más de 440 px. */
  wide?: boolean;
  children: ComponentChildren;
}) {
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <aside
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
