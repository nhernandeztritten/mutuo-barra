/**
 * Gráficos SVG a mano, sin librería (SPEC §3.5: la app funciona sin internet y
 * no carga nada de un CDN).
 *
 * Reglas que se siguen aquí (método `dataviz`):
 * - Barras de 24 px como mucho, extremo redondeado 4 px y base cuadrada.
 * - Rejilla y ejes: línea sólida de 1 px, un paso por encima del fondo. Nunca
 *   discontinua. La discontinua se reserva para un umbral de verdad (el techo).
 * - El texto lleva color de tinta, nunca el color de la serie.
 * - Una serie no lleva leyenda (el título ya la nombra); dos o más, siempre.
 * - Cada gráfico tiene su gemelo en texto al lado: ninguna cifra vive solo aquí.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, RefObject } from 'preact';

/* ---------------- Medida real del contenedor ---------------- */

/**
 * Ancho en píxeles del contenedor. El SVG se dibuja a tamaño real —sin escalar—
 * para que una etiqueta de 15 px siga midiendo 15 px en pantalla.
 */
function useAncho(fallback = 560): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const medir = (): void => setAncho(Math.max(240, Math.round(node.clientWidth)));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return [ref, ancho];
}

/** Rectángulo con las dos esquinas del extremo redondeadas y la base cuadrada. */
function barraVertical(x: number, y: number, w: number, h: number, r = 4): string {
  const radio = Math.max(0, Math.min(r, h, w / 2));
  const base = y + h;
  return `M${x} ${base} L${x} ${y + radio} Q${x} ${y} ${x + radio} ${y} L${x + w - radio} ${y} Q${x + w} ${y} ${x + w} ${y + radio} L${x + w} ${base} Z`;
}

/* ---------------- Envoltorio ---------------- */

export function Grafico({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ComponentChildren;
}) {
  return (
    <figure class="grafico">
      <figcaption class="grafico__cap">
        <span class="card__title">{titulo}</span>
        {nota ? <span class="meta">{nota}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}

/* ---------------- Columnas con umbral ---------------- */

export interface Columna {
  /** Etiqueta bajo la columna (una hora, un nombre de evento). */
  label: string;
  value: number;
  /** Texto del valor; por defecto, el número. */
  text?: string;
}

/**
 * Columnas verticales de una sola serie.
 *
 * @param umbral línea de referencia discontinua (el techo de la barra, la media
 *   entre eventos). Es un umbral de verdad, por eso va discontinua.
 */
export function Columnas({
  data,
  umbral,
  umbralLabel,
  alto = 190,
  fuente = 15,
}: {
  data: Columna[];
  umbral?: number | null;
  umbralLabel?: string;
  alto?: number;
  fuente?: number;
}) {
  const [ref, ancho] = useAncho();
  if (data.length === 0) return <p class="meta">Todavía no hay datos.</p>;

  const padTop = fuente + 8;
  const padBottom = fuente + 10;
  const plot = alto - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.value), umbral ?? 0);
  const paso = ancho / data.length;
  const grosor = Math.min(24, Math.max(6, paso - 10));
  // Un número sobre cada columna solo mientras se puedan leer; si no, la
  // etiqueta del eje y el texto de al lado cargan con los valores.
  const etiquetar = data.length <= 12;
  const saltoX = Math.max(1, Math.ceil((data.length * (fuente * 2.6)) / Math.max(1, ancho)));
  const yDe = (v: number): number => padTop + plot - (v / max) * plot;

  return (
    <div class="grafico__lienzo" ref={ref}>
      <svg width={ancho} height={alto} role="img" aria-label="Gráfico de columnas">
        <line
          x1={0}
          y1={padTop + plot}
          x2={ancho}
          y2={padTop + plot}
          stroke="var(--line)"
          stroke-width="1"
        />
        {data.map((d, i) => {
          const h = (d.value / max) * plot;
          const x = i * paso + (paso - grosor) / 2;
          return (
            <g key={`${d.label}-${i}`}>
              {d.value > 0 ? (
                <path d={barraVertical(x, padTop + plot - h, grosor, h)} fill="var(--primary)">
                  <title>{`${d.label}: ${d.text ?? d.value}`}</title>
                </path>
              ) : null}
              {etiquetar ? (
                <text
                  x={i * paso + paso / 2}
                  y={padTop + plot - h - 6}
                  text-anchor="middle"
                  font-size={fuente}
                  fill="var(--ink-2)"
                  stroke="var(--surface)"
                  stroke-width="3"
                  paint-order="stroke"
                  class="num"
                >
                  {d.text ?? d.value}
                </text>
              ) : null}
              {i % saltoX === 0 ? (
                <text
                  x={i * paso + paso / 2}
                  y={alto - 2}
                  text-anchor="middle"
                  font-size={fuente}
                  fill="var(--ink-3)"
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {umbral !== undefined && umbral !== null && umbral > 0 ? (
          <>
            <line
              x1={0}
              y1={yDe(umbral)}
              x2={ancho}
              y2={yDe(umbral)}
              stroke="var(--warn)"
              stroke-width="2"
              stroke-dasharray="6 5"
            />
            {umbralLabel ? (
              <text
                x={ancho - 2}
                y={Math.max(fuente, yDe(umbral) - 5)}
                text-anchor="end"
                font-size={fuente}
                fill="var(--warn)"
                stroke="var(--surface)"
                stroke-width="3"
                paint-order="stroke"
              >
                {umbralLabel}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>
    </div>
  );
}

/* ---------------- Barras horizontales ---------------- */

export interface BarraFila {
  label: string;
  value: number;
  text: string;
}

/** Una serie, nombres largos: barras horizontales con el valor en la punta. */
export function BarrasHorizontales({ data, fuente = 15 }: { data: BarraFila[]; fuente?: number }) {
  if (data.length === 0) return <p class="meta">Todavía no hay datos.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div class="barras">
      {data.map((d) => (
        <div class="barras__fila" key={d.label} style={{ fontSize: `${fuente}px` }}>
          <span class="barras__label">{d.label}</span>
          <span class="barras__pista">
            <span class="barras__fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span class="barras__valor num">{d.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Barra apilada horizontal ---------------- */

export interface Segmento {
  label: string;
  value: number;
  color: string;
  text: string;
}

/**
 * Parte-de-un-todo. Los segmentos se separan con 2 px del color del fondo, no
 * con un borde. Siempre con leyenda: el color nunca es el único canal.
 */
export function BarraApilada({ data, alto = 26 }: { data: Segmento[]; alto?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p class="meta">Todavía no hay datos.</p>;
  const visibles = data.filter((d) => d.value > 0);
  return (
    <div class="apilada">
      <div class="apilada__pista" style={{ height: `${alto}px` }}>
        {visibles.map((d) => (
          <span
            class="apilada__seg"
            key={d.label}
            style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
            title={`${d.label}: ${d.text}`}
          />
        ))}
      </div>
      <ul class="leyenda">
        {visibles.map((d) => (
          <li class="leyenda__item" key={d.label}>
            <span class="leyenda__punto" style={{ background: d.color }} aria-hidden="true" />
            <span>{d.label}</span>
            <span class="leyenda__valor num">{d.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Curva ---------------- */

/** Una sola línea de 2 px con punto final; sin leyenda, el título la nombra. */
export function Curva({
  data,
  alto = 180,
  fuente = 14,
}: {
  data: Columna[];
  alto?: number;
  fuente?: number;
}) {
  const [ref, ancho] = useAncho();
  if (data.length === 0) return <p class="meta">Todavía no hay datos.</p>;

  const padTop = fuente + 10;
  const padBottom = fuente + 10;
  const plot = alto - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const paso = data.length > 1 ? ancho / (data.length - 1) : ancho;
  const px = (i: number): number => (data.length > 1 ? i * paso : ancho / 2);
  const py = (v: number): number => padTop + plot - (v / max) * plot;
  const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)} ${py(p.value)}`).join(' ');
  const saltoX = Math.max(1, Math.ceil((data.length * (fuente * 3.4)) / Math.max(1, ancho)));
  const ultimo = data[data.length - 1]!;

  return (
    <div class="grafico__lienzo" ref={ref}>
      <svg width={ancho} height={alto} role="img" aria-label="Curva">
        <line
          x1={0}
          y1={padTop + plot}
          x2={ancho}
          y2={padTop + plot}
          stroke="var(--line)"
          stroke-width="1"
        />
        <path
          d={`${d} L${px(data.length - 1)} ${padTop + plot} L${px(0)} ${padTop + plot} Z`}
          fill="var(--primary)"
          opacity="0.1"
        />
        <path
          d={d}
          fill="none"
          stroke="var(--primary)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        {/* Anillo de 2 px del color del fondo: el punto se lee aunque cruce la línea. */}
        <circle
          cx={px(data.length - 1)}
          cy={py(ultimo.value)}
          r="5"
          fill="var(--primary)"
          stroke="var(--surface)"
          stroke-width="2"
        />
        <text
          x={px(data.length - 1)}
          y={Math.max(fuente, py(ultimo.value) - 10)}
          text-anchor="end"
          font-size={fuente}
          fill="var(--ink-2)"
          class="num"
        >
          {ultimo.text ?? ultimo.value}
        </text>
        {data.map((p, i) =>
          i % saltoX === 0 ? (
            <text
              key={p.label}
              x={px(i)}
              y={alto - 2}
              text-anchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              font-size={fuente}
              fill="var(--ink-3)"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/* ---------------- Medidor ---------------- */

/**
 * Consumo contra carga. El relleno lleva la severidad; la pista es el mismo
 * color en claro. Ámbar por encima del 75 %, rojo por encima del 90 %.
 */
export function Medidor({
  label,
  pct,
  detalle,
}: {
  label: string;
  pct: number;
  detalle: string;
}) {
  const estado = pct > 90 ? 'danger' : pct > 75 ? 'warn' : 'ok';
  return (
    <div class={`medidor medidor--${estado}`}>
      <span class="medidor__label">{label}</span>
      <span class="medidor__pista">
        <span class="medidor__fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span class="medidor__detalle num">{detalle}</span>
    </div>
  );
}
