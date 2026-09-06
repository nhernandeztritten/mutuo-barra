/**
 * Insumos — SPEC §3.6.
 *
 * Un insumo a 0 € no se inventa: se marca «Sin costear» y se ve aquí hasta que
 * alguien mire la factura. Mientras siga a 0, el coste de las bebidas que lo
 * llevan está incompleto y así se dice.
 */
import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Plus } from 'lucide-preact';
import { createIngredient, saveIngredient } from '../data/repo';
import type { CostSource, Ingredient, RecipeUnit, StockUnit } from '../data/types';
import { Button, Sheet } from '../ui/components';
import { Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import { ingredients, loadCatalog, products } from '../ui/store';

const ORIGENES: { value: CostSource; label: string; hint: string }[] = [
  { value: 'medido', label: 'Medido', hint: 'sale de una factura o del escandallo' },
  { value: 'estimado', label: 'Estimado', hint: 'a ojo, con un ratio; revísalo' },
  { value: 'sin-costear', label: 'Sin costear', hint: 'todavía no sabemos lo que cuesta' },
];

const UNIDADES: { unit: RecipeUnit; stockUnit: StockUnit; factor: number; label: string }[] = [
  { unit: 'g', stockUnit: 'kg', factor: 1000, label: 'Gramos, se compra en kilos' },
  { unit: 'ml', stockUnit: 'L', factor: 1000, label: 'Mililitros, se compra en litros' },
  { unit: 'g', stockUnit: 'g', factor: 1, label: 'Gramos, se cuenta en gramos' },
  { unit: 'ud', stockUnit: 'ud', factor: 1, label: 'Unidades' },
];

function parseNumber(text: string): number {
  const value = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

/** Cuatro decimales: un mililitro de leche cuesta 0,00096 €. */
function costeText(value: number): string {
  return String(value).replace('.', ',');
}

function insumoVacio(sortOrder: number): Ingredient {
  return {
    id: '',
    name: '',
    unit: 'g',
    stockUnit: 'kg',
    stockFactor: 1000,
    costPerUnit: 0,
    costSource: 'sin-costear',
    trackStock: true,
    sortOrder,
  };
}

export function AjustesInsumos() {
  const { route } = useLocation();
  const [editando, setEditando] = useState<Ingredient | null>(null);
  const [busy, setBusy] = useState(false);

  const usoPorInsumo = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of products.value) {
      for (const item of p.recipe) {
        map.set(item.ingredientId, [...(map.get(item.ingredientId) ?? []), p.name]);
      }
    }
    return map;
  }, [products.value]);

  const sinCostear = ingredients.value.filter((i) => i.costSource === 'sin-costear');
  const siguienteOrden = ingredients.value.reduce((max, i) => Math.max(max, i.sortOrder), 0) + 10;

  async function alternarStock(ing: Ingredient): Promise<void> {
    setBusy(true);
    await saveIngredient({ ...ing, trackStock: !ing.trackStock });
    await loadCatalog();
    setBusy(false);
  }

  return (
    <section class="ajustes">
      <header class="row">
        <div class="stack">
          <h1 class="display">Insumos</h1>
          <p class="meta">Todos los costes llevan el IVA dentro.</p>
        </div>
        <div class="spacer" />
        <Button variant="primary" onClick={() => setEditando(insumoVacio(siguienteOrden))}>
          <Plus size={20} strokeWidth={1.75} /> Nuevo insumo
        </Button>
      </header>

      {sinCostear.length > 0 ? (
        <p class="meta">
          {sinCostear.length === 1 ? 'Hay un insumo' : `Hay ${sinCostear.length} insumos`} sin
          costear ({sinCostear.map((i) => i.name).join(', ')}). Mientras estén a 0 €, el coste de
          las bebidas que los llevan está incompleto.
        </p>
      ) : null}

      <div class="eventos__group">
        {ingredients.value.map((ing) => (
          <div class="event-row" key={ing.id}>
            <div class="event-row__main">
              <span class="event-row__name">
                {ing.name}
                {ing.costSource === 'sin-costear' ? <Etiqueta tone="warn">Sin costear</Etiqueta> : null}
                {ing.costSource === 'estimado' ? <Etiqueta>Estimado</Etiqueta> : null}
              </span>
              <span class="meta num">
                {costeText(ing.costPerUnit)} € por {ing.unit} · se cuenta en {ing.stockUnit}
                {usoPorInsumo.has(ing.id) ? ` · ${usoPorInsumo.get(ing.id)?.length} bebidas` : ''}
              </span>
            </div>
            <button
              type="button"
              class="switch"
              aria-pressed={ing.trackStock}
              disabled={busy}
              onClick={() => void alternarStock(ing)}
              title="Aparece en la carga del evento y en el recuento del cierre"
            >
              {ing.trackStock ? 'Se cuenta' : 'No se cuenta'}
            </button>
            <Button onClick={() => setEditando(ing)}>Editar</Button>
          </div>
        ))}
      </div>

      <div class="row">
        <Button variant="ghost" onClick={() => route('/ajustes')}>
          Volver a Carta y ajustes
        </Button>
      </div>

      {editando ? <InsumoSheet ingredient={editando} onClose={() => setEditando(null)} /> : null}
    </section>
  );
}

function InsumoSheet({ ingredient, onClose }: { ingredient: Ingredient; onClose: () => void }) {
  const esNuevo = ingredient.id === '';
  const [name, setName] = useState(ingredient.name);
  const [costText, setCostText] = useState(costeText(ingredient.costPerUnit));
  const [costSource, setCostSource] = useState<CostSource>(ingredient.costSource);
  const [unidadIdx, setUnidadIdx] = useState(() => {
    const i = UNIDADES.findIndex(
      (u) => u.unit === ingredient.unit && u.stockUnit === ingredient.stockUnit,
    );
    return i < 0 ? 0 : i;
  });
  const [trackStock, setTrackStock] = useState(ingredient.trackStock);
  const [busy, setBusy] = useState(false);

  const unidad = UNIDADES[unidadIdx] ?? UNIDADES[0]!;

  async function guardar(): Promise<void> {
    if (name.trim() === '') {
      showToast('El insumo necesita un nombre');
      return;
    }
    setBusy(true);
    const coste = parseNumber(costText);
    const payload = {
      name: name.trim(),
      unit: unidad.unit,
      stockUnit: unidad.stockUnit,
      stockFactor: unidad.factor,
      costPerUnit: coste,
      // Un coste a 0 sigue siendo «sin costear», diga lo que diga el desplegable.
      costSource: coste === 0 ? ('sin-costear' as CostSource) : costSource,
      trackStock,
      sortOrder: ingredient.sortOrder,
    };
    if (esNuevo) await createIngredient(payload);
    else await saveIngredient({ ...payload, id: ingredient.id });
    await loadCatalog();
    setBusy(false);
    showToast(esNuevo ? 'Insumo creado' : 'Insumo guardado');
    onClose();
  }

  return (
    <Sheet title={esNuevo ? 'Nuevo insumo' : ingredient.name} onClose={onClose}>
      <label class="field" for="in-nombre">
        <span class="field__label">Nombre</span>
        <input
          id="in-nombre"
          class="input"
          value={name}
          placeholder="Bebida de soja"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <label class="field" for="in-unidad">
        <span class="field__label">Unidades</span>
        <select
          id="in-unidad"
          class="select"
          value={String(unidadIdx)}
          onChange={(e) => setUnidadIdx(Number((e.currentTarget as HTMLSelectElement).value))}
        >
          {UNIDADES.map((u, i) => (
            <option key={u.label} value={String(i)}>
              {u.label}
            </option>
          ))}
        </select>
        <span class="meta">Las recetas se escriben en {unidad.unit}; la carga, en {unidad.stockUnit}.</span>
      </label>

      <label class="field" for="in-coste">
        <span class="field__label">Coste por {unidad.unit} (€, con IVA)</span>
        <input
          id="in-coste"
          class="input"
          inputMode="decimal"
          value={costText}
          onInput={(e) => setCostText((e.currentTarget as HTMLInputElement).value)}
        />
        <span class="meta">
          {parseNumber(costText) > 0
            ? `${costeText(Math.round(parseNumber(costText) * unidad.factor * 100) / 100)} € por ${unidad.stockUnit}`
            : 'A 0 € se queda como «Sin costear».'}
        </span>
      </label>

      <label class="field" for="in-origen">
        <span class="field__label">De dónde sale el coste</span>
        <select
          id="in-origen"
          class="select"
          value={costSource}
          onChange={(e) => setCostSource((e.currentTarget as HTMLSelectElement).value as CostSource)}
        >
          {ORIGENES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.hint}
            </option>
          ))}
        </select>
      </label>

      <label class="check">
        <input
          type="checkbox"
          checked={trackStock}
          onChange={() => setTrackStock((v) => !v)}
        />
        <span>Se carga y se cuenta en el cierre</span>
      </label>

      <Button variant="primary" action disabled={busy} onClick={() => void guardar()}>
        {esNuevo ? 'Crear insumo' : 'Guardar cambios'}
      </Button>
    </Sheet>
  );
}
