/**
 * «Empezar de cero»: la doble validación y el tope de avisos del móvil.
 *
 * Lo que aquí se comprueba es lo que nadie puede comprobar a ojo en una boda:
 * que un toque suelto no reinicie nada, que soltar antes de tiempo cancele, y
 * que a 1,5 s se ejecute exactamente una vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { MANTENER_MS, MantenerPulsado } from '../mantener';
import { PanelReinicio, REINICIO_LABEL, avisoDeReinicio } from '../reinicio';
import { esMovil } from '../layout';
import { clearToasts, maxToasts, showToast, toasts } from '../toast';

function boton(): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(REINICIO_LABEL) }) as HTMLButtonElement;
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  esMovil.value = false;
  clearToasts();
});

describe('mantener pulsado', () => {
  it('un toque corto no hace nada', () => {
    const hecho = vi.fn();
    render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(120);
    fireEvent.pointerUp(boton());
    vi.advanceTimersByTime(5000);

    expect(hecho).not.toHaveBeenCalled();
  });

  it('soltar a 0,8 s cancela, y volver a intentarlo empieza de cero', () => {
    const hecho = vi.fn();
    render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(800);
    fireEvent.pointerUp(boton());
    // Lo que quedaba de aquel intento no puede seguir corriendo por su cuenta.
    vi.advanceTimersByTime(1000);
    expect(hecho).not.toHaveBeenCalled();

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(MANTENER_MS);
    expect(hecho).toHaveBeenCalledTimes(1);
  });

  it('a 1,5 s se ejecuta, y una sola vez', () => {
    const hecho = vi.fn();
    render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(MANTENER_MS - 1);
    expect(hecho).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hecho).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(hecho).toHaveBeenCalledTimes(1);
  });

  it('sacar el dedo del botón sin soltar también cancela', () => {
    const hecho = vi.fn();
    render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(900);
    fireEvent.pointerLeave(boton());
    vi.advanceTimersByTime(2000);

    expect(hecho).not.toHaveBeenCalled();
  });

  it('con el teclado vale mantener la barra, y la repetición no reinicia la cuenta', () => {
    const hecho = vi.fn();
    render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.keyDown(boton(), { key: ' ' });
    vi.advanceTimersByTime(1000);
    // Safari repite el evento mientras la tecla está abajo: si cada repetición
    // volviera a empezar, mantenerla pulsada no terminaría nunca.
    fireEvent.keyDown(boton(), { key: ' ', repeat: true });
    vi.advanceTimersByTime(500);

    expect(hecho).toHaveBeenCalledTimes(1);
  });

  it('desmontar a media pulsación no deja el temporizador vivo', () => {
    const hecho = vi.fn();
    const { unmount } = render(<MantenerPulsado label={REINICIO_LABEL} onComplete={hecho} />);

    fireEvent.pointerDown(boton());
    vi.advanceTimersByTime(700);
    unmount();
    vi.advanceTimersByTime(3000);

    expect(hecho).not.toHaveBeenCalled();
  });
});

describe('el panel dice qué se pierde antes de ofrecer el botón', () => {
  it('cuenta las bebidas y el pedido a medias', () => {
    expect(avisoDeReinicio(12, 3)).toBe(
      'Se anularán 12 bebidas servidas y el pedido en curso. La carga y los datos del evento se conservan.',
    );
    // El verbo concuerda: con una sola cosa va en singular.
    expect(avisoDeReinicio(1, 0)).toBe(
      'Se anulará 1 bebida servida. La carga y los datos del evento se conservan.',
    );
    expect(avisoDeReinicio(0, 2)).toBe(
      'Se anulará el pedido en curso. La carga y los datos del evento se conservan.',
    );
    expect(avisoDeReinicio(1, 2)).toBe(
      'Se anularán 1 bebida servida y el pedido en curso. La carga y los datos del evento se conservan.',
    );
  });

  it('sin nada servido no promete anular nada que no exista', () => {
    expect(avisoDeReinicio(0, 0)).toBe(
      'No hay nada servido todavía: solo se pone a cero el reloj de la barra. La carga y los datos del evento se conservan.',
    );
  });

  it('«Cancelar» cierra el panel y no reinicia nada', () => {
    const reiniciar = vi.fn();
    const cancelar = vi.fn();
    render(
      <PanelReinicio servidas={5} enCurso={0} onReiniciar={reiniciar} onCancelar={cancelar} />,
    );

    expect(screen.getByText(/Se anularán 5 bebidas servidas/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(reiniciar).not.toHaveBeenCalled();
  });
});

describe('el tope de avisos', () => {
  it('en móvil caben dos y en el iPad tres', () => {
    esMovil.value = true;
    expect(maxToasts()).toBe(2);
    for (const texto of ['uno', 'dos', 'tres']) showToast(texto);
    expect(toasts.value.map((t) => t.message)).toEqual(['dos', 'tres']);

    clearToasts();
    esMovil.value = false;
    expect(maxToasts()).toBe(3);
    for (const texto of ['uno', 'dos', 'tres']) showToast(texto);
    expect(toasts.value.map((t) => t.message)).toEqual(['uno', 'dos', 'tres']);
  });
});
