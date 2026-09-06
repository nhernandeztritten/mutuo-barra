/**
 * Domain types. Mirrors SPEC.md §2 field by field.
 * All costs include VAT (escandallo criterion).
 */

/* ---------------- Insumo ---------------- */

/** Unit the recipes are written in. */
export type RecipeUnit = 'g' | 'ml' | 'ud';
/** Unit the ingredient is bought / counted in. */
export type StockUnit = 'kg' | 'L' | 'ud' | 'g';
/** Where the cost figure comes from. Never invent a number. */
export type CostSource = 'medido' | 'estimado' | 'sin-costear';

export interface Ingredient {
  id: string;
  name: string;
  unit: RecipeUnit;
  stockUnit: StockUnit;
  /** Recipe units per stock unit: 1000 for g→kg and ml→L, 1 for ud/g. */
  stockFactor: number;
  /** Cost of one recipe unit, VAT included. */
  costPerUnit: number;
  costSource: CostSource;
  /** Shows up in the load screen and the closing count. */
  trackStock: boolean;
  sortOrder: number;
}

/* ---------------- Producto ---------------- */

/** Production route. Only `grupo` counts against the 50 drinks/h per barista ceiling. */
export type Via = 'grupo' | 'lote_caliente' | 'lote_frio' | 'envasado';

export type Category = 'Espresso' | 'Con leche' | 'Filtro' | 'Fríos' | 'Especiales' | 'Otros';

export interface RecipeItem {
  ingredientId: string;
  qty: number;
}

/**
 * A modifier group the product accepts. `optionIds` narrows the group to a
 * subset of its options (SPEC §2.3: Espresso admits `extra` but only Doble,
 * Iced and Tapa). Omitted means every option of the group is allowed.
 */
export interface AllowedModifierGroup {
  groupId: string;
  optionIds?: string[];
}

export interface Product {
  id: string;
  name: string;
  /** ≤ 12 characters, what the tile shows. */
  shortName: string;
  category: Category;
  via: Via;
  recipe: RecipeItem[];
  price: number;
  /** True until Mutuo decides the real price. Settings shows the «provisional» tag. */
  priceProvisional: boolean;
  allowedModifierGroups: AllowedModifierGroup[];
  active: boolean;
  sortOrder: number;
}

/* ---------------- Modificadores ---------------- */

export type ModifierGroupType = 'single' | 'multi';

export interface ModifierGroup {
  id: string;
  name: string;
  type: ModifierGroupType;
  sortOrder: number;
}

/**
 * Effects a modifier applies over the base recipe. Applied in the order
 * leche → cafe → extra, and within a group by `sortOrder`, so `lid` always
 * sees the final cup chosen by `iced`.
 */
export type ModifierEffect =
  /** Default option: changes nothing. */
  | { kind: 'none' }
  /** Swap one ingredient for another, keeping the quantity. */
  | { kind: 'replace'; from: string; to: string }
  /** Add a fixed amount of an ingredient. */
  | { kind: 'add'; ingredientId: string; qty: number }
  /** Add more of whichever coffee the drink already carries (normal or desca). */
  | { kind: 'doubleCoffee'; qty: number; candidates: string[] }
  /** Swap the hot cup for the cold one and add ice. */
  | { kind: 'iced'; cupFrom: string[]; cupTo: string; iceIngredientId: string; iceQty: number }
  /** Add the lid matching the final cup. */
  | { kind: 'lid'; byCup: Record<string, string> };

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  isDefault: boolean;
  effects: ModifierEffect[];
  /** Δ over the provisional price. */
  priceDelta: number;
  sortOrder: number;
}

/* ---------------- Evento ---------------- */

export type EventType = 'boda' | 'privado' | 'activacion' | 'rodaje' | 'mercado' | 'otro';
export type EventMode = 'incluido' | 'venta';
export type EventStatus = 'planned' | 'live' | 'closed';

/** Quantities keyed by ingredient id, always in recipe units. */
export type StockMap = Record<string, number>;

export interface Event {
  id: string;
  name: string;
  type: EventType;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  venue: string;
  guestsExpected: number;
  drinksPerGuest: number;
  hoursContracted: number;
  baristas: number;
  mode: EventMode;
  status: EventStatus;
  /** ISO datetime. */
  openedAt: string | null;
  closedAt: string | null;
  stockStart: StockMap;
  stockEnd: StockMap | null;
  guestsReal: number | null;
  setupMinutes: number | null;
  teardownMinutes: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Marks the «Probar con un evento de ejemplo» event. */
  isDemo: boolean;
}

/** Alias, because `Event` collides with the DOM global inside UI modules. */
export type BarEvent = Event;

/* ---------------- Pedido ---------------- */

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'invitacion';

export interface AppliedModifier {
  groupId: string;
  optionId: string;
  label: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  /** Frozen at insert time: editing the menu later must not rewrite history. */
  productName: string;
  modifiers: AppliedModifier[];
  qty: number;
  unitPrice: number;
  unitCost: number;
  /** Final recipe for ONE unit, keyed by ingredient id. */
  usage: StockMap;
  note: string;
}

export interface Order {
  id: string;
  eventId: string;
  createdAt: string;
  servedAt: string;
  deviceId: string;
  mode: EventMode;
  lines: OrderLine[];
  subtotal: number;
  tip: number;
  total: number;
  payment: PaymentMethod | null;
  cashGiven: number | null;
  /** Append-only: voiding sets this, never deletes the row. */
  voidedAt: string | null;
  voidReason: string;
  note: string;
}

/* ---------------- Ajustes ---------------- */

export type Theme = 'light' | 'night';

export interface Settings {
  /** Always `'app'`: settings is a single row. */
  id: 'app';
  /** uuid generated on first run, stamped on every order. */
  deviceId: string;
  deviceName: string;
  /** Version of the seed already written, so a future seed can migrate. */
  seedVersion: number;
  theme: Theme;
  /** Result of `navigator.storage.persist()`; null = not asked yet. */
  persistentStorage: boolean | null;
  oneTapMode: boolean;
  createdAt: string;
  updatedAt: string;
}
