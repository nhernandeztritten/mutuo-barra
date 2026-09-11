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
  /**
   * Cuánto cabe dentro, en ml. Solo los vasos lo declaran; sirve para avisar de
   * que una receta no cabe en su propio vaso (`src/domain/recetas.ts`).
   */
  capacityMl?: number;
}

/* ---------------- Producto ---------------- */

/** Production route. Only `grupo` counts against the 50 drinks/h per barista ceiling. */
export type Via = 'grupo' | 'lote_caliente' | 'lote_frio' | 'envasado';

export type Category = 'Espresso' | 'Con leche' | 'Filtro' | 'Fríos' | 'Especiales' | 'Otros';

/**
 * Cómo se extrae la bebida. Cada método tiene una receta clásica —una relación
 * entre gramos de materia y mililitros de líquido— que la app usa para
 * **comparar y avisar**, nunca para reescribir una receta por su cuenta
 * (`src/domain/recetas.ts`).
 */
export type Metodo =
  | 'espresso'
  | 'filtro'
  | 'cold_brew'
  | 'infusion'
  | 'batido'
  | 'sin_extraccion';

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
  /** Cómo se extrae. Solo metadato: no entra en el coste ni en el consumo. */
  method: Metodo;
  /** Volumen de bebida servida, en ml, sin contar el hielo. También metadato. */
  servingMl: number;
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
  /**
   * Litros de lote que se van a preparar, por método. Suman al café de la carga
   * sugerida (SPEC §2.4) y se leen la mañana del evento. Opcional: los eventos
   * anteriores a la fase 8 no lo traen.
   */
  lotes?: { filtro?: number; cold_brew?: number };
  /**
   * Tramos en los que el servicio estuvo parado sin cerrar el evento. Una boda
   * va en dos turnos —café después de la comida, parada durante la cena, otra
   * vez en la fiesta—, y parar no es cerrar: el `status` sigue siendo `live`.
   *
   * El último tramo con `hasta === null` es una pausa **en curso**. Nada se
   * borra nunca: cada parada y cada reanudación deja su marca, y la duración de
   * la barra descuenta la suma de los tramos.
   *
   * Opcional: los eventos anteriores a la fase 9 no lo traen, y no tenerlo
   * significa exactamente lo mismo que tenerlo vacío.
   */
  pausas?: Pausa[];
}

/** Un tramo de servicio parado. `hasta` a `null` es «ahora mismo, parado». */
export interface Pausa {
  /** ISO datetime en el que se paró. */
  desde: string;
  /** ISO datetime en el que se reanudó, o `null` si sigue parado. */
  hasta: string | null;
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

/**
 * Motivos de anulación que escribe la propia aplicación, no el barista.
 *
 * `voidReason` es texto libre a propósito (los motivos del Resumen son
 * `error` / `devuelto` / `otro` y Mutuo puede querer otros). Estos dos son los
 * que la interfaz interpreta:
 *
 * - `deshacer`: el «Deshacer» de un toast, dentro de sus 8 s.
 * - `editado`: el pedido se corrigió; el que lo sustituye lo apunta en
 *   `replacesOrderId`. En el Resumen sale como «Corregido», no como «Anulado».
 */
export const VOID_DESHACER = 'deshacer';
export const VOID_EDITADO = 'editado';

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
  /**
   * Id del pedido al que corrige, cuando este nació de editar uno ya servido.
   * El original queda anulado con `voidReason: 'editado'` y este conserva su
   * `servedAt`, para que las franjas y el ritmo no se muevan.
   */
  replacesOrderId?: string;
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
  /** «Ahora no» en el aviso de instalar: no se vuelve a enseñar en Eventos. */
  installHintDismissed: boolean;
  oneTapMode: boolean;
  /**
   * Ratios de extracción editados en «Métodos y ratios». Solo los que Nicolas
   * haya cambiado; los que falten valen los de fábrica (`RATIOS_CLASICOS`).
   * Cambiar uno **no reescribe ninguna receta**: cambia lo que la app compara.
   */
  ratios?: Partial<Record<Metodo, number>>;
  createdAt: string;
  updatedAt: string;
}
