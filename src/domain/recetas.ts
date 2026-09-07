/**
 * Recetas clásicas por método de extracción — SPEC §2.6.
 *
 * La regla que manda: **ningún ratio reescribe una receta por su cuenta**. Los
 * costes del escandallo están medidos y una relación teórica no los pisa. Lo
 * que hace este módulo es calcular, comparar y avisar; aplicar el cambio es
 * siempre un toque de Nicolas en Ajustes.
 *
 * Funciones puras: ni Dexie ni DOM.
 */
import type { Ingredient, Metodo, Product, RecipeItem } from '../data/types';
import { formatDecimal } from './format';

/* ---------------- Métodos ---------------- */

export interface MetodoInfo {
  id: Metodo;
  label: string;
  /** Mililitros de líquido de extracción por gramo de materia. */
  ratio: number;
  /** Insumo que se dosifica: el café, el matcha, la hoja de té. */
  ingredienteBase: string | null;
  /** Líquido de la extracción. */
  liquidoBase: string | null;
  /**
   * El líquido de la extracción **ya es una línea de la receta**. En un té el
   * agua se escribe (200 ml); en un espresso los 36 ml de salida no se
   * escriben nunca, y el `agua` que pueda llevar la receta es agua añadida
   * (el Americano). De esta distinción salen los 222 ml del Americano.
   */
  extraccionEnLaReceta: boolean;
  /** Vaso que impone el método, cuando lo impone. El cold brew va en el frío. */
  vasoPreferido: string | null;
  /** Hielo que lleva de serie una bebida de este método, en g. */
  hieloG: number;
  nota: string;
}

/** Los de fábrica. Editables en «Métodos y ratios» (se guardan en `settings.ratios`). */
export const RATIOS_CLASICOS: Record<Metodo, number> = {
  espresso: 2,
  filtro: 16,
  cold_brew: 10,
  infusion: 100,
  batido: 80,
  sin_extraccion: 0,
};

export const METODOS: MetodoInfo[] = [
  {
    id: 'espresso',
    label: 'Espresso',
    ratio: RATIOS_CLASICOS.espresso,
    ingredienteBase: 'cafe',
    liquidoBase: 'agua',
    extraccionEnLaReceta: false,
    vasoPreferido: null,
    hieloG: 0,
    nota: '18 g de café dan 36 ml en la taza.',
  },
  {
    id: 'filtro',
    label: 'Filtro (batch brew)',
    ratio: RATIOS_CLASICOS.filtro,
    ingredienteBase: 'cafe',
    liquidoBase: 'agua',
    extraccionEnLaReceta: false,
    vasoPreferido: null,
    hieloG: 0,
    nota: '60 g por litro. Una taza de 200 ml pide 12,5 g.',
  },
  {
    id: 'cold_brew',
    label: 'Cold brew',
    ratio: RATIOS_CLASICOS.cold_brew,
    ingredienteBase: 'cafe',
    liquidoBase: 'agua',
    extraccionEnLaReceta: false,
    vasoPreferido: 'vaso_frio',
    hieloG: 120,
    nota: '1 g de café por cada 10 ml de bebida.',
  },
  {
    id: 'infusion',
    label: 'Infusión (té)',
    ratio: RATIOS_CLASICOS.infusion,
    ingredienteBase: 'te_hoja',
    liquidoBase: 'agua',
    extraccionEnLaReceta: true,
    vasoPreferido: null,
    hieloG: 0,
    nota: '2 g de hoja por cada 200 ml de agua.',
  },
  {
    id: 'batido',
    label: 'Batido (matcha)',
    ratio: RATIOS_CLASICOS.batido,
    ingredienteBase: 'matcha',
    liquidoBase: 'leche',
    extraccionEnLaReceta: true,
    vasoPreferido: null,
    hieloG: 0,
    nota: '2,5 g de matcha por cada 200 ml de leche.',
  },
  {
    id: 'sin_extraccion',
    label: 'Sin extracción',
    ratio: RATIOS_CLASICOS.sin_extraccion,
    ingredienteBase: null,
    liquidoBase: null,
    extraccionEnLaReceta: true,
    vasoPreferido: null,
    hieloG: 0,
    nota: 'Agua, refrescos y latas: no hay nada que extraer.',
  },
];

const METODOS_POR_ID = new Map(METODOS.map((m) => [m.id, m]));

export function metodoInfo(metodo: Metodo): MetodoInfo | undefined {
  return METODOS_POR_ID.get(metodo);
}

/** Ratios efectivos: los editados encima de los clásicos. */
export type RatiosMap = Partial<Record<Metodo, number>>;

export function ratiosEfectivos(ratios?: RatiosMap): Record<Metodo, number> {
  const out = { ...RATIOS_CLASICOS };
  if (!ratios) return out;
  for (const m of METODOS) {
    const v = ratios[m.id];
    // Un ratio de 0 o negativo no es un ratio: se ignora y manda el clásico.
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[m.id] = v;
  }
  return out;
}

export function ratioDe(metodo: Metodo, ratios?: RatiosMap): number {
  return ratiosEfectivos(ratios)[metodo] ?? 0;
}

/* ---------------- Umbrales ---------------- */

/** Las dosis se redondean a media unidad: la báscula de la barra no da más. */
export const REDONDEO_DOSIS_G = 0.5;
/** Hasta un 10 % de diferencia con el ratio no se avisa: es café, no farmacia. */
export const TOLERANCIA_DOSIS = 0.1;

function redondeaDosis(gramos: number): number {
  return Math.round(gramos / REDONDEO_DOSIS_G) * REDONDEO_DOSIS_G;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

const g = (value: number): string => formatDecimal(value, 2);

/* ---------------- Cálculos de ratio ---------------- */

/** Gramos de materia para un volumen de líquido de extracción. Redondeo a 0,5 g. */
export function dosisPara(metodo: Metodo, volumenMl: number, ratios?: RatiosMap): number {
  const ratio = ratioDe(metodo, ratios);
  if (ratio <= 0 || volumenMl <= 0) return 0;
  return redondeaDosis(volumenMl / ratio);
}

/** Mililitros que salen de una dosis. El inverso de `dosisPara`. */
export function volumenPara(metodo: Metodo, dosisG: number, ratios?: RatiosMap): number {
  const ratio = ratioDe(metodo, ratios);
  if (ratio <= 0 || dosisG <= 0) return 0;
  return round(dosisG * ratio, 2);
}

/** Café y agua para preparar un lote de `litros`. Batch brew y cold brew. */
export function lotePara(
  metodo: Metodo,
  litros: number,
  ratios?: RatiosMap,
): { cafeG: number; aguaL: number } {
  const ratio = ratioDe(metodo, ratios);
  if (ratio <= 0 || litros <= 0) return { cafeG: 0, aguaL: 0 };
  return { cafeG: redondeaDosis((litros * 1000) / ratio), aguaL: round(litros, 3) };
}

/* ---------------- Lectura de una receta ---------------- */

function unidadDe(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((i) => [i.id, i]));
}

function qtyEnReceta(product: Product, ingredientId: string | null): number {
  if (!ingredientId) return 0;
  return product.recipe.find((r) => r.ingredientId === ingredientId)?.qty ?? 0;
}

/** Suma de las líneas líquidas de la receta (unidad `ml`). El hielo va en g, no cuenta. */
export function liquidosDeLaReceta(product: Product, ingredients: Ingredient[]): number {
  const byId = unidadDe(ingredients);
  let total = 0;
  for (const item of product.recipe) {
    if (byId.get(item.ingredientId)?.unit === 'ml') total += item.qty;
  }
  return round(total, 2);
}

/**
 * Mililitros de bebida que salen de la extracción **según la dosis que tiene la
 * receta ahora mismo**. 18 g de café a 1:2 son 36 ml de espresso.
 */
export function volumenExtraido(product: Product, ratios?: RatiosMap): number {
  const info = metodoInfo(product.method);
  if (!info) return 0;
  return volumenPara(product.method, qtyEnReceta(product, info.ingredienteBase), ratios);
}

/**
 * Agua que consume preparar una bebida, en ml. Para el espresso es el
 * rendimiento; para filtro y cold brew, el volumen extraído; para el té, el agua
 * de la infusión. 0 en `batido` (el líquido es leche) y en `sin_extraccion`.
 *
 * No se añade a la receta: es para la carga y para enseñarlo.
 */
export function aguaDeExtraccion(product: Product, ratios?: RatiosMap): number {
  const info = metodoInfo(product.method);
  if (!info || info.liquidoBase !== 'agua') return 0;
  return volumenExtraido(product, ratios);
}

/**
 * Volumen de bebida que llega al vaso: la extracción más los líquidos de la
 * receta, sin contar el hielo. La extracción solo se suma cuando no está ya
 * escrita en la receta (un té lleva sus 200 ml de agua; un espresso no).
 */
export function volumenServido(
  product: Product,
  ingredients: Ingredient[],
  ratios?: RatiosMap,
): number {
  const info = metodoInfo(product.method);
  const liquidos = liquidosDeLaReceta(product, ingredients);
  if (!info || info.extraccionEnLaReceta) return liquidos;
  return round(liquidos + volumenExtraido(product, ratios), 2);
}

/**
 * Mililitros de extracción que pide el volumen servido declarado. En un cortado
 * de 156 ml con 120 ml de leche, la extracción son 36 ml, no 156: el ratio se
 * aplica al café, no al vaso entero.
 */
export function volumenExtraidoObjetivo(product: Product, ingredients: Ingredient[]): number {
  const info = metodoInfo(product.method);
  if (!info || info.ratio <= 0 || product.servingMl <= 0) return 0;
  if (info.extraccionEnLaReceta) return round(product.servingMl, 2);
  return Math.max(0, round(product.servingMl - liquidosDeLaReceta(product, ingredients), 2));
}

/** La dosis que pediría el ratio para el volumen servido declarado. */
export function dosisSegunRatio(
  product: Product,
  ingredients: Ingredient[],
  ratios?: RatiosMap,
): number {
  return dosisPara(product.method, volumenExtraidoObjetivo(product, ingredients), ratios);
}

/** La dosis que la receta lleva escrita hoy. */
export function dosisEnLaReceta(product: Product): number {
  const info = metodoInfo(product.method);
  return qtyEnReceta(product, info?.ingredienteBase ?? null);
}

/** El vaso de la receta, si lleva uno con capacidad declarada. */
export function vasoDeLaReceta(
  product: Product,
  ingredients: Ingredient[],
): Ingredient | undefined {
  const byId = unidadDe(ingredients);
  for (const item of product.recipe) {
    const ing = byId.get(item.ingredientId);
    if (ing && typeof ing.capacityMl === 'number' && ing.capacityMl > 0) return ing;
  }
  return undefined;
}

/* ---------------- Avisos ---------------- */

export type TipoAviso =
  | 'sin-metodo'
  | 'sin-volumen'
  | 'dosis-fuera-de-ratio'
  | 'no-cabe-en-el-vaso'
  | 'insumo-sin-costear';

export interface Aviso {
  tipo: TipoAviso;
  texto: string;
  /** Lo que haría «Usar el ratio». Solo lo trae el aviso de dosis. */
  arreglo?: { ingredientId: string; qty: number };
}

/**
 * Repasa una receta contra su método. Devuelve avisos, no errores: la receta
 * sigue siendo la que manda hasta que Nicolas toque «Usar el ratio».
 */
export function revisarReceta(
  product: Product,
  ingredients: Ingredient[],
  ratios?: RatiosMap,
): Aviso[] {
  const avisos: Aviso[] = [];
  const byId = unidadDe(ingredients);
  const info = metodoInfo(product.method);

  if (!info) {
    avisos.push({
      tipo: 'sin-metodo',
      texto: 'Falta decir cómo se prepara: elige un método arriba.',
    });
  }

  if (!(product.servingMl > 0)) {
    avisos.push({
      tipo: 'sin-volumen',
      texto: 'Falta el volumen servido: escribe cuántos mililitros salen en el vaso.',
    });
  }

  // --- Dosis contra el ratio ---
  const ratio = info ? ratioDe(product.method, ratios) : 0;
  if (info && info.ingredienteBase && ratio > 0 && product.servingMl > 0) {
    const objetivo = volumenExtraidoObjetivo(product, ingredients);
    const esperada = dosisPara(product.method, objetivo, ratios);
    const actual = dosisEnLaReceta(product);
    const base = byId.get(info.ingredienteBase);
    const nombre = base?.name ?? info.ingredienteBase;
    if (esperada > 0) {
      const desvio = Math.abs(actual - esperada) / esperada;
      if (desvio > TOLERANCIA_DOSIS) {
        const cola =
          actual > 0
            ? `y la receta tiene ${g(actual)} g`
            : `y la receta no lleva ${nombre.toLocaleLowerCase('es-ES')}`;
        avisos.push({
          tipo: 'dosis-fuera-de-ratio',
          texto: `A 1:${g(ratio)}, ${g(objetivo)} ml piden ${g(esperada)} g ${cola}`,
          arreglo: { ingredientId: info.ingredienteBase, qty: esperada },
        });
      }
    }
  }

  // --- Cabe en el vaso ---
  const vaso = vasoDeLaReceta(product, ingredients);
  if (vaso && typeof vaso.capacityMl === 'number') {
    const servido = volumenServido(product, ingredients, ratios);
    if (servido > vaso.capacityMl) {
      avisos.push({
        tipo: 'no-cabe-en-el-vaso',
        texto: `${g(servido)} ml no caben en el vaso de ${g(vaso.capacityMl)} ml`,
      });
    }
  }

  // --- Insumos sin costear ---
  const sinCostear = product.recipe
    .filter((r) => r.qty > 0 && byId.get(r.ingredientId)?.costSource === 'sin-costear')
    .map((r) => byId.get(r.ingredientId)?.name ?? r.ingredientId);
  if (sinCostear.length > 0) {
    avisos.push({
      tipo: 'insumo-sin-costear',
      texto:
        sinCostear.length === 1
          ? `${sinCostear[0]} todavía no tiene coste: el de esta bebida está incompleto`
          : `${sinCostear.join(' y ')} todavía no tienen coste: el de esta bebida está incompleto`,
    });
  }

  return avisos;
}

/* ---------------- Propuesta al crear una bebida ---------------- */

/**
 * Receta de partida para una bebida nueva: la dosis que pide el ratio, el
 * líquido cuando el método lo escribe, el hielo del método, el vaso más pequeño
 * en el que quepa y el menaje. Desde ahí se edita a mano.
 */
export function recetaPropuesta(
  metodo: Metodo,
  volumenMl: number,
  ingredients: Ingredient[],
  ratios?: RatiosMap,
): RecipeItem[] {
  const info = metodoInfo(metodo);
  const byId = unidadDe(ingredients);
  const items: RecipeItem[] = [];
  const existe = (id: string): boolean => byId.has(id);

  if (info && info.ingredienteBase && ratioDe(metodo, ratios) > 0 && existe(info.ingredienteBase)) {
    // `volumenMl` es a la vez el volumen servido y el de extracción: una bebida
    // recién creada todavía no lleva leche ni nada que reste.
    const dosis = dosisPara(metodo, volumenMl, ratios);
    if (dosis > 0) items.push({ ingredientId: info.ingredienteBase, qty: dosis });
  }

  // El líquido solo se escribe cuando el método lo escribe (té, matcha) o
  // cuando no hay extracción ninguna (agua, refrescos).
  const liquido = info?.extraccionEnLaReceta ? (info.liquidoBase ?? 'agua') : null;
  if (liquido && volumenMl > 0 && existe(liquido)) {
    items.push({ ingredientId: liquido, qty: round(volumenMl, 2) });
  }

  if (info && info.hieloG > 0 && existe('hielo')) {
    items.push({ ingredientId: 'hielo', qty: info.hieloG });
  }

  const vaso = vasoPara(metodo, volumenMl, ingredients);
  if (vaso) items.push({ ingredientId: vaso.id, qty: 1 });
  if (existe('menaje')) items.push({ ingredientId: 'menaje', qty: 1 });

  return items;
}

/**
 * El vaso más pequeño en el que quepa la bebida, salvo que el método imponga
 * uno (el cold brew va siempre en el vaso frío, con hielo o sin él).
 */
export function vasoPara(
  metodo: Metodo,
  volumenMl: number,
  ingredients: Ingredient[],
): Ingredient | undefined {
  const info = metodoInfo(metodo);
  const vasos = ingredients
    .filter((i): i is Ingredient & { capacityMl: number } =>
      typeof i.capacityMl === 'number' && i.capacityMl > 0)
    .sort((a, b) => a.capacityMl - b.capacityMl);
  if (vasos.length === 0) return undefined;
  if (info?.vasoPreferido) {
    const impuesto = vasos.find((v) => v.id === info.vasoPreferido);
    if (impuesto) return impuesto;
  }
  return vasos.find((v) => v.capacityMl >= volumenMl) ?? vasos[vasos.length - 1];
}

/* ---------------- Lotes ---------------- */

/** Métodos que se preparan por lotes, con la vía de producción que los pide. */
export const METODOS_DE_LOTE: { metodo: Metodo; via: Product['via']; label: string }[] = [
  { metodo: 'filtro', via: 'lote_caliente', label: 'Batch brew' },
  { metodo: 'cold_brew', via: 'lote_frio', label: 'Cold brew' },
];

/** Gramos de café que suman los lotes declarados de un evento. */
export function cafeDeLotes(
  lotes: { filtro?: number; cold_brew?: number } | undefined,
  ratios?: RatiosMap,
): number {
  if (!lotes) return 0;
  let total = 0;
  for (const { metodo } of METODOS_DE_LOTE) {
    const litros = lotes[metodo as 'filtro' | 'cold_brew'];
    if (typeof litros === 'number' && litros > 0) {
      total += lotePara(metodo, litros, ratios).cafeG;
    }
  }
  return round(total, 2);
}
