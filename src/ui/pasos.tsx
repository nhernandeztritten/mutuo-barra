/**
 * Indicador del ciclo de un evento: 1 Preparar → 2 Servir → 3 Cerrar → 4 Resultados.
 *
 * Aparece bajo el nombre del evento en todas sus pantallas. Contesta la pregunta
 * del Trunk Test: «¿dónde estoy y qué viene después?».
 */
import type { EventStatus } from '../data/types';

export type PasoId = 1 | 2 | 3 | 4;

/** Cómo se ve un paso: el actual en petróleo, los tocables activos, el resto apagado. */
export type PasoEstado = 'actual' | 'hecho' | 'disponible' | 'futuro';

export interface Paso {
  id: PasoId;
  name: string;
  estado: PasoEstado;
  /** `null` cuando el paso no se puede visitar desde donde estás. */
  href: string | null;
}

const NOMBRES: Record<PasoId, string> = {
  1: 'Preparar',
  2: 'Servir',
  3: 'Cerrar',
  4: 'Resultados',
};

/** El paso en el que está el evento ahora mismo. */
export function pasoActual(status: EventStatus): PasoId {
  if (status === 'planned') return 1;
  if (status === 'live') return 2;
  return 4;
}

/**
 * Los cuatro pasos con su estado para un evento concreto.
 *
 * - `planned`: estás en Preparar; nada más es visitable todavía.
 * - `live`: Preparar ya está hecho (no se edita con la barra abierta), estás en
 *   Servir y Cerrar está disponible.
 * - `closed`: solo Resultados; los tres primeros quedan apagados y de lectura.
 */
export function pasosDeEvento(eventId: string, status: EventStatus): Paso[] {
  const base = `/evento/${eventId}`;
  const paso = (id: PasoId, estado: PasoEstado, href: string | null = null): Paso => ({
    id,
    name: NOMBRES[id],
    estado,
    href: estado === 'disponible' || estado === 'actual' ? href : null,
  });

  if (status === 'planned') {
    return [paso(1, 'actual', base), paso(2, 'futuro'), paso(3, 'futuro'), paso(4, 'futuro')];
  }
  if (status === 'live') {
    return [
      paso(1, 'hecho'),
      paso(2, 'actual', base),
      paso(3, 'disponible', `${base}/cerrar`),
      paso(4, 'futuro'),
    ];
  }
  return [paso(1, 'futuro'), paso(2, 'futuro'), paso(3, 'futuro'), paso(4, 'actual', base)];
}

/**
 * @param compact versión para la cabecera de la barra. Ahí no caben cuatro
 *   pastillas sin bajar de 15 px, y DESIGN.md prohíbe texto más pequeño en la
 *   pantalla que se lee a 75 cm con las manos mojadas. Se resume en una línea
 *   —«Paso 2 de 4 · Servir»— que contesta la misma pregunta; el salto al paso 3
 *   lo da «Cerrar barra», que está en esa misma cabecera.
 */
export function Pasos({
  eventId,
  status,
  compact = false,
}: {
  eventId: string;
  status: EventStatus;
  compact?: boolean;
}) {
  const pasos = pasosDeEvento(eventId, status);
  const actual = pasos.find((p) => p.estado === 'actual');

  if (compact) {
    return (
      <p class="pasos-linea">
        Paso {actual?.id ?? 1} de 4 · <b>{actual?.name ?? ''}</b>
      </p>
    );
  }

  return (
    <ol class="pasos" aria-label={`Paso ${actual?.id ?? 1} de 4: ${actual?.name ?? ''}`}>
      {pasos.map((p) => {
        const inner = (
          <>
            <span class="pasos__num" aria-hidden="true">
              {p.id}
            </span>
            <span class="pasos__name">{p.name}</span>
          </>
        );
        return (
          <li class={`pasos__item is-${p.estado}`} key={p.id}>
            {p.href ? (
              <a
                class="pasos__link"
                href={p.href}
                {...(p.estado === 'actual' ? { 'aria-current': 'step' as const } : {})}
              >
                {inner}
              </a>
            ) : (
              <span class="pasos__link">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
