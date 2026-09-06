/**
 * Pantallas que todavía no toca construir. Cada una dice en qué fase llega y
 * deja siempre una salida: nunca un callejón sin retorno en medio de un evento.
 */
import { useLocation, useRoute } from 'preact-iso';
import { Button } from '../ui/components';

function Placeholder({ title, note }: { title: string; note: string }) {
  const { route } = useLocation();
  const { params } = useRoute();
  const eventId = params['id'];
  return (
    <section class="stack" style={{ maxWidth: '640px' }}>
      <h1 class="display">{title}</h1>
      <p class="meta">{note}</p>
      <div class="row">
        {eventId ? (
          <Button variant="primary" onClick={() => route(`/evento/${eventId}`)}>
            Volver a la barra
          </Button>
        ) : null}
        <Button onClick={() => route('/')}>Ir a Eventos</Button>
      </div>
    </section>
  );
}

export const Resumen = () => (
  <Placeholder
    title="Resumen del evento"
    note="Disponible en la siguiente fase: bebidas por franja, top 5, reparto de leches y consumo contra carga."
  />
);

export const Cierre = () => (
  <Placeholder
    title="Cerrar evento"
    note="Disponible en la siguiente fase: recuento de insumos, notas del evento y resultado con coste real por bebida."
  />
);

export const Panel = () => (
  <Placeholder title="Panel" note="Fase 3: comparativa entre eventos y exportación CSV/JSON." />
);

export const Ajustes = () => (
  <Placeholder title="Ajustes" note="Fase 3: carta, insumos y dispositivo." />
);

export const AjustesCarta = () => (
  <Placeholder title="Carta" note="Fase 3: productos, recetas, precios y modificadores." />
);

export const AjustesInsumos = () => (
  <Placeholder title="Insumos" note="Fase 3: coste unitario, origen del dato y seguimiento de stock." />
);

export const NoEncontrado = () => (
  <Placeholder title="Aquí no hay nada" note="La dirección no existe. Vuelve a Eventos." />
);
