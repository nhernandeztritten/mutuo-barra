/**
 * Los motivos de anulación y sus chips en línea.
 *
 * Vivían dentro de `routes/resumen.tsx`. Desde la fase 7 se anula también
 * desde la fila desplegada de «Últimos pedidos», y los dos sitios tienen que
 * preguntar lo mismo con las mismas palabras: un solo componente, no dos que
 * se parecen.
 *
 * Nunca una ventana emergente centrada: los chips salen donde está el pedido
 * (`DESIGN.md`, «Prohibido»).
 */
import { VOID_DESHACER, VOID_EDITADO } from '../data/types';

export interface Motivo {
  id: string;
  label: string;
}

/** Lo que se le pregunta al barista al anular. Tres opciones, ni una más. */
export const MOTIVOS: Motivo[] = [
  { id: 'error', label: 'Error' },
  { id: 'devuelto', label: 'Devuelto' },
  { id: 'otro', label: 'Otro' },
];

/**
 * Cómo se lee un `voidReason` en la lista de pedidos.
 *
 * `editado` no es una anulación para el barista: ese pedido se corrigió y en
 * su sitio hay otro con la misma hora. Decirle «Anulado» sería mentirle sobre
 * lo que hizo.
 */
export function etiquetaDeAnulacion(voidReason: string): string {
  if (voidReason === VOID_EDITADO) return 'Corregido';
  const motivo = MOTIVOS.find((m) => m.id === voidReason);
  if (motivo) return `Anulado · ${motivo.label}`;
  if (voidReason === VOID_DESHACER) return 'Anulado · Deshecho';
  return voidReason ? `Anulado · ${voidReason}` : 'Anulado';
}

/**
 * Los tres motivos, en chips de 44 px, más «Cancelar» para salir sin anular.
 * Sustituye al «¿Estás seguro?» que `DESIGN.md` prohíbe: se elige el motivo o
 * no se anula.
 */
export function ChipsMotivo({
  onElegir,
  onCancelar,
  etiqueta = 'Motivo de la anulación',
}: {
  onElegir: (motivoId: string) => void;
  onCancelar: () => void;
  etiqueta?: string;
}) {
  return (
    <span class="pedido__motivos" role="group" aria-label={etiqueta}>
      {MOTIVOS.map((m) => (
        <button type="button" class="chip chip--mini" key={m.id} onClick={() => onElegir(m.id)}>
          {m.label}
        </button>
      ))}
      <button type="button" class="chip chip--mini" onClick={onCancelar}>
        Cancelar
      </button>
    </span>
  );
}
