/**
 * Carta — SPEC §3.6.
 *
 * Editar la carta nunca reescribe la historia: cada línea servida lleva su
 * receta y su precio congelados. Lo que se cambia aquí vale para lo que venga.
 */
import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Plus, Trash2 } from 'lucide-preact';
import { createModifierOption, createProduct, saveProduct } from '../data/repo';
import type {
  AllowedModifierGroup,
  Category,
  ModifierEffect,
  Product,
  RecipeItem,
  Via,
} from '../data/types';
import { formatMoney } from '../domain/format';
import { costOfUsage } from '../domain/modifiers';
import { Button, Sheet } from '../ui/components';
import { Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import { ingredients, loadCatalog, modifierGroups, modifierOptions, products } from '../ui/store';

const CATEGORIAS: Category[] = ['Espresso', 'Con leche', 'Filtro', 'Fríos', 'Especiales', 'Otros'];

const VIAS: { value: Via; label: string }[] = [
  { value: 'grupo', label: 'Máquina de espresso' },
  { value: 'lote_caliente', label: 'Lote caliente (filtro)' },
  { value: 'lote_frio', label: 'Lote frío (cold brew, matcha)' },
  { value: 'envasado', label: 'Envasado' },
];

function parseNumber(text: string): number {
  const value = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

function numText(value: number): string {
  return String(value).replace('.', ',');
}

function productoVacio(sortOrder: number): Product {
  return {
    id: '',
    name: '',
    shortName: '',
    category: 'Otros',
    via: 'grupo',
    recipe: [{ ingredientId: 'menaje', qty: 1 }],
    price: 0,
    priceProvisional: false,
    allowedModifierGroups: [],
    active: true,
    sortOrder,
  };
}

export function AjustesCarta() {
  const { route } = useLocation();
  const [editando, setEditando] = useState<Product | null>(null);
  const [nuevaOpcion, setNuevaOpcion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grupos = useMemo(() => {
    const order: Category[] = [];
    const byCategory = new Map<Category, Product[]>();
    for (const p of products.value) {
      if (!byCategory.has(p.category)) {
        byCategory.set(p.category, []);
        order.push(p.category);
      }
      byCategory.get(p.category)!.push(p);
    }
    return order.map((category) => ({ category, items: byCategory.get(category) ?? [] }));
  }, [products.value]);

  async function alternarActivo(product: Product): Promise<void> {
    setBusy(true);
    await saveProduct({ ...product, active: !product.active });
    await loadCatalog();
    setBusy(false);
    showToast(product.active ? `«${product.name}» ya no sale en la barra` : `«${product.name}» vuelve a la barra`);
  }

  const siguienteOrden =
    products.value.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10;

  return (
    <section class="ajustes">
      <header class="row">
        <div class="stack">
          <h1 class="display">Carta</h1>
          <p class="meta">Los cambios afectan solo a pedidos futuros.</p>
        </div>
        <div class="spacer" />
        <Button variant="primary" onClick={() => setEditando(productoVacio(siguienteOrden))}>
          <Plus size={20} strokeWidth={1.75} /> Nueva bebida
        </Button>
      </header>

      {grupos.map(({ category, items }) => (
        <div class="eventos__group" key={category}>
          <h2 class="section-title">{category}</h2>
          {items.map((product) => (
            <div class={['event-row', product.active ? '' : 'is-off'].filter(Boolean).join(' ')} key={product.id}>
              <div class="event-row__main">
                <span class="event-row__name">
                  {product.name}
                  {product.priceProvisional ? <Etiqueta tone="warn">precio provisional</Etiqueta> : null}
                  {product.active ? null : <Etiqueta>desactivada</Etiqueta>}
                </span>
                <span class="meta">
                  {formatMoney(product.price)} ·{' '}
                  {product.recipe
                    .map((r) => ingredients.value.find((i) => i.id === r.ingredientId)?.name ?? r.ingredientId)
                    .join(' · ')}
                </span>
              </div>
              <button
                type="button"
                class="switch"
                aria-pressed={product.active}
                disabled={busy}
                onClick={() => void alternarActivo(product)}
              >
                {product.active ? 'Activa' : 'Desactivada'}
              </button>
              <Button onClick={() => setEditando(product)}>Editar</Button>
            </div>
          ))}
        </div>
      ))}

      <div class="eventos__group">
        <h2 class="section-title">Modificadores</h2>
        {modifierGroups.value.map((group) => (
          <div class="event-row" key={group.id}>
            <div class="event-row__main">
              <span class="event-row__name">{group.name}</span>
              <span class="meta">
                {modifierOptions.value
                  .filter((o) => o.groupId === group.id)
                  .map((o) => o.name)
                  .join(' · ')}
              </span>
            </div>
            <Button onClick={() => setNuevaOpcion(group.id)}>
              <Plus size={20} strokeWidth={1.75} /> Nueva opción
            </Button>
          </div>
        ))}
      </div>

      <div class="row">
        <Button variant="ghost" onClick={() => route('/ajustes')}>
          Volver a Carta y ajustes
        </Button>
      </div>

      {editando ? (
        <ProductoSheet
          product={editando}
          onClose={() => setEditando(null)}
          onSaved={() => setEditando(null)}
        />
      ) : null}

      {nuevaOpcion ? (
        <OpcionSheet groupId={nuevaOpcion} onClose={() => setNuevaOpcion(null)} />
      ) : null}
    </section>
  );
}

/* ================= Editor de una bebida ================= */

function ProductoSheet({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNuevo = product.id === '';
  const [name, setName] = useState(product.name);
  const [shortName, setShortName] = useState(product.shortName);
  const [category, setCategory] = useState<Category>(product.category);
  const [via, setVia] = useState<Via>(product.via);
  const [priceText, setPriceText] = useState(numText(product.price));
  const [sortOrder, setSortOrder] = useState(String(product.sortOrder));
  const [recipe, setRecipe] = useState<RecipeItem[]>(product.recipe);
  const [allowed, setAllowed] = useState<AllowedModifierGroup[]>(product.allowedModifierGroups);
  const [busy, setBusy] = useState(false);

  const price = parseNumber(priceText);
  // Editar el precio es exactamente lo que deja de hacerlo provisional.
  const sigueProvisional = product.priceProvisional && numText(product.price) === priceText;

  const usage = Object.fromEntries(recipe.map((r) => [r.ingredientId, r.qty]));
  const coste = costOfUsage(usage, ingredients.value);

  function setRecipeQty(index: number, text: string): void {
    setRecipe((prev) => prev.map((r, i) => (i === index ? { ...r, qty: parseNumber(text) } : r)));
  }

  function setRecipeIngredient(index: number, ingredientId: string): void {
    setRecipe((prev) => prev.map((r, i) => (i === index ? { ...r, ingredientId } : r)));
  }

  function addRecipeItem(): void {
    const libre = ingredients.value.find((i) => !recipe.some((r) => r.ingredientId === i.id));
    if (!libre) return;
    setRecipe((prev) => [...prev, { ingredientId: libre.id, qty: 0 }]);
  }

  function toggleGroup(groupId: string): void {
    setAllowed((prev) =>
      prev.some((g) => g.groupId === groupId)
        ? prev.filter((g) => g.groupId !== groupId)
        : [...prev, { groupId }],
    );
  }

  function toggleOption(groupId: string, optionId: string, todas: string[]): void {
    setAllowed((prev) => {
      const actual = prev.find((g) => g.groupId === groupId);
      if (!actual) return [...prev, { groupId, optionIds: [optionId] }];
      const actuales = actual.optionIds ?? todas;
      const next = actuales.includes(optionId)
        ? actuales.filter((id) => id !== optionId)
        : [...actuales, optionId];
      // Si vuelven a estar todas, se guarda sin lista: el producto admite el grupo entero.
      const limpio: AllowedModifierGroup =
        next.length === todas.length ? { groupId } : { groupId, optionIds: next };
      return prev.map((g) => (g.groupId === groupId ? limpio : g));
    });
  }

  async function guardar(): Promise<void> {
    if (name.trim() === '') {
      showToast('La bebida necesita un nombre: escríbelo arriba');
      return;
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      shortName: (shortName.trim() || name.trim()).slice(0, 14),
      category,
      via,
      recipe: recipe.filter((r) => r.qty > 0),
      price: Math.round(price * 100) / 100,
      priceProvisional: sigueProvisional,
      allowedModifierGroups: allowed,
      active: product.active,
      sortOrder: Math.round(parseNumber(sortOrder)) || 999,
    };
    if (esNuevo) await createProduct(payload);
    else await saveProduct({ ...payload, id: product.id });
    await loadCatalog();
    setBusy(false);
    showToast(esNuevo ? 'Bebida creada' : 'Bebida guardada');
    onSaved();
  }

  return (
    <Sheet title={esNuevo ? 'Nueva bebida' : product.name} wide onClose={onClose}>
      <div class="form__grid">
        <label class="field" for="pr-nombre">
          <span class="field__label">Nombre</span>
          <input
            id="pr-nombre"
            class="input"
            value={name}
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field" for="pr-corto">
          <span class="field__label">Nombre en el botón</span>
          <input
            id="pr-corto"
            class="input"
            value={shortName}
            placeholder={name}
            onInput={(e) => setShortName((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field" for="pr-categoria">
          <span class="field__label">Categoría</span>
          <select
            id="pr-categoria"
            class="select"
            value={category}
            onChange={(e) => setCategory((e.currentTarget as HTMLSelectElement).value as Category)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label class="field" for="pr-via">
          <span class="field__label">Cómo se prepara</span>
          <select
            id="pr-via"
            class="select"
            value={via}
            onChange={(e) => setVia((e.currentTarget as HTMLSelectElement).value as Via)}
          >
            {VIAS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label class="field" for="pr-precio">
          <span class="field__label">
            Precio {sigueProvisional ? <Etiqueta tone="warn">provisional</Etiqueta> : null}
          </span>
          <input
            id="pr-precio"
            class="input"
            inputMode="decimal"
            value={priceText}
            onInput={(e) => setPriceText((e.currentTarget as HTMLInputElement).value)}
          />
          <span class="meta">Solo se usa en los eventos de venta por bebida.</span>
        </label>
        <label class="field" for="pr-orden">
          <span class="field__label">Orden</span>
          <input
            id="pr-orden"
            class="input"
            inputMode="decimal"
            value={sortOrder}
            onInput={(e) => setSortOrder((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="form__block">
        <div class="row">
          <h3 class="section-title">Receta</h3>
          <div class="spacer" />
          <span class="meta num">Coste: {formatMoney(coste)}</span>
        </div>
        {recipe.map((item, index) => {
          const ing = ingredients.value.find((i) => i.id === item.ingredientId);
          return (
            <div class="receta-row" key={`${item.ingredientId}-${index}`}>
              <select
                class="select"
                aria-label="Insumo"
                value={item.ingredientId}
                onChange={(e) =>
                  setRecipeIngredient(index, (e.currentTarget as HTMLSelectElement).value)
                }
              >
                {ingredients.value.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                class="input"
                inputMode="decimal"
                aria-label={`Cantidad de ${ing?.name ?? item.ingredientId}`}
                value={numText(item.qty)}
                onInput={(e) => setRecipeQty(index, (e.currentTarget as HTMLInputElement).value)}
              />
              <span class="meta">{ing?.unit ?? ''}</span>
              <button
                type="button"
                class="btn btn--step"
                aria-label={`Quitar ${ing?.name ?? 'insumo'} de la receta`}
                onClick={() => setRecipe((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 size={20} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
        <Button onClick={addRecipeItem}>
          <Plus size={20} strokeWidth={1.75} /> Añadir insumo
        </Button>
      </div>

      <div class="form__block">
        <h3 class="section-title">Qué se le puede cambiar</h3>
        {modifierGroups.value.map((group) => {
          const opciones = modifierOptions.value.filter((o) => o.groupId === group.id);
          const todas = opciones.map((o) => o.id);
          const allowance = allowed.find((g) => g.groupId === group.id);
          const admitidas = allowance ? (allowance.optionIds ?? todas) : [];
          return (
            <div class="stack" key={group.id}>
              <label class="check">
                <input
                  type="checkbox"
                  checked={allowance !== undefined}
                  onChange={() => toggleGroup(group.id)}
                />
                <span>{group.name}</span>
              </label>
              {allowance ? (
                <div class="check-list">
                  {opciones.map((o) => (
                    <label class="check" key={o.id}>
                      <input
                        type="checkbox"
                        checked={admitidas.includes(o.id)}
                        onChange={() => toggleOption(group.id, o.id, todas)}
                      />
                      <span>{o.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button variant="primary" action disabled={busy} onClick={() => void guardar()}>
        {esNuevo ? 'Crear bebida' : 'Guardar cambios'}
      </Button>
    </Sheet>
  );
}

/* ================= Nueva opción de modificador ================= */

function OpcionSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const group = modifierGroups.value.find((g) => g.id === groupId);
  const [name, setName] = useState('');
  const [deltaText, setDeltaText] = useState('0');
  const [efecto, setEfecto] = useState<'replace' | 'add'>('replace');
  const [from, setFrom] = useState(ingredients.value[0]?.id ?? '');
  const [to, setTo] = useState(ingredients.value[1]?.id ?? '');
  const [qtyText, setQtyText] = useState('0');
  const [busy, setBusy] = useState(false);

  async function crear(): Promise<void> {
    if (name.trim() === '') {
      showToast('La opción necesita un nombre: escríbelo arriba');
      return;
    }
    const effects: ModifierEffect[] =
      efecto === 'replace'
        ? [{ kind: 'replace', from, to }]
        : [{ kind: 'add', ingredientId: to, qty: parseNumber(qtyText) }];
    setBusy(true);
    const hermanas = modifierOptions.value.filter((o) => o.groupId === groupId);
    await createModifierOption({
      groupId,
      name: name.trim(),
      isDefault: false,
      effects,
      priceDelta: Math.round(parseNumber(deltaText) * 100) / 100,
      sortOrder: hermanas.reduce((max, o) => Math.max(max, o.sortOrder), 0) + 10,
    });
    await loadCatalog();
    setBusy(false);
    showToast('Opción creada');
    onClose();
  }

  return (
    <Sheet title={`Nueva opción de ${group?.name ?? ''}`} onClose={onClose}>
      <label class="field" for="op-nombre">
        <span class="field__label">Nombre</span>
        <input
          id="op-nombre"
          class="input"
          value={name}
          placeholder="Soja"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <label class="field" for="op-delta">
        <span class="field__label">Cambio de precio (€)</span>
        <input
          id="op-delta"
          class="input"
          inputMode="decimal"
          value={deltaText}
          onInput={(e) => setDeltaText((e.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <label class="field" for="op-efecto">
        <span class="field__label">Qué le hace a la receta</span>
        <select
          id="op-efecto"
          class="select"
          value={efecto}
          onChange={(e) =>
            setEfecto((e.currentTarget as HTMLSelectElement).value as 'replace' | 'add')
          }
        >
          <option value="replace">Cambiar un insumo por otro</option>
          <option value="add">Añadir una cantidad de un insumo</option>
        </select>
      </label>

      {efecto === 'replace' ? (
        <div class="form__grid">
          <label class="field" for="op-from">
            <span class="field__label">Quita</span>
            <select
              id="op-from"
              class="select"
              value={from}
              onChange={(e) => setFrom((e.currentTarget as HTMLSelectElement).value)}
            >
              {ingredients.value.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label class="field" for="op-to">
            <span class="field__label">Pone</span>
            <select
              id="op-to"
              class="select"
              value={to}
              onChange={(e) => setTo((e.currentTarget as HTMLSelectElement).value)}
            >
              {ingredients.value.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div class="form__grid">
          <label class="field" for="op-add">
            <span class="field__label">Insumo</span>
            <select
              id="op-add"
              class="select"
              value={to}
              onChange={(e) => setTo((e.currentTarget as HTMLSelectElement).value)}
            >
              {ingredients.value.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label class="field" for="op-qty">
            <span class="field__label">Cantidad</span>
            <input
              id="op-qty"
              class="input"
              inputMode="decimal"
              value={qtyText}
              onInput={(e) => setQtyText((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
      )}

      <p class="meta">
        Después hay que marcarla en cada bebida que la admita, dentro de «Qué se le puede cambiar».
      </p>

      <Button variant="primary" action disabled={busy} onClick={() => void crear()}>
        Crear opción
      </Button>
    </Sheet>
  );
}
