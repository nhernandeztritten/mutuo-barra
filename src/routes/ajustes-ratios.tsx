/**
 * Métodos y ratios — SPEC §3.6.
 *
 * Las recetas clásicas de cada método, editables. Lo que hay que tener claro al
 * entrar aquí, y por eso está escrito en la pantalla: **cambiar un ratio no
 * reescribe ninguna receta**. Cambia lo que la app compara y lo que propone.
 */
import { useState } from 'preact/hooks';
import { RotateCcw } from 'lucide-preact';
import type { Metodo } from '../data/types';
import { formatDecimal } from '../domain/format';
import {
  METODOS,
  RATIOS_CLASICOS,
  ratiosEfectivos,
  volumenPara,
} from '../domain/recetas';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { showToast } from '../ui/toast';
import { ingredients, ratios, setRatios } from '../ui/store';

function parseNumber(text: string): number {
  const value = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

const n = (value: number): string => formatDecimal(value, 2);

/**
 * Cómo se lee cada método en cristiano, con una dosis de ejemplo y la frase que
 * corresponde. **No** se dice «una bebida de 200 ml pide tantos gramos»: en un
 * espresso el ratio se aplica a los 36 ml que salen, no al vaso entero con
 * leche, y esa frase invitaba a leer 100 g para un latte.
 */
const EJEMPLOS: Record<Metodo, { dosis: number; frase: (dosis: string, ml: string) => string }> = {
  espresso: { dosis: 18, frase: (d, ml) => `${d} g de café dan ${ml} ml de espresso en la taza.` },
  filtro: { dosis: 12.5, frase: (d, ml) => `${d} g de café dan ${ml} ml de café de filtro.` },
  cold_brew: { dosis: 12.5, frase: (d, ml) => `${d} g de café dan ${ml} ml de cold brew.` },
  infusion: { dosis: 2, frase: (d, ml) => `${d} g de hoja se infusionan en ${ml} ml de agua.` },
  batido: { dosis: 2.5, frase: (d, ml) => `${d} g de matcha se baten en ${ml} ml de leche.` },
  sin_extraccion: { dosis: 0, frase: () => '' },
};

export function AjustesRatios() {
  const route = useIr();
  const [busy, setBusy] = useState(false);
  const vigentes = ratiosEfectivos(ratios.value);
  const nombreDe = (id: string | null): string =>
    ingredients.value.find((i) => i.id === id)?.name.toLocaleLowerCase('es-ES') ?? 'materia';

  async function cambiar(metodo: Metodo, texto: string): Promise<void> {
    const valor = parseNumber(texto);
    setBusy(true);
    // Un campo vacío o a cero vuelve al clásico: no hay ratio de 0.
    const siguiente = { ...ratios.value };
    if (valor > 0) siguiente[metodo] = Math.round(valor * 100) / 100;
    else delete siguiente[metodo];
    await setRatios(siguiente);
    setBusy(false);
  }

  async function restaurar(): Promise<void> {
    setBusy(true);
    await setRatios({});
    setBusy(false);
    showToast('Ratios clásicos restaurados. Ninguna receta se ha tocado.');
  }

  const hayCambios = METODOS.some(
    (m) => m.ratio > 0 && vigentes[m.id] !== RATIOS_CLASICOS[m.id],
  );

  return (
    <section class="ajustes">
      <header class="row">
        <div class="stack">
          <h1 class="display">Métodos y ratios</h1>
          <p class="meta">
            Cambiar un ratio no reescribe ninguna receta: solo cambia lo que la app compara y lo
            que te propone al crear una bebida.
          </p>
        </div>
        <div class="spacer" />
        <Button disabled={busy || !hayCambios} onClick={() => void restaurar()}>
          <RotateCcw size={20} strokeWidth={1.75} /> Restaurar los clásicos
        </Button>
      </header>

      <div class="eventos__group">
        {METODOS.map((m) => {
          const ratio = vigentes[m.id];
          const editado = m.ratio > 0 && ratio !== RATIOS_CLASICOS[m.id];
          const materia = nombreDe(m.ingredienteBase);
          const { dosis, frase } = EJEMPLOS[m.id];
          return (
            <div class="ratio-row" key={m.id}>
              <div class="ratio-row__main">
                <span class="event-row__name">{m.label}</span>
                <span class="meta">
                  {m.ratio > 0
                    ? frase(n(dosis), n(volumenPara(m.id, dosis, ratios.value)))
                    : m.nota}
                </span>
              </div>
              {m.ratio > 0 ? (
                <label class="ratio-row__campo" for={`ra-${m.id}`}>
                  <span class="ratio-row__etiqueta">1 g de {materia} por</span>
                  <input
                    id={`ra-${m.id}`}
                    class="input"
                    inputMode="decimal"
                    aria-label={`Mililitros por gramo en ${m.label}`}
                    value={n(ratio)}
                    onChange={(e) =>
                      void cambiar(m.id, (e.currentTarget as HTMLInputElement).value)
                    }
                  />
                  <span class="ratio-row__unidad">ml</span>
                </label>
              ) : (
                <span class="meta ratio-row__campo">Sin ratio</span>
              )}
              <span class="ratio-row__clasico meta">
                {m.ratio > 0
                  ? editado
                    ? `El clásico es 1:${n(RATIOS_CLASICOS[m.id])}`
                    : 'El clásico'
                  : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div class="row">
        <Button variant="ghost" onClick={() => route('/ajustes')}>
          Volver a Carta y ajustes
        </Button>
      </div>
    </section>
  );
}
