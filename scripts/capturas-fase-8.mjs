/**
 * Fase 8 — las recetas clásicas por método, verificadas en el navegador.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-8.mjs
 *
 * Los siete puntos del encargo: el Cold brew y sus avisos · el Flat white que
 * no cabe en su vaso · el Filtro dentro de tolerancia, fuera de ella y
 * arreglado con «Usar el ratio» · una bebida nueva propuesta sola · el ratio
 * del filtro cambiado a 1:15 y restaurado · los litros de lote que suben la
 * carga y sobreviven a guardar.
 *
 * Las capturas van a `docs/capturas/fase-8/`.
 */
import { mkdirSync } from 'node:fs';
import { BASE, HORIZONTAL, abrirNavegador, irA } from './lib/recorrido.mjs';

const CAPTURAS = 'docs/capturas/fase-8';
mkdirSync(CAPTURAS, { recursive: true });

const fallos = [];
const linea = (ok, texto) => {
  if (!ok) fallos.push(texto);
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${texto}`);
};

let n = 0;
async function captura(page, nombre) {
  n += 1;
  await page.screenshot({ path: `${CAPTURAS}/${String(n).padStart(2, '0')}-${nombre}.png` });
}

/* ---------- Ayudas de la carta ---------- */

async function editar(page, nombre) {
  await page
    .locator('.event-row', { has: page.locator('.event-row__name', { hasText: nombre }) })
    .first()
    .getByRole('button', { name: 'Editar', exact: true })
    .click();
  await page.waitForSelector('.prep');
  // La hoja entra con una animación: sin esperarla, la captura sale a medio
  // camino y se lee la carta de detrás.
  await page.waitForTimeout(400);
}

const lectura = (page) => page.locator('.prep__lectura').textContent();
const avisos = (page) => page.locator('.aviso__texto').allTextContents();
const cerrarHoja = async (page) => {
  await page.locator('.sheet button[aria-label="Cerrar"]').first().click();
  await page.waitForTimeout(200);
};

const { browser, page } = await abrirNavegador({ viewport: HORIZONTAL });
console.log(`\n=== Recetas clásicas por método sobre ${BASE} a 1180 × 820 ===\n`);

/* ---------- 1. Cold brew: 1:10, 125 ml, 12,5 g ---------- */

await irA(page, '/ajustes/carta');
await page.waitForSelector('.ajustes');

const cabecera = (await page.locator('.ajustes header .meta').first().textContent()) ?? '';
linea(cabecera.includes('5 bebidas por revisar'), `La cabecera de Carta dice: «${cabecera.trim()}»`);

const marcadas = await page
  .locator('.event-row', { has: page.locator('.marca-revisar') })
  .locator('.event-row__name')
  .allTextContents();
console.log(`     Marcadas: ${marcadas.map((t) => t.replace(/revisar.*/, '').trim()).join(' · ')}`);

const altoMarca = await page.evaluate(() => {
  const el = document.querySelector('.marca-revisar');
  return el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0;
});
linea(altoMarca >= 15, `La marca «revisar» va a ${altoMarca} px (mínimo 15)`);
await captura(page, 'carta-con-cinco-por-revisar');

await editar(page, 'Cold brew');
const leeColdBrew = (await lectura(page)) ?? '';
const avisosColdBrew = await avisos(page);
linea(
  leeColdBrew.includes('Ratio 1:10') && leeColdBrew.includes('125 ml piden 12,5 g'),
  `Cold brew lee: «${leeColdBrew.trim()}»`,
);
linea(
  !avisosColdBrew.some((a) => a.includes('no caben')),
  `Cold brew: 125 ml en un vaso frío de 425 no es un error. Avisos: ${avisosColdBrew.length === 0 ? 'ninguno' : avisosColdBrew.join(' | ')}`,
);
await captura(page, 'cold-brew-ratio-1-10-sin-avisos');
await cerrarHoja(page);

/* ---------- 2. Flat white: no cabe en el vaso ---------- */

await editar(page, 'Flat white');
const avisosFlat = await avisos(page);
linea(
  avisosFlat.includes('192 ml no caben en el vaso de 180 ml'),
  `Flat white avisa: «${avisosFlat.join(' | ')}»`,
);
const arregloFlat = await page.locator('.aviso .btn').count();
linea(arregloFlat === 0, 'El aviso de «no cabe» no ofrece arreglo automático: se lee y ya');
await captura(page, 'flat-white-no-cabe-en-el-vaso');
await cerrarHoja(page);

/* ---------- 3. Filtro: tolerancia, aviso y «Usar el ratio» ---------- */

await editar(page, 'Filtro');
linea(
  (await avisos(page)).length === 0,
  `Filtro con 12 g y 12,5 esperados: dentro de la tolerancia del 10 %, sin aviso. Lee: «${((await lectura(page)) ?? '').trim()}»`,
);
await captura(page, 'filtro-12-g-dentro-de-tolerancia');

const dosisFiltro = page.getByLabel('Cantidad de Café');
await dosisFiltro.fill('9');
await page.waitForTimeout(250);
const avisoFiltro = await avisos(page);
linea(
  avisoFiltro.includes('A 1:16, 200 ml piden 12,5 g y la receta tiene 9 g'),
  `Con 9 g el aviso dice: «${avisoFiltro.join(' | ')}»`,
);
await captura(page, 'filtro-9-g-avisa-de-la-dosis');

await page.getByRole('button', { name: 'Usar el ratio' }).click();
await page.waitForTimeout(250);
linea(
  (await dosisFiltro.inputValue()) === '12,5' && (await avisos(page)).length === 0,
  `«Usar el ratio» deja la dosis en ${await dosisFiltro.inputValue()} g y el aviso desaparece`,
);
await captura(page, 'filtro-usar-el-ratio-devuelve-12-5');
await cerrarHoja(page);

/* ---------- 4. Bebida nueva: la receta se propone sola ---------- */

await page.getByRole('button', { name: /Nueva bebida/ }).click();
await page.waitForSelector('.prep');
await page.waitForTimeout(400);
await page.fill('#pr-nombre', 'Cold brew doble');
await page.selectOption('#pr-metodo', 'cold_brew');
await page.fill('#pr-volumen', '250');
await page.waitForTimeout(300);

const propuesta = await page.evaluate(() =>
  [...document.querySelectorAll('.receta-row')].map((f) => {
    const s = f.querySelector('select');
    return `${s.options[s.selectedIndex].text} ${f.querySelector('input').value}`;
  }),
);
linea(
  propuesta.some((r) => r.startsWith('Café 25')) && propuesta.some((r) => r.startsWith('Vaso frío')),
  `Receta propuesta: ${propuesta.join(' · ')}`,
);
await captura(page, 'bebida-nueva-receta-propuesta-sola');

await page.getByRole('button', { name: 'Crear bebida' }).click();
await page.waitForTimeout(500);
linea(
  (await page.locator('.event-row__name', { hasText: 'Cold brew doble' }).count()) === 1,
  'La bebida nueva queda guardada en la carta',
);

// Y sale en la barra: para eso se crea.
await irA(page, '/evento/nuevo');
await page.fill('#ev-nombre', 'Boda Ana y Marc');
await page.fill('#ev-invitados', '100');

/* ---------- 6a. Lotes: 4 L de batch ---------- */

const sugeridoCafe = () =>
  page
    .locator('.load-row', { has: page.locator('.load-row__name', { hasText: /^Café / }) })
    .first()
    .locator('.load-row__hint')
    .textContent();

const antesDeLote = (await sugeridoCafe()) ?? '';
await page.getByLabel('Litros de Batch brew que vas a preparar').fill('4');
await page.waitForTimeout(300);
const cuentaLote = (await page.locator('.lote-row__cuenta').first().textContent()) ?? '';
const despuesDeLote = (await sugeridoCafe()) ?? '';
linea(
  cuentaLote.includes('250 g de café') && cuentaLote.includes('4 L de agua'),
  `La fila de lote dice: «${cuentaLote.trim()}»`,
);
linea(
  antesDeLote.includes('2,48 kg') && despuesDeLote.includes('2,73 kg'),
  `El café sugerido sube de «${antesDeLote.trim()}» a «${despuesDeLote.trim()}» (+250 g)`,
);
// La captura tiene que enseñar el lote y la carga a la vez: la relación entre
// los dos es justo lo que se está comprobando.
await page.evaluate(() => {
  const titulo = [...document.querySelectorAll('.section-title')].find(
    (h) => h.textContent?.trim() === 'Lotes',
  );
  titulo?.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -24);
});
await page.waitForTimeout(250);
await captura(page, 'preparar-lotes-4-l-suben-la-carga');

await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
await page.getByRole('button', { name: 'Guardar', exact: true }).click();
await page.waitForSelector('.eventos');

// Se vuelve a abrir: los litros siguen.
await page.getByRole('button', { name: 'Ver datos' }).first().click();
await page.waitForSelector('.lote-row', { timeout: 5000 });
// La carga guardada la rellena un efecto, un tick después de pintar la fila.
await page
  .waitForFunction(() => document.querySelector('.lote-row input')?.value !== '', null, {
    timeout: 5000,
  })
  .catch(() => undefined);
const litrosTrasGuardar = await page
  .getByLabel('Litros de Batch brew que vas a preparar')
  .inputValue();
linea(litrosTrasGuardar === '4', `Al volver a abrir el evento, los litros siguen: ${litrosTrasGuardar} L`);
await captura(page, 'preparar-lotes-siguen-tras-guardar');

/* ---------- 4 bis. La bebida nueva, en la barra ---------- */

await irA(page, '/');
await page.getByRole('button', { name: 'Abrir barra' }).first().click();
await page.waitForSelector('.tile-grid .tile');
const tiles = await page.locator('.tile-grid .tile').allTextContents();
const nueva = tiles.find((t) => t.startsWith('Cold brew dob'));
linea(
  nueva !== undefined,
  `La bebida creada sale en la barra entre las ${tiles.length} de la carta, y su tile dice «${nueva?.trim()}»`,
);
// El nombre del tile se recorta a 14 caracteres desde la fase 3: «Cold brew
// doble» se queda en «Cold brew dobl». No se toca aquí (no es de esta fase),
// pero queda anotado en DECISIONES como pendiente.
await captura(page, 'barra-con-la-bebida-nueva');
await page.getByRole('button', { name: 'Eventos', exact: true }).click();
await page.waitForSelector('.eventos');

/* ---------- 5. Ratio del filtro a 1:15 y restaurado ---------- */

await irA(page, '/ajustes/ratios');
await page.waitForSelector('.ratio-row');
await captura(page, 'metodos-y-ratios-los-clasicos');

await page.getByLabel('Mililitros por gramo en Filtro (batch brew)').fill('15');
await page.getByLabel('Mililitros por gramo en Filtro (batch brew)').blur();
await page.waitForTimeout(400);
const leeRatio15 =
  (await page
    .locator('.ratio-row', { hasText: 'Filtro (batch brew)' })
    .locator('.meta')
    .first()
    .textContent()) ?? '';
linea(
  leeRatio15.includes('187,5 ml'),
  `A 1:15 la lectura del método cambia: «${leeRatio15.trim()}»`,
);
await captura(page, 'ratio-del-filtro-a-1-15');

await irA(page, '/ajustes/carta');
await editar(page, 'Filtro');
const leeFiltro15 = ((await lectura(page)) ?? '').trim();
linea(
  leeFiltro15.includes('Ratio 1:15') && leeFiltro15.includes('13,5 g'),
  `Y la lectura del Filtro también: «${leeFiltro15}»`,
);
const avisoCon15 = await avisos(page);
linea(
  avisoCon15.some((a) => a.includes('1:15') && a.includes('13,5 g')),
  `Con el ratio a 1:15 el Filtro avisa: «${avisoCon15.join(' | ')}»`,
);
await captura(page, 'filtro-avisa-con-el-ratio-a-1-15');
await cerrarHoja(page);

await irA(page, '/ajustes/ratios');
await page.getByRole('button', { name: /Restaurar los clásicos/ }).click();
await page.waitForTimeout(400);
const ratioRestaurado = await page
  .getByLabel('Mililitros por gramo en Filtro (batch brew)')
  .inputValue();
linea(ratioRestaurado === '16', `«Restaurar los clásicos» devuelve el filtro a 1:${ratioRestaurado}`);

await irA(page, '/ajustes/carta');
await editar(page, 'Filtro');
linea(
  (await avisos(page)).length === 0,
  'Restaurado el ratio, el Filtro vuelve a estar sin avisos y su receta nunca se tocó',
);
await captura(page, 'filtro-sin-avisos-tras-restaurar');
await cerrarHoja(page);

/* ---------- Modo noche, para ver que los avisos se leen ---------- */

await irA(page, '/ajustes');
await page.getByRole('button', { name: /Noche/ }).click();
await page.waitForTimeout(300);
await irA(page, '/ajustes/ratios');
await captura(page, 'metodos-y-ratios-en-modo-noche');
await irA(page, '/ajustes/carta');
await editar(page, 'Flat white');
await captura(page, 'aviso-de-vaso-en-modo-noche');

/* ---------- Cierre ---------- */

console.log(`\n${page.errores.length === 0 ? 'OK   ' : 'FALLA'} Sin errores de consola (${page.errores.length})`);
if (page.errores.length > 0) {
  fallos.push('errores de consola');
  console.log(page.errores.slice(0, 5).join('\n'));
}

await browser.close();
console.log(`\n${n} capturas en ${CAPTURAS}`);
if (fallos.length > 0) {
  console.log(`\n${fallos.length} comprobaciones fallan:`);
  for (const f of fallos) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nTodo verde.\n');
