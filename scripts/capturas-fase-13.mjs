/**
 * Fase 13 · los dos estados de la tira, medidos en el navegador.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-13.mjs
 *
 * Nicolas, después de usarla con el pedido ya servido: «una vez realizado el
 * pedido, me gustaría que se viera directamente dónde se iban acumulando los
 * pedidos. De forma que si me olvido de algo, a simple vista pueda repasarlo».
 *
 * Lo que se comprueba, a **402 × 874** (el iPhone 17 Pro en Safari) y a
 * **402 × 781** (el mismo aparato instalado, con las safe areas descontadas):
 *
 * 1. Con el pedido vacío y algo servido, la tira enseña **los pedidos
 *    servidos**, con su rótulo «Ya servidos» y sin ninguna «×».
 * 2. El orden es el mismo que en el otro estado: **el más reciente abajo**.
 * 3. Tocar una fila abre la hoja con **ese** pedido desplegado.
 * 4. Empezar a montar otro pedido devuelve la tira a «Pedido actual».
 * 5. Anular desde la hoja saca la fila de la tira.
 * 6. Con más pedidos que filas sale «+N más · ver todo».
 * 7. Y en todo el recorrido **el grid no se mueve ni un píxel**: la última
 *    bebida se queda donde estaba y no hay scroll de grid ni de página.
 *
 * Al final, el iPad en sus dos giros: allí no hay tira en ninguno de los dos
 * estados, porque el pedido y «Últimos pedidos» ya están en su columna.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:4173';
const CAPTURAS = 'docs/capturas/fase-13';
mkdirSync(CAPTURAS, { recursive: true });

/** El iPhone 17 Pro tal cual, y con las safe areas de la app instalada fuera. */
const IPHONE = { width: 402, height: 874 };
const IPHONE_SAFE = { width: 402, height: 781 };
const IPAD_H = { width: 1180, height: 820 };
const IPAD_V = { width: 820, height: 1180 };

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

/** Todo lo que hace falta saber de la tira y del grid, de una pasada. */
function estado() {
  const grid = document.querySelector('.grid-wrap');
  const tiles = [...document.querySelectorAll('.tile-grid .tile')];
  const ultima = tiles[tiles.length - 1]?.getBoundingClientRect();
  const tira = document.querySelector('.tira');
  const lista = document.querySelector('.tira__lista');
  const barra = document.querySelector('.ticket-bar');
  return {
    alto: innerHeight,
    tile: Math.round(tiles[0]?.getBoundingClientRect().height ?? 0),
    // El borde inferior de la última bebida: si la tira empujara el grid, esta
    // cifra se movería. `scrollHeight − clientHeight` nunca baja de cero.
    ultimaY: ultima ? Math.round(ultima.bottom) : 0,
    ultimaVisible: Boolean(
      ultima && barra && ultima.bottom <= barra.getBoundingClientRect().top + 1,
    ),
    holgura: ultima && grid ? Math.round(grid.getBoundingClientRect().bottom - ultima.bottom) : 0,
    gridScroll: grid ? grid.scrollHeight - grid.clientHeight : 0,
    paginaScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    hayTira: Boolean(tira),
    modo: tira ? (tira.classList.contains('tira--servidos') ? 'servidos' : 'pedido') : '',
    rotulo: document.querySelector('.tira__rotulo')?.textContent?.trim() ?? '',
    descripcion: tira?.getAttribute('aria-label') ?? '',
    tiraAlto: tira ? Math.round(tira.getBoundingClientRect().height) : 0,
    tiraY: tira ? Math.round(tira.getBoundingClientRect().top) : 0,
    filasVisibles: lista ? Number(getComputedStyle(lista).getPropertyValue('--tira-filas')) : 0,
    listaAlto: lista ? Math.round(lista.getBoundingClientRect().height) : 0,
    filas: document.querySelectorAll('.tira__fila').length,
    mas: document.querySelector('.tira__mas')?.textContent?.trim() ?? '',
    cruces: document.querySelectorAll('.tira__quitar').length,
    // Lo que se lee de arriba abajo, que es el orden de la hoja.
    // La hora y la frase van en dos elementos: el hueco lo pone el CSS, así
    // que en el texto plano están pegadas. Se leen por separado.
    servidos: [...document.querySelectorAll('.tira--servidos .tira__fila')].map((f) =>
      [
        f.querySelector('.tira__hora')?.textContent?.trim() ?? '',
        f.querySelector('.tira__frase')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      ].join(' '),
    ),
    lineas: [...document.querySelectorAll('.tira--pedido .tira__nombre')].map((f) =>
      (f.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
    barraTexto: document.querySelector('.ticket-bar__texto')?.textContent?.trim() ?? '',
    // El fondo dice a media distancia qué estado es; el rótulo lo dice del todo.
    fondoLista: lista ? getComputedStyle(lista).backgroundColor : '',
  };
}

/** Dónde acaba la última bebida **con la tira apagada**: la comparación honesta. */
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

/** Toca una bebida del grid por su nombre. */
async function toca(page, nombre) {
  await page.locator('.tile-grid .tile', { hasText: nombre }).first().click();
  await page.waitForTimeout(200);
}

/** Sirve el pedido que haya montado y espera a que la tira lo recoja. */
async function sirve(page) {
  await page.locator('.ticket-bar .btn--action').click();
  await page.waitForSelector('.tira--servidos', { timeout: 5000 });
  await page.waitForTimeout(200);
}

/* ================= El recorrido en el iPhone ================= */

for (const viewport of [IPHONE, IPHONE_SAFE]) {
  const etiqueta = `iPhone ${String(viewport.width)} × ${String(viewport.height)}`;
  console.log(`\n=== ${etiqueta} ===\n`);
  const { browser, page } = await abrir(viewport);
  const sufijo = `${String(viewport.width)}x${String(viewport.height)}`;

  await abrirBarra(page, `Boda ${sufijo}`);

  /* ---- 0. El punto de partida: nada servido, nada que enseñar ---- */

  const vacia = await page.evaluate(estado);
  linea(!vacia.hayTira, `${etiqueta}: sin nada servido y con el pedido vacío no hay tira`);
  linea(
    vacia.barraTexto.includes('Sin pedidos todavía'),
    `${etiqueta}: y la barra de abajo lo dice — «${vacia.barraTexto}»`,
  );
  const sueloVacio = vacia.ultimaY;
  await captura(page, `${sufijo}-barra-recien-abierta-sin-tira-y-el-hueco-libre`);

  /* ---- 1. El estado «Pedido actual», con su rótulo ---- */

  await toca(page, 'Cortado');
  await toca(page, 'Latte');
  const montando = await page.evaluate(estado);
  const montandoSinTira = await page.evaluate(gridSinTira);
  linea(
    montando.modo === 'pedido' && montando.rotulo === 'Pedido actual',
    `${etiqueta}: montando, la tira se llama «${montando.rotulo}» — ${montando.lineas.join(' | ')}`,
  );
  linea(
    montando.cruces === montando.filas,
    `${etiqueta}: cada línea del pedido lleva su «×» (${String(montando.cruces)} de ${String(montando.filas)})`,
  );
  linea(
    montando.ultimaY === montandoSinTira,
    `${etiqueta}: el rótulo no le quita ni un píxel al grid (última bebida en ${String(montando.ultimaY)} px, sin tira ${String(montandoSinTira)})`,
  );
  linea(
    montando.gridScroll <= 1 && montando.paginaScroll <= 1,
    `${etiqueta}: sin scroll de grid ni de página montando el pedido`,
  );
  console.log(
    `NOTA  ${etiqueta} · «Pedido actual» con ${String(montando.filas)} líneas: tira ${String(montando.tiraAlto)} px (${String(montando.filasVisibles)} filas a la vista) · holgura ${String(montando.holgura)} px · presupuesto ${String(montando.tiraAlto + montando.holgura)} px`,
  );
  await captura(page, `${sufijo}-estado-pedido-actual-con-su-rotulo-y-sus-cruces`);
  await revisa(page, `${etiqueta} · «Pedido actual»`);

  /* ---- 2. Servido: la tira cambia de estado, y lo dice ---- */

  await sirve(page);
  const servido = await page.evaluate(estado);
  const servidoSinTira = await page.evaluate(gridSinTira);
  linea(
    servido.modo === 'servidos' && servido.rotulo === 'Ya servidos',
    `${etiqueta}: servido el pedido, la tira pasa a «${servido.rotulo}» — ${servido.servidos.join(' | ')}`,
  );
  linea(
    servido.descripcion === 'Pedidos ya servidos',
    `${etiqueta}: y lo dice también quien no ve la pantalla — «${servido.descripcion}»`,
  );
  linea(servido.cruces === 0, `${etiqueta}: aquí no hay ninguna «×»: anular se queda en la hoja`);
  linea(
    servido.fondoLista !== montando.fondoLista,
    `${etiqueta}: la superficie acompaña al rótulo — servidos ${servido.fondoLista}, pedido ${montando.fondoLista}`,
  );
  linea(
    servido.barraTexto.includes('Pedido actual (0)') && !servido.barraTexto.includes('Último'),
    `${etiqueta}: la barra de abajo deja de repetirlo — «${servido.barraTexto}»`,
  );
  linea(
    servido.ultimaY === servidoSinTira && servido.ultimaY === sueloVacio,
    `${etiqueta}: el grid sigue donde estaba con el pedido vacío (${String(servido.ultimaY)} px, sin tira ${String(servidoSinTira)})`,
  );
  linea(
    servido.gridScroll <= 1 && servido.paginaScroll <= 1,
    `${etiqueta}: sin scroll de grid ni de página con la tira de servidos`,
  );
  console.log(
    `NOTA  ${etiqueta} · «Ya servidos» con 1 pedido: tira ${String(servido.tiraAlto)} px (${String(servido.filasVisibles)} filas a la vista) · holgura ${String(servido.holgura)} px · presupuesto ${String(servido.tiraAlto + servido.holgura)} px`,
  );
  await captura(page, `${sufijo}-estado-ya-servidos-con-el-pedido-recien-servido`);
  await revisa(page, `${etiqueta} · «Ya servidos»`);

  /* ---- 3. Tres pedidos: el más reciente abajo, pegado a la barra ---- */

  await toca(page, 'Americano');
  await sirve(page);
  await toca(page, 'Cappuccino');
  await sirve(page);
  const tres = await page.evaluate(estado);
  const orden = tres.servidos.map((t) => t.replace(/^\d{2}:\d{2} /, ''));
  linea(
    orden.length >= 3 &&
      orden[orden.length - 1].startsWith('Cappuccino') &&
      orden[orden.length - 2].startsWith('Americano'),
    `${etiqueta}: el más reciente el último, pegado a la barra — ${orden.join(' | ')}`,
  );
  linea(
    tres.servidos.every((t) => /^\d{2}:\d{2} \S/.test(t)),
    `${etiqueta}: cada fila lleva su hora delante — «${tres.servidos[0]}»`,
  );
  linea(
    tres.ultimaY === sueloVacio && tres.gridScroll <= 1 && tres.paginaScroll <= 1,
    `${etiqueta}: con tres pedidos el grid sigue intacto (${String(tres.ultimaY)} px)`,
  );
  console.log(
    `NOTA  ${etiqueta} · «Ya servidos» con 3 pedidos: tira ${String(tres.tiraAlto)} px (${String(tres.filasVisibles)} filas) · holgura ${String(tres.holgura)} px`,
  );
  await captura(page, `${sufijo}-tres-pedidos-servidos-el-ultimo-pegado-a-la-barra`);
  await revisa(page, `${etiqueta} · tres servidos`);

  /* ---- 4. Tocar una fila abre ese pedido desplegado ---- */

  const cual = await page.evaluate(
    () => document.querySelectorAll('.tira__pedido').length - 1,
  );
  await page.locator('.tira__pedido').nth(cual).click();
  await page.waitForSelector('.ticket--sheet');
  await page.waitForTimeout(400);
  const hoja = await page.evaluate(() => {
    const fila = document.querySelector('.ticket--sheet .ultimos__fila');
    return {
      abierta: fila?.classList.contains('is-abierta') ?? false,
      expandida: fila?.querySelector('.ultimos__cabeza')?.getAttribute('aria-expanded') ?? '',
      texto: (fila?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  });
  linea(
    hoja.abierta && hoja.expandida === 'true',
    `${etiqueta}: tocar una fila abre la hoja con ese pedido desplegado — «${hoja.texto}»`,
  );
  await captura(page, `${sufijo}-la-hoja-abierta-por-la-tira-con-ese-pedido-desplegado`);

  /* ---- 5. Anular desde la hoja: la fila sale de la tira ---- */

  const antesDeAnular = (await page.evaluate(estado)).servidos.length;
  await page.locator('.ticket--sheet .ultimos__anular').first().click();
  await page.waitForTimeout(400);
  // Con el aviso «Anulado · … · Deshacer» vivo, la «X» de la hoja puede quedar
  // debajo: se cierra con Escape, que es la salida que no depende del sitio.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const anulado = await page.evaluate(estado);
  linea(
    anulado.servidos.length === antesDeAnular - 1 &&
      !anulado.servidos.some((t) => t.includes('Cappuccino')),
    `${etiqueta}: anulado desde la hoja, su fila sale de la tira — ${anulado.servidos.join(' | ')}`,
  );
  linea(
    anulado.ultimaY === sueloVacio && anulado.gridScroll <= 1,
    `${etiqueta}: y el grid sigue sin moverse (${String(anulado.ultimaY)} px)`,
  );
  await captura(page, `${sufijo}-anulado-desde-la-hoja-la-fila-desaparece-de-la-tira`);

  /* ---- 6. Volver a montar: la tira vuelve al otro estado ---- */

  await toca(page, 'Cortado');
  const vuelta = await page.evaluate(estado);
  linea(
    vuelta.modo === 'pedido' && vuelta.rotulo === 'Pedido actual',
    `${etiqueta}: empezar otro pedido devuelve la tira a «${vuelta.rotulo}»`,
  );
  linea(
    vuelta.cruces === vuelta.filas && vuelta.filas === 1,
    `${etiqueta}: y vuelven las «×» de quitar una línea`,
  );
  await captura(page, `${sufijo}-de-vuelta-al-estado-pedido-actual-al-tocar-una-bebida`);

  /* ---- 7. «+N más · ver todo», con más pedidos que filas ---- */

  await sirve(page);
  for (const bebida of ['Latte', 'Americano', 'Cappuccino', 'Flat white']) {
    await toca(page, bebida);
    await sirve(page);
  }
  const muchos = await page.evaluate(estado);
  linea(
    muchos.mas !== '',
    `${etiqueta}: con más pedidos que filas sale el rótulo — «${muchos.mas}»`,
  );
  linea(
    muchos.filas === muchos.filasVisibles,
    `${etiqueta}: se ven las ${String(muchos.filasVisibles)} filas que caben, y el rótulo dice el resto`,
  );
  linea(
    muchos.ultimaY === sueloVacio && muchos.gridScroll <= 1 && muchos.paginaScroll <= 1,
    `${etiqueta}: con la tira llena el grid sigue intacto y sin scroll (${String(muchos.ultimaY)} px)`,
  );
  console.log(
    `NOTA  ${etiqueta} · «Ya servidos» lleno: tira ${String(muchos.tiraAlto)} px (${String(muchos.filasVisibles)} filas + rótulo) · holgura ${String(muchos.holgura)} px · presupuesto ${String(muchos.tiraAlto + muchos.holgura)} px`,
  );
  await captura(page, `${sufijo}-la-tira-llena-de-servidos-con-el-rotulo-de-los-que-faltan`);
  await revisa(page, `${etiqueta} · tira llena`);

  await page.locator('.tira__mas').click();
  await page.waitForSelector('.ticket--sheet');
  await page.waitForTimeout(300);
  linea(
    await page.evaluate(() => Boolean(document.querySelector('.ticket--sheet'))),
    `${etiqueta}: «ver todo» abre la hoja, igual que en el otro estado`,
  );
  await captura(page, `${sufijo}-ver-todo-abre-la-hoja-con-todos-los-pedidos`);
  await page.locator('.ticket--sheet .ticket__head').getByRole('button', { name: 'Cerrar' }).click();
  await page.waitForTimeout(300);

  /* ---- 8. El estado final: el grid exactamente donde estaba ---- */

  const final = await page.evaluate(estado);
  linea(
    final.ultimaY === sueloVacio && final.ultimaVisible,
    `${etiqueta}: al final del recorrido la última bebida sigue en ${String(final.ultimaY)} px y entera sobre la barra`,
  );
  linea(
    final.gridScroll === 0 && final.paginaScroll === 0,
    `${etiqueta}: scrollHeight === clientHeight en el grid (${String(final.gridScroll)}) y en la página (${String(final.paginaScroll)})`,
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
  const montando = await page.evaluate(estado);
  linea(!montando.hayTira, `${etiqueta}: montando no hay tira; el pedido está en su columna`);

  // En vertical el ticket se pliega en la barra de abajo: el botón de la
  // columna sigue en el DOM pero escondido, así que se pide el que se ve.
  await page.locator('.ticket-bar .btn--action:visible, .ticket .btn--action:visible').first().click();
  await page.waitForTimeout(600);
  const servido = await page.evaluate(() => ({
    hayTira: Boolean(document.querySelector('.tira')),
    ultimos: [...document.querySelectorAll('.ultimos__fila')].length,
    grid: (() => {
      const g = document.querySelector('.grid-wrap');
      return g ? g.scrollHeight - g.clientHeight : 0;
    })(),
    pagina: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  linea(
    !servido.hayTira && servido.ultimos >= 1,
    `${etiqueta}: servido tampoco hay tira; «Últimos pedidos» ya está en la columna (${String(servido.ultimos)} fila)`,
  );
  linea(
    servido.grid <= 1 && servido.pagina <= 1,
    `${etiqueta}: sin scroll de grid ni de página`,
  );
  await captura(page, `${sufijo}-la-barra-con-el-pedido-y-los-ultimos-en-su-columna-sin-tira`);
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
