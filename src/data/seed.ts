/**
 * Initial menu and ingredients — SPEC.md §2.1 to §2.3.
 * Every cost includes VAT. Ingredients with no measured cost carry 0 and
 * `costSource: 'sin-costear'` so Settings can flag them; we never invent a number.
 */
import type { Ingredient, Metodo, ModifierGroup, ModifierOption, Product } from './types';

/** Bump when the seed content changes so `initDb` can migrate. */
export const SEED_VERSION = 5;

/**
 * Cambios de la semilla que hay que llevar a una base ya sembrada. Solo se
 * aplican si el texto sigue siendo el que puso la semilla: si Nicolas lo editó
 * en Ajustes, manda lo suyo.
 *
 * v2 (fase 4): «Esp. tonic» y «Té/infusión» eran abreviaturas sin motivo; en el
 * grid de cuatro columnas los dos nombres completos caben.
 */
export const SHORTNAME_MIGRATIONS: { id: string; de: string; a: string }[] = [
  { id: 'espresso_tonic', de: 'Esp. tonic', a: 'Espresso tonic' },
  { id: 'te', de: 'Té/infusión', a: 'Té / infusión' },
];

/**
 * v3 (07/09/2026, decisión de Nicolas): el Americano y el Flat white se sacan
 * con doble carga, 36 g. Como ya son dobles, dejan de admitir el modificador
 * «Doble»: sumarlo otra vez daría 54 g, que no es ninguna bebida de la carta.
 *
 * `recetaAnterior` es la receta exacta que dejó la semilla v2. La migración
 * solo actúa si la receta guardada sigue siendo esa: si Nicolas la editó a mano
 * en Ajustes, manda lo suyo y no se toca nada (tampoco los modificadores).
 */
export interface DoseMigration {
  id: string;
  recetaAnterior: { ingredientId: string; qty: number }[];
  /** Cuánto café pasa a llevar la receta. */
  cafeNuevo: number;
  /** Opciones que el producto deja de admitir. */
  quitarOpciones: string[];
}

export const DOSE_MIGRATIONS: DoseMigration[] = [
  {
    id: 'americano',
    recetaAnterior: [
      { ingredientId: 'cafe', qty: 18 },
      { ingredientId: 'agua', qty: 150 },
      { ingredientId: 'vaso_10', qty: 1 },
      { ingredientId: 'menaje', qty: 1 },
    ],
    cafeNuevo: 36,
    quitarOpciones: ['extra_doble'],
  },
  {
    id: 'flat_white',
    recetaAnterior: [
      { ingredientId: 'cafe', qty: 18 },
      { ingredientId: 'leche', qty: 120 },
      { ingredientId: 'vaso_6', qty: 1 },
      { ingredientId: 'menaje', qty: 1 },
    ],
    cafeNuevo: 36,
    quitarOpciones: ['extra_doble'],
  },
];

/**
 * v4 (07/09/2026): la carta aprende las recetas clásicas por método. La
 * migración **solo añade metadatos** —método, volumen servido, capacidad de los
 * vasos y el insumo `te_hoja`—; no toca ninguna dosis, ningún precio y ningún
 * modificador. Los costes del escandallo no se mueven ni un céntimo.
 */
export const METHOD_MIGRATIONS: { id: string; method: Metodo; servingMl: number }[] = [
  { id: 'espresso', method: 'espresso', servingMl: 36 },
  { id: 'americano', method: 'espresso', servingMl: 222 },
  { id: 'cortado', method: 'espresso', servingMl: 156 },
  { id: 'flat_white', method: 'espresso', servingMl: 192 },
  { id: 'cappuccino', method: 'espresso', servingMl: 166 },
  { id: 'latte', method: 'espresso', servingMl: 256 },
  { id: 'filtro', method: 'filtro', servingMl: 200 },
  { id: 'cold_brew', method: 'cold_brew', servingMl: 125 },
  { id: 'espresso_tonic', method: 'espresso', servingMl: 236 },
  { id: 'matcha_latte', method: 'batido', servingMl: 200 },
  { id: 'cremaet', method: 'espresso', servingMl: 66 },
  { id: 'carajillo', method: 'espresso', servingMl: 66 },
  { id: 'te', method: 'infusion', servingMl: 200 },
  { id: 'agua_botella', method: 'sin_extraccion', servingMl: 250 },
];

/** Capacidad de los vasos, en ml. Sin esto no se puede avisar de que algo no cabe. */
export const CAPACITY_MIGRATIONS: { id: string; capacityMl: number }[] = [
  { id: 'vaso_6', capacityMl: 180 },
  { id: 'vaso_10', capacityMl: 300 },
  { id: 'vaso_frio', capacityMl: 425 },
];

/**
 * El té no costaba nada porque no tenía insumo: solo agua, vaso y menaje. Se
 * añade la hoja, sin costear (nadie ha mirado la factura todavía), y se mete en
 * la receta del Té con los 2 g que pide la infusión a 1:100.
 *
 * `recetaAnterior` es el seguro: si la receta guardada ya no es la de la
 * semilla, Nicolas la editó y no se le toca.
 */
export const TE_RECETA_ANTERIOR = [
  { ingredientId: 'agua', qty: 200 },
  { ingredientId: 'vaso_10', qty: 1 },
  { ingredientId: 'menaje', qty: 1 },
];
export const TE_HOJA_QTY = 2;

/**
 * v5 (11/09/2026, decisión de Nicolas: «quita lo de la tapa»). El modificador
 * **Tapa** desaparece de la carta: no se usaba en barra y ensuciaba la fila de
 * extras de nueve bebidas.
 *
 * Qué hace la migración y qué **no** hace:
 *
 * - Borra la opción `extra_tapa` y la quita de los `allowedModifierGroups` de
 *   todas las bebidas. Una lista de `extra` que se quede vacía deja de declarar
 *   el grupo: un grupo sin opciones no es un grupo.
 * - Los tres insumos de tapa **no se borran** —siguen en Ajustes → Insumos por
 *   si Mutuo los recupera— pero pasan a `trackStock: false`, para que no pidan
 *   un número en la carga ni en el recuento del cierre.
 * - **No toca ni un pedido.** Una línea servida con tapa guarda su receta, su
 *   coste y su etiqueta congelados: la historia no se reescribe.
 */
export const TAPA_OPTION_ID = 'extra_tapa';

/** Los insumos de tapa que dejan de contarse. Siguen existiendo. */
export const TAPA_INGREDIENTS = ['tapa_6', 'tapa_10', 'tapa_fria'];

export const INGREDIENTS: Ingredient[] = [
  // --- Cafés ---
  { id: 'cafe', name: 'Café', unit: 'g', stockUnit: 'kg', stockFactor: 1000, costPerUnit: 0.0297, costSource: 'medido', trackStock: true, sortOrder: 10 },
  { id: 'cafe_desca', name: 'Café descafeinado', unit: 'g', stockUnit: 'kg', stockFactor: 1000, costPerUnit: 0.0297, costSource: 'estimado', trackStock: true, sortOrder: 20 },
  // --- Líquidos ---
  { id: 'leche', name: 'Leche entera', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0.00096, costSource: 'medido', trackStock: true, sortOrder: 30 },
  { id: 'avena', name: 'Bebida de avena', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0.00219, costSource: 'medido', trackStock: true, sortOrder: 40 },
  { id: 'sin_lactosa', name: 'Leche sin lactosa', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0.0014, costSource: 'estimado', trackStock: true, sortOrder: 50 },
  { id: 'agua', name: 'Agua filtrada', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0.00038, costSource: 'estimado', trackStock: false, sortOrder: 60 },
  { id: 'hielo', name: 'Hielo', unit: 'g', stockUnit: 'kg', stockFactor: 1000, costPerUnit: 0.00035, costSource: 'medido', trackStock: true, sortOrder: 70 },
  { id: 'matcha', name: 'Matcha', unit: 'g', stockUnit: 'g', stockFactor: 1, costPerUnit: 0.0908, costSource: 'medido', trackStock: true, sortOrder: 80 },
  // --- Vasos (`capacityMl`: lo que cabe dentro, para avisar de que algo no cabe) ---
  // Las tapas siguen aquí por si vuelven, pero ya no se cuentan (semilla v5).
  { id: 'vaso_6', name: 'Vaso 6 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.062, costSource: 'medido', trackStock: true, sortOrder: 90, capacityMl: 180 },
  { id: 'vaso_10', name: 'Vaso 10 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.097, costSource: 'medido', trackStock: true, sortOrder: 100, capacityMl: 300 },
  { id: 'vaso_frio', name: 'Vaso frío 425 ml', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.142, costSource: 'medido', trackStock: true, sortOrder: 110, capacityMl: 425 },
  { id: 'tapa_6', name: 'Tapa 6 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.044, costSource: 'medido', trackStock: false, sortOrder: 120 },
  { id: 'tapa_10', name: 'Tapa 10 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.057, costSource: 'medido', trackStock: false, sortOrder: 130 },
  { id: 'tapa_fria', name: 'Tapa vaso frío', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.121, costSource: 'medido', trackStock: false, sortOrder: 140 },
  // --- Menaje ---
  { id: 'menaje', name: 'Servilleta + removedor + azúcar', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.031, costSource: 'medido', trackStock: false, sortOrder: 150 },
  // --- Sin costear: Nicolas los rellena en Ajustes ---
  // La hoja de té entra en la v4: hasta ahora un té no costaba nada porque no
  // tenía insumo ninguno, solo agua y vaso.
  { id: 'te_hoja', name: 'Hoja de té / infusión', unit: 'g', stockUnit: 'g', stockFactor: 1, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 155 },
  { id: 'tonica', name: 'Tónica', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 160 },
  { id: 'licor', name: 'Licor (cremaet / 43)', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 170 },
  { id: 'sirope', name: 'Sirope', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 180 },
  { id: 'pajita', name: 'Pajita', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0, costSource: 'sin-costear', trackStock: false, sortOrder: 190 },
];

/** Every recipe carries one `menaje`. */
const MENAJE = { ingredientId: 'menaje', qty: 1 };

export const PRODUCTS: Product[] = [
  {
    id: 'espresso', name: 'Espresso', shortName: 'Espresso', category: 'Espresso', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 2.0, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_doble', 'extra_iced'] }],
    active: true, sortOrder: 10, method: 'espresso', servingMl: 36,
  },
  {
    // Doble de café por decisión de Nicolas (07/09/2026): ya sale doble, así
    // que no admite el modificador «Doble».
    id: 'americano', name: 'Americano', shortName: 'Americano', category: 'Espresso', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 36 }, { ingredientId: 'agua', qty: 150 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_iced'] }],
    active: true, sortOrder: 20, method: 'espresso', servingMl: 222,
  },
  {
    id: 'cortado', name: 'Cortado', shortName: 'Cortado', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 120 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 2.2, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 30, method: 'espresso', servingMl: 156,
  },
  {
    // Doble de café, como el Americano: sin el modificador «Doble».
    id: 'flat_white', name: 'Flat white', shortName: 'Flat white', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 36 }, { ingredientId: 'leche', qty: 120 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.0, priceProvisional: true,
    allowedModifierGroups: [
      { groupId: 'leche' },
      { groupId: 'cafe' },
      { groupId: 'extra', optionIds: ['extra_iced', 'extra_sirope'] },
    ],
    active: true, sortOrder: 40, method: 'espresso', servingMl: 192,
  },
  {
    id: 'cappuccino', name: 'Cappuccino', shortName: 'Cappuccino', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 130 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.0, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 50, method: 'espresso', servingMl: 166,
  },
  {
    id: 'latte', name: 'Latte', shortName: 'Latte', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 220 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 3.2, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 60, method: 'espresso', servingMl: 256,
  },
  {
    id: 'filtro', name: 'Filtro', shortName: 'Filtro', category: 'Filtro', via: 'lote_caliente',
    recipe: [{ ingredientId: 'cafe', qty: 12 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.8, priceProvisional: true,
    allowedModifierGroups: [],
    active: true, sortOrder: 70, method: 'filtro', servingMl: 200,
  },
  {
    id: 'cold_brew', name: 'Cold brew', shortName: 'Cold brew', category: 'Fríos', via: 'lote_frio',
    recipe: [{ ingredientId: 'cafe', qty: 12.5 }, { ingredientId: 'hielo', qty: 120 }, { ingredientId: 'vaso_frio', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [],
    active: true, sortOrder: 80, method: 'cold_brew', servingMl: 125,
  },
  {
    id: 'espresso_tonic', name: 'Espresso tonic', shortName: 'Espresso tonic', category: 'Fríos', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'tonica', qty: 200 }, { ingredientId: 'hielo', qty: 120 }, { ingredientId: 'vaso_frio', qty: 1 }, MENAJE],
    price: 3.8, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_doble'] }],
    active: true, sortOrder: 90, method: 'espresso', servingMl: 236,
  },
  {
    id: 'matcha_latte', name: 'Matcha latte', shortName: 'Matcha latte', category: 'Fríos', via: 'lote_frio',
    recipe: [{ ingredientId: 'matcha', qty: 2.5 }, { ingredientId: 'leche', qty: 200 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 3.8, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'extra', optionIds: ['extra_iced'] }],
    active: true, sortOrder: 100, method: 'batido', servingMl: 200,
  },
  {
    id: 'cremaet', name: 'Cremaet', shortName: 'Cremaet', category: 'Especiales', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'licor', qty: 30 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }],
    active: true, sortOrder: 110, method: 'espresso', servingMl: 66,
  },
  {
    id: 'carajillo', name: 'Carajillo', shortName: 'Carajillo', category: 'Especiales', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'licor', qty: 30 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }],
    active: true, sortOrder: 120, method: 'espresso', servingMl: 66,
  },
  {
    id: 'te', name: 'Té / infusión', shortName: 'Té / infusión', category: 'Otros', via: 'lote_caliente',
    recipe: [{ ingredientId: 'te_hoja', qty: 2 }, { ingredientId: 'agua', qty: 200 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.0, priceProvisional: true,
    allowedModifierGroups: [],
    active: true, sortOrder: 130, method: 'infusion', servingMl: 200,
  },
  {
    id: 'agua_botella', name: 'Agua', shortName: 'Agua', category: 'Otros', via: 'envasado',
    recipe: [{ ingredientId: 'vaso_10', qty: 1 }, { ingredientId: 'agua', qty: 250 }, MENAJE],
    price: 1.0, priceProvisional: true,
    allowedModifierGroups: [],
    active: true, sortOrder: 140, method: 'sin_extraccion', servingMl: 250,
  },
];

export const MODIFIER_GROUPS: ModifierGroup[] = [
  { id: 'leche', name: 'Leche', type: 'single', sortOrder: 10 },
  { id: 'cafe', name: 'Café', type: 'single', sortOrder: 20 },
  { id: 'extra', name: 'Extras', type: 'multi', sortOrder: 30 },
];

export const MODIFIER_OPTIONS: ModifierOption[] = [
  { id: 'leche_vaca', groupId: 'leche', name: 'Vaca', isDefault: true, effects: [{ kind: 'none' }], priceDelta: 0, sortOrder: 10 },
  { id: 'leche_avena', groupId: 'leche', name: 'Avena', isDefault: false, effects: [{ kind: 'replace', from: 'leche', to: 'avena' }], priceDelta: 0.5, sortOrder: 20 },
  { id: 'leche_sin_lactosa', groupId: 'leche', name: 'Sin lactosa', isDefault: false, effects: [{ kind: 'replace', from: 'leche', to: 'sin_lactosa' }], priceDelta: 0.3, sortOrder: 30 },

  { id: 'cafe_normal', groupId: 'cafe', name: 'Normal', isDefault: true, effects: [{ kind: 'none' }], priceDelta: 0, sortOrder: 10 },
  { id: 'cafe_descafeinado', groupId: 'cafe', name: 'Descafeinado', isDefault: false, effects: [{ kind: 'replace', from: 'cafe', to: 'cafe_desca' }], priceDelta: 0, sortOrder: 20 },

  { id: 'extra_doble', groupId: 'extra', name: 'Doble', isDefault: false, effects: [{ kind: 'doubleCoffee', qty: 18, candidates: ['cafe', 'cafe_desca'] }], priceDelta: 0.8, sortOrder: 10 },
  { id: 'extra_iced', groupId: 'extra', name: 'Iced', isDefault: false, effects: [{ kind: 'iced', cupFrom: ['vaso_6', 'vaso_10'], cupTo: 'vaso_frio', iceIngredientId: 'hielo', iceQty: 120 }], priceDelta: 0.3, sortOrder: 20 },
  { id: 'extra_sirope', groupId: 'extra', name: 'Sirope', isDefault: false, effects: [{ kind: 'add', ingredientId: 'sirope', qty: 10 }], priceDelta: 0.4, sortOrder: 30 },
];

/** Category order for the bar tabs. */
export const CATEGORIES = ['Espresso', 'Con leche', 'Filtro', 'Fríos', 'Especiales', 'Otros'] as const;
