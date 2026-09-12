/**
 * «Empezar de cero»: el panel de doble validación.
 *
 * Nicolas probó la app con el evento de verdad ya abierto y quiere dejarlo
 * limpio antes de servir. Reiniciar no borra nada —los pedidos quedan anulados
 * con motivo `reinicio`, la carga y los datos del evento no se tocan— pero
 * **sí** se lleva por delante el contador del evento en curso, así que no puede
 * pasar con un toque suelto.
 *
 * Dos validaciones y ninguna ventana emergente (`DESIGN.md` las prohíbe en el
 * flujo de servir): el panel se despliega en el sitio y dice exactamente qué se
 * pierde, y dentro hay que **mantener pulsado** un segundo y medio. Soltar
 * antes cancela. Después queda la tercera red: «Deshacer» durante ocho
 * segundos.
 */
import { useEffect, useRef } from 'preact/hooks';
import { formatInt } from '../domain/format';
import { Button } from './components';
import { MantenerPulsado } from './mantener';

export const REINICIO_LABEL = 'Mantén pulsado para empezar de cero';

/** Lo que se va a anular, contado y en castellano llano. */
export function avisoDeReinicio(servidas: number, enCurso: number): string {
  const conserva = 'La carga y los datos del evento se conservan.';
  if (servidas === 0 && enCurso === 0) {
    return `No hay nada servido todavía: solo se pone a cero el reloj de la barra. ${conserva}`;
  }
  const bebidas =
    servidas === 0
      ? ''
      : `${formatInt(servidas)} ${servidas === 1 ? 'bebida servida' : 'bebidas servidas'}`;
  const pedido = enCurso > 0 ? 'el pedido en curso' : '';
  const partes = [bebidas, pedido].filter(Boolean);
  // El verbo concuerda: una sola cosa en singular, dos o más en plural.
  const plural = partes.length > 1 || servidas > 1;
  return `Se ${plural ? 'anularán' : 'anulará'} ${partes.join(' y ')}. ${conserva}`;
}

export function PanelReinicio({
  servidas,
  enCurso,
  onReiniciar,
  onCancelar,
}: {
  servidas: number;
  /** Bebidas del pedido a medias. Cero si no hay ninguno. */
  enCurso: number;
  onReiniciar: () => void;
  onCancelar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * El panel entra por el pie de la hoja «Más», que en un iPhone ya llega al
   * 86 % de la pantalla: sin esto, «Cancelar» se quedaba por debajo del borde y
   * lo único que se veía del panel era el botón que reinicia. La salida tiene
   * que verse antes que la acción.
   */
  useEffect(() => {
    const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' });
  }, []);

  return (
    <div class="reinicio" ref={ref} role="group" aria-label="Empezar de cero">
      <p class="reinicio__aviso">{avisoDeReinicio(servidas, enCurso)}</p>
      {/* La salida va antes que la acción: al desplegarse el panel, lo primero
          que se lee debajo del aviso es cómo salir de aquí. */}
      <Button variant="ghost" class="reinicio__cancelar" onClick={onCancelar}>
        Cancelar
      </Button>
      <MantenerPulsado label={REINICIO_LABEL} onComplete={onReiniciar} />
    </div>
  );
}
