/**
 * Initial menu and ingredients — SPEC.md §2.1 to §2.3.
 * Every cost includes VAT. Ingredients with no measured cost carry 0 and
 * `costSource: 'sin-costear'` so Settings can flag them; we never invent a number.
 */
import type { Ingredient, ModifierGroup, ModifierOption, Product } from './types';

/** Bump when the seed content changes so `initDb` can migrate. */
export const SEED_VERSION = 1;

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
  // --- Vasos y tapas ---
  { id: 'vaso_6', name: 'Vaso 6 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.062, costSource: 'medido', trackStock: true, sortOrder: 90 },
  { id: 'vaso_10', name: 'Vaso 10 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.097, costSource: 'medido', trackStock: true, sortOrder: 100 },
  { id: 'vaso_frio', name: 'Vaso frío 425 ml', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.142, costSource: 'medido', trackStock: true, sortOrder: 110 },
  { id: 'tapa_6', name: 'Tapa 6 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.044, costSource: 'medido', trackStock: true, sortOrder: 120 },
  { id: 'tapa_10', name: 'Tapa 10 oz', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.057, costSource: 'medido', trackStock: true, sortOrder: 130 },
  { id: 'tapa_fria', name: 'Tapa vaso frío', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.121, costSource: 'medido', trackStock: true, sortOrder: 140 },
  // --- Menaje ---
  { id: 'menaje', name: 'Servilleta + removedor + azúcar', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0.031, costSource: 'medido', trackStock: false, sortOrder: 150 },
  // --- Sin costear: Nicolas los rellena en Ajustes ---
  { id: 'tonica', name: 'Tónica', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 160 },
  { id: 'licor', name: 'Licor (cremaet / 43)', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 170 },
  { id: 'sirope', name: 'Sirope', unit: 'ml', stockUnit: 'L', stockFactor: 1000, costPerUnit: 0, costSource: 'sin-costear', trackStock: true, sortOrder: 180 },
  { id: 'pajita', name: 'Pajita', unit: 'ud', stockUnit: 'ud', stockFactor: 1, costPerUnit: 0, costSource: 'sin-costear', trackStock: false, sortOrder: 190 },
];

/** Every recipe carries one `menaje`. */
const MENAJE = { ingredientId: 'menaje', qty: 1 };

/** `extra` narrowed to the options a product actually admits (SPEC §2.3). */
const EXTRA_TAPA = { groupId: 'extra', optionIds: ['extra_tapa'] };

export const PRODUCTS: Product[] = [
  {
    id: 'espresso', name: 'Espresso', shortName: 'Espresso', category: 'Espresso', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 2.0, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_doble', 'extra_iced', 'extra_tapa'] }],
    active: true, sortOrder: 10,
  },
  {
    id: 'americano', name: 'Americano', shortName: 'Americano', category: 'Espresso', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'agua', qty: 150 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_doble', 'extra_iced', 'extra_tapa'] }],
    active: true, sortOrder: 20,
  },
  {
    id: 'cortado', name: 'Cortado', shortName: 'Cortado', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 120 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 2.2, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 30,
  },
  {
    id: 'flat_white', name: 'Flat white', shortName: 'Flat white', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 120 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.0, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 40,
  },
  {
    id: 'cappuccino', name: 'Cappuccino', shortName: 'Cappuccino', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 130 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.0, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 50,
  },
  {
    id: 'latte', name: 'Latte', shortName: 'Latte', category: 'Con leche', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'leche', qty: 220 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 3.2, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'cafe' }, { groupId: 'extra' }],
    active: true, sortOrder: 60,
  },
  {
    id: 'filtro', name: 'Filtro', shortName: 'Filtro', category: 'Filtro', via: 'lote_caliente',
    recipe: [{ ingredientId: 'cafe', qty: 12 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.8, priceProvisional: true,
    allowedModifierGroups: [EXTRA_TAPA],
    active: true, sortOrder: 70,
  },
  {
    id: 'cold_brew', name: 'Cold brew', shortName: 'Cold brew', category: 'Fríos', via: 'lote_frio',
    recipe: [{ ingredientId: 'cafe', qty: 12.5 }, { ingredientId: 'hielo', qty: 120 }, { ingredientId: 'vaso_frio', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [EXTRA_TAPA],
    active: true, sortOrder: 80,
  },
  {
    id: 'espresso_tonic', name: 'Espresso tonic', shortName: 'Esp. tonic', category: 'Fríos', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'tonica', qty: 200 }, { ingredientId: 'hielo', qty: 120 }, { ingredientId: 'vaso_frio', qty: 1 }, MENAJE],
    price: 3.8, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }, { groupId: 'extra', optionIds: ['extra_doble'] }],
    active: true, sortOrder: 90,
  },
  {
    id: 'matcha_latte', name: 'Matcha latte', shortName: 'Matcha latte', category: 'Fríos', via: 'lote_frio',
    recipe: [{ ingredientId: 'matcha', qty: 2.5 }, { ingredientId: 'leche', qty: 200 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 3.8, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'leche' }, { groupId: 'extra', optionIds: ['extra_iced', 'extra_tapa'] }],
    active: true, sortOrder: 100,
  },
  {
    id: 'cremaet', name: 'Cremaet', shortName: 'Cremaet', category: 'Especiales', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'licor', qty: 30 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }],
    active: true, sortOrder: 110,
  },
  {
    id: 'carajillo', name: 'Carajillo', shortName: 'Carajillo', category: 'Especiales', via: 'grupo',
    recipe: [{ ingredientId: 'cafe', qty: 18 }, { ingredientId: 'licor', qty: 30 }, { ingredientId: 'vaso_6', qty: 1 }, MENAJE],
    price: 3.5, priceProvisional: true,
    allowedModifierGroups: [{ groupId: 'cafe' }],
    active: true, sortOrder: 120,
  },
  {
    id: 'te', name: 'Té / infusión', shortName: 'Té/infusión', category: 'Otros', via: 'lote_caliente',
    recipe: [{ ingredientId: 'agua', qty: 200 }, { ingredientId: 'vaso_10', qty: 1 }, MENAJE],
    price: 2.0, priceProvisional: true,
    allowedModifierGroups: [EXTRA_TAPA],
    active: true, sortOrder: 130,
  },
  {
    id: 'agua_botella', name: 'Agua', shortName: 'Agua', category: 'Otros', via: 'envasado',
    recipe: [{ ingredientId: 'vaso_10', qty: 1 }, { ingredientId: 'agua', qty: 250 }, MENAJE],
    price: 1.0, priceProvisional: true,
    allowedModifierGroups: [EXTRA_TAPA],
    active: true, sortOrder: 140,
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
  // Last on purpose: the lid must see the cup Iced may have swapped.
  { id: 'extra_tapa', groupId: 'extra', name: 'Tapa', isDefault: false, effects: [{ kind: 'lid', byCup: { vaso_6: 'tapa_6', vaso_10: 'tapa_10', vaso_frio: 'tapa_fria' } }], priceDelta: 0, sortOrder: 40 },
];

/** Category order for the bar tabs. */
export const CATEGORIES = ['Espresso', 'Con leche', 'Filtro', 'Fríos', 'Especiales', 'Otros'] as const;
