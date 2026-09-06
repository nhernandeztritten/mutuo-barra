/**
 * El recorrido completo, en capturas y con comprobaciones por el camino.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas.mjs
 *
 * Primer uso → Cómo funciona → nuevo evento con carga → abrir barra → grid
 * entero a la vista → servir → resumen → cerrar con recuento → resultados del
 * evento → Resultados globales → exportar. Después, lo mismo en vertical.
 *
 * Las capturas van a `docs/capturas/fase-4/`.
 */
import { mkdirSync } from 'node:fs';
import {
  BASE,
  HORIZONTAL,
  VERTICAL,
  abrirNavegador,
  irA,
} from './lib/recorrido.mjs';

const CAPTURAS = 'docs/capturas/fase-4';
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
await captura(page, 'barra-grid-continuo-con-leyenda');

// La leyenda: con el grid entero a la vista, resalta en vez de desplazar.
await page.locator('.leyenda-cat__item', { hasText: 'Especiales' }).click();
await page.waitForTimeout(120);
const resaltados = await page.locator('.tile--flash').count();
linea(resaltados === 2, `tocar «Especiales» resalta sus ${resaltados} bebidas`);
await captura(page, 'leyenda-resalta-una-categoria');
await page.waitForTimeout(500);

// Cortado con avena en dos toques.
await page.locator('.chips .chip', { hasText: 'Avena' }).click();
await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).click();
await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.locator('.tile-grid .tile', { hasText: /^Espresso tonic/ }).click();
const mods = await page.locator('.ticket__mods').first().textContent();
linea(mods?.trim() === 'avena', `el chip se aplica al tile: la línea dice «${mods?.trim()}»`);
await captura(page, 'ticket-tres-bebidas-cortado-con-avena');

await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(400);
linea(
  (await page.locator('.barra__count-value').textContent())?.trim() === '3',
  'servidas 3 bebidas, con «Deshacer» a mano',
);
await captura(page, 'servido-con-deshacer');

// Unas cuantas más, para que el resumen tenga algo que enseñar.
for (const bebida of [/^Cortado/, /^Flat white/, /^Cappuccino/, /^Cold brew/, /^Filtro/]) {
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
  desviacion !== 'sin recuento',
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

const errores = page.errores.filter((e) => !e.includes('favicon'));
linea(errores.length === 0, `sin errores de consola${errores.length ? `: ${errores.join(' · ')}` : ''}`);

await browser.close();

console.log(`\n${n} capturas en ${CAPTURAS}/`);
console.log(fallos.length === 0 ? 'Todo en verde.' : `${fallos.length} comprobaciones en rojo.`);
process.exit(fallos.length === 0 ? 0 : 1);
