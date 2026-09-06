/**
 * Phase 1 placeholders. Each screen is built in phases 2 and 3; this file only
 * proves the routes of SPEC §5 resolve.
 */
import { useRoute } from 'preact-iso';

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section class="placeholder">
      <h1 class="display">{title}</h1>
      <p class="meta">{note}</p>
    </section>
  );
}

export const Eventos = () => <Placeholder title="Eventos" note="Fase 2: lista, nuevo evento, abrir y pausar la barra." />;

export const EventoNuevo = () => <Placeholder title="Nuevo evento" note="Fase 2: datos del evento y carga inicial con sugerencia." />;

export function Barra() {
  const { params } = useRoute();
  return <Placeholder title="Barra" note={`Fase 2: chips, tiles, ticket y servir. Evento ${params['id'] ?? '—'}.`} />;
}

export const Resumen = () => <Placeholder title="Resumen" note="Fase 3: bebidas por franja, top 5, leches y consumo contra carga." />;

export const Cierre = () => <Placeholder title="Cerrar evento" note="Fase 3: recuento, notas y resultado." />;

export const Panel = () => <Placeholder title="Panel" note="Fase 3: comparativa entre eventos y exportación CSV/JSON." />;

export const Ajustes = () => <Placeholder title="Ajustes" note="Fase 3: carta, insumos y dispositivo." />;

export const AjustesCarta = () => <Placeholder title="Carta" note="Fase 3: productos, recetas, precios y modificadores." />;

export const AjustesInsumos = () => <Placeholder title="Insumos" note="Fase 3: coste unitario, origen del dato y seguimiento de stock." />;

export const NoEncontrado = () => <Placeholder title="Aquí no hay nada" note="La dirección no existe. Vuelve a Eventos." />;
