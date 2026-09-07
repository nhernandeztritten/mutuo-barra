/**
 * Las recetas clásicas dentro de la interfaz: el bloque «Preparación» de la
 * carta, la propuesta al crear una bebida y los litros de lote del paso
 * «Preparar».
 *
 * Lo que se comprueba es lo que ve Nicolas, no la interna: que el aviso sale
 * con su texto, que «Usar el ratio» cambia la dosis **y nada más**, y que los
 * litros siguen ahí al volver a abrir el evento.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider, Route, Router } from 'preact-iso';
import { initDb, resetDb } from '../../data/db';
import { createEvent, getEvent, listProducts, saveProduct } from '../../data/repo';
import { AjustesCarta } from '../../routes/ajustes-carta';
import { EventoForm } from '../../routes/evento-form';
import { ToastHost } from '../components';
import { loadCatalog, loadSettings, refreshEvents } from '../store';
import { clearToasts } from '../toast';

function CartaHarness() {
  return (
    <LocationProvider>
      <AjustesCarta />
      <ToastHost />
    </LocationProvider>
  );
}

function EventoHarness() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/evento/:id/editar" component={EventoForm} />
        <Route default component={EventoForm} />
      </Router>
      <ToastHost />
    </LocationProvider>
  );
}

/** Abre el editor de una bebida por su nombre. */
function editar(nombre: string): void {
  const fila = [...document.querySelectorAll<HTMLElement>('.event-row')].find((el) =>
    el.querySelector('.event-row__name')?.textContent?.trim().startsWith(nombre),
  );
  if (!fila) throw new Error(`No hay fila para «${nombre}»`);
  const boton = [...fila.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === 'Editar',
  );
  if (!boton) throw new Error(`La fila de «${nombre}» no tiene «Editar»`);
  fireEvent.click(boton);
}

const avisos = (): string[] =>
  [...document.querySelectorAll('.aviso__texto')].map((el) => el.textContent?.trim() ?? '');

const lectura = (): string => document.querySelector('.prep__lectura')?.textContent?.trim() ?? '';

/** La receta del editor abierto, como `insumo: cantidad`. */
function receta(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fila of document.querySelectorAll('.receta-row')) {
    const select = fila.querySelector<HTMLSelectElement>('select');
    const input = fila.querySelector<HTMLInputElement>('input');
    if (select && input) {
      const nombre = select.options[select.selectedIndex]?.text ?? select.value;
      out[nombre] = input.value;
    }
  }
  return out;
}

function campo(id: string): HTMLInputElement | HTMLSelectElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`No existe el campo #${id}`);
  return el as HTMLInputElement | HTMLSelectElement;
}

beforeEach(async () => {
  cleanup();
  clearToasts();
  await resetDb();
  await initDb();
  await loadSettings();
  await loadCatalog();
  await refreshEvents();
});

describe('Carta: la marca de revisar', () => {
  it('la cabecera cuenta las bebidas por revisar y solo esas llevan la marca', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');

    expect(document.querySelector('.ajustes header .meta')?.textContent).toContain(
      '5 bebidas por revisar',
    );

    const marcadas = [...document.querySelectorAll('.event-row')]
      .filter((el) => el.querySelector('.marca-revisar'))
      // El nombre es el primer nodo de texto; detrás van las etiquetas.
      .map((el) => el.querySelector('.event-row__name')?.firstChild?.textContent?.trim());
    expect(marcadas).toEqual([
      'Flat white',
      'Espresso tonic',
      'Cremaet',
      'Carajillo',
      'Té / infusión',
    ]);
  });
});

describe('Carta: el bloque «Preparación»', () => {
  it('el Cold brew lee 1:10, 125 ml piden 12,5 g y no avisa de la dosis', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    editar('Cold brew');
    await screen.findByText('Preparación');

    expect((campo('pr-metodo') as HTMLSelectElement).value).toBe('cold_brew');
    expect((campo('pr-volumen') as HTMLInputElement).value).toBe('125');
    expect(lectura()).toContain('Ratio 1:10');
    expect(lectura()).toContain('125 ml piden 12,5 g de café');
    expect(avisos()).toEqual([]);
  });

  it('el Flat white avisa de que no cabe en su vaso, y ese aviso no tiene arreglo', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    editar('Flat white');
    await screen.findByText('Preparación');

    expect(avisos()).toEqual(['192 ml no caben en el vaso de 180 ml']);
    expect(document.querySelector('.aviso .btn')).toBeNull();
  });

  it('el Filtro con 12 g está dentro de tolerancia; con 9 avisa y «Usar el ratio» lo arregla', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    editar('Filtro');
    await screen.findByText('Preparación');
    expect(avisos()).toEqual([]);

    // Se baja la dosis a mano, como haría Nicolas.
    const cantidad = screen.getByLabelText('Cantidad de Café') as HTMLInputElement;
    fireEvent.input(cantidad, { target: { value: '9' } });
    await waitFor(() =>
      expect(avisos()).toEqual(['A 1:16, 200 ml piden 12,5 g y la receta tiene 9 g']),
    );

    const antes = receta();
    fireEvent.click(screen.getByRole('button', { name: 'Usar el ratio' }));
    await waitFor(() => expect(avisos()).toEqual([]));

    const despues = receta();
    expect(despues['Café']).toBe('12,5');
    // Y nada más se ha movido: el vaso y el menaje siguen igual.
    expect(Object.keys(despues)).toEqual(Object.keys(antes));
    expect(despues['Vaso 10 oz']).toBe(antes['Vaso 10 oz']);
    expect(despues['Servilleta + removedor + azúcar']).toBe(
      antes['Servilleta + removedor + azúcar'],
    );
  });

  it('el aviso de dosis no toca la carta hasta que se guarda', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    editar('Filtro');
    await screen.findByText('Preparación');
    fireEvent.input(screen.getByLabelText('Cantidad de Café'), { target: { value: '9' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar el ratio' }));

    // Sin pulsar «Guardar cambios», la base sigue con los 12 g medidos.
    const filtro = (await listProducts()).find((p) => p.id === 'filtro');
    expect(filtro?.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(12);
  });
});

describe('Carta: la propuesta al crear una bebida', () => {
  it('un cold brew de 250 ml propone 25 g de café y el vaso frío', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    fireEvent.click(screen.getByRole('button', { name: /Nueva bebida/ }));
    await screen.findByText('Preparación');

    fireEvent.input(campo('pr-nombre'), { target: { value: 'Cold brew doble' } });
    fireEvent.change(campo('pr-metodo'), { target: { value: 'cold_brew' } });
    fireEvent.input(campo('pr-volumen'), { target: { value: '250' } });

    await waitFor(() => expect(receta()['Café']).toBe('25'));
    expect(receta()['Vaso frío 425 ml']).toBe('1');
    expect(receta()['Hielo']).toBe('120');
    expect(receta()['Servilleta + removedor + azúcar']).toBe('1');
    expect(avisos()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Crear bebida' }));
    await waitFor(async () => {
      const creada = (await listProducts()).find((p) => p.name === 'Cold brew doble');
      expect(creada?.method).toBe('cold_brew');
      expect(creada?.servingMl).toBe(250);
      expect(creada?.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(25);
      expect(creada?.recipe.find((r) => r.ingredientId === 'vaso_frio')?.qty).toBe(1);
    });
  });

  it('la vía sigue al método al crear, para que la hoja no se contradiga', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    fireEvent.click(screen.getByRole('button', { name: /Nueva bebida/ }));
    await screen.findByText('Preparación');

    expect((campo('pr-via') as HTMLSelectElement).value).toBe('grupo');
    fireEvent.change(campo('pr-metodo'), { target: { value: 'cold_brew' } });
    await waitFor(() => expect((campo('pr-via') as HTMLSelectElement).value).toBe('lote_frio'));

    // Y en cuanto Nicolas la elige a mano, manda la suya.
    fireEvent.change(campo('pr-via'), { target: { value: 'grupo' } });
    fireEvent.change(campo('pr-metodo'), { target: { value: 'filtro' } });
    await waitFor(() => expect(lectura()).toContain('Ratio 1:16'));
    expect((campo('pr-via') as HTMLSelectElement).value).toBe('grupo');
  });

  it('en cuanto se toca la receta, la propuesta deja de mandar', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    fireEvent.click(screen.getByRole('button', { name: /Nueva bebida/ }));
    await screen.findByText('Preparación');

    fireEvent.change(campo('pr-metodo'), { target: { value: 'filtro' } });
    fireEvent.input(campo('pr-volumen'), { target: { value: '200' } });
    await waitFor(() => expect(receta()['Café']).toBe('12,5'));

    fireEvent.input(screen.getByLabelText('Cantidad de Café'), { target: { value: '14' } });
    // Cambiar el volumen ya no reescribe lo que Nicolas ha escrito.
    fireEvent.input(campo('pr-volumen'), { target: { value: '300' } });
    await waitFor(() => expect(lectura()).toContain('300 ml'));
    expect(receta()['Café']).toBe('14');
  });

  it('editar una bebida existente nunca propone nada', async () => {
    render(<CartaHarness />);
    await screen.findByText('Carta');
    editar('Cortado');
    await screen.findByText('Preparación');

    fireEvent.input(campo('pr-volumen'), { target: { value: '200' } });
    await waitFor(() => expect(lectura()).toContain('80 ml piden 40 g'));
    // La receta medida se queda como está; solo aparece el aviso.
    expect(receta()['Café']).toBe('18');
    expect(receta()['Leche entera']).toBe('120');
  });
});

describe('Preparar: los litros de lote', () => {
  it('4 L de batch dicen 250 g de café y suben el café sugerido en 250 g', async () => {
    const evento = await createEvent({ name: 'Boda Ana y Marc', guestsExpected: 100 });
    await refreshEvents();
    window.history.pushState({}, '', `/evento/${evento.id}/editar`);
    render(<EventoHarness />);
    await screen.findByText('Lotes');

    const sugeridoCafe = (): string => {
      const fila = [...document.querySelectorAll('.load-row')].find((el) =>
        el.querySelector('.load-row__name')?.textContent?.startsWith('Café '),
      );
      return fila?.querySelector('.load-row__hint')?.textContent?.trim() ?? '';
    };

    // 100 invitados × 1,2 = 120 bebidas × 18 g × 1,15 = 2.484 g.
    expect(sugeridoCafe()).toBe('Sugerido: 2,48 kg');

    fireEvent.input(screen.getByLabelText('Litros de Batch brew que vas a preparar'), {
      target: { value: '4' },
    });
    await waitFor(() =>
      expect(document.querySelector('.lote-row__cuenta')?.textContent).toBe(
        '4 L → 250 g de café + 4 L de agua (1:16)',
      ),
    );
    // 2.484 + 250 = 2.734 g.
    expect(sugeridoCafe()).toBe('Sugerido: 2,73 kg');
  });

  it('los litros se guardan en el evento y siguen ahí al volver a abrirlo', async () => {
    const evento = await createEvent({ name: 'Boda Ana y Marc', guestsExpected: 100 });
    await refreshEvents();
    window.history.pushState({}, '', `/evento/${evento.id}/editar`);
    const primera = render(<EventoHarness />);
    await screen.findByText('Lotes');

    fireEvent.input(screen.getByLabelText('Litros de Batch brew que vas a preparar'), {
      target: { value: '4' },
    });
    fireEvent.input(screen.getByLabelText('Litros de Cold brew que vas a preparar'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () => {
      expect((await getEvent(evento.id))?.lotes).toEqual({ filtro: 4, cold_brew: 2 });
    });

    primera.unmount();
    await refreshEvents();
    window.history.pushState({}, '', `/evento/${evento.id}/editar`);
    render(<EventoHarness />);
    await screen.findByText('Lotes');
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Litros de Batch brew que vas a preparar') as HTMLInputElement).value,
      ).toBe('4'),
    );
    expect(
      (screen.getByLabelText('Litros de Cold brew que vas a preparar') as HTMLInputElement).value,
    ).toBe('2');
  });

  it('desactivar una bebida de lote esconde su fila pero no borra los litros', async () => {
    const evento = await createEvent({
      name: 'Boda Ana y Marc',
      guestsExpected: 100,
      lotes: { filtro: 4, cold_brew: 2 },
    });
    // El cold brew sale de la carta después de haber escrito sus litros.
    for (const p of await listProducts()) {
      if (p.via === 'lote_frio') await saveProduct({ ...p, active: false });
    }
    await loadCatalog();
    await refreshEvents();

    window.history.pushState({}, '', `/evento/${evento.id}/editar`);
    render(<EventoHarness />);
    await screen.findByText('Lotes');
    expect(screen.queryByLabelText('Litros de Cold brew que vas a preparar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => {
      expect((await getEvent(evento.id))?.lotes).toEqual({ filtro: 4, cold_brew: 2 });
    });
  });

  it('sin bebidas de lote en la carta activa, el bloque no aparece', async () => {
    for (const p of await listProducts()) {
      if (p.via === 'lote_caliente' || p.via === 'lote_frio') {
        await saveProduct({ ...p, active: false });
      }
    }
    await loadCatalog();

    const evento = await createEvent({ name: 'Rodaje', guestsExpected: 30 });
    await refreshEvents();
    window.history.pushState({}, '', `/evento/${evento.id}/editar`);
    render(<EventoHarness />);
    await screen.findByText('Carga');
    expect(screen.queryByText('Lotes')).toBeNull();
  });
});
