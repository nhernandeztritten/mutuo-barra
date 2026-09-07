/**
 * Carta — SPEC §3.6.
 *
 * Editar la carta nunca reescribe la historia: cada línea servida lleva su
 * receta y su precio congelados. Lo que se cambia aquí vale para lo que venga.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Plus, Trash2 } from 'lucide-preact';
import { createModifierOption, createProduct, saveProduct } from '../data/repo';
import type {
  AllowedModifierGroup,
  Category,
  Metodo,
  ModifierEffect,
  Product,
  RecipeItem,
  Via,
} from '../data/types';
import { formatDecimal, formatMoney } from '../domain/format';
import { costOfUsage } from '../domain/modifiers';
import {
  METODOS,
  aguaDeExtraccion,
  dosisPara,
  metodoInfo,
  ratioDe,
  recetaPropuesta,
  revisarReceta,
  volumenExtraidoObjetivo,
  type Aviso,
} from '../domain/recetas';
import { Button, Sheet } from '../ui/components';
import { useIr } from '../ui/navegar';
import { Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import {
  ingredients,
  loadCatalog,
  modifierGroups,
  modifierOptions,
  products,
  ratios,
} from '../ui/store';

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

/**
 * Qué recurso ocupa cada método, para proponer la vía al crear una bebida. Solo
 * es un punto de partida: la vía se puede cambiar a mano y manda la de Nicolas.
 */
const VIA_DEL_METODO: Record<Metodo, Via> = {
  espresso: 'grupo',
  filtro: 'lote_caliente',
  cold_brew: 'lote_frio',
  infusion: 'lote_caliente',
  batido: 'lote_frio',
  sin_extraccion: 'envasado',
};

function numEs(value: number): string {
  return formatDecimal(value, 2);
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
    method: 'espresso',
    servingMl: 36,
  };
}

export function AjustesCarta() {
  const route = useIr();
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

  /**
   * Bebidas con algo que mirar. Son avisos, no errores: la carta funciona igual
   * y nada cambia hasta que Nicolas entre a tocarlo (SPEC §2.6).
   */
  const porRevisar = useMemo(() => {
    const map = new Map<string, Aviso[]>();
    for (const p of products.value) {
      const encontrados = revisarReceta(p, ingredients.value, ratios.value);
      if (encontrados.length > 0) map.set(p.id, encontrados);
    }
    return map;
  }, [products.value, ingredients.value, ratios.value]);

  return (
    <section class="ajustes">
      <header class="row">
        <div class="stack">
          <h1 class="display">Carta</h1>
          <p class="meta">
            Los cambios afectan solo a pedidos futuros.
            {porRevisar.size > 0
              ? ` ${porRevisar.size === 1 ? '1 bebida' : `${porRevisar.size} bebidas`} por revisar.`
              : ''}
          </p>
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
                  {porRevisar.has(product.id) ? (
                    <span class="marca-revisar" title={porRevisar.get(product.id)?.[0]?.texto}>
                      revisar
                    </span>
                  ) : null}
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
  const [method, setMethod] = useState<Metodo>(product.method ?? 'espresso');
  const [servingText, setServingText] = useState(numText(product.servingMl ?? 0));
  const [busy, setBusy] = useState(false);
  /**
   * Mientras la receta de una bebida nueva no se toque, la propone el ratio.
   * En cuanto Nicolas la edita, manda la suya: la propuesta ahorra teclear a
   * ciegas, no le quita el timón.
   */
  const recetaTocada = useRef(!esNuevo);
  /** Lo mismo con la vía: un cold brew no sale de la máquina de espresso. */
  const viaTocada = useRef(!esNuevo);

  const servingMl = parseNumber(servingText);
  /** El borrador de ahora mismo: los avisos se leen sobre lo que se está editando. */
  const borrador: Product = { ...product, recipe, method, servingMl };
  const info = metodoInfo(method);
  const ratio = ratioDe(method, ratios.value);
  const objetivo = volumenExtraidoObjetivo(borrador, ingredients.value);
  const dosisIdeal = dosisPara(method, objetivo, ratios.value);
  const agua = aguaDeExtraccion(borrador, ratios.value);
  const materia =
    ingredients.value.find((i) => i.id === info?.ingredienteBase)?.name.toLocaleLowerCase('es-ES') ??
    'materia';
  const avisos = revisarReceta(borrador, ingredients.value, ratios.value);

  useEffect(() => {
    // Solo al crear, y solo mientras la receta siga siendo la propuesta.
    if (!esNuevo || recetaTocada.current) return;
    setRecipe(recetaPropuesta(method, servingMl, ingredients.value, ratios.value));
  }, [esNuevo, method, servingMl]);

  useEffect(() => {
    // Al crear, la vía sigue al método mientras nadie la toque: si no, la hoja
    // enseñaba «Cold brew» y «Máquina de espresso» a la vez, contradiciéndose.
    if (!esNuevo || viaTocada.current) return;
    setVia(VIA_DEL_METODO[method]);
  }, [esNuevo, method]);

  function editarReceta(next: RecipeItem[] | ((prev: RecipeItem[]) => RecipeItem[])): void {
    recetaTocada.current = true;
    setRecipe(next);
  }

  /** «Usar el ratio»: ajusta la dosis del insumo base y nada más. */
  function usarElRatio(arreglo: { ingredientId: string; qty: number }): void {
    recetaTocada.current = true;
    setRecipe((prev) =>
      prev.some((r) => r.ingredientId === arreglo.ingredientId)
        ? prev.map((r) =>
            r.ingredientId === arreglo.ingredientId ? { ...r, qty: arreglo.qty } : r,
          )
        : [{ ingredientId: arreglo.ingredientId, qty: arreglo.qty }, ...prev],
    );
    showToast(`Dosis ajustada a ${numEs(arreglo.qty)} g. Nada más ha cambiado.`);
  }

  const price = parseNumber(priceText);
  // Editar el precio es exactamente lo que deja de hacerlo provisional.
  const sigueProvisional = product.priceProvisional && numText(product.price) === priceText;

  const usage = Object.fromEntries(recipe.map((r) => [r.ingredientId, r.qty]));
  const coste = costOfUsage(usage, ingredients.value);

  function setRecipeQty(index: number, text: string): void {
    editarReceta((prev) => prev.map((r, i) => (i === index ? { ...r, qty: parseNumber(text) } : r)));
  }

  function setRecipeIngredient(index: number, ingredientId: string): void {
    editarReceta((prev) => prev.map((r, i) => (i === index ? { ...r, ingredientId } : r)));
  }

  function addRecipeItem(): void {
    const libre = ingredients.value.find((i) => !recipe.some((r) => r.ingredientId === i.id));
    if (!libre) return;
    editarReceta((prev) => [...prev, { ingredientId: libre.id, qty: 0 }]);
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
      method,
      servingMl: Math.round(servingMl * 100) / 100,
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
          {/* No es «cómo se prepara»: eso es el método, que está abajo. Esto es
              qué recurso ocupa, que es lo que decide el ritmo por hora. */}
          <span class="field__label">Qué ocupa al servirla</span>
          <select
            id="pr-via"
            class="select"
            value={via}
            onChange={(e) => {
              viaTocada.current = true;
              setVia((e.currentTarget as HTMLSelectElement).value as Via);
            }}
          >
            {VIAS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <span class="meta">Solo la máquina de espresso cuenta para el ritmo por hora.</span>
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

      <div class="form__block prep">
        <h3 class="section-title">Preparación</h3>
        <div class="form__grid">
          <label class="field" for="pr-metodo">
            <span class="field__label">Método</span>
            <select
              id="pr-metodo"
              class="select"
              value={method}
              onChange={(e) => setMethod((e.currentTarget as HTMLSelectElement).value as Metodo)}
            >
              {METODOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label class="field" for="pr-volumen">
            <span class="field__label">Volumen servido (ml)</span>
            <input
              id="pr-volumen"
              class="input"
              inputMode="decimal"
              value={servingText}
              onInput={(e) => setServingText((e.currentTarget as HTMLInputElement).value)}
            />
            <span class="meta">Lo que llega al vaso, sin contar el hielo.</span>
          </label>
        </div>

        <p class="prep__lectura num">
          {ratio > 0 && objetivo > 0 ? (
            <>
              Ratio 1:{numEs(ratio)} · {numEs(objetivo)} ml piden {numEs(dosisIdeal)} g de {materia}
              {agua > 0 ? ` · agua de extracción ${numEs(agua)} ml` : ''}
            </>
          ) : ratio > 0 ? (
            <>Escribe el volumen servido y te digo cuántos gramos pide.</>
          ) : (
            <>{info?.nota ?? 'Elige un método arriba.'}</>
          )}
        </p>

        {esNuevo && !recetaTocada.current ? (
          <p class="meta">
            La receta de abajo se propone sola mientras no la toques: dosis por ratio, vaso y
            menaje.
          </p>
        ) : null}

        {avisos.length > 0 ? (
          <ul class="avisos">
            {avisos.map((aviso) => (
              <li class="aviso" key={`${aviso.tipo}-${aviso.texto}`}>
                <span class="aviso__texto">{aviso.texto}</span>
                {aviso.arreglo ? (
                  <Button class="aviso__accion" onClick={() => usarElRatio(aviso.arreglo!)}>
                    Usar el ratio
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
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
                onClick={() => editarReceta((prev) => prev.filter((_, i) => i !== index))}
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
