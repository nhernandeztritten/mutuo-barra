/** Dirección que no existe. Siempre con salida a Eventos. */
import { useLocation } from 'preact-iso';
import { Button } from '../ui/components';

export function NoEncontrado() {
  const { route } = useLocation();
  return (
    <section class="stack" style={{ maxWidth: '640px' }}>
      <h1 class="display">Aquí no hay nada</h1>
      <p class="meta">Esta dirección no existe. Vuelve a la lista de eventos.</p>
      <div class="row">
        <Button variant="primary" onClick={() => route('/')}>
          Ir a Eventos
        </Button>
      </div>
    </section>
  );
}
