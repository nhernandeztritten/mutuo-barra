/**
 * Mantener pulsado para confirmar una acción destructiva.
 *
 * La app no pregunta «¿estás seguro?» —`DESIGN.md` lo prohíbe— y tampoco planta
 * un modal en el centro de la pantalla. Para lo único que no se puede resolver
 * con un «Deshacer» a solas —empezar un evento de cero— la confirmación es
 * física: hay que aguantar el dedo un segundo y medio. Un toque suelto en el
 * bolsillo no lo consigue, y soltar antes lo cancela sin decir nada.
 *
 * El progreso se pinta con `transform: scaleX`, que no toca el layout. Con
 * `prefers-reduced-motion` no hay animación: en su sitio va un contador que baja
 * 3 · 2 · 1, para que quien la haya pedido siga sabiendo cuánto le falta.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

/** Lo que hay que aguantar. Un segundo y medio: bastante para no ser un toque. */
export const MANTENER_MS = 1500;

/** Tres pasos de cuenta atrás cuando no puede haber animación. */
const PASOS = 3;

function sinMovimiento(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function MantenerPulsado({
  label,
  onComplete,
  class: cls,
}: {
  /** Lo que dice el botón. Tiene que decir que hay que mantenerlo. */
  label: string;
  onComplete: () => void;
  class?: string | undefined;
}) {
  const [pulsando, setPulsando] = useState(false);
  /** Cuenta atrás visible solo con `prefers-reduced-motion`. 0 = no se enseña. */
  const [cuenta, setCuenta] = useState(0);
  const fin = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paso = useRef<ReturnType<typeof setInterval> | null>(null);
  const relleno = useRef<HTMLSpanElement>(null);

  function limpiar(): void {
    if (fin.current !== null) {
      clearTimeout(fin.current);
      fin.current = null;
    }
    if (paso.current !== null) {
      clearInterval(paso.current);
      paso.current = null;
    }
  }

  /** Soltar antes de tiempo: se cancela y no pasa nada. */
  function parar(): void {
    if (fin.current === null && paso.current === null && !pulsando) return;
    limpiar();
    setPulsando(false);
    setCuenta(0);
    const barra = relleno.current;
    if (barra) {
      barra.style.transition = 'transform 150ms var(--ease)';
      barra.style.transform = 'scaleX(0)';
    }
  }

  function empezar(): void {
    if (fin.current !== null) return;
    setPulsando(true);
    if (sinMovimiento()) {
      setCuenta(PASOS);
      paso.current = setInterval(() => {
        setCuenta((c) => Math.max(0, c - 1));
      }, MANTENER_MS / PASOS);
    } else if (relleno.current) {
      const barra = relleno.current;
      barra.style.transition = `transform ${String(MANTENER_MS)}ms linear`;
      barra.style.transform = 'scaleX(1)';
    }
    fin.current = setTimeout(() => {
      fin.current = null;
      parar();
      onComplete();
    }, MANTENER_MS);
  }

  // Desmontar a media pulsación no puede dejar vivo el temporizador que ejecuta.
  useEffect(() => limpiar, []);

  return (
    <button
      type="button"
      class={['mantener', pulsando ? 'is-pulsando' : '', cls ?? ''].filter(Boolean).join(' ')}
      onPointerDown={empezar}
      onPointerUp={parar}
      onPointerLeave={parar}
      onPointerCancel={parar}
      onKeyDown={(e) => {
        // Con el teclado vale lo mismo: mantener la barra o Intro. `repeat` se
        // ignora, que si no cada repetición reiniciaría la cuenta.
        if (e.repeat) return;
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        empezar();
      }}
      onKeyUp={parar}
      onBlur={parar}
    >
      <span class="mantener__relleno" ref={relleno} aria-hidden="true" />
      <span class="mantener__texto">
        {label}
        {cuenta > 0 ? <span class="mantener__cuenta num"> · {cuenta}</span> : null}
      </span>
    </button>
  );
}
