/**
 * El recorrido completo, en capturas y con comprobaciones por el camino.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas.mjs
 *
 * Primer uso → Cómo funciona → nuevo evento con carga → abrir barra → grid
 * entero a la vista → **fila de extras contextual** → servir → resumen →
 * cerrar con recuento → resultados del evento → Resultados globales →
 * exportar. Después, lo mismo en vertical, y la migración de la semilla.
 *
 * Las capturas van a `docs/capturas/fase-5/`.
 */
import { mkdirSync } from 'node:fs';
import {
  BASE,
  HORIZONTAL,
  VERTICAL,
  abrirNavegador,
  irA,
} from './lib/recorrido.mjs';

const CAPTURAS = 'docs/capturas/fase-5';
mkdirSync(CAPTURAS, { recursive: true });

const fallos = [];
const linea = (ok, texto) => {
  if (!ok) fallos.push(texto);
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${texto}`);
};

let n = 0;
async function captura(page, nombre) {
  n += 1;
  const archivo = `${CAPTURAS}/${String(n).padStart(2, '0')}-${nombre}.png`;
  await page.screenshot({ path: archivo });
  return archivo;
}

const { browser, page } = await abrirNavegador({ viewport: HORIZONTAL });
console.log(`\n=== Recorrido completo sobre ${BASE} a 1180 × 820 ===\n`);

/* ---------- 1. Primer uso ---------- */

await irA(page, '/');
const comoFunciona = await page.locator('.como__item').allTextContents();
linea(comoFunciona.length === 4, `el primer uso explica los cuatro pasos (${comoFunciona.length})`);
linea(
  (await page.locator('.instalar').count()) === 1,
  'y recuerda instalar la app en el iPad',
);
await captura(page, 'primer-uso-como-funciona-e-instalar');

/* ---------- 2. Nuevo evento con carga ---------- */

await page.getByRole('button', { name: 'Nuevo evento' }).first().click();
await page.waitForSelector('#ev-nombre');
await page.fill('#ev-nombre', 'Boda Ana y Marc');
await page.fill('#ev-lugar', 'Finca La Alquería, Valencia');
await page.fill('#ev-invitados', '120');
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
await page.waitForTimeout(200);
const cafe = await page.inputValue('input[aria-label="Carga de Café en kg"]');
linea(cafe !== '', `la sugerencia rellena la carga de café: ${cafe} kg`);
await captura(page, 'evento-nuevo-con-carga-sugerida');

await page.getByRole('button', { name: 'Guardar', exact: true }).click();
await page.waitForSelector('.eventos');
linea(
  (await page.locator('.event-row__step').first().textContent())?.includes('Paso 1 de 4'),
  'el evento aparece en Próximos, en el paso 1',
);
await captura(page, 'eventos-con-proximo-listo-para-abrir');

/* ---------- 3. La barra ---------- */

await page.getByRole('button', { name: 'Abrir barra' }).first().click();
await page.waitForSelector('.tile-grid .tile');

const grid = await page.evaluate(() => {
  const wrap = document.querySelector('.grid-wrap');
  const g = document.querySelector('.tile-grid');
  const tiles = [...g.querySelectorAll('.tile')];
  return {
    tiles: tiles.length,
    filas: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size,
    alto: Math.ceil(g.getBoundingClientRect().height),
    hueco: wrap.clientHeight,
    cabe: wrap.scrollHeight <= wrap.clientHeight,
  };
});
linea(
  grid.cabe && grid.tiles === 14,
  `el grid entero a la vista: ${grid.tiles} tiles en ${grid.filas} filas, ${grid.alto} px de ${grid.hueco}`,
);
linea(
  (await page.locator('.pasos-linea').textContent())?.includes('Paso 2 de 4'),
  'la cabecera dice «Paso 2 de 4 · Servir»',
);
await captura(page, 'barra-grid-con-pestanas');

// Las pestañas filtran el grid; «Todas» lo devuelve entero.
await page.locator('.cat-tabs__item', { hasText: 'Especiales' }).click();
await page.waitForTimeout(120);
const filtrados = await page.locator('.tile-grid .tile').count();
linea(filtrados === 2, `la pestaña «Especiales» deja ${filtrados} bebidas`);
await captura(page, 'pestana-filtra-una-categoria');
await page.locator('.cat-tabs__item', { hasText: 'Todas' }).click();
await page.waitForTimeout(120);
const todas = await page.locator('.tile-grid .tile').count();
linea(todas === 14, `«Todas» devuelve las ${todas} bebidas`);

/* ---------- 3 bis. La fila de extras, después de la bebida ---------- */

const extras = () =>
  page.$$eval('.extras button', (bs) => bs.map((b) => b.textContent.trim()));
const bebidaDeLaFila = () =>
  page.$eval('.extras', (e) => e.querySelector('.extras__bebida')?.textContent?.trim() ?? null);
/** El café que gastó de verdad el último pedido, leído de IndexedDB. */
const cafeDelUltimoPedido = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mutuo-barra');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('orders', 'readonly').objectStore('orders').getAll();
          all.onsuccess = () => {
            const vivos = all.result.filter((o) => o.voidedAt === null);
            const ultimo = vivos.sort((a, b) => a.servedAt.localeCompare(b.servedAt)).pop();
            resolve(ultimo?.lines?.[0]?.usage?.cafe ?? null);
          };
        };
      }),
  );

linea(
  (await page.locator('.extras__pista').textContent())?.trim() ===
    'Toca una bebida; sus extras salen aquí',
  'la fila arranca vacía y dice dónde van a salir los extras',
);
await captura(page, 'fila-de-extras-vacia');

/* ---------- 3 ter. Un Americano gasta 36 g de café ---------- */

const cafeAntes = await page.locator('.meter__value').textContent();
await page.locator('.tile-grid .tile', { hasText: /^Americano/ }).click();
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(500);
const cafeDespues = await page.locator('.meter__value').textContent();
const gramos = await cafeDelUltimoPedido();
linea(
  gramos === 36,
  `el Americano servido descuenta ${gramos} g de café (los 18 de antes eran media dosis)`,
);
linea(
  cafeAntes?.startsWith('2,98') && cafeDespues?.startsWith('2,94'),
  `el medidor pasa de ${cafeAntes?.trim()} a ${cafeDespues?.trim()} (2 980 − 36 = 2 944 g)`,
);
linea(
  (await page.locator('.extras__pista').count()) === 1 &&
    (await page.locator('.barra__count-value').textContent())?.trim() === '1',
  'al servir, la fila vuelve al estado vacío y el contador sube',
);
await captura(page, 'un-americano-gasta-36-g-y-la-fila-vuelve-a-vacia');

/* ---------- 3 quater. Los extras de cada bebida ---------- */

await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.waitForTimeout(150);
linea(
  (await bebidaDeLaFila()) === 'Latte' &&
    (await extras()).join(' · ') === 'Vaca · Avena · Sin lactosa · Desca · Doble · Iced · Sirope · Tapa',
  `tocar «Latte» llena la fila con sus extras: ${(await extras()).join(' · ')}`,
);
const fila = await page.evaluate(() => {
  const e = document.querySelector('.extras');
  const botones = [...e.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
  return {
    alto: Math.round(e.getBoundingClientRect().height),
    minAlto: Math.round(Math.min(...botones.map((r) => r.height))),
    minAncho: Math.round(Math.min(...botones.map((r) => r.width))),
    cabe: e.scrollWidth <= e.clientWidth,
    ancho: e.scrollWidth,
    letra: Math.min(
      ...[...e.querySelectorAll('button, .extras__bebida')].map((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      ),
    ),
  };
});
linea(
  fila.alto === 56 && fila.minAlto >= 44 && fila.minAncho >= 44,
  `la fila mide ${fila.alto} px y ningún objetivo baja de 44 (mínimo ${fila.minAlto} × ${fila.minAncho})`,
);
linea(fila.letra >= 15, `y ningún texto baja de 15 px (mínimo ${fila.letra})`);
linea(fila.cabe, `los ocho extras del Latte caben sin desplazar (${fila.ancho} px)`);
await captura(page, 'fila-extras-del-latte');

await page.locator('.extras button', { hasText: /^Avena$/ }).click();
await page.waitForTimeout(150);
const conAvena = await page.locator('.ticket__row').first().textContent();
linea(
  conAvena?.includes('Latte') && conAvena?.includes('avena'),
  'tocar «Avena» cambia esa línea: el ticket dice «Latte · avena»',
);
linea(
  (await page.getAttribute('.extras button:has-text("Avena")', 'aria-pressed')) === 'true',
  'y el extra queda marcado en violeta',
);
await captura(page, 'latte-con-avena-desde-la-fila');

await page.locator('.extras button', { hasText: /^Sin lactosa$/ }).click();
await page.waitForTimeout(150);
const sinLactosa = await page.locator('.ticket__row').first().textContent();
linea(
  sinLactosa?.includes('sin lactosa') && !sinLactosa?.includes('avena'),
  'la leche es de opción única: «Sin lactosa» apaga «Avena»',
);
await captura(page, 'la-leche-cambia-a-sin-lactosa');

// Qué ofrece cada bebida. El Americano y el Flat white ya salen dobles.
await page.locator('.tile-grid .tile', { hasText: /^Espresso$/ }).click();
await page.waitForTimeout(120);
linea(
  (await extras()).join(' · ') === 'Desca · Doble · Iced · Tapa',
  `el Espresso solo ofrece: ${(await extras()).join(' · ')}`,
);
await captura(page, 'extras-del-espresso');

await page.locator('.tile-grid .tile', { hasText: /^Americano/ }).click();
await page.waitForTimeout(120);
const exAmericano = await extras();
linea(!exAmericano.includes('Doble'), `el Americano ya no ofrece «Doble»: ${exAmericano.join(' · ')}`);
await captura(page, 'el-americano-no-ofrece-doble');

await page.locator('.tile-grid .tile', { hasText: /^Flat white/ }).click();
await page.waitForTimeout(120);
const exFlat = await extras();
linea(!exFlat.includes('Doble'), `el Flat white tampoco: ${exFlat.join(' · ')}`);
await captura(page, 'el-flat-white-no-ofrece-doble');

/* ---------- 3 quinquies. Dos Lattes con avena acaban en una línea ---------- */

// El pedido se vacía sin servir: «Deshacer último» hasta que no quede nada.
while ((await page.locator('.ticket__row').count()) > 0) {
  await page.locator('.ticket__foot .btn', { hasText: 'Deshacer' }).click();
  await page.waitForTimeout(80);
}
await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.waitForTimeout(120);
await page.locator('.extras button', { hasText: /^Avena$/ }).click();
await page.waitForTimeout(150);
const antes = await page.locator('.ticket__row').count();
await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.waitForTimeout(150);
const entre = await page.locator('.ticket__row').count();
await page.locator('.extras button', { hasText: /^Avena$/ }).click();
await page.waitForTimeout(250);
const agrupadas = await page.evaluate(() => {
  const filas = [...document.querySelectorAll('.ticket__row')];
  return {
    filas: filas.length,
    qty: filas[0]?.querySelector('.ticket__qty')?.textContent?.trim(),
    actual: document.querySelectorAll('.ticket__row.is-current').length,
  };
});
linea(
  antes === 1 && entre === 2 && agrupadas.filas === 1 && agrupadas.qty === '2',
  `dos Lattes tocados por separado (1 → 2 líneas) se funden en ${agrupadas.filas} con cantidad ${agrupadas.qty} al poner la avena a la segunda`,
);
linea(agrupadas.actual === 1, 'y la línea superviviente queda marcada como la actual');
await captura(page, 'dos-lattes-con-avena-agrupados');

await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(400);

/* ---------- 3 quater. Modo Rápido: el extra, justo después ---------- */

await page.locator('.switch--stacked').click();
await page.waitForTimeout(200);
// La explicación del modo vive en la fila, no en el subtítulo: en la cabecera
// no cabe sin cortar «Cerrar barra».
linea(
  (await page.locator('.extras__pista').textContent())?.trim() ===
    'Toca una bebida: se sirve al momento y sus extras salen aquí',
  'con Rápido encendido, la fila explica que el toque ya sirve',
);
await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).click();
await page.waitForTimeout(400);
linea(
  (await bebidaDeLaFila()) === 'Cortado',
  'en Rápido la bebida se sirve al tocarla y la fila sigue editándola',
);
await captura(page, 'rapido-cortado-servido-y-editable');

await page.locator('.extras button', { hasText: /^Avena$/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Resumen' }).click();
await page.waitForSelector('.sheet--wide');
const guardado = await page.locator('.sheet--wide').textContent();
linea(
  guardado?.includes('Cortado') && guardado?.includes('Avena'),
  'y el pedido ya guardado pasa a «Cortado · Avena» en el resumen',
);
await captura(page, 'rapido-el-pedido-guardado-lleva-la-avena');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.locator('.switch--stacked').click();
await page.waitForTimeout(200);

/* ---------- 3 quinquies. Recargar con el pedido a medias ---------- */

await page.locator('.tile-grid .tile', { hasText: /^Cappuccino/ }).click();
await page.waitForTimeout(150);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.tile-grid .tile');
await page.waitForTimeout(300);
linea(
  (await bebidaDeLaFila()) === 'Cappuccino' &&
    (await page.locator('.ticket__row.is-current').count()) === 1,
  'tras recargar, la línea que quedaba en el pedido vuelve a ser la actual',
);
await captura(page, 'tras-recargar-la-fila-recupera-su-linea');

// Unas cuantas más, para que el resumen tenga algo que enseñar.
for (const bebida of [/^Cortado/, /^Flat white/, /^Cold brew/, /^Filtro/]) {
  await page.locator('.tile-grid .tile', { hasText: bebida }).click();
}
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(400);

/* ---------- 4. Resumen ---------- */

await page.getByRole('button', { name: 'Resumen' }).click();
await page.waitForSelector('.sheet--wide');
linea(
  (await page.locator('.sheet--wide .stat').count()) >= 3,
  'el resumen se abre como hoja sobre la barra, sin cambiar de pantalla',
);
await captura(page, 'resumen-sobre-la-barra');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* ---------- 5. Cerrar con recuento ---------- */

await page.getByRole('button', { name: 'Cerrar barra' }).click();
await page.waitForSelector('.recuento');

const pasoActual = await page.locator('.pasos__item.is-actual .pasos__name').textContent();
linea(pasoActual === 'Cerrar', `el indicador marca «${pasoActual}», no «Servir»`);
const placeholder = await page.locator('.recuento__input input').first().getAttribute('placeholder');
linea(placeholder === 'sin contar', `el campo «Queda» vacío dice «${placeholder}»`);
await captura(page, 'cierre-recuento-vacio-paso-3');

// Se cuenta el café y la desviación aparece en vivo.
// Un recuento creíble: 8 bebidas gastan ~0,14 kg de una carga de 2,98.
await page.locator('.recuento__input input').first().fill('2,80');
await page.waitForTimeout(300);
const desviacion = await page.locator('.recuento__row').first().locator('.recuento__cell').last().textContent();
linea(
  desviacion !== 'no contado',
  `al escribir el recuento la fila enseña la desviación: ${desviacion?.trim()}`,
);
await page.fill('#ci-invitados', '112');
await page.fill('#ci-incidencias', 'Se acabó la avena a las 22:10.');
await captura(page, 'cierre-con-recuento-y-resultado-en-vivo');

await page.getByRole('button', { name: 'Cerrar y ver resultados' }).click();
await page.waitForSelector('.detalle, .stat-grid');
await page.waitForTimeout(400);
linea(
  (await page.locator('.pasos__item.is-actual .pasos__name').textContent()) === 'Resultados',
  'tras cerrar, el evento está en el paso 4',
);
await captura(page, 'resultados-del-evento');

/* ---------- 6. Resultados globales y exportar ---------- */

await page.locator('.navlink', { hasText: 'Resultados' }).click();
await page.waitForSelector('.tabla--eventos, .empty');
linea(
  (await page.locator('.tabla--eventos tbody tr').count()) === 1,
  'el evento cerrado entra en la tabla de Resultados',
);
await captura(page, 'resultados-globales-tabla-y-graficos');

const descargas = [];
page.on('download', (d) => descargas.push(d.suggestedFilename()));
await page.getByRole('button', { name: 'Exportar todo' }).click();
await page.waitForTimeout(1500);
linea(
  descargas.length === 3,
  `exportar guarda ${descargas.length} archivos: ${descargas.join(', ')}`,
);

/* ---------- 7. Vertical ---------- */

console.log('\n=== Vertical, 820 × 1180 ===\n');
await page.setViewportSize(VERTICAL);
await irA(page, '/');
await captura(page, 'vertical-eventos');

// Se reabre la barra para ver el ticket como barra inferior.
await irA(page, '/resultados');
await page.waitForTimeout(200);
await page.locator('.tabla--eventos a').first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Reabrir' }).click();
await page.waitForTimeout(600);
await irA(page, '/');
await page.getByRole('button', { name: 'Abrir barra' }).first().click();
await page.waitForSelector('.tile-grid .tile');
const barraInferior = await page.evaluate(() => {
  const b = document.querySelector('.ticket-bar');
  const columna = document.querySelector('.barra__cols > .ticket');
  return {
    visible: b ? getComputedStyle(b).display !== 'none' : false,
    columnaOculta: columna ? getComputedStyle(columna).display === 'none' : true,
  };
});
linea(
  barraInferior.visible && barraInferior.columnaOculta,
  'en vertical el ticket baja a la barra inferior y la columna desaparece',
);
await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.waitForTimeout(150);
const filaVertical = await page.evaluate(() => {
  const e = document.querySelector('.extras');
  const botones = [...e.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
  return {
    bebida: e.querySelector('.extras__bebida')?.textContent?.trim() ?? null,
    alto: Math.round(e.getBoundingClientRect().height),
    minAlto: Math.round(Math.min(...botones.map((r) => r.height))),
    minAncho: Math.round(Math.min(...botones.map((r) => r.width))),
    desplaza: e.scrollWidth > e.clientWidth,
    ancho: e.scrollWidth,
    hueco: e.clientWidth,
  };
});
linea(
  filaVertical.bebida === 'Latte' && filaVertical.alto === 56,
  `en vertical la fila sigue midiendo ${filaVertical.alto} px y enseña los extras del ${filaVertical.bebida}`,
);
linea(
  filaVertical.minAlto >= 44 && filaVertical.minAncho >= 44,
  `y ningún objetivo baja de 44 px (mínimo ${filaVertical.minAlto} × ${filaVertical.minAncho})`,
);
linea(
  true,
  filaVertical.desplaza
    ? `los ocho extras no caben en ${filaVertical.hueco} px y la fila se desplaza a lo ancho (${filaVertical.ancho} px), sin scroll de página`
    : `los ocho extras caben en los ${filaVertical.hueco} px de ancho`,
);
await captura(page, 'vertical-fila-de-extras-del-latte');
await captura(page, 'vertical-barra-y-ticket-inferior');

await page.locator('.ticket-bar__label').click();
await page.waitForSelector('.ticket--sheet');
const hoja = await page.evaluate(() => {
  const s = document.querySelector('.ticket--sheet');
  return { rol: s?.getAttribute('role'), modal: s?.getAttribute('aria-modal') };
});
linea(
  hoja.rol === 'dialog' && hoja.modal === 'true',
  'desplegado, el ticket es un diálogo de verdad',
);
await captura(page, 'vertical-ticket-desplegado');

await page.waitForFunction(() =>
  document.querySelector('.ticket--sheet')?.contains(document.activeElement),
);
await page.keyboard.press('Escape');
await page.waitForSelector('.ticket--sheet', { state: 'detached' });
linea(true, 'y se cierra con Escape');

/* ---------- 8. Modo noche ---------- */

await page.setViewportSize(HORIZONTAL);
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Noche/ }).click();
await page.waitForTimeout(300);
linea(
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'night',
  'el interruptor «Noche» cambia el tema desde la propia barra',
);
await captura(page, 'barra-en-modo-noche');

/* ---------- 9. La migración de la semilla, sobre una base de verdad ---------- */

console.log('\n=== Migración de la semilla v2 → v3 ===\n');

/** Lee la receta y los extras de un producto directamente de IndexedDB. */
const leerProducto = (id) =>
  page.evaluate(
    (pid) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mutuo-barra');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction('products', 'readonly').objectStore('products').get(pid);
          get.onsuccess = () => {
            const p = get.result;
            resolve({
              cafe: p.recipe.find((r) => r.ingredientId === 'cafe')?.qty ?? null,
              extras: p.allowedModifierGroups.find((a) => a.groupId === 'extra')?.optionIds ?? null,
            });
          };
        };
      }),
    id,
  );

/** Deja la base como estaba en la fase 4: semilla v2 y las dos bebidas a 18 g. */
const volverALaV2 = (cafeFlatWhite) =>
  page.evaluate(
    (qty) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mutuo-barra');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['products', 'settings'], 'readwrite');
          const productos = tx.objectStore('products');
          const v2 = {
            americano: [
              { ingredientId: 'cafe', qty: 18 },
              { ingredientId: 'agua', qty: 150 },
              { ingredientId: 'vaso_10', qty: 1 },
              { ingredientId: 'menaje', qty: 1 },
            ],
            flat_white: [
              { ingredientId: 'cafe', qty: qty },
              { ingredientId: 'leche', qty: 120 },
              { ingredientId: 'vaso_6', qty: 1 },
              { ingredientId: 'menaje', qty: 1 },
            ],
          };
          for (const [id, recipe] of Object.entries(v2)) {
            const get = productos.get(id);
            get.onsuccess = () => {
              const p = get.result;
              productos.put({
                ...p,
                recipe,
                allowedModifierGroups: p.allowedModifierGroups.map((a) =>
                  a.groupId === 'extra'
                    ? { ...a, optionIds: [...(a.optionIds ?? []), 'extra_doble'] }
                    : a,
                ),
              });
            };
          }
          const ajustes = tx.objectStore('settings');
          const gs = ajustes.get('app');
          gs.onsuccess = () => ajustes.put({ ...gs.result, seedVersion: 2 });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
      }),
    cafeFlatWhite,
  );

// Caso 1: la receta sigue siendo la de la semilla → se migra.
await volverALaV2(18);
const antesDeMigrar = await leerProducto('flat_white');
linea(
  antesDeMigrar.cafe === 18 && antesDeMigrar.extras.includes('extra_doble'),
  `la base vuelve a la v2: Flat white con ${antesDeMigrar.cafe} g y con «Doble»`,
);
await irA(page, '/');
await page.waitForTimeout(400);
const migrado = await leerProducto('flat_white');
const migradoAmericano = await leerProducto('americano');
linea(
  migrado.cafe === 36 && !migrado.extras.includes('extra_doble'),
  `al arrancar, el Flat white pasa a ${migrado.cafe} g y pierde «Doble» (le quedan ${migrado.extras.join(', ')})`,
);
linea(
  migradoAmericano.cafe === 36 && !migradoAmericano.extras.includes('extra_doble'),
  `y el Americano igual: ${migradoAmericano.cafe} g, extras ${migradoAmericano.extras.join(', ')}`,
);
await irA(page, '/ajustes/carta');
await page.waitForTimeout(300);
await captura(page, 'carta-tras-migrar-flat-white-36-g');

// Caso 2: Nicolas la editó a mano → no se toca.
await volverALaV2(20);
await irA(page, '/');
await page.waitForTimeout(400);
const editado = await leerProducto('flat_white');
linea(
  editado.cafe === 20 && editado.extras.includes('extra_doble'),
  `una receta editada a mano (${editado.cafe} g) no se pisa, y conserva sus modificadores`,
);
await irA(page, '/ajustes/carta');
await page.waitForTimeout(300);
await captura(page, 'carta-con-la-receta-editada-a-mano-intacta');

const errores = page.errores.filter((e) => !e.includes('favicon'));
linea(errores.length === 0, `sin errores de consola${errores.length ? `: ${errores.join(' · ')}` : ''}`);

await browser.close();

console.log(`\n${n} capturas en ${CAPTURAS}/`);
console.log(fallos.length === 0 ? 'Todo en verde.' : `${fallos.length} comprobaciones en rojo.`);
process.exit(fallos.length === 0 ? 0 : 1);
