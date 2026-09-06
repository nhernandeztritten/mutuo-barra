/**
 * Piezas compartidas entre pantallas: la explicación de los cuatro pasos, la
 * cifra suelta y las etiquetas. Nada de dominio aquí dentro.
 */
import type { ComponentChildren } from 'preact';

/** Los cuatro pasos en una línea cada uno. Primer uso y «Carta y ajustes». */
export function ComoFunciona({ titulo = 'Cómo funciona' }: { titulo?: string }) {
  const pasos: [string, string][] = [
    ['Preparar', 'creas el evento y anotas lo que subes al carro.'],
    ['Servir', 'abres la barra y tocas cada bebida al servirla.'],
    ['Cerrar', 'cuentas lo que queda y anotas las incidencias.'],
    ['Resultados', 'ves qué se sirvió, qué se consumió y cuánto costó.'],
  ];
  return (
    <div class="card como">
      <h2 class="card__title">{titulo}</h2>
      <ol class="como__list">
        {pasos.map(([nombre, texto], i) => (
          <li class="como__item" key={nombre}>
            <span class="como__num num" aria-hidden="true">
              {i + 1}
            </span>
            <span class="como__text">
              <b>{nombre}</b> — {texto}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Cifra grande con su etiqueta. `hint` va debajo, en pequeño. */
export function Cifra({
  value,
  label,
  hint,
  state,
}: {
  value: string;
  label: string;
  hint?: string | undefined;
  state?: 'warn' | 'danger' | undefined;
}) {
  return (
    <div class={['stat', state ? `stat--${state}` : ''].filter(Boolean).join(' ')}>
      <span class="stat__value">{value}</span>
      <span class="stat__label">{label}</span>
      {hint ? <span class="stat__hint">{hint}</span> : null}
    </div>
  );
}

/** Etiqueta pequeña: «Ejemplo», «provisional», «Sin costear». */
export function Etiqueta({
  tone = 'neutro',
  children,
}: {
  tone?: 'neutro' | 'warn' | 'accent';
  children: ComponentChildren;
}) {
  return <span class={`etiqueta etiqueta--${tone}`}>{children}</span>;
}

/** Fila de dos columnas: concepto a la izquierda, cifra a la derecha. */
export function Fila({
  label,
  value,
  hint,
  state,
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  hint?: ComponentChildren;
  state?: 'warn' | 'danger' | undefined;
}) {
  return (
    <div class="fila">
      <span class="fila__label">
        {label}
        {hint ? <span class="fila__hint">{hint}</span> : null}
      </span>
      <span class={['fila__value', 'num', state ? `is-${state}` : ''].filter(Boolean).join(' ')}>
        {value}
      </span>
    </div>
  );
}
