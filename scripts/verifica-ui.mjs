/**
 * Comprobaciones de la interfaz que no se pueden hacer sin layout de verdad:
 * jsdom no mide nada. Corre sobre la app construida (`npm run preview`).
 *
 *   npm run build && npm run preview &
 *   node scripts/verifica-ui.mjs
 *
 * 1. El grid de la barra cabe entero a 1180 × 820 con la carta de 14.
 * 2. Todo control de la barra mide ≥ 44 × 44 y hay ≥ 8 px entre controles.
 * 3. Ninguna ruta hace scroll horizontal a 1180, 1024, 820 ni 768 de ancho.
 * 4. Todo control enfocable pinta un anillo visible con `:focus-visible`.
 */
import {
  BASE,
  HORIZONTAL,
  abrirBarra,
  abrirNavegador,
  crearEvento,
  irA,
} from './lib/recorrido.mjs';

const MIN_TOQUE = 44;
const MIN_HUECO = 8;

const fallos = [];
const linea = (ok, texto) => {
  if (!ok) fallos.push(texto);
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${texto}`);
};

/* ---------- 1. El grid cabe ---------- */

async function midePorGrid(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.grid-wrap');
    const grid = document.querySelector('.tile-grid');
    if (!wrap || !grid) return null;
    const tiles = [...grid.querySelectorAll('.tile')];
    const filas = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size;
    const columnas = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size;
    return {
      scrollHeight: wrap.scrollHeight,
      clientHeight: wrap.clientHeight,
      // Lo que mide el grid de verdad: `scrollHeight` nunca baja del hueco.
      altoContenido: Math.ceil(grid.getBoundingClientRect().height),
      tiles: tiles.length,
      filas,
      columnas,
      altoTile: Math.round(tiles[0]?.getBoundingClientRect().height ?? 0),
    };
  });
}

/* ---------- 2. Objetivos táctiles ---------- */

const SELECTOR_CONTROLES =
  'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';

async function mideToques(page, ambito) {
  return page.evaluate(
    ({ sel, ambito, min, hueco }) => {
      const raiz = document.querySelector(ambito);
      if (!raiz) return null;
      const visibles = [...raiz.querySelectorAll(sel)]
        .filter((el) => !el.hasAttribute('disabled'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .filter(({ el }) => getComputedStyle(el).visibility !== 'hidden');

      const etiqueta = ({ el, r }) =>
        `${el.className || el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)}» ${Math.round(r.width)}×${Math.round(r.height)}`;

      const pequenos = visibles
        .filter(({ r }) => r.width < min - 0.5 || r.height < min - 0.5)
        .map(etiqueta);

      // Hueco: solo entre controles que se solapan en el otro eje, que son los
      // que el dedo puede confundir.
      const juntos = [];
      for (let i = 0; i < visibles.length; i++) {
        for (let j = i + 1; j < visibles.length; j++) {
          const a = visibles[i];
          const b = visibles[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const solapaY = a.r.bottom > b.r.top + 1 && b.r.bottom > a.r.top + 1;
          const solapaX = a.r.right > b.r.left + 1 && b.r.right > a.r.left + 1;
          let d = null;
          if (solapaY) d = Math.max(b.r.left - a.r.right, a.r.left - b.r.right);
          else if (solapaX) d = Math.max(b.r.top - a.r.bottom, a.r.top - b.r.bottom);
          if (d !== null && d < hueco - 0.5 && d > -1) {
            juntos.push(`${etiqueta(a)} ↔ ${etiqueta(b)} = ${Math.round(d * 10) / 10} px`);
          }
        }
      }
      return { total: visibles.length, pequenos, juntos };
    },
    { sel: SELECTOR_CONTROLES, ambito, min: MIN_TOQUE, hueco: MIN_HUECO },
  );
}

/* ---------- 3. Scroll horizontal ---------- */

async function hayScrollHorizontal(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth > de.clientWidth + 1;
  });
}

/* ---------- 4. Foco visible ---------- */

async function focoVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.focus();
    // `:focus-visible` con foco por teclado; forzamos el estado consultándolo.
    const visible = el.matches(':focus-visible');
    const s = getComputedStyle(el);
    return { visible, outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}` };
  }, selector);
}

/**
 * Cierra una hoja con Escape. Espera antes a que la hoja se haya llevado el
 * foco: el efecto que ata el teclado corre después del primer pintado.
 */
async function cerrarConEscape(page, selector) {
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.contains(document.activeElement),
    selector,
    { timeout: 3000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector(selector, { state: 'detached', timeout: 3000 });
  return true;
}

/* ---------- Recorrido ---------- */

const { browser, page } = await abrirNavegador({ viewport: HORIZONTAL });

console.log(`\n=== Interfaz sobre ${BASE} a ${HORIZONTAL.width} × ${HORIZONTAL.height} ===\n`);

await irA(page, '/');
await crearEvento(page);
await abrirBarra(page);

const grid = await midePorGrid(page);
console.log(
  `Grid: ${grid.tiles} tiles en ${grid.filas} filas × ${grid.columnas} columnas, ` +
    `tile de ${grid.altoTile} px · el grid mide ${grid.altoContenido} px en un hueco de ${grid.clientHeight} px ` +
    `(sobran ${grid.clientHeight - grid.altoContenido} px)`,
);
linea(
  grid.scrollHeight <= grid.clientHeight,
  `el grid de la barra cabe sin scroll a 1180 × 820 (${grid.scrollHeight} ≤ ${grid.clientHeight})`,
);
linea(grid.tiles === 14, `las 14 bebidas de la carta están a la vista (${grid.tiles})`);

const toques = await mideToques(page, '.barra');
console.log(`\nControles medidos en la barra: ${toques.total}`);
linea(
  toques.pequenos.length === 0,
  `todos los controles de la barra miden ≥ ${MIN_TOQUE} × ${MIN_TOQUE}` +
    (toques.pequenos.length ? `\n       ${toques.pequenos.join('\n       ')}` : ''),
);
linea(
  toques.juntos.length === 0,
  `hay ≥ ${MIN_HUECO} px entre controles vecinos` +
    (toques.juntos.length ? `\n       ${toques.juntos.join('\n       ')}` : ''),
);

// La cabecera entera a la vista: «Cerrar barra» es la única acción terminal y
// no puede quedarse fuera del borde derecho. Un subtítulo largo en el
// interruptor Rápido ya la cortó una vez.
const cabecera = await page.evaluate(() => {
  const h = document.querySelector('.barra__header');
  const cerrar = document.querySelector('.barra__cerrar');
  const r = cerrar.getBoundingClientRect();
  return {
    recorte: Math.round(h.scrollWidth - h.clientWidth),
    derechaBoton: Math.round(r.right),
    ancho: Math.round(window.innerWidth),
  };
});
linea(
  cabecera.recorte <= 0 && cabecera.derechaBoton <= cabecera.ancho,
  `la cabecera cabe entera: «Cerrar barra» acaba en ${cabecera.derechaBoton} px de ${cabecera.ancho}`,
);

// Las hojas: la del ticket y la de una línea. Desde la fase 5 la de una línea
// se abre con su botón «Más»: tocar el nombre solo la hace la bebida actual.
await page.locator('.tile-grid .tile').first().click();
await page.locator('.ticket__row .btn--mas').first().click();
await page.waitForSelector('.sheet');
const hoja = await mideToques(page, '.sheet');
linea(
  hoja.pequenos.length === 0,
  `los controles de la hoja de modificadores miden ≥ ${MIN_TOQUE} × ${MIN_TOQUE}` +
    (hoja.pequenos.length ? `\n       ${hoja.pequenos.join('\n       ')}` : ''),
);
linea(
  hoja.juntos.length === 0,
  `hay ≥ ${MIN_HUECO} px entre los controles de la hoja` +
    (hoja.juntos.length ? `\n       ${hoja.juntos.join('\n       ')}` : ''),
);
linea(
  await cerrarConEscape(page, '.sheet'),
  'la hoja de modificadores atrapa el foco y se cierra con Escape',
);

const foco = await focoVisible(page, '.tile-grid .tile');
linea(
  Boolean(foco?.visible) && !foco.outline.startsWith('0px'),
  `el foco se ve en los tiles (${foco?.outline})`,
);

// El resumen: hoja ancha con los chips de anulación.
await page.getByRole('button', { name: 'Resumen' }).click();
await page.waitForSelector('.sheet--wide');
const resumen = await mideToques(page, '.sheet--wide');
linea(
  resumen.pequenos.length === 0,
  `los controles del resumen miden ≥ ${MIN_TOQUE} × ${MIN_TOQUE}` +
    (resumen.pequenos.length ? `\n       ${resumen.pequenos.join('\n       ')}` : ''),
);
linea(await cerrarConEscape(page, '.sheet--wide'), 'el resumen se cierra con Escape');

/* ---------- Scroll horizontal en todas las rutas ---------- */

console.log('\nScroll horizontal por ruta y ancho:');
const eventoId = page.url().split('/evento/')[1]?.split('/')[0];
const RUTAS = [
  '/',
  '/evento/nuevo',
  `/evento/${eventoId}`,
  `/evento/${eventoId}/resumen`,
  `/evento/${eventoId}/cerrar`,
  '/resultados',
  '/ajustes',
  '/ajustes/carta',
  '/ajustes/insumos',
  '/ruta-que-no-existe',
];
for (const ancho of [1180, 1024, 820, 768]) {
  await page.setViewportSize({ width: ancho, height: ancho === 820 ? 1180 : 768 });
  const malas = [];
  for (const ruta of RUTAS) {
    await irA(page, ruta);
    if (await hayScrollHorizontal(page)) malas.push(ruta);
  }
  linea(malas.length === 0, `sin scroll horizontal a ${ancho} px${malas.length ? `: ${malas.join(', ')}` : ''}`);
}

/* ---------- Errores de consola ---------- */

const ruido = page.errores.filter((e) => !e.includes('favicon'));
linea(ruido.length === 0, `sin errores de consola${ruido.length ? `: ${ruido.join(' · ')}` : ''}`);

await browser.close();

console.log(`\n${fallos.length === 0 ? 'Todo en verde.' : `${fallos.length} comprobaciones en rojo.`}`);
process.exit(fallos.length === 0 ? 0 : 1);
