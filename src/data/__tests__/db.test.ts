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
} from '../seed';
import type { Product } from '../types';

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

function extras(product: Product): string[] {
  return product.allowedModifierGroups.find((a) => a.groupId === 'extra')?.optionIds ?? [];
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
    expect(SEED_VERSION).toBe(3);

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
