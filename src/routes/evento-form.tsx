/**
 * Nuevo evento y edición de uno `planned` — SPEC §3.1 y §2.4.
 * Una sola página con dos bloques: Datos y Carga. Se puede guardar sin carga.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { Play, Wand2 } from 'lucide-preact';
import { createEvent, openEvent, updateEvent } from '../data/repo';
import type { BarEvent, EventMode, EventType, StockMap } from '../data/types';
import { loadSuggestion } from '../domain/stats';
import { formatDecimal, formatQty } from '../domain/format';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { Pasos } from '../ui/pasos';
import { showToast } from '../ui/toast';
import { eventById, liveEvent, refreshEvents, trackedIngredients } from '../ui/store';

const TYPES: { value: EventType; label: string }[] = [
  { value: 'boda', label: 'Boda' },
  { value: 'privado', label: 'Evento privado' },
  { value: 'activacion', label: 'Activación' },
  { value: 'rodaje', label: 'Rodaje' },
  { value: 'mercado', label: 'Mercado' },
  { value: 'otro', label: 'Otro' },
];

const MODES: { value: EventMode; label: string }[] = [
  { value: 'incluido', label: 'Incluido en la tarifa' },
  { value: 'venta', label: 'Venta por bebida' },
];

/** `"3,25"` → `3.25`. Acepta también el punto por si el teclado lo mete. */
function parseNumber(text: string): number {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  const value = Number.parseFloat(clean);
  return Number.isFinite(value) ? value : 0;
}

function numberToText(value: number): string {
  if (value === 0) return '';
  // Dos decimales: la misma precisión que la sugerencia que se enseña al lado.
  return formatDecimal(value, 2);
}

interface FormState {
  name: string;
  type: EventType;
  date: string;
  venue: string;
  guestsExpected: string;
  drinksPerGuest: string;
  hoursContracted: string;
  baristas: string;
  mode: EventMode;
  notes: string;
}

function initialState(event: BarEvent | undefined): FormState {
  return {
    name: event?.name ?? '',
    type: event?.type ?? 'boda',
    date: event?.date ?? new Date().toISOString().slice(0, 10),
    venue: event?.venue ?? '',
    guestsExpected: event ? String(event.guestsExpected) : '',
    drinksPerGuest: formatDecimal(event?.drinksPerGuest ?? 1.2, 2),
    hoursContracted: String(event?.hoursContracted ?? 4),
    baristas: String(event?.baristas ?? 2),
    mode: event?.mode ?? 'incluido',
    notes: event?.notes ?? '',
  };
}

export function EventoForm() {
  const route = useIr();
  const { params } = useRoute();
  const id = params['id'];
  const existing = eventById(id);
  const isNew = id === undefined;

  const [form, setForm] = useState<FormState>(() => initialState(existing));
  /** Carga en unidad de stock (kg, L, ud), como texto para respetar la coma. */
  const [load, setLoad] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setForm(initialState(existing));
    const next: Record<string, string> = {};
    for (const ing of trackedIngredients.value) {
      const recipeQty = existing.stockStart[ing.id];
      if (recipeQty !== undefined) next[ing.id] = numberToText(recipeQty / ing.stockFactor);
    }
    setLoad(next);
  }, [existing?.id]);

  const guests = parseNumber(form.guestsExpected);
  const perGuest = parseNumber(form.drinksPerGuest);
  const suggestion = useMemo(() => loadSuggestion(guests, perGuest), [guests, perGuest]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** La carga se escribe en unidad de stock y se guarda en unidad de receta. */
  function collectStock(): StockMap {
    const stock: StockMap = {};
    for (const ing of trackedIngredients.value) {
      const text = load[ing.id];
      if (!text) continue;
      const value = parseNumber(text);
      if (value > 0) stock[ing.id] = Math.round(value * ing.stockFactor * 1000) / 1000;
    }
    return stock;
  }

  function useSuggestionFor(ingredientId: string): void {
    const ing = trackedIngredients.value.find((i) => i.id === ingredientId);
    const suggested = suggestion[ingredientId];
    if (!ing || suggested === undefined) return;
    setLoad((prev) => ({ ...prev, [ingredientId]: numberToText(suggested / ing.stockFactor) }));
  }

  function useAllSuggestions(): void {
    const next: Record<string, string> = { ...load };
    for (const ing of trackedIngredients.value) {
      const suggested = suggestion[ing.id];
      if (suggested !== undefined) next[ing.id] = numberToText(suggested / ing.stockFactor);
    }
    setLoad(next);
  }

  async function save(): Promise<BarEvent | null> {
    const name = form.name.trim();
    if (name === '') {
      showToast('El evento necesita un nombre: escríbelo arriba');
      return null;
    }
    setBusy(true);
    const payload = {
      name,
      type: form.type,
      date: form.date,
      venue: form.venue.trim(),
      guestsExpected: Math.round(parseNumber(form.guestsExpected)),
      drinksPerGuest: parseNumber(form.drinksPerGuest) || 1.2,
      hoursContracted: parseNumber(form.hoursContracted) || 4,
      baristas: Math.max(1, Math.round(parseNumber(form.baristas)) || 2),
      mode: form.mode,
      stockStart: collectStock(),
      notes: form.notes,
    };
    const saved = existing ? await updateEvent(existing.id, payload) : await createEvent(payload);
    await refreshEvents();
    setBusy(false);
    return saved;
  }

  async function saveAndBack(): Promise<void> {
    const saved = await save();
    if (!saved) return;
    showToast(isNew ? 'Evento creado' : 'Evento guardado', null, 4000);
    route('/');
  }

  async function saveAndOpen(): Promise<void> {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    await openEvent(saved.id);
    await refreshEvents();
    setBusy(false);
    route(`/evento/${saved.id}`);
  }

  const otherLive = liveEvent.value && liveEvent.value.id !== existing?.id ? liveEvent.value : null;

  return (
    <section class="form">
      <header class="stack">
        <h1 class="display">{isNew ? 'Nuevo evento' : form.name || 'Evento'}</h1>
        {existing ? <Pasos eventId={existing.id} status={existing.status} /> : null}
        <p class="meta">
          {isNew
            ? 'Paso 1 de 4: los datos del evento y lo que subes al carro. La carga se puede rellenar después.'
            : 'Comprueba los datos y la carga antes de abrir la barra.'}
        </p>
      </header>

      <div class="form__block">
        <h2 class="section-title">Datos</h2>
        <div class="form__grid">
          <label class="field" for="ev-nombre">
            <span class="field__label">Nombre</span>
            <input
              id="ev-nombre"
              class="input"
              value={form.name}
              placeholder="Boda Ana y Marc"
              onInput={(e) => set('name', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-tipo">
            <span class="field__label">Tipo</span>
            <select
              id="ev-tipo"
              class="select"
              value={form.type}
              onChange={(e) => set('type', (e.currentTarget as HTMLSelectElement).value as EventType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label class="field" for="ev-fecha">
            <span class="field__label">Fecha</span>
            <input
              id="ev-fecha"
              class="input"
              type="date"
              value={form.date}
              onInput={(e) => set('date', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-lugar">
            <span class="field__label">Lugar</span>
            <input
              id="ev-lugar"
              class="input"
              value={form.venue}
              placeholder="Finca, Valencia"
              onInput={(e) => set('venue', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-invitados">
            <span class="field__label">Invitados</span>
            <input
              id="ev-invitados"
              class="input"
              inputMode="decimal"
              value={form.guestsExpected}
              placeholder="120"
              onInput={(e) => set('guestsExpected', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-bebidas">
            <span class="field__label">Bebidas por invitado</span>
            <input
              id="ev-bebidas"
              class="input"
              inputMode="decimal"
              value={form.drinksPerGuest}
              onInput={(e) => set('drinksPerGuest', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-horas">
            <span class="field__label">Horas contratadas</span>
            <input
              id="ev-horas"
              class="input"
              inputMode="decimal"
              value={form.hoursContracted}
              onInput={(e) => set('hoursContracted', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-baristas">
            <span class="field__label">Baristas</span>
            <input
              id="ev-baristas"
              class="input"
              inputMode="decimal"
              value={form.baristas}
              onInput={(e) => set('baristas', (e.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <label class="field" for="ev-modo">
            <span class="field__label">Modo de cobro</span>
            <select
              id="ev-modo"
              class="select"
              value={form.mode}
              onChange={(e) => set('mode', (e.currentTarget as HTMLSelectElement).value as EventMode)}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label class="field" for="ev-notas">
          <span class="field__label">Notas</span>
          <textarea
            id="ev-notas"
            class="textarea"
            value={form.notes}
            onInput={(e) => set('notes', (e.currentTarget as HTMLTextAreaElement).value)}
          />
        </label>
      </div>

      <div class="form__block">
        <div class="row">
          <h2 class="section-title">Carga</h2>
          <div class="spacer" />
          <Button onClick={useAllSuggestions} disabled={Object.keys(suggestion).length === 0}>
            <Wand2 size={20} strokeWidth={1.75} /> Usar todas las sugerencias
          </Button>
        </div>
        <p class="meta">
          Lo que subes de verdad al carro. Puedes guardarla vacía y rellenarla al abrir la barra.
          {Object.keys(suggestion).length === 0
            ? ' Escribe los invitados para ver las sugerencias.'
            : null}
        </p>

        {trackedIngredients.value.map((ing) => {
          const suggested = suggestion[ing.id];
          return (
            <div class="load-row" key={ing.id}>
              <span class="load-row__name">
                {ing.name} <span class="load-row__unit">({ing.stockUnit})</span>
              </span>
              <input
                class="input"
                inputMode="decimal"
                aria-label={`Carga de ${ing.name} en ${ing.stockUnit}`}
                value={load[ing.id] ?? ''}
                placeholder="0"
                onInput={(e) =>
                  setLoad((prev) => ({ ...prev, [ing.id]: (e.currentTarget as HTMLInputElement).value }))
                }
              />
              <span class="meta load-row__hint">
                {suggested === undefined ? '' : `Sugerido: ${formatQty(suggested, ing.unit)}`}
              </span>
              <Button
                class="load-row__use"
                variant="ghost"
                disabled={suggested === undefined}
                onClick={() => useSuggestionFor(ing.id)}
              >
                Usar sugerencia
              </Button>
            </div>
          );
        })}
      </div>

      {otherLive ? (
        <p class="meta">
          Hay otra barra abierta ({otherLive.name}). Al abrir esta, aquella se pausa y conserva sus
          pedidos.
        </p>
      ) : null}

      <div class="row">
        <Button variant="primary" disabled={busy} onClick={() => void saveAndBack()}>
          Guardar
        </Button>
        {existing && existing.status === 'planned' ? (
          <Button disabled={busy} onClick={() => void saveAndOpen()}>
            <Play size={20} strokeWidth={1.75} /> Guardar y abrir barra
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => route('/')}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
