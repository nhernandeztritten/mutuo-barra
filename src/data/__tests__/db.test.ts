/**
 * Migraciones de la semilla sobre una base ya sembrada.
 *
 * El iPad de Nicolas no se vacía entre fases: lo que se comprueba aquí es que
 * al arrancar con una base vieja llegan los cambios de la carta, y que lo que
 * él haya editado a mano en Ajustes sobrevive.
 */
import { describe, expect, it } from 'vitest';
import { BarraDb, initDb, updateSettings } from '../db';
import {
  DOSE_MIGRATIONS,
  INGREDIENTS,
  MODIFIER_GROUPS,
  MODIFIER_OPTIONS,
  PRODUCTS,
  SEED_VERSION,
  TE_RECETA_ANTERIOR,
} from '../seed';
import { applyModifiers } from '../../domain/modifiers';
import type { Ingredient, Product } from '../types';

let n = 0;

/** Base con la carta de la semilla v2: la que tienen los iPads ahora mismo. */
async function baseV2(editar: (p: Product) => Product = (p) => p): Promise<BarraDb> {
  const db = new BarraDb(`barra-migracion-${++n}`);
  await db.open();

  const dosis = new Map(DOSE_MIGRATIONS.map((d) => [d.id, d]));
  const productosV2 = PRODUCTS.map((p) => {
    const cambio = dosis.get(p.id);
    if (!cambio) return p;
    // Se deshace la v3 para reconstruir exactamente lo que dejó la v2.
    const anterior: Product = {
      ...p,
      recipe: cambio.recetaAnterior.map((r) => ({ ...r })),
      allowedModifierGroups: p.allowedModifierGroups.map((a) =>
        a.groupId === 'extra' && a.optionIds
          ? { ...a, optionIds: [...a.optionIds, 'extra_doble'].sort() }
          : a,
      ),
    };
    return anterior;
  });

  await db.ingredients.bulkPut(INGREDIENTS);
  await db.products.bulkPut(productosV2.map(editar));
  await db.modifierGroups.bulkPut(MODIFIER_GROUPS);
  await db.modifierOptions.bulkPut(MODIFIER_OPTIONS);
  await updateSettings({ seedVersion: 2 }, db);
  return db;
}

/**
 * Base con la carta de la semilla v3: la que tienen los iPads antes de la fase
 * 8. Es la v4 sin los metadatos nuevos —método, volumen, capacidad del vaso y
 * la hoja de té—, que es exactamente lo que la migración tiene que añadir.
 */
async function baseV3(editar: (p: Product) => Product = (p) => p): Promise<BarraDb> {
  const db = new BarraDb(`barra-migracion-v3-${++n}`);
  await db.open();

  const productosV3 = PRODUCTS.map((p) => {
    const { method: _m, servingMl: _s, ...resto } = p;
    const previo = resto as unknown as Product;
    // El Té de la v3 no llevaba hoja: solo agua, vaso y menaje.
    return p.id === 'te' ? { ...previo, recipe: TE_RECETA_ANTERIOR.map((r) => ({ ...r })) } : previo;
  });
  const insumosV3 = INGREDIENTS.filter((i) => i.id !== 'te_hoja').map((i) => {
    const { capacityMl: _c, ...resto } = i;
    return resto as Ingredient;
  });

  await db.ingredients.bulkPut(insumosV3);
  await db.products.bulkPut(productosV3.map(editar));
  await db.modifierGroups.bulkPut(MODIFIER_GROUPS);
  await db.modifierOptions.bulkPut(MODIFIER_OPTIONS);
  await updateSettings({ seedVersion: 3 }, db);
  return db;
}

function extras(product: Product): string[] {
  return product.allowedModifierGroups.find((a) => a.groupId === 'extra')?.optionIds ?? [];
}

/** Coste de una receta guardada, con los insumos de esa misma base. */
async function costeDe(db: BarraDb, id: string): Promise<number> {
  const p = (await db.products.get(id))!;
  return applyModifiers(p, [], await db.ingredients.toArray(), MODIFIER_GROUPS).unitCost;
}

describe('semilla nueva', () => {
  it('siembra ya con la doble dosis y sin «Doble» en esas dos bebidas', async () => {
    const db = new BarraDb(`barra-nueva-${++n}`);
    await initDb(db);

    const americano = (await db.products.get('americano'))!;
    const flat = (await db.products.get('flat_white'))!;
    expect(americano.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(36);
    expect(flat.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(36);
    expect(extras(americano)).not.toContain('extra_doble');
    expect(extras(flat)).not.toContain('extra_doble');

    // El resto de la carta no se mueve.
    const cortado = (await db.products.get('cortado'))!;
    expect(cortado.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(18);
    db.close();
  });
});

describe('migración de la dosis (v2 → v3)', () => {
  it('sube a 36 g y quita «Doble» en una base que sigue con la receta de la semilla', async () => {
    const db = await baseV2();
    // Punto de partida: lo que hay hoy en el iPad.
    expect((await db.products.get('flat_white'))!.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(18);
    expect(extras((await db.products.get('flat_white'))!)).toContain('extra_doble');

    await initDb(db);

    const americano = (await db.products.get('americano'))!;
    const flat = (await db.products.get('flat_white'))!;
    expect(americano.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(36);
    expect(flat.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(36);
    expect(extras(americano)).not.toContain('extra_doble');
    expect(extras(flat)).not.toContain('extra_doble');
    db.close();
  });

  it('el Flat white conserva sus demás extras: solo desaparece «Doble»', async () => {
    const db = await baseV2();
    await initDb(db);
    const flat = (await db.products.get('flat_white'))!;
    expect(extras(flat).sort()).toEqual(['extra_iced', 'extra_sirope', 'extra_tapa']);
    // Y sigue admitiendo leche y café.
    expect(flat.allowedModifierGroups.map((a) => a.groupId).sort()).toEqual(['cafe', 'extra', 'leche']);
    db.close();
  });

  it('no toca una receta que Nicolas editó a mano: 20 g se quedan en 20 g', async () => {
    const db = await baseV2((p) =>
      p.id === 'flat_white'
        ? { ...p, recipe: p.recipe.map((r) => (r.ingredientId === 'cafe' ? { ...r, qty: 20 } : r)) }
        : p,
    );
    await initDb(db);

    const flat = (await db.products.get('flat_white'))!;
    expect(flat.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(20);
    // Y como su receta es suya, tampoco se le tocan los modificadores.
    expect(extras(flat)).toContain('extra_doble');

    // El Americano, que no tocó, sí se migra: las dos bebidas son independientes.
    expect((await db.products.get('americano'))!.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(36);
    db.close();
  });

  it('tampoco la toca si lo editado es otro insumo de la receta', async () => {
    const db = await baseV2((p) =>
      p.id === 'flat_white'
        ? { ...p, recipe: p.recipe.map((r) => (r.ingredientId === 'leche' ? { ...r, qty: 150 } : r)) }
        : p,
    );
    await initDb(db);
    const flat = (await db.products.get('flat_white'))!;
    expect(flat.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(18);
    db.close();
  });

  it('deja la base en la versión 3 y no repite la migración al siguiente arranque', async () => {
    const db = await baseV2();
    await initDb(db);
    const settings = await db.settings.get('app');
    expect(settings?.seedVersion).toBe(SEED_VERSION);
    expect(SEED_VERSION).toBe(4);

    // Segundo arranque con la receta ya editada por Nicolas después de migrar:
    // no vuelve a pisarla porque la versión ya está al día.
    const flat = (await db.products.get('flat_white'))!;
    await db.products.put({
      ...flat,
      recipe: flat.recipe.map((r) => (r.ingredientId === 'cafe' ? { ...r, qty: 30 } : r)),
    });
    await initDb(db);
    expect((await db.products.get('flat_white'))!.recipe.find((r) => r.ingredientId === 'cafe')?.qty).toBe(30);
    db.close();
  });
});

describe('migración de métodos y volúmenes (v3 → v4)', () => {
  it('la semilla nueva trae método y volumen en las catorce bebidas', async () => {
    const db = new BarraDb(`barra-v4-${++n}`);
    await initDb(db);
    const productos = await db.products.toArray();
    expect(productos).toHaveLength(14);
    for (const p of productos) {
      expect(p.method).toBeTruthy();
      expect(p.servingMl).toBeGreaterThan(0);
    }
    expect((await db.products.get('cold_brew'))!.method).toBe('cold_brew');
    expect((await db.products.get('americano'))!.servingMl).toBe(222);
    db.close();
  });

  it('sobre una base v3 añade método y volumen sin tocar la receta', async () => {
    const db = await baseV3();
    const antes = (await db.products.get('cortado'))!;
    expect(antes.method).toBeUndefined();
    const costeAntes = await costeDe(db, 'cortado');

    await initDb(db);

    const despues = (await db.products.get('cortado'))!;
    expect(despues.method).toBe('espresso');
    expect(despues.servingMl).toBe(156);
    expect(despues.recipe).toEqual(antes.recipe);
    expect(await costeDe(db, 'cortado')).toBe(costeAntes);
    db.close();
  });

  it('los costes del escandallo no se mueven ni un céntimo', async () => {
    const db = await baseV3();
    await initDb(db);
    expect(await costeDe(db, 'cortado')).toBeCloseTo(0.7428, 4);
    expect(await costeDe(db, 'flat_white')).toBeCloseTo(1.2774, 4);
    expect(await costeDe(db, 'americano')).toBeCloseTo(1.2542, 4);
    db.close();
  });

  it('los vasos aprenden lo que les cabe', async () => {
    const db = await baseV3();
    expect((await db.ingredients.get('vaso_6'))!.capacityMl).toBeUndefined();
    await initDb(db);
    expect((await db.ingredients.get('vaso_6'))!.capacityMl).toBe(180);
    expect((await db.ingredients.get('vaso_10'))!.capacityMl).toBe(300);
    expect((await db.ingredients.get('vaso_frio'))!.capacityMl).toBe(425);
    db.close();
  });

  it('añade la hoja de té, sin costear, y la mete en la receta del Té', async () => {
    const db = await baseV3();
    expect(await db.ingredients.get('te_hoja')).toBeUndefined();
    const costeAntes = await costeDe(db, 'te');
    await initDb(db);

    const hoja = (await db.ingredients.get('te_hoja'))!;
    expect(hoja.costPerUnit).toBe(0);
    expect(hoja.costSource).toBe('sin-costear');
    expect(hoja.trackStock).toBe(true);

    const te = (await db.products.get('te'))!;
    expect(te.recipe.find((r) => r.ingredientId === 'te_hoja')?.qty).toBe(2);
    // Y como la hoja está a 0 €, el té sigue costando lo mismo que antes: el
    // insumo nuevo se ve en Ajustes, pero no inventa ningún céntimo.
    expect(await costeDe(db, 'te')).toBe(costeAntes);
    db.close();
  });

  it('no pisa una receta que Nicolas editó a mano: el Té con 250 ml se queda sin hoja', async () => {
    const db = await baseV3((p) =>
      p.id === 'te'
        ? { ...p, recipe: p.recipe.map((r) => (r.ingredientId === 'agua' ? { ...r, qty: 250 } : r)) }
        : p,
    );
    await initDb(db);
    const te = (await db.products.get('te'))!;
    expect(te.recipe.find((r) => r.ingredientId === 'te_hoja')).toBeUndefined();
    expect(te.recipe.find((r) => r.ingredientId === 'agua')?.qty).toBe(250);
    // El método y el volumen sí llegan: son metadatos, no receta.
    expect(te.method).toBe('infusion');
    db.close();
  });

  it('no pisa un método ni un volumen ya puestos a mano', async () => {
    const db = await baseV3((p) =>
      p.id === 'filtro' ? ({ ...p, method: 'cold_brew', servingMl: 400 } as Product) : p,
    );
    await initDb(db);
    const filtro = (await db.products.get('filtro'))!;
    expect(filtro.method).toBe('cold_brew');
    expect(filtro.servingMl).toBe(400);
    db.close();
  });

  it('deja la base en la versión 4 y no repite la migración al siguiente arranque', async () => {
    const db = await baseV3();
    await initDb(db);
    expect((await db.settings.get('app'))?.seedVersion).toBe(4);

    const te = (await db.products.get('te'))!;
    await db.products.put({ ...te, recipe: te.recipe.filter((r) => r.ingredientId !== 'te_hoja') });
    await initDb(db);
    expect((await db.products.get('te'))!.recipe.find((r) => r.ingredientId === 'te_hoja')).toBeUndefined();
    db.close();
  });

  it('los ratios arrancan vacíos: mandan los clásicos hasta que alguien los toque', async () => {
    const db = new BarraDb(`barra-ratios-${++n}`);
    const { settings } = await initDb(db);
    expect(settings.ratios).toEqual({});
    db.close();
  });
});
