/**
 * El evento entero en un iPhone, como lo va a hacer Nicolas mañana.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-9.mjs
 *
 * 402 × 874 (iPhone 17 Pro) con `deviceScaleFactor: 3` y táctil. Recorre crear
 * el evento con carga → abrir barra → servir con extras → modo Rápido → la hoja
 * del pedido y «Últimos pedidos» → «Más» → cerrar con recuento → resultados, y
 * en **cada** pantalla comprueba lo que decide si esto sirve detrás de una
 * barra: que la página no se desplaza a lo ancho, que no hay ningún objetivo
 * táctil por debajo de 44 px, que no hay texto por debajo de 15 px y que la
 * barra inferior no tapa nada.
 *
 * Al final repite lo esencial a 375 × 667, que es el iPhone prestado.
 *
 * Las capturas van a `docs/capturas/fase-9/`.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:4173';
const CAPTURAS = 'docs/capturas/fase-9';
mkdirSync(CAPTURAS, { recursive: true });

/** iPhone 17 Pro en vertical: el modo real, con una mano y sin girar nada. */
const IPHONE = { width: 402, height: 874 };
/** El iPhone base, el otro tamaño que tiene que caber de una. */
const IPHONE_BASE = { width: 393, height: 852 };
/** El iPhone prestado, el suelo de anchura que tiene que aguantar. */
const SE = { width: 375, height: 667 };

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

async function abrir(viewport) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['iPhone 15 Pro'],
    viewport,
    screen: viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.errores = errores;
  return { browser, page };
}

async function irA(page, ruta = '/') {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.body.textContent?.includes('Abriendo el cuaderno'));
  await page.waitForTimeout(150);
}

/**
 * Las cuatro comprobaciones de una pantalla de móvil. Solo mira lo que se ve:
 * un control escondido con `display: none` no lo puede tocar nadie.
 *
 * Los contenedores que se desplazan a lo ancho a propósito —la fila de extras,
 * las pestañas de categoría, el envoltorio de las tablas— no cuentan como
 * desborde: lo que no puede desplazarse es **la página**.
 */
async function revisa(page, nombre) {
  const r = await page.evaluate(() => {
    const raiz = document.documentElement;
    const out = { scrollW: raiz.scrollWidth, clientW: raiz.clientWidth, pequenos: [], textos: [], tapados: [] };

    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      const rr = el.getBoundingClientRect();
      return rr.width > 0 && rr.height > 0;
    };

    const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.hasAttribute('disabled') || !visible(el)) continue;
      const rr = el.getBoundingClientRect();
      if (rr.width < 43.5 || rr.height < 43.5) {
        const texto = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
        out.pequenos.push(`${el.className || el.tagName} «${texto}» ${Math.round(rr.width)}×${Math.round(rr.height)}`);
      }
    }

    const vistos = new Set();
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0 || !el.textContent?.trim() || !visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      // 14 px vale solo en las tablas de Resultados (DESIGN.md · Tipografía).
      const enTabla = el.closest('.tabla') !== null;
      const suelo = enTabla ? 13.5 : 14.5;
      if (fs < suelo) {
        const k = `${el.className}|${String(fs)}`;
        if (!vistos.has(k)) {
          vistos.add(k);
          out.textos.push(`${el.className || el.tagName} ${String(fs)}px «${el.textContent.trim().slice(0, 20)}»`);
        }
      }
    }

    // Lo que la barra inferior fija tapa. La pregunta de verdad es «¿el dedo
    // llega a esto?», así que se responde tocando: en el centro del control,
    // `elementFromPoint` tiene que devolverlo a él o algo suyo. Un tile que se
    // ha ido con el scroll de su caja no cuenta —ahí no hay nada que tapar—,
    // por eso antes se comprueba que el punto caiga dentro de todas las cajas
    // con recorte de sus antepasados.
    const dentroDeSusCajas = (el, x, y) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        const recorta = /auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY);
        if (!recorta) continue;
        const pr = p.getBoundingClientRect();
        if (x < pr.left - 0.5 || x > pr.right + 0.5 || y < pr.top - 0.5 || y > pr.bottom + 0.5) return false;
      }
      return true;
    };

    // Con una hoja abierta, que lo de detrás esté tapado es justo lo que se
    // quiere: la hoja es modal. La comprobación mira la pantalla de trabajo.
    const hoja = document.querySelector('[role="dialog"]');
    const bar = document.querySelector('.ticket-bar');
    if (!hoja && bar && getComputedStyle(bar).display !== 'none') {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el) || bar.contains(el)) continue;
        const rr = el.getBoundingClientRect();
        const x = rr.left + rr.width / 2;
        const y = rr.top + rr.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        if (!dentroDeSusCajas(el, x, y)) continue;
        const encima = document.elementFromPoint(x, y);
        if (encima && (encima === el || el.contains(encima) || encima.contains(el))) continue;
        // El toast vive ocho segundos y se va solo; no es un tapón.
        if (encima?.closest('.toast-layer')) continue;
        const quien = encima ? encima.className || encima.tagName : 'nada';
        out.tapados.push(
          `${el.className || el.tagName} «${(el.textContent ?? '').trim().slice(0, 20)}» lo tapa ${String(quien).slice(0, 24)}`,
        );
      }
    }
    return out;
  });

  const scroll = r.scrollW > r.clientW + 1;
  linea(!scroll, `${nombre}: la página no se desplaza a lo ancho${scroll ? ` (${String(r.scrollW)} > ${String(r.clientW)})` : ''}`);
  linea(r.pequenos.length === 0, `${nombre}: ningún objetivo táctil por debajo de 44 px${r.pequenos.length ? ` — ${r.pequenos.join(' | ')}` : ''}`);
  linea(r.textos.length === 0, `${nombre}: ningún texto por debajo de 15 px${r.textos.length ? ` — ${r.textos.join(' | ')}` : ''}`);
  linea(
    r.tapados.length === 0,
    `${nombre}: nada tapa un control (la barra inferior incluida)${r.tapados.length ? ` — ${r.tapados.join(' | ')}` : ''}`,
  );
}

/**
 * La comprobación dura de la barra en un móvil: **todo de una**, sin
 * desplazar nada. Con la cola delante no se desplaza una lista para encontrar
 * un cortado, así que esto no es una preferencia, es el requisito.
 */
async function cabeSinDesplazar(page, viewport, etiqueta) {
  // `barMode` esconde el menú en el render siguiente y la zona de trabajo
  // crece detrás: medir antes de eso da 96 px de menos y una falsa alarma.
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const wrap = document.querySelector('.grid-wrap');
    const tiles = [...document.querySelectorAll('.tile-grid .tile')];
    const grid = document.querySelector('.tile-grid').getBoundingClientRect();
    const bar = document.querySelector('.ticket-bar').getBoundingClientRect();
    const servir = document.querySelector('.ticket-bar .btn--action').getBoundingClientRect();
    const ultimo = tiles[tiles.length - 1].getBoundingClientRect();
    return {
      pagina: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
      grid: wrap.scrollHeight > wrap.clientHeight + 1,
      holgura: Math.round(wrap.clientHeight - grid.height - 8),
      bebidas: tiles.length,
      // El nombre entero, sin abreviar: el `span` del tile no puede recortarse.
      cortados: tiles
        .map((t) => t.querySelector('span'))
        .filter((sp) => sp.scrollWidth > sp.clientWidth + 1)
        .map((sp) => sp.textContent),
      ultimoDentro: ultimo.bottom <= bar.top + 0.5,
      servirDentro: servir.bottom <= window.innerHeight + 0.5,
    };
  });
  linea(!m.pagina, `${etiqueta}: la página no se desplaza a lo alto`);
  linea(
    !m.grid,
    `${etiqueta}: las ${String(m.bebidas)} bebidas caben de una, sin desplazar el grid (holgura ${String(m.holgura)} px)`,
  );
  linea(m.ultimoDentro, `${etiqueta}: el último tile queda por encima de la barra del pedido`);
  linea(m.servirDentro, `${etiqueta}: el botón de servir entra en la pantalla`);
  linea(
    m.cortados.length === 0,
    `${etiqueta}: ningún nombre se recorta${m.cortados.length ? ` — ${m.cortados.join(' | ')}` : ''}`,
  );
}

async function crearEventoYAbrirBarra(page, nombre) {
  await irA(page, '/evento/nuevo');
  await page.fill('#ev-nombre', nombre);
  await page.fill('#ev-lugar', 'Finca La Alquería, Valencia');
  await page.fill('#ev-invitados', '120');
  await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.waitForSelector('.eventos');
  await page.getByRole('button', { name: 'Abrir barra' }).first().click();
  await page.waitForSelector('.tile-grid .tile');
  await page.waitForTimeout(400);
}

const toca = (page, nombre) =>
  page.locator('.tile-grid .tile', { hasText: new RegExp(`^${nombre}`) }).first().click();

/* ================= 402 × 874, el recorrido entero ================= */

const { browser, page } = await abrir(IPHONE);
console.log(`\n=== Un iPhone detrás de la barra · ${BASE} a 402 × 874 ===\n`);

/* ---------- 1. Primer uso y menú ---------- */

await irA(page, '/');
const menu = await page.evaluate(() => {
  const nav = document.querySelector('.navbar');
  const activo = document.querySelector('.navlink[aria-current="page"]');
  return {
    cabe: nav.scrollWidth <= nav.clientWidth + 1,
    entradas: [...document.querySelectorAll('.navlink')].map((a) => a.textContent.trim()),
    // «Sin desplazar» de verdad: la entrada activa entera dentro de la caja.
    activoVisible: activo
      ? activo.getBoundingClientRect().right <= nav.getBoundingClientRect().right + 1
      : false,
  };
});
linea(menu.cabe, `el menú cabe entero sin desplazar (${menu.entradas.join(' · ')})`);
linea(menu.activoVisible, 'la entrada activa se ve sin desplazar');
linea(
  menu.entradas.includes('Ajustes'),
  'en móvil la tercera entrada dice «Ajustes», no «Carta y ajustes»',
);
const nuevos = await page.getByRole('button', { name: 'Nuevo evento' }).count();
linea(nuevos === 1, `el estado vacío enseña un solo «Nuevo evento» (${String(nuevos)})`);
const aviso = (await page.locator('.instalar__texto').textContent()) ?? '';
linea(
  aviso.includes('este iPhone'),
  `el aviso de instalación nombra el aparato: «…${aviso.trim().slice(17, 46)}…»`,
);
await revisa(page, 'Eventos (primer uso)');
await captura(page, 'eventos-primer-uso');

/* ---------- 2. Preparar ---------- */

await irA(page, '/evento/nuevo');
await page.fill('#ev-nombre', 'Boda Ana y Marc');
await page.fill('#ev-lugar', 'Finca La Alquería, Valencia');
await page.fill('#ev-invitados', '120');
await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
await page.waitForTimeout(200);
// 16 px o más en todo lo que se escribe: por debajo, Safari hace zoom al enfocar.
const inputsChicos = await page.evaluate(() =>
  [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => `${el.id || el.getAttribute('aria-label') || el.tagName} ${getComputedStyle(el).fontSize}`),
);
linea(inputsChicos.length === 0, `Preparar: todo lo que se escribe va a 16 px o más${inputsChicos.length ? ` — ${inputsChicos.join(' | ')}` : ''}`);
const apilada = await page.evaluate(() => {
  const fila = document.querySelector('.load-row');
  if (!fila) return null;
  const hijos = [...fila.children].filter((el) => el.getBoundingClientRect().height > 0);
  const arriba = new Set(hijos.map((el) => Math.round(el.getBoundingClientRect().top)));
  return { filas: arriba.size, ancho: Math.round(fila.getBoundingClientRect().width) };
});
linea(
  apilada !== null && apilada.filas >= 2,
  `Preparar: la fila de insumo se apila en vez de salirse (${String(apilada?.filas)} alturas, ${String(apilada?.ancho)} px de ancho)`,
);
await revisa(page, 'Preparar');
await captura(page, 'preparar-carga');

await page.getByRole('button', { name: 'Guardar', exact: true }).click();
await page.waitForSelector('.eventos');
await revisa(page, 'Eventos (con evento)');
await captura(page, 'eventos-con-proximo');

/* ---------- 3. La barra ---------- */

await page.getByRole('button', { name: 'Abrir barra' }).first().click();
await page.waitForSelector('.tile-grid .tile');

const cabecera = await page.evaluate(() => {
  const h = document.querySelector('.barra__header');
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  const columnas = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size;
  const filas = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size;
  const hijosVisibles = [...h.children].filter((el) => getComputedStyle(el).display !== 'none');
  return {
    alto: Math.round(h.getBoundingClientRect().height),
    // Una sola fila: todo lo visible de la cabecera comparte centro vertical.
    // Los `top` no sirven —un contador de 24 px y un botón de 44 empiezan a
    // alturas distintas aunque estén en la misma línea.
    alturas: new Set(
      hijosVisibles.map((el) => {
        const rr = el.getBoundingClientRect();
        return Math.round((rr.top + rr.bottom) / 2);
      }),
    ).size,
    columnas,
    filas,
    altoTile: Math.round(tiles[0]?.getBoundingClientRect().height ?? 0),
    fsTile: parseFloat(getComputedStyle(tiles[0]?.querySelector('span')).fontSize),
    visibles: tiles.filter((t) => t.getBoundingClientRect().bottom <= window.innerHeight).length,
    total: tiles.length,
    hayMas: getComputedStyle(document.querySelector('.barra__mas')).display !== 'none',
    hayActions: getComputedStyle(document.querySelector('.barra__actions')).display !== 'none',
  };
});
linea(cabecera.alto <= 72, `la cabecera es una franja de ${String(cabecera.alto)} px`);
linea(cabecera.alturas === 1, `y está en una sola fila (${String(cabecera.alturas)} alturas)`);
linea(cabecera.hayMas && !cabecera.hayActions, 'los cuatro controles se han ido al botón «Más»');
linea(cabecera.columnas === 3, `el grid es de 3 columnas (${String(cabecera.columnas)})`);
linea(cabecera.altoTile <= 84 && cabecera.altoTile >= 70, `el tile mide ${String(cabecera.altoTile)} px de alto`);
linea(cabecera.fsTile >= 17, `y su texto ${String(cabecera.fsTile)} px, nunca por debajo de 17`);
await cabeSinDesplazar(page, IPHONE, '402');
await revisa(page, 'Barra');
await captura(page, 'barra-vacia');

/* ---------- 4. Servir «Cortado» con avena en dos toques ---------- */

await toca(page, 'Cortado');
await page.waitForTimeout(150);
const nombreExtras = await page.locator('.extras__bebida').textContent();
linea(nombreExtras?.trim() === 'Cortado', `la fila de extras dice la bebida actual: «${String(nombreExtras).trim()}»`);
await page.getByRole('button', { name: 'Avena', exact: true }).click();
await page.waitForTimeout(150);
const conAvena = await page.evaluate(() => {
  const bar = document.querySelector('.ticket-bar__label');
  return bar?.textContent ?? '';
});
linea(conAvena.includes('Pedido actual (1)'), `dos toques y el pedido tiene una bebida: «${conAvena.trim()}»`);
await revisa(page, 'Barra con una bebida');
await captura(page, 'barra-cortado-con-avena');

const botonServir = (await page.locator('.ticket-bar .btn--action').textContent()) ?? '';
linea(
  botonServir.includes('Servir 1 bebida'),
  `el botón de abajo dice la cuenta entera: «${botonServir.trim()}»`,
);

// Ocho bebidas variadas más, y a servir.
for (const bebida of ['Latte', 'Cappuccino', 'Americano', 'Espresso', 'Flat white', 'Cold brew', 'Filtro', 'Latte']) {
  await toca(page, bebida);
  await page.waitForTimeout(60);
}
await revisa(page, 'Barra con nueve bebidas');
const label9 = (await page.locator('.ticket-bar .btn--action').textContent()) ?? '';
linea(label9.includes('Servir 9 bebidas'), `nueve bebidas montadas: «${label9.trim()}»`);
await captura(page, 'barra-nueve-bebidas');
await page.locator('.ticket-bar .btn--action').click();
await page.waitForTimeout(500);

/* ---------- 5. Modo Rápido desde la hoja «Más» ---------- */

await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
const hojaMas = await page.evaluate(() => {
  const h = document.querySelector('.hoja-abajo');
  const filas = [...h.querySelectorAll('.hoja-fila')];
  return {
    abajo: Math.round(h.getBoundingClientRect().bottom) >= window.innerHeight - 1,
    nombres: filas.map((f) => f.querySelector('.hoja-fila__nombre').textContent.trim()),
    pistas: filas.map((f) => f.querySelector('.hoja-fila__pista').textContent.trim()),
    altos: filas.map((f) => Math.round(f.getBoundingClientRect().height)),
  };
});
linea(hojaMas.abajo, 'la hoja «Más» sube desde abajo, no se planta en el centro');
linea(
  hojaMas.nombres.join(' · ') ===
    'Rápido · Noche · Resumen · Pausar servicio · Cerrar barra · Empezar de cero',
  `sus seis filas, con «Empezar de cero» la última: ${hojaMas.nombres.join(' · ')}`,
);
linea(
  hojaMas.pistas[0] === 'un toque, una bebida',
  `cada fila explica qué hace: «Rápido — ${hojaMas.pistas[0]}»`,
);
linea(Math.min(...hojaMas.altos) >= 56, `y mide ${String(Math.min(...hojaMas.altos))} px la más baja`);
await revisa(page, 'Hoja «Más»');
await captura(page, 'hoja-mas');

await page.getByRole('button', { name: /^Rápido/ }).click();
await page.waitForTimeout(200);
await page.locator('.hoja-abajo .btn[aria-label="Cerrar"]').click();
await page.waitForTimeout(250);
const enRapido = (await page.locator('.ticket-bar__label').textContent()) ?? '';
linea(enRapido.includes('Modo rápido'), `el modo Rápido queda puesto: «${enRapido.trim()}»`);
await toca(page, 'Espresso');
await page.waitForTimeout(400);
await captura(page, 'barra-modo-rapido');
await revisa(page, 'Barra en modo Rápido');

// Y se quita, para seguir con el pedido normal.
await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
await page.getByRole('button', { name: /^Rápido/ }).click();
await page.waitForTimeout(200);
await page.locator('.hoja-abajo .btn[aria-label="Cerrar"]').click();
await page.waitForTimeout(250);

/* ---------- 6. La hoja del pedido y «Últimos pedidos» ---------- */

await toca(page, 'Cappuccino');
await page.waitForTimeout(150);
await page.locator('.ticket-bar__label').click();
await page.waitForSelector('.ticket--sheet');
await page.waitForTimeout(300);
const hoja = await page.evaluate(() => {
  const s = document.querySelector('.ticket--sheet');
  const r = s.getBoundingClientRect();
  return {
    alto: Math.round(r.height),
    porcentaje: Math.round((r.height / window.innerHeight) * 100),
    ultimos: s.querySelector('.ultimos') !== null,
    filas: s.querySelectorAll('.ultimos__fila').length,
    deshacer: [...s.querySelectorAll('button')].some((b) => b.textContent.includes('Deshacer último')),
    servir: s.querySelector('.ticket__foot .btn--action')?.textContent.trim(),
    // El botón grande, el último de la hoja.
    servirAbajo:
      Math.round(s.querySelector('.ticket__foot')?.getBoundingClientRect().bottom ?? 0) >=
      Math.round(r.bottom) - 2,
  };
});
linea(hoja.porcentaje >= 40, `la hoja del pedido ocupa ${String(hoja.porcentaje)} % de la pantalla (${String(hoja.alto)} px)`);
linea(hoja.ultimos, `dentro está «Últimos pedidos», con ${String(hoja.filas)} filas`);
linea(hoja.deshacer, 'y «Deshacer último»');
linea(hoja.servirAbajo, `con el botón grande abajo del todo: «${String(hoja.servir)}»`);
await revisa(page, 'Hoja del pedido');
await captura(page, 'hoja-del-pedido');

// Desplegar un pedido dentro de la hoja: no puede mover la página.
const antesScroll = await page.evaluate(() => window.scrollY);
await page.locator('.ticket--sheet .ultimos__cabeza').first().click();
await page.waitForTimeout(350);
const desplegado = await page.evaluate(() => ({
  abierta: document.querySelectorAll('.ticket--sheet .ultimos__fila.is-abierta').length,
  acciones: [...document.querySelectorAll('.ticket--sheet .ultimos__acciones button')].map((b) =>
    b.textContent.trim(),
  ),
  scrollY: window.scrollY,
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
linea(desplegado.abierta === 1, 'desplegar un pedido dentro de la hoja abre una sola fila');
linea(
  desplegado.scrollY === antesScroll && desplegado.scrollW <= desplegado.clientW + 1,
  'y no provoca scroll de la página',
);
linea(
  desplegado.acciones.join(' · ').includes('Repetir'),
  `la fila desplegada ofrece: ${desplegado.acciones.join(' · ')}`,
);
await revisa(page, 'Hoja del pedido con una fila desplegada');
await captura(page, 'hoja-pedido-desplegado');

// Repetir uno.
await page.getByRole('button', { name: 'Repetir' }).first().click();
await page.waitForTimeout(400);
const trasRepetir = (await page.locator('.ticket--sheet .ticket__head').textContent()) ?? '';
linea(/Pedido actual \(\d+\)/.test(trasRepetir), `repetir devuelve las líneas al pedido: «${trasRepetir.trim()}»`);

// Anular otro.
await page.locator('.ticket--sheet .ultimos__cabeza').nth(1).click();
await page.waitForTimeout(350);
const filasAntes = await page.locator('.ticket--sheet .ultimos__fila').count();
await page.getByRole('button', { name: 'Anular' }).first().click();
await page.waitForTimeout(500);
const filasDespues = await page.locator('.ticket--sheet .ultimos__fila').count();
linea(
  filasDespues <= filasAntes,
  `anular saca el pedido de la lista (${String(filasAntes)} → ${String(filasDespues)})`,
);
await captura(page, 'hoja-pedido-tras-anular');

// Servir lo que hay montado y cerrar la hoja.
await page.locator('.ticket--sheet .ticket__foot .btn--action').click();
await page.waitForTimeout(600);

/* ---------- 7. «Más» → Resumen → volver; y Noche ---------- */

await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
await page.getByRole('button', { name: /^Resumen/ }).click();
await page.waitForSelector('.sheet');
await page.waitForTimeout(300);
await revisa(page, 'Resumen sobre la barra');
await captura(page, 'resumen-sobre-la-barra');
await page.locator('.sheet .btn[aria-label="Cerrar"]').click();
await page.waitForTimeout(250);
linea(
  (await page.locator('.tile-grid .tile').count()) > 0,
  'cerrar el Resumen devuelve a la barra, sin cambiar de pantalla',
);

await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
await page.getByRole('button', { name: /^Noche/ }).click();
await page.waitForTimeout(300);
const noche = await page.evaluate(() => document.documentElement.dataset['theme']);
linea(noche === 'night', 'el modo Noche se pone desde la hoja «Más»');
await captura(page, 'hoja-mas-en-noche');
await revisa(page, 'Hoja «Más» en modo noche');
await page.getByRole('button', { name: /^Noche/ }).click();
await page.waitForTimeout(300);
await page.locator('.hoja-abajo .btn[aria-label="Cerrar"]').click();
await page.waitForTimeout(250);
linea(
  (await page.evaluate(() => document.documentElement.dataset['theme'])) !== 'night',
  'y se quita igual de fácil',
);

/* ---------- 7 bis. Pausar y reanudar el servicio ---------- */

await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
const orden = await page.evaluate(() =>
  [...document.querySelectorAll('.hoja-abajo .hoja-fila__nombre')].map((el) => el.textContent.trim()),
);
linea(
  orden.join(' · ') ===
    'Rápido · Noche · Resumen · Pausar servicio · Cerrar barra · Empezar de cero',
  `«Pausar servicio» va antes de «Cerrar barra», y «Empezar de cero» la última: ${orden.join(' · ')}`,
);
await page.getByRole('button', { name: /^Pausar servicio/ }).click();
await page.waitForSelector('.barra__pausa');
await page.waitForTimeout(300);

const pausa = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  return {
    cabecera: document.querySelector('.barra__pausa')?.textContent.trim(),
    ritmo: document.querySelector('.barra__rate') !== null,
    tilesApagados: tiles.filter((t) => t.disabled).length,
    total: tiles.length,
    principal: document.querySelector('.ticket-bar .btn--action')?.textContent.trim(),
    ultimos: document.querySelector('.ultimos') !== null,
  };
});
linea(pausa.cabecera === 'En pausa', `la cabecera lo dice: «${String(pausa.cabecera)}»`);
linea(!pausa.ritmo, 'y el ritmo de la última hora deja de enseñar un número que caería solo');
linea(
  pausa.tilesApagados === pausa.total,
  `no se puede tocar ninguna bebida (${String(pausa.tilesApagados)} de ${String(pausa.total)})`,
);
linea(
  pausa.principal === 'Reanudar servicio',
  `la acción principal pasa a ser «${String(pausa.principal)}», en el sitio de servir`,
);
linea(pausa.ultimos, 'y «Últimos pedidos» se sigue pudiendo ver');
// La cabecera tiene `overflow: hidden`: lo que no quepa se corta sin avisar.
const cabeceraEnPausa = await page.evaluate(() => {
  const h = document.querySelector('.barra__header');
  const caja = h.getBoundingClientRect();
  return [...h.children]
    .filter((el) => getComputedStyle(el).display !== 'none')
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > caja.right + 0.5 || r.left < caja.left - 0.5;
    })
    .map((el) => el.className.split(' ')[0]);
});
linea(
  cabeceraEnPausa.length === 0,
  `y nada de la cabecera se corta${cabeceraEnPausa.length ? ` — ${cabeceraEnPausa.join(' | ')}` : ''}`,
);
await revisa(page, 'Barra en pausa');
await captura(page, 'barra-en-pausa');

// En Eventos, la tarjeta lo dice y ofrece reanudar.
await page.locator('.barra__salir').click();
await page.waitForSelector('.card--live');
await page.waitForTimeout(250);
const tarjeta = await page.evaluate(() => {
  const card = document.querySelector('.card--live');
  return {
    titulo: card.querySelector('.section-title')?.textContent.trim(),
    enPausa: card.classList.contains('card--pausa'),
    botones: [...card.querySelectorAll('button')].map((b) => b.textContent.trim()),
    ritmo: [...card.querySelectorAll('.stat__value')].map((el) => el.textContent.trim()),
  };
});
linea(
  tarjeta.enPausa && tarjeta.titulo === 'Barra en pausa',
  `Eventos: la tarjeta dice «${String(tarjeta.titulo)}»`,
);
linea(
  tarjeta.botones.includes('Reanudar servicio') && tarjeta.botones.includes('Cerrar barra'),
  `con ${tarjeta.botones.join(' · ')}`,
);
linea(tarjeta.ritmo.includes('en pausa'), 'y la última hora dice «en pausa», no un número');
await revisa(page, 'Eventos con la barra en pausa');
await captura(page, 'eventos-barra-en-pausa');

// Reanudar desde Eventos y volver a la barra.
await page.getByRole('button', { name: /^Reanudar servicio/ }).click();
await page.waitForTimeout(400);
linea(
  (await page.locator('.card--live .section-title').textContent())?.trim() === 'Barra abierta',
  'reanudar desde Eventos devuelve la tarjeta a «Barra abierta»',
);
await page.getByRole('button', { name: 'Seguir sirviendo' }).click();
await page.waitForSelector('.tile-grid .tile');
await page.waitForTimeout(400);
const vuelta = await page.evaluate(() => ({
  apagados: [...document.querySelectorAll('.tile-grid .tile')].filter((t) => t.disabled).length,
  principal: document.querySelector('.ticket-bar .btn--action')?.textContent.trim(),
}));
linea(
  vuelta.apagados === 0 && vuelta.principal !== 'Reanudar servicio',
  `y las bebidas se vuelven a poder tocar (botón: «${String(vuelta.principal)}»)`,
);
await cabeSinDesplazar(page, IPHONE, '402 tras reanudar');

/* ---------- 8. Cerrar barra con recuento ---------- */

await page.locator('.barra__mas').click();
await page.waitForSelector('.hoja-abajo');
await page.getByRole('button', { name: /^Cerrar barra/ }).click();
await page.waitForSelector('.recuento');
await page.waitForTimeout(250);
await page.waitForTimeout(200);
const recuento = await page.evaluate(() => {
  const fila = document.querySelector('.recuento__row');
  const celdas = [...fila.children].filter((el) => el.getBoundingClientRect().height > 0);
  return {
    alturas: new Set(celdas.map((el) => Math.round(el.getBoundingClientRect().top))).size,
    cabecera: getComputedStyle(document.querySelector('.recuento__head')).display,
    etiquetas: [...fila.querySelectorAll('[data-label]')].map((el) => el.dataset.label),
  };
});
linea(
  recuento.cabecera === 'none' && recuento.alturas >= 2,
  `el recuento se apila en tarjeta por insumo (${String(recuento.alturas)} alturas, cabecera ${recuento.cabecera})`,
);
linea(
  recuento.etiquetas.includes('Cargado') && recuento.etiquetas.includes('Teórico'),
  `y cada cifra lleva su nombre: ${recuento.etiquetas.join(' · ')}`,
);
await revisa(page, 'Cerrar (recuento)');
await captura(page, 'cerrar-recuento');

await page.locator('.recuento__input input').first().fill('0,6');
await page.locator('.recuento__input input').nth(1).fill('4');
await page.waitForTimeout(250);
await revisa(page, 'Cerrar con el recuento escrito');
await captura(page, 'cerrar-recuento-escrito');
await page.getByRole('button', { name: /Cerrar y ver resultados/ }).click();
await page.waitForTimeout(600);

/* ---------- 9. Resultados ---------- */

await page.waitForSelector('.detalle, .stat-grid');
await page.waitForTimeout(250);
const duracion = await page.evaluate(() => {
  const cifra = [...document.querySelectorAll('.stat')].find((s) =>
    s.textContent?.includes('duración de la barra'),
  );
  return cifra?.textContent?.trim() ?? '';
});
linea(
  duracion.includes('de pausa'),
  `la duración de la barra descuenta la pausa: «${duracion.replace(/\s+/g, ' ')}»`,
);
await revisa(page, 'Resultados del evento');
await captura(page, 'resultados-del-evento');

await irA(page, '/resultados');
await page.waitForTimeout(300);
const tablas = await page.evaluate(() =>
  [...document.querySelectorAll('.tabla-wrap')].map((w) => ({
    desplaza: w.scrollWidth > w.clientWidth,
    dentro: w.getBoundingClientRect().right <= document.documentElement.clientWidth + 1,
  })),
);
linea(
  tablas.every((t) => t.dentro),
  `las ${String(tablas.length)} tablas se quedan dentro de su caja (y ${String(tablas.filter((t) => t.desplaza).length)} se desplazan ahí dentro)`,
);
const graficos = await page.evaluate(() =>
  [...document.querySelectorAll('.grafico')].every(
    (g) => g.getBoundingClientRect().right <= document.documentElement.clientWidth + 1,
  ),
);
linea(graficos, 'y los gráficos refluyen sin salirse');
await revisa(page, 'Resultados');
await captura(page, 'resultados-globales');

/* ---------- 10. Carta y ajustes ---------- */

await irA(page, '/ajustes');
await page.waitForTimeout(250);
const ajustes = await page.evaluate(() => {
  const rejillas = [...document.querySelectorAll('.form__grid')];
  const unaColumna = rejillas.every((g) => {
    const hijos = [...g.children].filter((el) => el.getBoundingClientRect().height > 0);
    return new Set(hijos.map((el) => Math.round(el.getBoundingClientRect().left))).size <= 1;
  });
  return { unaColumna, texto: document.body.textContent ?? '' };
});
linea(ajustes.unaColumna, 'Ajustes: los formularios van a una columna');
linea(!ajustes.texto.includes('Nombre de este iPad'), 'y el campo dice «Nombre de este dispositivo»');
linea(
  ajustes.texto.includes('Instalar en este iPhone'),
  'la sección de instalar nombra el aparato de verdad',
);
await revisa(page, 'Carta y ajustes');
await captura(page, 'ajustes');

await irA(page, '/ajustes/carta');
await page.waitForTimeout(250);
await revisa(page, 'Carta');
await captura(page, 'carta');

linea(page.errores.length === 0, `sin errores de consola${page.errores.length ? `: ${page.errores.join(' | ')}` : ''}`);
await browser.close();

/* ================= 393 × 852, que la carta siga cabiendo de una ================= */

console.log('\n=== El iPhone base · 393 × 852 ===\n');
const base = await abrir(IPHONE_BASE);
await crearEventoYAbrirBarra(base.page, 'Boda en el 393');
const grid393 = await base.page.evaluate(
  () =>
    new Set(
      [...document.querySelectorAll('.tile-grid .tile')].map((t) =>
        Math.round(t.getBoundingClientRect().left),
      ),
    ).size,
);
linea(grid393 === 3, `393: el grid es de 3 columnas (${String(grid393)})`);
await cabeSinDesplazar(base.page, IPHONE_BASE, '393');
await revisa(base.page, '393 · Barra');
await captura(base.page, '393-barra');
linea(base.page.errores.length === 0, `393: sin errores de consola${base.page.errores.length ? `: ${base.page.errores.join(' | ')}` : ''}`);
await base.browser.close();

/* ================= 375 × 667, lo esencial ================= */

console.log('\n=== Lo esencial en un iPhone prestado · 375 × 667 ===\n');
const chico = await abrir(SE);

await irA(chico.page, '/');
const menuSE = await chico.page.evaluate(() => {
  const nav = document.querySelector('.navbar');
  return { cabe: nav.scrollWidth <= nav.clientWidth + 1, ancho: nav.scrollWidth, caja: nav.clientWidth };
});
linea(
  menuSE.cabe,
  `375: el menú cabe entero sin desplazar (${String(menuSE.ancho)} ≤ ${String(menuSE.caja)})`,
);
await revisa(chico.page, '375 · Eventos');
await captura(chico.page, '375-eventos');

await crearEventoYAbrirBarra(chico.page, 'Boda en el SE');
const gridSE = await chico.page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  const h = document.querySelector('.barra__header');
  return {
    columnas: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size,
    alto: Math.round(h.getBoundingClientRect().height),
  };
});
linea(gridSE.columnas === 3, `375: el grid sigue siendo de 3 columnas (${String(gridSE.columnas)})`);
linea(gridSE.alto <= 72, `375: la cabecera sigue en una franja de ${String(gridSE.alto)} px`);
await cabeSinDesplazar(chico.page, SE, '375');
await revisa(chico.page, '375 · Barra');
await captura(chico.page, '375-barra');

await toca(chico.page, 'Cortado');
await chico.page.waitForTimeout(150);
await revisa(chico.page, '375 · Barra con una bebida');
await chico.page.locator('.ticket-bar__label').click();
await chico.page.waitForSelector('.ticket--sheet');
await chico.page.waitForTimeout(300);
await revisa(chico.page, '375 · Hoja del pedido');
await captura(chico.page, '375-hoja-del-pedido');

await chico.page.locator('.ticket--sheet .ticket__foot .btn--action').click();
await chico.page.waitForTimeout(500);
await chico.page.locator('.barra__mas').click();
await chico.page.waitForSelector('.hoja-abajo');
await revisa(chico.page, '375 · Hoja «Más»');
await captura(chico.page, '375-hoja-mas');

linea(chico.page.errores.length === 0, `375: sin errores de consola${chico.page.errores.length ? `: ${chico.page.errores.join(' | ')}` : ''}`);
await chico.browser.close();

/* ================= Resultado ================= */

console.log(`\n${String(n)} capturas en ${CAPTURAS}/`);
if (fallos.length > 0) {
  console.log(`\n${String(fallos.length)} fallos:`);
  for (const f of fallos) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nTodo en verde.');
