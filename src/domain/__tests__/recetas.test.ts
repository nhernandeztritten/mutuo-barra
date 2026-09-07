/**
 * Recetas clásicas por método — SPEC §2.6.
 *
 * Lo que se comprueba aquí es que la app **sabe** las relaciones clásicas, no
 * que las imponga: los avisos se calculan sobre la carta real y las recetas
 * medidas se quedan como están. Si un test de `modifiers.test.ts` cambia por
 * algo de aquí, es que se ha roto el principio.
 */
import { describe, expect, it } from 'vitest';
import {
  METODOS,
  RATIOS_CLASICOS,
  TOLERANCIA_DOSIS,
  aguaDeExtraccion,
  cafeDeLotes,
  dosisEnLaReceta,
  dosisPara,
  dosisSegunRatio,
  lotePara,
  metodoInfo,
  ratiosEfectivos,
  recetaPropuesta,
  revisarReceta,
  vasoPara,
  volumenExtraidoObjetivo,
  volumenPara,
  volumenServido,
} from '../recetas';
import { INGREDIENTS, PRODUCTS, product } from './fixtures';
import type { Metodo, Product, RecipeItem } from '../../data/types';

/** Un producto de la carta con la receta cambiada, sin tocar la semilla. */
function con(id: string, recipe: RecipeItem[], patch: Partial<Product> = {}): Product {
  return { ...product(id), recipe, ...patch };
}

/** La receta de la carta con una cantidad distinta para un insumo. */
function conDosis(id: string, ingredientId: string, qty: number): Product {
  return con(
    id,
    product(id).recipe.map((r) => (r.ingredientId === ingredientId ? { ...r, qty } : r)),
  );
}

const avisos = (p: Product): string[] => revisarReceta(p, INGREDIENTS).map((a) => a.tipo);
const textos = (p: Product): string[] => revisarReceta(p, INGREDIENTS).map((a) => a.texto);

describe('los ratios clásicos son los de la tabla', () => {
  it('espresso 1:2, filtro 1:16, cold brew 1:10, té 1:100, matcha 1:80', () => {
    expect(RATIOS_CLASICOS).toEqual({
      espresso: 2,
      filtro: 16,
      cold_brew: 10,
      infusion: 100,
      batido: 80,
      sin_extraccion: 0,
    });
  });

  it('hay seis métodos y cada uno declara su insumo y su líquido', () => {
    expect(METODOS).toHaveLength(6);
    expect(metodoInfo('espresso')?.ingredienteBase).toBe('cafe');
    expect(metodoInfo('infusion')?.ingredienteBase).toBe('te_hoja');
    expect(metodoInfo('batido')?.liquidoBase).toBe('leche');
    expect(metodoInfo('sin_extraccion')?.ingredienteBase).toBeNull();
  });

  it('un ratio editado manda, y uno inválido no', () => {
    expect(ratiosEfectivos({ filtro: 15 }).filtro).toBe(15);
    expect(ratiosEfectivos({ filtro: 0 }).filtro).toBe(16);
    expect(ratiosEfectivos({ filtro: -3 }).filtro).toBe(16);
    expect(ratiosEfectivos(undefined).espresso).toBe(2);
  });
});

describe('dosisPara: los cuatro casos de la tabla', () => {
  it('espresso 1:2 — 36 ml en taza piden 18 g', () => {
    expect(dosisPara('espresso', 36)).toBe(18);
  });

  it('filtro 1:16 — una taza de 200 ml pide 12,5 g', () => {
    expect(dosisPara('filtro', 200)).toBe(12.5);
  });

  it('cold brew 1:10 — 125 ml piden 12,5 g y 250 ml piden 25 g', () => {
    expect(dosisPara('cold_brew', 125)).toBe(12.5);
    expect(dosisPara('cold_brew', 250)).toBe(25);
  });

  it('té 1:100 — 200 ml de agua piden 2 g de hoja', () => {
    expect(dosisPara('infusion', 200)).toBe(2);
  });

  it('matcha 1:80 — 200 ml de leche piden 2,5 g', () => {
    expect(dosisPara('batido', 200)).toBe(2.5);
  });

  it('sin extracción no hay dosis que calcular', () => {
    expect(dosisPara('sin_extraccion', 250)).toBe(0);
  });

  it('la dosis se redondea a media unidad, que es lo que da la báscula', () => {
    // 190 / 16 = 11,875 → 12; 210 / 16 = 13,125 → 13; 205 / 16 = 12,8125 → 13.
    expect(dosisPara('filtro', 190)).toBe(12);
    expect(dosisPara('filtro', 210)).toBe(13);
    expect(dosisPara('filtro', 205)).toBe(13);
    // 100 / 16 = 6,25 → 6,5.
    expect(dosisPara('filtro', 100)).toBe(6.5);
  });

  it('un ratio editado cambia la dosis: a 1:15, 200 ml piden 13,5 g', () => {
    expect(dosisPara('filtro', 200, { filtro: 15 })).toBe(13.5);
  });
});

describe('volumenPara: el inverso', () => {
  it('18 g de café dan 36 ml de espresso', () => {
    expect(volumenPara('espresso', 18)).toBe(36);
  });

  it('12,5 g a 1:16 dan 200 ml de filtro', () => {
    expect(volumenPara('filtro', 12.5)).toBe(200);
  });

  it('sin extracción no sale nada', () => {
    expect(volumenPara('sin_extraccion', 10)).toBe(0);
  });
});

describe('lotePara: preparar batch y cold brew', () => {
  it('4 L de filtro son 250 g de café y 4 L de agua', () => {
    expect(lotePara('filtro', 4)).toEqual({ cafeG: 250, aguaL: 4 });
  });

  it('4 L de cold brew son 400 g de café', () => {
    expect(lotePara('cold_brew', 4)).toEqual({ cafeG: 400, aguaL: 4 });
  });

  it('medio litro de filtro son 31,5 g', () => {
    // 500 / 16 = 31,25 → 31,5 con el redondeo de media unidad.
    expect(lotePara('filtro', 0.5)).toEqual({ cafeG: 31.5, aguaL: 0.5 });
  });

  it('cero litros no piden nada', () => {
    expect(lotePara('filtro', 0)).toEqual({ cafeG: 0, aguaL: 0 });
  });

  it('el café de los lotes de un evento se suma para la carga', () => {
    expect(cafeDeLotes({ filtro: 4, cold_brew: 2 })).toBe(450);
    expect(cafeDeLotes({ filtro: 4 })).toBe(250);
    expect(cafeDeLotes(undefined)).toBe(0);
    expect(cafeDeLotes({})).toBe(0);
  });
});

describe('volumen servido y agua de extracción sobre la carta real', () => {
  const esperado: [string, number][] = [
    ['espresso', 36],
    ['americano', 222],
    ['cortado', 156],
    ['flat_white', 192],
    ['cappuccino', 166],
    ['latte', 256],
    ['cold_brew', 125],
    ['espresso_tonic', 236],
    ['matcha_latte', 200],
    ['cremaet', 66],
    ['carajillo', 66],
    ['te', 200],
    ['agua_botella', 250],
  ];

  it.each(esperado)('%s sirve %i ml, que es lo que declara la carta', (id, ml) => {
    expect(volumenServido(product(id), INGREDIENTS)).toBe(ml);
    expect(product(id).servingMl).toBe(ml);
  });

  it('el Filtro sirve 192 ml con sus 12 g, y declara 200: por eso está dentro de tolerancia', () => {
    expect(volumenServido(product('filtro'), INGREDIENTS)).toBe(192);
    expect(product('filtro').servingMl).toBe(200);
  });

  it('el hielo no cuenta como bebida: el cold brew sirve 125 ml, no 245', () => {
    expect(product('cold_brew').recipe.find((r) => r.ingredientId === 'hielo')?.qty).toBe(120);
    expect(volumenServido(product('cold_brew'), INGREDIENTS)).toBe(125);
  });

  it('el agua de extracción es el rendimiento del espresso y el volumen del filtro', () => {
    expect(aguaDeExtraccion(product('espresso'))).toBe(36);
    expect(aguaDeExtraccion(product('americano'))).toBe(72);
    expect(aguaDeExtraccion(product('filtro'))).toBe(192);
    expect(aguaDeExtraccion(product('cold_brew'))).toBe(125);
    expect(aguaDeExtraccion(product('te'))).toBe(200);
  });

  it('el matcha no gasta agua (se bate en leche) y el agua embotellada tampoco', () => {
    expect(aguaDeExtraccion(product('matcha_latte'))).toBe(0);
    expect(aguaDeExtraccion(product('agua_botella'))).toBe(0);
  });

  it('el ratio se aplica a la extracción, no al vaso entero: el Latte extrae 36 ml, no 256', () => {
    expect(volumenExtraidoObjetivo(product('latte'), INGREDIENTS)).toBe(36);
    expect(volumenExtraidoObjetivo(product('americano'), INGREDIENTS)).toBe(72);
    expect(volumenExtraidoObjetivo(product('filtro'), INGREDIENTS)).toBe(200);
  });
});

describe('revisarReceta: la dosis contra el ratio', () => {
  it('el Filtro con 12 g está dentro de la tolerancia del 10 % y no avisa', () => {
    expect(dosisSegunRatio(product('filtro'), INGREDIENTS)).toBe(12.5);
    expect(dosisEnLaReceta(product('filtro'))).toBe(12);
    expect(avisos(product('filtro'))).not.toContain('dosis-fuera-de-ratio');
  });

  it('11,5 g con 12,5 esperados tampoco avisa: es un 8 %', () => {
    expect(avisos(conDosis('filtro', 'cafe', 11.5))).not.toContain('dosis-fuera-de-ratio');
  });

  it('9 g sí avisa, y el arreglo devuelve los 12,5 g', () => {
    const encontrados = revisarReceta(conDosis('filtro', 'cafe', 9), INGREDIENTS);
    const dosis = encontrados.find((a) => a.tipo === 'dosis-fuera-de-ratio');
    expect(dosis).toBeDefined();
    expect(dosis?.texto).toBe('A 1:16, 200 ml piden 12,5 g y la receta tiene 9 g');
    expect(dosis?.arreglo).toEqual({ ingredientId: 'cafe', qty: 12.5 });
  });

  it('la tolerancia es del 10 %, ni más ni menos', () => {
    expect(TOLERANCIA_DOSIS).toBe(0.1);
    // 12,5 ± 10 % = 11,25 a 13,75. 11,3 pasa; 11,2 no.
    expect(avisos(conDosis('filtro', 'cafe', 11.3))).not.toContain('dosis-fuera-de-ratio');
    expect(avisos(conDosis('filtro', 'cafe', 11.2))).toContain('dosis-fuera-de-ratio');
  });

  it('con un ratio editado a 1:15 el Filtro de 12 g se sale y el aviso lo dice', () => {
    const encontrados = revisarReceta(product('filtro'), INGREDIENTS, { filtro: 15 });
    const dosis = encontrados.find((a) => a.tipo === 'dosis-fuera-de-ratio');
    expect(dosis?.texto).toBe('A 1:15, 200 ml piden 13,5 g y la receta tiene 12 g');
    expect(dosis?.arreglo?.qty).toBe(13.5);
  });

  it('si la receta no lleva el insumo base, el aviso lo dice y el arreglo lo añade', () => {
    const sinHoja = con('te', product('te').recipe.filter((r) => r.ingredientId !== 'te_hoja'));
    const dosis = revisarReceta(sinHoja, INGREDIENTS).find((a) => a.tipo === 'dosis-fuera-de-ratio');
    expect(dosis?.texto).toContain('no lleva hoja de té');
    expect(dosis?.arreglo).toEqual({ ingredientId: 'te_hoja', qty: 2 });
  });

  it('el agua embotellada no tiene ratio, así que nunca avisa de dosis', () => {
    expect(avisos(product('agua_botella'))).toEqual([]);
  });
});

describe('revisarReceta: cabe en el vaso', () => {
  it('el Flat white no cabe: 192 ml en un vaso de 180', () => {
    expect(textos(product('flat_white'))).toContain('192 ml no caben en el vaso de 180 ml');
  });

  it('es la única bebida de la carta que no cabe en su vaso', () => {
    const noCaben = PRODUCTS.filter((p) =>
      revisarReceta(p, INGREDIENTS).some((a) => a.tipo === 'no-cabe-en-el-vaso'),
    ).map((p) => p.id);
    expect(noCaben).toEqual(['flat_white']);
  });

  it('125 ml de cold brew en un vaso frío de 425 no es un error', () => {
    expect(avisos(product('cold_brew'))).not.toContain('no-cabe-en-el-vaso');
  });

  it('el Cappuccino con 166 ml cabe justo; con 190 ya no', () => {
    expect(avisos(product('cappuccino'))).not.toContain('no-cabe-en-el-vaso');
    expect(avisos(conDosis('cappuccino', 'leche', 160))).toContain('no-cabe-en-el-vaso');
  });
});

describe('revisarReceta: lo que falta', () => {
  it('sin volumen declarado lo dice', () => {
    expect(avisos({ ...product('cortado'), servingMl: 0 })).toContain('sin-volumen');
  });

  it('sin método declarado lo dice', () => {
    expect(avisos({ ...product('cortado'), method: 'inventado' as Metodo })).toContain('sin-metodo');
  });

  it('los insumos sin costear también salen aquí', () => {
    expect(avisos(product('cremaet'))).toContain('insumo-sin-costear');
    expect(textos(product('espresso_tonic'))[0]).toContain('Tónica');
    expect(avisos(product('cortado'))).toEqual([]);
  });
});

describe('la revisión de la carta real', () => {
  it('destapa exactamente cinco bebidas, y ninguna por dosis', () => {
    const conAviso = PRODUCTS.filter((p) => revisarReceta(p, INGREDIENTS).length > 0).map((p) => p.id);
    expect(conAviso).toEqual([
      'flat_white',
      'espresso_tonic',
      'cremaet',
      'carajillo',
      'te',
    ]);
    for (const p of PRODUCTS) {
      expect(avisos(p)).not.toContain('dosis-fuera-de-ratio');
    }
  });
});

describe('recetaPropuesta: lo que ahorra teclear a ciegas', () => {
  it('un cold brew de 250 ml trae 25 g de café, hielo, vaso frío y menaje', () => {
    expect(recetaPropuesta('cold_brew', 250, INGREDIENTS)).toEqual([
      { ingredientId: 'cafe', qty: 25 },
      { ingredientId: 'hielo', qty: 120 },
      { ingredientId: 'vaso_frio', qty: 1 },
      { ingredientId: 'menaje', qty: 1 },
    ]);
  });

  it('un espresso de 36 ml propone la receta que ya tiene la carta', () => {
    expect(recetaPropuesta('espresso', 36, INGREDIENTS)).toEqual(product('espresso').recipe);
  });

  it('un té de 200 ml trae la hoja y su agua', () => {
    expect(recetaPropuesta('infusion', 200, INGREDIENTS)).toEqual([
      { ingredientId: 'te_hoja', qty: 2 },
      { ingredientId: 'agua', qty: 200 },
      { ingredientId: 'vaso_10', qty: 1 },
      { ingredientId: 'menaje', qty: 1 },
    ]);
  });

  it('un matcha de 200 ml se bate en leche, no en agua', () => {
    expect(recetaPropuesta('batido', 200, INGREDIENTS)).toEqual(product('matcha_latte').recipe);
  });

  it('sin extracción solo hay agua, vaso y menaje', () => {
    expect(recetaPropuesta('sin_extraccion', 250, INGREDIENTS)).toEqual([
      { ingredientId: 'agua', qty: 250 },
      { ingredientId: 'vaso_10', qty: 1 },
      { ingredientId: 'menaje', qty: 1 },
    ]);
  });

  it('el vaso es el más pequeño en el que quepa', () => {
    expect(vasoPara('filtro', 150, INGREDIENTS)?.id).toBe('vaso_6');
    expect(vasoPara('filtro', 200, INGREDIENTS)?.id).toBe('vaso_10');
    expect(vasoPara('filtro', 400, INGREDIENTS)?.id).toBe('vaso_frio');
    // Más de lo que cabe en ninguno: el mayor, y el aviso de «no cabe» hará el resto.
    expect(vasoPara('filtro', 900, INGREDIENTS)?.id).toBe('vaso_frio');
  });

  it('el cold brew va siempre al vaso frío, quepa o no en uno más pequeño', () => {
    expect(vasoPara('cold_brew', 125, INGREDIENTS)?.id).toBe('vaso_frio');
  });

  it('lo propuesto no dispara ningún aviso de dosis', () => {
    const propuesta: Product = {
      ...product('cold_brew'),
      id: 'cold_brew_doble',
      name: 'Cold brew doble',
      servingMl: 250,
      recipe: recetaPropuesta('cold_brew', 250, INGREDIENTS),
    };
    expect(avisos(propuesta)).not.toContain('dosis-fuera-de-ratio');
    expect(avisos(propuesta)).not.toContain('no-cabe-en-el-vaso');
  });
});
