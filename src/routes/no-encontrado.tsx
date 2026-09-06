/** Dirección que no existe. Siempre con salida a Eventos. */
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';

export function NoEncontrado() {
  const route = useIr();
  return (
    <section class="stack" style={{ maxWidth: '640px' }}>
      <h1 class="display">Aquí no hay nada</h1>
      <p class="meta">Esta dirección no existe.</p>
      <div class="row">
        <Button variant="primary" onClick={() => route('/')}>
          Ir a Eventos
        </Button>
      </div>
    </section>
  );
}
