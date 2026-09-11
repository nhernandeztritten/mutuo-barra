/**
 * Modifier application — SPEC.md §2.3.
 *
 * Modifiers run over the base recipe in the order leche → cafe → extra, and
 * inside a group by `sortOrder`. That ordering is what makes «Descafeinado +
 * Doble» add 18 g of decaf instead of 18 g of regular coffee.
 *
 * The result is frozen into the order line: editing the menu later never
 * rewrites history.
 */
import type {
  AllowedModifierGroup,
  Ingredient,
  ModifierGroup,
  ModifierOption,
  Product,
  StockMap,
} from '../data/types';

/** Why a selected modifier did not make it into the drink. */
export type IgnoredReason = 'grupo-no-admitido' | 'opcion-no-admitida' | 'sin-efecto';

export interface IgnoredModifier {
  optionId: string;
  groupId: string;
  label: string;
  reason: IgnoredReason;
}

export interface AppliedRecipe {
  /** Final recipe for ONE unit, keyed by ingredient id. */
  usage: StockMap;
  unitPrice: number;
  unitCost: number;
  /** Names of the non-default options actually applied, in application order. */
  labels: string[];
  /** Options that did not apply. The UI shakes the chip; no dialog. */
  ignored: IgnoredModifier[];
}

/** Fallback ranking when no `ModifierGroup[]` is supplied. */
const DEFAULT_GROUP_RANK: Record<string, number> = { leche: 0, cafe: 1, extra: 2 };

/**
 * Los efectos que esta versión sabe aplicar. Tiene que ir a la par del `switch`
 * de `applyOption`.
 *
 * Lo usa la importación de una copia de seguridad: una opción con un efecto que
 * ya no existe —la `lid` de la Tapa, retirada en la semilla v5— entraría en la
 * carta como un chip que se puede tocar y que no hace nada. Mejor no meterla.
 */
const EFECTOS_CONOCIDOS = new Set(['none', 'replace', 'add', 'doubleCoffee', 'iced']);

/** Si esta versión sabe aplicar todos los efectos de la opción. */
export function esOpcionAplicable(option: Pick<ModifierOption, 'effects'>): boolean {
  return option.effects.every((e) => EFECTOS_CONOCIDOS.has(e.kind));
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

function findAllowance(
  product: Product,
  groupId: string,
): AllowedModifierGroup | undefined {
  return product.allowedModifierGroups.find((g) => g.groupId === groupId);
}

/** Whether a product admits a concrete option (group + optional option whitelist). */
export function isOptionAllowed(product: Product, option: ModifierOption): boolean {
  const allowance = findAllowance(product, option.groupId);
  if (!allowance) return false;
  return allowance.optionIds === undefined || allowance.optionIds.includes(option.id);
}

function addQty(usage: StockMap, ingredientId: string, qty: number): void {
  usage[ingredientId] = (usage[ingredientId] ?? 0) + qty;
}

/**
 * Applies one option's effects over `usage`.
 * Returns false when nothing changed, so the caller can report it as ignored.
 */
function applyOption(usage: StockMap, option: ModifierOption): boolean {
  let changed = false;

  for (const effect of option.effects) {
    switch (effect.kind) {
      case 'none': {
        // Default option (Vaca, Normal): a deliberate no-op, still "applied".
        changed = true;
        break;
      }
      case 'replace': {
        const qty = usage[effect.from];
        if (qty === undefined) break;
        delete usage[effect.from];
        addQty(usage, effect.to, qty);
        changed = true;
        break;
      }
      case 'add': {
        addQty(usage, effect.ingredientId, effect.qty);
        changed = true;
        break;
      }
      case 'doubleCoffee': {
        // Adds more of whichever coffee the drink already carries.
        const present = effect.candidates.find((id) => (usage[id] ?? 0) > 0);
        if (present === undefined) break;
        addQty(usage, present, effect.qty);
        changed = true;
        break;
      }
      case 'iced': {
        const from = effect.cupFrom.find((id) => (usage[id] ?? 0) > 0);
        if (from === undefined) break;
        const cups = usage[from] ?? 0;
        delete usage[from];
        addQty(usage, effect.cupTo, cups);
        addQty(usage, effect.iceIngredientId, effect.iceQty);
        changed = true;
        break;
      }
    }
  }

  return changed;
}

/**
 * Builds the final recipe, price and cost of one unit of `product` with
 * `options` selected. Options the product does not admit, or that have nothing
 * to act on, come back in `ignored` and cost nothing.
 *
 * @param groups optional, only to derive the group order; defaults to leche → cafe → extra.
 */
export function applyModifiers(
  product: Product,
  options: ModifierOption[],
  ingredients: Ingredient[],
  groups?: ModifierGroup[],
): AppliedRecipe {
  const rank = new Map<string, number>();
  if (groups && groups.length > 0) {
    for (const g of groups) rank.set(g.id, g.sortOrder);
  } else {
    for (const [id, r] of Object.entries(DEFAULT_GROUP_RANK)) rank.set(id, r);
  }
  const rankOf = (groupId: string): number => rank.get(groupId) ?? 99;

  const ignored: IgnoredModifier[] = [];
  const accepted: ModifierOption[] = [];

  for (const option of options) {
    const allowance = findAllowance(product, option.groupId);
    if (!allowance) {
      ignored.push({ optionId: option.id, groupId: option.groupId, label: option.name, reason: 'grupo-no-admitido' });
      continue;
    }
    if (allowance.optionIds !== undefined && !allowance.optionIds.includes(option.id)) {
      ignored.push({ optionId: option.id, groupId: option.groupId, label: option.name, reason: 'opcion-no-admitida' });
      continue;
    }
    accepted.push(option);
  }

  accepted.sort((a, b) => {
    const byGroup = rankOf(a.groupId) - rankOf(b.groupId);
    return byGroup !== 0 ? byGroup : a.sortOrder - b.sortOrder;
  });

  const usage: StockMap = {};
  for (const item of product.recipe) addQty(usage, item.ingredientId, item.qty);

  const labels: string[] = [];
  let price = product.price;

  for (const option of accepted) {
    const changed = applyOption(usage, option);
    if (!changed) {
      ignored.push({ optionId: option.id, groupId: option.groupId, label: option.name, reason: 'sin-efecto' });
      continue;
    }
    price += option.priceDelta;
    if (!option.isDefault) labels.push(option.name);
  }

  const costs = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
  let cost = 0;
  for (const [ingredientId, qty] of Object.entries(usage)) {
    cost += qty * (costs.get(ingredientId) ?? 0);
  }

  // Round the recipe too: floating point turns 220 ml into 219.99999999999997.
  const cleanUsage: StockMap = {};
  for (const [id, qty] of Object.entries(usage)) cleanUsage[id] = round(qty, 4);

  return {
    usage: cleanUsage,
    unitPrice: round(price, 2),
    unitCost: round(cost, 4),
    labels,
    ignored,
  };
}

/** Cost of an arbitrary quantity map, VAT included. */
export function costOfUsage(usage: StockMap, ingredients: Ingredient[]): number {
  const costs = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
  let total = 0;
  for (const [id, qty] of Object.entries(usage)) total += qty * (costs.get(id) ?? 0);
  return round(total, 4);
}
