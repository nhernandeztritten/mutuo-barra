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
import type { Ingredient, ModifierOption, Order, Product } from '../types';

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

/**
 * Base con la carta de la semilla v4: la que tiene el iPhone de Nicolas la
 * noche antes de la boda. Es la v5 **con la Tapa todavía dentro**, que es lo
 * que la migración tiene que retirar sin tocar un solo pedido.
 */
const TAPA_V4: ModifierOption = {
  id: 'extra_tapa', groupId: 'extra', name: 'Tapa', isDefault: false,
  effects: [{ kind: 'add', ingredientId: 'tapa_6', qty: 1 }],
  priceDelta: 0, sortOrder: 40,
};

/** Los `allowedModifierGroups` que tenía cada bebida en la v4. */
const EXTRAS_V4: Record<string, string[]> = {
  espresso: ['extra_doble', 'extra_iced', 'extra_tapa'],
  americano: ['extra_iced', 'extra_tapa'],
  flat_white: ['extra_iced', 'extra_sirope', 'extra_tapa'],
  matcha_latte: ['extra_iced', 'extra_tapa'],
  filtro: ['extra_tapa'],
  cold_brew: ['extra_tapa'],
  te: ['extra_tapa'],
  agua_botella: ['extra_tapa'],
};

async function baseV4(): Promise<BarraDb> {
  const db = new BarraDb(`barra-migracion-v4-${++n}`);
  await db.open();

  const productosV4 = PRODUCTS.map((p) => {
    const listaV4 = EXTRAS_V4[p.id];
    if (!listaV4) return p;
    const sinExtra = p.allowedModifierGroups.filter((a) => a.groupId !== 'extra');
    return { ...p, allowedModifierGroups: [...sinExtra, { groupId: 'extra', optionIds: listaV4 }] };
  });
  // En la v4 las tres tapas se contaban en la carga y en el recuento.
  const insumosV4 = INGREDIENTS.map((i) =>
    i.id.startsWith('tapa_') ? { ...i, trackStock: true } : i,
  );

  await db.ingredients.bulkPut(insumosV4);
  await db.products.bulkPut(productosV4);
  await db.modifierGroups.bulkPut(MODIFIER_GROUPS);
  await db.modifierOptions.bulkPut([...MODIFIER_OPTIONS, TAPA_V4]);
  await updateSettings({ seedVersion: 4 }, db);
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
    // La Tapa se fue con la v5 en la misma pasada: quedan sus dos extras.
    expect(extras(flat).sort()).toEqual(['extra_iced', 'extra_sirope']);
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

  it('deja la base en la versión de la semilla y no repite la migración', async () => {
    const db = await baseV2();
    await initDb(db);
    const settings = await db.settings.get('app');
    expect(settings?.seedVersion).toBe(SEED_VERSION);
    expect(SEED_VERSION).toBe(5);

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

  it('deja la base en la versión de la semilla y no repite la migración', async () => {
    const db = await baseV3();
    await initDb(db);
    expect((await db.settings.get('app'))?.seedVersion).toBe(SEED_VERSION);

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

describe('migración de la Tapa (v4 → v5)', () => {
  /** Un pedido servido con tapa, congelado tal y como lo guardó la barra. */
  function pedidoConTapa(): Order {
    return {
      id: 'ord-tapa',
      eventId: 'ev-viejo',
      createdAt: '2026-09-05T18:10:00.000Z',
      servedAt: '2026-09-05T18:10:00.000Z',
      deviceId: 'dev-1',
      mode: 'incluido',
      lines: [
        {
          id: 'l1',
          productId: 'cortado',
          productName: 'Cortado',
          modifiers: [{ groupId: 'extra', optionId: 'extra_tapa', label: 'Tapa' }],
          qty: 2,
          unitPrice: 2.2,
          unitCost: 0.7868,
          usage: { cafe: 18, leche: 120, vaso_6: 1, menaje: 1, tapa_6: 1 },
          note: '',
        },
      ],
      subtotal: 4.4,
      tip: 0,
      total: 4.4,
      payment: null,
      cashGiven: null,
      voidedAt: null,
      voidReason: '',
      note: '',
    };
  }

  it('la opción desaparece de la base y ninguna bebida la admite', async () => {
    const db = await baseV4();
    await initDb(db);

    expect(await db.modifierOptions.get('extra_tapa')).toBeUndefined();
    for (const p of await db.products.toArray()) {
      for (const a of p.allowedModifierGroups) {
        expect(a.optionIds ?? []).not.toContain('extra_tapa');
      }
    }
    db.close();
  });

  it('una bebida que solo admitía Tapa se queda sin el grupo, no con un grupo vacío', async () => {
    const db = await baseV4();
    await initDb(db);
    for (const id of ['filtro', 'cold_brew', 'te', 'agua_botella']) {
      expect((await db.products.get(id))!.allowedModifierGroups).toEqual([]);
    }
    // Y las que tenían más de un extra conservan los demás.
    expect(extras((await db.products.get('espresso'))!)).toEqual(['extra_doble', 'extra_iced']);
    expect(extras((await db.products.get('flat_white'))!)).toEqual(['extra_iced', 'extra_sirope']);
    db.close();
  });

  it('los tres insumos de tapa siguen existiendo, pero dejan de contarse', async () => {
    const db = await baseV4();
    await initDb(db);
    for (const id of ['tapa_6', 'tapa_10', 'tapa_fria']) {
      const ing = await db.ingredients.get(id);
      expect(ing).toBeDefined();
      expect(ing?.trackStock).toBe(false);
      // El coste medido no se toca: si vuelven, vuelven con su cifra.
      expect(ing?.costPerUnit).toBeGreaterThan(0);
    }
    db.close();
  });

  it('un pedido servido con tapa no se toca: línea, coste y etiqueta siguen', async () => {
    const db = await baseV4();
    await db.orders.put(pedidoConTapa());
    await initDb(db);

    const guardado = (await db.orders.get('ord-tapa'))!;
    expect(guardado).toEqual(pedidoConTapa());
    expect(guardado.lines[0]!.usage['tapa_6']).toBe(1);
    expect(guardado.lines[0]!.modifiers[0]!.label).toBe('Tapa');
    db.close();
  });

  it('deja la base en la versión 5 y no repite la migración', async () => {
    const db = await baseV4();
    await initDb(db);
    expect((await db.settings.get('app'))?.seedVersion).toBe(5);
    expect(SEED_VERSION).toBe(5);

    // Segundo arranque: si Nicolas se inventara una tapa nueva a mano, la
    // migración ya no corre y no se la pisa.
    await db.modifierOptions.put({ ...TAPA_V4, id: 'extra_tapa_nueva', name: 'Tapa (nueva)' });
    await initDb(db);
    expect(await db.modifierOptions.get('extra_tapa_nueva')).toBeDefined();
    db.close();
  });

  it('la carta nueva tampoco la trae: 8 opciones, no 9', async () => {
    const db = new BarraDb(`barra-sin-tapa-${++n}`);
    await initDb(db);
    expect(await db.modifierOptions.count()).toBe(8);
    expect(await db.modifierOptions.get('extra_tapa')).toBeUndefined();
    db.close();
  });
});
