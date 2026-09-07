/**
 * Cómo se lee una anulación en la lista de pedidos.
 *
 * Desde el 07/09/2026 no se pregunta el motivo: anular es un toque y el aviso
 * ofrece «Deshacer» durante ocho segundos. En barra, con cola delante, elegir
 * entre tres motivos costaba más que el error que pretendía documentar
 * (`docs/DECISIONES.md`).
 */
import { VOID_DESHACER, VOID_EDITADO } from '../data/types';

/** Motivo que se guarda cuando el barista anula a mano. */
export const VOID_MANUAL = 'anulado';

export function etiquetaDeAnulacion(voidReason: string): string {
  // `editado` no es una anulación para el barista: ese pedido se corrigió y en
  // su sitio hay otro con la misma hora.
  if (voidReason === VOID_EDITADO) return 'Corregido';
  if (voidReason === VOID_DESHACER) return 'Anulado · Deshecho';
  return 'Anulado';
}
