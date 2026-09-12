/**
 * Fase 12 · las dos peticiones de Nicolas del 12/09/2026, medidas en el
 * navegador.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-12.mjs
 *
 * Se recorre a **402 × 874** (el iPhone 17 Pro tal cual, en Safari) y a
 * **402 × 781** (el mismo aparato con las safe areas de la app instalada
 * descontadas: 59 arriba y 34 abajo). Lo que se mide:
 *
 * 1. **La tira del pedido en curso**: que aparece con la primera bebida, que
 *    enseña las que caben de verdad en el hueco, que la «×» quita con su
 *    «Deshacer», y sobre todo que **el grid no se mueve ni un píxel** ni hay
 *    scroll de página o del grid, tenga la tira las filas que tenga.
 * 2. **Salir de la hoja**: que al abrirla por el contador de «servidas» —que
 *    la abre ya desplazada hasta la lista de pedidos— el título y la «X» se
 *    ven enteros dentro del viewport, que deslizar hacia abajo la cierra y
 *    que la «X» también.
 *
 * Después, el iPad en sus dos giros: allí no hay tira —el pedido ya está en su
 * columna— y la hoja sigue abriéndose y cerrándose como siempre.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:4173';
const CAPTURAS = 'docs/capturas/fase-12';
mkdirSync(CAPTURAS, { recursive: true });

/** El iPhone 17 Pro tal cual, y con las safe areas de la app instalada fuera. */
const IPHONE = { width: 402, height: 874 };
const IPHONE_SAFE = { width: 402, height: 781 };
const IPAD_H = { width: 1180, height: 820 };
const IPAD_V = { width: 820, height: 1180 };

/** Lo que hay que arrastrar hacia abajo para que una hoja se cierre. */
const ARRASTRE_CIERRE = 80;

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

async function abrir(viewport, movil = true) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...(movil ? devices['iPhone 15 Pro'] : {}),
    viewport,
    screen: viewport,
    deviceScaleFactor: movil ? 3 : 2,
    isMobile: movil,
    hasTouch: movil,
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
  await page.waitForTimeout(160);
}

async function abrirBarra(page, nombre) {
  await irA(page, '/evento/nuevo');
  await page.fill('#ev-nombre', nombre);
  await page.fill('#ev-invitados', '120');
  await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.waitForSelector('.eventos');
  await page.getByRole('button', { name: 'Abrir barra' }).first().click();
  await page.waitForSelector('.tile-grid .tile');
  // El «Evento creado» de hace un momento tapa media pantalla en las capturas
  // y no es de lo que va esta fase: se espera a que se vaya solo.
  await page
    .waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

/** Ningún texto por debajo de 15 px, ningún objetivo por debajo de 44. */
async function revisa(page, nombre, conocidos = []) {
  const r = await page.evaluate((conocidos) => {
    const raiz = document.documentElement;
    const out = { scrollW: raiz.scrollWidth, clientW: raiz.clientWidth, pequenos: [], sabidos: [], textos: [] };
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
        const t = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
        const texto = `${el.className || el.tagName} «${t}» ${Math.round(rr.width)}×${Math.round(rr.height)}`;
        if (conocidos.some((s) => el.matches(s))) out.sabidos.push(texto);
        else out.pequenos.push(texto);
      }
    }
    const vistos = new Set();
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0 || !el.textContent?.trim() || !visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const suelo = el.closest('.tabla') ? 13.5 : 14.5;
      if (fs < suelo) {
        const k = `${el.className}|${String(fs)}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        out.textos.push(`${el.className || el.tagName} ${String(fs)}px «${el.textContent.trim().slice(0, 20)}»`);
      }
    }
    return out;
  }, conocidos);
  for (const s of r.sabidos) console.log(`NOTA  ${nombre}: medida sabida y no arreglada hoy — ${s}`);
  const scroll = r.scrollW > r.clientW + 1;
  linea(!scroll, `${nombre}: la página no se desplaza a lo ancho${scroll ? ` (${String(r.scrollW)} > ${String(r.clientW)})` : ''}`);
  linea(r.pequenos.length === 0, `${nombre}: ningún objetivo táctil por debajo de 44 px${r.pequenos.length ? ` — ${r.pequenos.join(' | ')}` : ''}`);
  linea(r.textos.length === 0, `${nombre}: ningún texto por debajo de 15 px${r.textos.length ? ` — ${r.textos.join(' | ')}` : ''}`);
}

/** Todo lo que hace falta saber del grid y de la tira, de una pasada. */
function estado() {
  const grid = document.querySelector('.grid-wrap');
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  const ultima = tiles[tiles.length - 1]?.getBoundingClientRect();
  const barra = document.querySelector('.ticket-bar')?.getBoundingClientRect();
  const tira = document.querySelector('.tira');
  const lista = document.querySelector('.tira__lista');
  return {
    alto: innerHeight,
    tile: Math.round(tiles[0]?.getBoundingClientRect().height ?? 0),
    bebidas: tiles.length,
    // El borde inferior de la última bebida: si la tira empujara el grid, esta
    // cifra se movería. `scrollHeight − clientHeight` nunca baja de cero y por
    // ahí no se ve nada (trampa aprendida en la fase 9).
    ultimaY: ultima ? Math.round(ultima.bottom) : 0,
    ultimaVisible: Boolean(ultima && barra && ultima.bottom <= barra.top + 1),
    holgura: ultima && grid ? Math.round(grid.getBoundingClientRect().bottom - ultima.bottom) : 0,
    gridScroll: grid ? grid.scrollHeight - grid.clientHeight : 0,
    paginaScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    hayTira: Boolean(tira),
    tiraAlto: tira ? Math.round(tira.getBoundingClientRect().height) : 0,
    filasVisibles: lista ? Number(getComputedStyle(lista).getPropertyValue('--tira-filas')) : 0,
    listaAlto: lista ? Math.round(lista.getBoundingClientRect().height) : 0,
    lineas: document.querySelectorAll('.tira__fila').length,
    rotulo: document.querySelector('.tira__mas')?.textContent?.trim() ?? '',
    // Lo que se lee de arriba abajo, que es el orden de la hoja.
    textos: [...document.querySelectorAll('.tira__fila .tira__nombre')].map((f) =>
      (f.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
    etiquetas: [...document.querySelectorAll('.tira__quitar')].map((b) => b.getAttribute('aria-label')),
  };
}

/**
 * Dónde acaba la última bebida **con la tira apagada**.
 *
 * Es la única comparación honesta: el grid ya baja 108 px al tocar la primera
 * bebida porque el bloque de extras crece (decisión 110, fase 11), y eso no lo
 * hace la tira. Lo que aquí se comprueba es que la tira no le quita ni un píxel
 * al grid, así que se mide con ella escondida y con ella puesta.
 */
function gridSinTira() {
  const tira = document.querySelector('.tira');
  const antes = tira ? tira.style.display : null;
  if (tira) tira.style.display = 'none';
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  const ultima = tiles[tiles.length - 1]?.getBoundingClientRect();
  const y = ultima ? Math.round(ultima.bottom) : 0;
  if (tira) tira.style.display = antes ?? '';
  return y;
}

/** La «X» de una hoja abierta: dónde está y si se ve entera. */
function salidaDeLaHoja(selector) {
  const hoja = document.querySelector(selector);
  if (!hoja) return null;
  const cabecera = hoja.querySelector('.hoja__cabecera');
  const cerrar = hoja.querySelector('[aria-label="Cerrar"]');
  if (!cerrar) return null;
  const r = cerrar.getBoundingClientRect();
  const rc = cabecera?.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    alto: Math.round(r.height),
    ancho: Math.round(r.width),
    dentro: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5,
    cabeceraPegada: cabecera ? getComputedStyle(cabecera).position === 'sticky' : false,
    cabeceraY: rc ? Math.round(rc.top) : 0,
    // Pegada de verdad: sin un hueco por el que asome el contenido de detrás.
    cabeceraAlBorde: rc ? Math.round(rc.top - hoja.getBoundingClientRect().top) === 0 : false,
    // El sitio por el que se ha abierto: la hoja del Resumen entra desplazada.
    desplazada: Math.round(hoja.scrollTop),
    titulo: hoja.querySelector('.sheet__title')?.textContent?.trim() ?? '',
  };
}

/** Arrastra una hoja hacia abajo `px` píxeles desde su asa y suelta. */
async function arrastrarHoja(page, selector, px) {
  // Se vuelve a medir justo antes de tocar: una caja medida hace dos segundos
  // dentro de una hoja que se desplaza ya no está donde estaba.
  const punto = await page.evaluate((selector) => {
    const hoja = document.querySelector(selector);
    const cabecera = hoja?.querySelector('.hoja__cabecera') ?? hoja;
    const r = cabecera.getBoundingClientRect();
    return { x: Math.round(r.left + 24), y: Math.round(r.top + r.height / 2) };
  }, selector);
  await page.mouse.move(punto.x, punto.y);
  await page.mouse.down();
  for (let paso = 1; paso <= 6; paso += 1) {
    await page.mouse.move(punto.x, punto.y + Math.round((px * paso) / 6));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Toca una bebida del grid por su nombre. */
async function toca(page, nombre) {
  await page.locator('.tile-grid .tile', { hasText: nombre }).first().click();
  await page.waitForTimeout(220);
}

/* ================= El recorrido en el iPhone ================= */

for (const viewport of [IPHONE, IPHONE_SAFE]) {
  const etiqueta = `iPhone ${String(viewport.width)} × ${String(viewport.height)}`;
  console.log(`\n=== ${etiqueta} ===\n`);
  const { browser, page } = await abrir(viewport);
  const sufijo = `${String(viewport.width)}x${String(viewport.height)}`;

  await abrirBarra(page, `Boda ${sufijo}`);

  /* ---- 1. La tira aparece con la primera bebida y no empuja el grid ---- */

  const vacia = await page.evaluate(estado);
  linea(!vacia.hayTira, `${etiqueta}: con el pedido vacío no hay tira, el hueco se queda como estaba`);
  await captura(page, `${sufijo}-barra-vacia-sin-tira-y-el-hueco-libre`);

  await toca(page, 'Cortado');
  const una = await page.evaluate(estado);
  const unaSinTira = await page.evaluate(gridSinTira);
  linea(una.hayTira && una.lineas === 1, `${etiqueta}: con una bebida la tira la enseña — «${una.textos.join(' | ')}»`);
  linea(
    una.ultimaY === unaSinTira,
    `${etiqueta}: la tira no le quita ni un píxel al grid (última bebida en ${String(una.ultimaY)} px, sin tira ${String(unaSinTira)})`,
  );
  console.log(
    `NOTA  ${etiqueta}: el grid baja de ${String(vacia.ultimaY)} a ${String(una.ultimaY)} px al tocar la primera bebida; eso lo hace el bloque de extras al crecer (decisión 110), no la tira`,
  );
  linea(una.gridScroll <= 1, `${etiqueta}: el grid no se desplaza con una bebida (${String(una.gridScroll)} px)`);
  linea(una.paginaScroll <= 1, `${etiqueta}: la página no se desplaza con una bebida (${String(una.paginaScroll)} px)`);
  await captura(page, `${sufijo}-la-tira-con-una-bebida-sobre-la-barra-del-pedido`);
  await revisa(page, `${etiqueta} · tira con una bebida`);

  await toca(page, 'Latte');
  const dos = await page.evaluate(estado);
  linea(
    dos.textos.length === 2 && dos.textos[0].startsWith('Cortado') && dos.textos[1].startsWith('Latte'),
    `${etiqueta}: el orden es el de la hoja, la más reciente la última — «${dos.textos.join(' | ')}»`,
  );
  linea(dos.ultimaY === una.ultimaY, `${etiqueta}: con dos bebidas el grid sigue donde estaba (${String(dos.ultimaY)} px)`);
  linea(dos.gridScroll <= 1 && dos.paginaScroll <= 1, `${etiqueta}: con dos bebidas no hay scroll de grid ni de página`);
  linea(
    dos.listaAlto === 45 * dos.filasVisibles - 1,
    `${etiqueta}: la tira mide justo sus ${String(dos.filasVisibles)} filas (${String(dos.listaAlto)} px)`,
  );
  await captura(page, `${sufijo}-la-tira-con-dos-bebidas-en-el-orden-de-la-hoja`);

  for (const bebida of ['Americano', 'Cappuccino', 'Flat white']) await toca(page, bebida);
  const cinco = await page.evaluate(estado);
  linea(cinco.lineas === 5, `${etiqueta}: el pedido lleva cinco líneas`);
  linea(
    cinco.ultimaY === una.ultimaY && cinco.gridScroll <= 1 && cinco.paginaScroll <= 1,
    `${etiqueta}: con cinco bebidas el grid sigue intacto y sin scroll (última en ${String(cinco.ultimaY)} px)`,
  );
  linea(
    cinco.filasVisibles >= 1 && cinco.filasVisibles <= 4,
    `${etiqueta}: se ven ${String(cinco.filasVisibles)} de las cinco líneas, que es lo que cabe en el hueco`,
  );
  if (cinco.rotulo !== '') {
    linea(
      cinco.rotulo === `+${String(cinco.lineas - cinco.filasVisibles)} más · ver todo`,
      `${etiqueta}: el rótulo dice cuántas quedan fuera — «${cinco.rotulo}»`,
    );
  } else {
    console.log(
      `NOTA  ${etiqueta}: no cabe el rótulo; la cuenta entera la da la barra de abajo («Pedido actual (5)»)`,
    );
  }
  console.log(
    `NOTA  ${etiqueta}: ${String(cinco.alto)} px de alto · tile ${String(cinco.tile)} · tira ${String(cinco.tiraAlto)} px (${String(cinco.filasVisibles)} filas) · holgura del grid ${String(cinco.holgura)} px`,
  );
  await captura(page, `${sufijo}-la-tira-con-cinco-bebidas-y-el-rotulo-de-las-que-faltan`);
  await revisa(page, `${etiqueta} · tira con cinco bebidas`);

  /* ---- 2. Quitar una bebida con su «Deshacer» ---- */

  const antesDeQuitar = await page.evaluate(estado);
  linea(
    antesDeQuitar.etiquetas.every((e) => /^Quitar .+ del pedido$/.test(e ?? '')),
    `${etiqueta}: cada «×» dice qué quita — «${antesDeQuitar.etiquetas[antesDeQuitar.etiquetas.length - 1] ?? ''}»`,
  );
  await page.locator('.tira__quitar').last().click();
  await page.waitForTimeout(250);
  const quitada = await page.evaluate(() => {
    const avisos = [...document.querySelectorAll('.toast')];
    const mio = avisos.find((t) => t.textContent?.includes('Quitada'));
    const tira = document.querySelector('.tira')?.getBoundingClientRect();
    return {
      lineas: document.querySelectorAll('.tira__fila').length,
      aviso: mio?.textContent?.trim() ?? '',
      avisos: avisos.map((t) => t.textContent?.trim() ?? ''),
      // El aviso lleva «Deshacer» y debajo hay «×»: no puede taparlas.
      tapaLaTira: Boolean(mio && tira && mio.getBoundingClientRect().bottom > tira.top + 1),
    };
  });
  linea(quitada.lineas === 4, `${etiqueta}: la «×» quita esa línea (quedan ${String(quitada.lineas)})`);
  linea(
    /^Quitada 1 .+Deshacer$/.test(quitada.aviso),
    `${etiqueta}: el aviso dice qué se quitó y ofrece deshacerlo — «${quitada.aviso}»`,
  );
  linea(
    !quitada.tapaLaTira,
    `${etiqueta}: el aviso se queda por encima de la tira y no tapa ninguna «×»`,
  );
  await captura(page, `${sufijo}-quitada-una-bebida-con-su-aviso-de-deshacer`);
  await revisa(page, `${etiqueta} · con el aviso de quitada`);

  await page.locator('.toast', { hasText: 'Quitada' }).getByRole('button', { name: 'Deshacer' }).click();
  await page.waitForTimeout(250);
  const devuelta = await page.evaluate(estado);
  linea(
    devuelta.lineas === 5 && devuelta.ultimaY === una.ultimaY,
    `${etiqueta}: «Deshacer» devuelve la línea entera y el grid sigue intacto (${String(devuelta.lineas)} líneas)`,
  );
  await captura(page, `${sufijo}-deshacer-devuelve-la-bebida-quitada`);

  /* ---- 3. Salir de la hoja: la abierta por el contador ---- */

  await page.locator('.barra__count').click();
  await page.waitForSelector('[role="dialog"][aria-label="Resumen"]');
  await page.waitForTimeout(600);
  const salida = await page.evaluate(salidaDeLaHoja, '[role="dialog"][aria-label="Resumen"]');
  linea(salida !== null, `${etiqueta}: el contador abre el histórico`);
  linea(
    salida?.cabeceraPegada === true && salida?.cabeceraAlBorde === true,
    `${etiqueta}: la cabecera va pegada al borde de la hoja, sin hueco por el que asome nada (${String(salida?.cabeceraY ?? '?')} px)`,
  );
  linea(
    salida?.dentro === true,
    `${etiqueta}: la «X» de cerrar se ve entera dentro del viewport (${String(salida?.x ?? '?')}, ${String(salida?.y ?? '?')} · ${String(salida?.ancho ?? '?')}×${String(salida?.alto ?? '?')} px)`,
  );
  linea(
    (salida?.desplazada ?? 0) > 0,
    `${etiqueta}: y eso con la hoja abierta ya desplazada hasta los pedidos (${String(salida?.desplazada ?? 0)} px)`,
  );
  await captura(page, `${sufijo}-el-historico-abierto-por-pedidos-con-su-cabecera-y-su-x-a-la-vista`);
  await revisa(page, `${etiqueta} · histórico abierto`);

  /* ---- 4. Cerrar deslizando, y cerrar con la «X» ---- */

  await arrastrarHoja(page, '[role="dialog"][aria-label="Resumen"]', 40);
  const corto = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"]')));
  linea(corto, `${etiqueta}: un deslizamiento corto (40 px) no cierra: la hoja vuelve a su sitio`);

  await arrastrarHoja(page, '[role="dialog"][aria-label="Resumen"]', ARRASTRE_CIERRE + 60);
  const cerradaGesto = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"]')));
  linea(!cerradaGesto, `${etiqueta}: deslizando hacia abajo más de ${String(ARRASTRE_CIERRE)} px la hoja se cierra`);
  await captura(page, `${sufijo}-la-hoja-cerrada-deslizando-de-vuelta-a-la-barra`);

  await page.locator('.barra__count').click();
  await page.waitForSelector('[role="dialog"][aria-label="Resumen"]');
  await page.waitForTimeout(600);
  const antesDeLaX = await page.evaluate(salidaDeLaHoja, '[role="dialog"][aria-label="Resumen"]');
  linea(antesDeLaX?.dentro === true, `${etiqueta}: la «X» sigue a la vista al volver a abrir`);
  await page.locator('[role="dialog"][aria-label="Resumen"] [aria-label="Cerrar"]').click();
  await page.waitForTimeout(300);
  const cerradaX = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"]')));
  linea(!cerradaX, `${etiqueta}: la «X» cierra la hoja`);
  await captura(page, `${sufijo}-la-hoja-cerrada-con-la-x-y-el-pedido-intacto`);

  /* ---- 5. Y el grid sigue exactamente donde estaba ---- */

  const final = await page.evaluate(estado);
  linea(
    final.ultimaY === una.ultimaY && final.ultimaVisible,
    `${etiqueta}: al final del recorrido la última bebida sigue en ${String(final.ultimaY)} px y entera sobre la barra`,
  );
  linea(
    final.gridScroll <= 1 && final.paginaScroll <= 1,
    `${etiqueta}: ni el grid ni la página se han desplazado en todo el recorrido`,
  );
  linea(page.errores.length === 0, `${etiqueta}: sin errores de consola${page.errores.length ? ` — ${page.errores.join(' | ')}` : ''}`);

  await browser.close();
}

/* ================= El iPad, sin regresión ================= */

for (const [nombre, viewport] of [
  ['iPad horizontal', IPAD_H],
  ['iPad vertical', IPAD_V],
]) {
  const etiqueta = `${nombre} · ${String(viewport.width)} × ${String(viewport.height)}`;
  console.log(`\n=== ${etiqueta} ===\n`);
  const { browser, page } = await abrir(viewport, false);
  const sufijo = nombre.replace(/\s+/g, '-').toLowerCase();

  await abrirBarra(page, `Boda ${sufijo}`);
  await toca(page, 'Cortado');
  await toca(page, 'Latte');

  const r = await page.evaluate(() => ({
    hayTira: Boolean(document.querySelector('.tira')),
    hayAsa: Boolean(
      [...document.querySelectorAll('.hoja__asa')].find((a) => a.getBoundingClientRect().height > 0),
    ),
    ticket: [...document.querySelectorAll('.ticket__row .ticket__product')].map((p) => p.textContent?.trim()),
  }));
  linea(!r.hayTira, `${etiqueta}: no hay tira; el pedido ya está entero en su columna — ${r.ticket.join(', ')}`);
  linea(!r.hayAsa, `${etiqueta}: ningún asa a la vista: aquí no se arrastra nada`);
  await captura(page, `${sufijo}-la-barra-con-el-pedido-en-su-columna-sin-tira`);

  await page.locator('.barra__count').click();
  await page.waitForSelector('[role="dialog"][aria-label="Resumen"]');
  await page.waitForTimeout(600);
  const salida = await page.evaluate(salidaDeLaHoja, '[role="dialog"][aria-label="Resumen"]');
  linea(salida?.dentro === true, `${etiqueta}: la «X» del histórico se ve entera (${String(salida?.y ?? '?')} px)`);
  linea(
    salida?.cabeceraPegada === true && salida?.cabeceraAlBorde === true,
    `${etiqueta}: la cabecera va pegada al borde también aquí`,
  );
  await captura(page, `${sufijo}-el-historico-con-su-cabecera-pegada-y-su-x`);

  await arrastrarHoja(page, '[role="dialog"][aria-label="Resumen"]', 200);
  const sigue = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"]')));
  linea(sigue, `${etiqueta}: arrastrar no cierra: el gesto es solo del móvil`);

  await page.locator('[role="dialog"][aria-label="Resumen"] [aria-label="Cerrar"]').click();
  await page.waitForTimeout(300);
  const cerrada = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"]')));
  linea(!cerrada, `${etiqueta}: la «X» cierra la hoja`);
  await revisa(page, `${etiqueta} · barra`, ['.meta a']);
  linea(page.errores.length === 0, `${etiqueta}: sin errores de consola${page.errores.length ? ` — ${page.errores.join(' | ')}` : ''}`);

  await browser.close();
}

console.log(`\n${String(n)} capturas en ${CAPTURAS}/`);
if (fallos.length > 0) {
  console.log(`\n${String(fallos.length)} en rojo:`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nTodo en verde.');
}
