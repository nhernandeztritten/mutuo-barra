/**
 * Fase 11 · las cuatro peticiones de Nicolas del 12/09/2026, medidas en el
 * navegador.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-11.mjs
 *
 * Se recorre a **402 × 874** (el iPhone 17 Pro tal cual) y a **402 × 781** (el
 * mismo aparato con las safe areas de la app instalada descontadas: 59 arriba y
 * 34 abajo). Lo que se mide:
 *
 * 1. Los extras de la bebida, todos a la vista y **sin desplazar a lo ancho**.
 * 2. La barra de abajo con el último pedido, y que abra su hoja desplegada;
 *    el contador de servidas, que abre el histórico.
 * 3. El aviso pequeño, encima de la barra del pedido y sin taparla.
 * 4. «Empezar de cero»: panel → soltar antes cancela → 1,5 s reinicia →
 *    contador a cero → «Deshacer» lo devuelve.
 *
 * Y el presupuesto vertical de siempre: las catorce bebidas, los extras, las
 * pestañas y la barra del pedido, sin scroll de página.
 *
 * Después, el iPad en sus dos giros, para que no haya regresión.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:4173';
const CAPTURAS = 'docs/capturas/fase-11';
mkdirSync(CAPTURAS, { recursive: true });

/** El iPhone 17 Pro tal cual, y con las safe areas de la app instalada fuera. */
const IPHONE = { width: 402, height: 874 };
const IPHONE_SAFE = { width: 402, height: 781 };
const IPAD_H = { width: 1180, height: 820 };
const IPAD_V = { width: 820, height: 1180 };

/** Lo que hay que aguantar para que «Empezar de cero» ocurra (`src/ui/mantener.tsx`). */
const MANTENER_MS = 1500;

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

/**
 * Ningún texto por debajo de 15 px, ningún objetivo por debajo de 44 y ninguna
 * página desplazada a lo ancho.
 *
 * `conocidos` son selectores de medidas **ya sabidas y no arregladas hoy**: se
 * imprimen como NOTA en cada pasada, con su cifra, para que no se pierdan de
 * vista, pero no tiñen de rojo la verificación de esta fase.
 */
async function revisa(page, nombre, conocidos = []) {
  const r = await page.evaluate((conocidos) => {
    const raiz = document.documentElement;
    const out = {
      scrollW: raiz.scrollWidth,
      clientW: raiz.clientWidth,
      pequenos: [],
      sabidos: [],
      textos: [],
    };
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
        if (conocidos.some((sel) => el.matches(sel))) out.sabidos.push(texto);
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
  for (const s of r.sabidos) {
    console.log(`NOTA  ${nombre}: medida sabida y no arreglada hoy — ${s}`);
  }
  const scroll = r.scrollW > r.clientW + 1;
  linea(!scroll, `${nombre}: la página no se desplaza a lo ancho${scroll ? ` (${String(r.scrollW)} > ${String(r.clientW)})` : ''}`);
  linea(r.pequenos.length === 0, `${nombre}: ningún objetivo táctil por debajo de 44 px${r.pequenos.length ? ` — ${r.pequenos.join(' | ')}` : ''}`);
  linea(r.textos.length === 0, `${nombre}: ningún texto por debajo de 15 px${r.textos.length ? ` — ${r.textos.join(' | ')}` : ''}`);
}

/**
 * Mantiene pulsado el botón de «Empezar de cero» durante `ms` y lo suelta.
 *
 * La caja se vuelve a medir justo antes de cada pulsación: la hoja «Más» se
 * desplaza por dentro en las pantallas bajas, y un ratón que apunta a unas
 * coordenadas de hace dos segundos aprieta el aire —y la prueba pasaría en
 * verde sin haber pulsado nada—.
 */
async function aguanta(page, ms, nombreCaptura) {
  const boton = page.locator('.reinicio .mantener');
  await boton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const caja = await boton.boundingBox();
  if (!caja) throw new Error('El botón de mantener pulsado no está en pantalla');
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(Math.min(ms, 400));
  // Que el botón se entere de que está pulsado: si no, no se ha pulsado nada.
  const pulsando = await page.evaluate(() =>
    Boolean(document.querySelector('.reinicio .mantener.is-pulsando')),
  );
  if (!pulsando) {
    await page.mouse.up();
    throw new Error('La pulsación no ha llegado al botón de mantener pulsado');
  }
  if (ms > 400) await page.waitForTimeout(ms - 400);
  if (nombreCaptura) await captura(page, nombreCaptura);
  await page.mouse.up();
}

/** Prepara un evento con carga y abre la barra. */
async function abrirBarra(page, nombre) {
  await irA(page, '/evento/nuevo');
  await page.fill('#ev-nombre', nombre);
  await page.fill('#ev-invitados', '120');
  await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.waitForSelector('.eventos');
  await page.getByRole('button', { name: 'Abrir barra' }).first().click();
  await page.waitForSelector('.tile-grid .tile');
  await page.waitForTimeout(400);
}

/* ================= 1 · Los extras, todos a la vista ================= */

async function mideExtras(page, etiqueta) {
  await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const zona = document.querySelector('.extras-zona');
    const fila = document.querySelector('.extras--envuelta');
    if (!zona || !fila) return null;
    const controles = [...fila.querySelectorAll('.chip, .seg__opt')];
    const rects = controles.map((c) => c.getBoundingClientRect());
    const caja = fila.getBoundingClientRect();
    // Cuántas filas distintas ocupan los controles: se agrupan por su borde
    // superior redondeado.
    const filas = [...new Set(rects.map((x) => Math.round(x.top)))].sort((a, b) => a - b);
    return {
      rotulo: document.querySelector('.extras__rotulo')?.textContent?.trim() ?? '',
      textos: controles.map((c) => c.textContent.trim()),
      scrollW: fila.scrollWidth,
      clientW: fila.clientWidth,
      dentro: rects.every((x) => x.left >= caja.left - 1 && x.right <= caja.right + 1),
      filas: filas.length,
      primeraFila: rects.filter((x) => Math.round(x.top) === filas[0]).length,
      altos: [...new Set(rects.map((x) => Math.round(x.height)))],
      altoZona: Math.round(zona.getBoundingClientRect().height),
      fuentes: [...new Set(controles.map((c) => parseFloat(getComputedStyle(c).fontSize)))],
    };
  });

  if (!r) {
    linea(false, `${etiqueta}: no se ha encontrado la fila de extras envuelta`);
    return;
  }

  linea(
    r.textos.join(' · ') === 'Vaca · Avena · Sin lactosa · Desca · Doble · Iced · Sirope',
    `${etiqueta}: los siete extras están presentes — ${r.textos.join(' · ')}`,
  );
  linea(
    r.scrollW <= r.clientW + 1 && r.dentro,
    `${etiqueta}: ninguno se sale del bloque (scrollWidth ${String(r.scrollW)} ≤ clientWidth ${String(r.clientW)})`,
  );
  linea(r.filas === 2, `${etiqueta}: los extras ocupan dos filas (${String(r.filas)})`);
  linea(
    r.primeraFila === 3,
    `${etiqueta}: la leche va sola en la primera fila (${String(r.primeraFila)} controles)`,
  );
  linea(
    r.altos.every((h) => h >= 44 && h <= 46),
    `${etiqueta}: los controles miden 44 px de alto (${r.altos.join(', ')})`,
  );
  linea(
    r.fuentes.every((f) => f >= 16 && f <= 17),
    `${etiqueta}: el texto de los extras va a 16-17 px (${r.fuentes.join(', ')})`,
  );
  linea(
    r.rotulo === 'Extras de: Latte',
    `${etiqueta}: el nombre de la bebida está en el rótulo de encima — «${r.rotulo}»`,
  );
  console.log(`NOTA  ${etiqueta}: el bloque de extras mide ${String(r.altoZona)} px de alto`);
}

/** El presupuesto vertical: todo cabe sin scroll de página ni del grid. */
async function midePresupuesto(page, etiqueta) {
  const r = await page.evaluate(() => {
    const grid = document.querySelector('.grid-wrap');
    const zona = document.querySelector('.extras-zona') ?? document.querySelector('.extras');
    const barra = document.querySelector('.ticket-bar');
    const tiles = [...document.querySelectorAll('.tile-grid .tile')];
    const rBarra = barra.getBoundingClientRect();
    const rGrid = grid.getBoundingClientRect();
    const ultima = tiles[tiles.length - 1]?.getBoundingClientRect();
    return {
      alto: innerHeight,
      gridScroll: grid.scrollHeight - grid.clientHeight,
      paginaScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // Holgura de verdad: lo que sobra entre la última bebida y el final del
      // hueco del grid. `scrollHeight` nunca baja de `clientHeight` y a partir
      // de ahí la resta siempre daba cero, dijera lo que dijera el diseño.
      holgura: ultima ? Math.round(rGrid.bottom - ultima.bottom) : 0,
      bebidas: tiles.length,
      // La última bebida tiene que verse entera por encima de la barra del pedido.
      ultimaVisible: tiles.length > 0 && tiles[tiles.length - 1].getBoundingClientRect().bottom <= rBarra.top + 1,
      altoTile: Math.round(tiles[0]?.getBoundingClientRect().height ?? 0),
      altoExtras: Math.round(zona.getBoundingClientRect().height),
    };
  });
  linea(
    r.paginaScroll <= 1,
    `${etiqueta}: la página no se desplaza en vertical (${String(r.paginaScroll)} px)`,
  );
  linea(
    r.gridScroll <= 1 && r.ultimaVisible,
    `${etiqueta}: las ${String(r.bebidas)} bebidas caben de una, sin desplazar el grid (holgura ${String(r.holgura)} px)`,
  );
  console.log(
    `NOTA  ${etiqueta}: ${String(r.alto)} px de alto · tile ${String(r.altoTile)} · extras ${String(r.altoExtras)} · holgura del grid ${String(r.holgura)} px`,
  );
}

/* ================= El recorrido en el iPhone ================= */

for (const viewport of [IPHONE, IPHONE_SAFE]) {
  const etiqueta = `iPhone ${String(viewport.width)} × ${String(viewport.height)}`;
  console.log(`\n=== ${etiqueta} ===\n`);
  const { browser, page } = await abrir(viewport);
  const sufijo = `${String(viewport.width)}x${String(viewport.height)}`;

  await abrirBarra(page, `Boda ${sufijo}`);
  await captura(page, `${sufijo}-barra-vacia-el-rotulo-invita-a-tocar-una-bebida`);
  await revisa(page, `${etiqueta} · barra`);

  const vacia = await page.evaluate(() => ({
    rotulo: document.querySelector('.extras__rotulo')?.textContent?.trim() ?? '',
    hayFila: Boolean(document.querySelector('.extras--envuelta')),
  }));
  linea(
    vacia.rotulo === 'Toca una bebida; sus extras salen aquí' && !vacia.hayFila,
    `${etiqueta}: sin bebida, el rótulo lo dice y no hay filas de extras — «${vacia.rotulo}»`,
  );

  await mideExtras(page, etiqueta);
  await captura(page, `${sufijo}-latte-con-los-siete-extras-en-dos-filas-sin-desplazar`);
  await midePresupuesto(page, etiqueta);

  // Una bebida sin extras sigue diciéndolo.
  await page.locator('.tile-grid .tile', { hasText: /^Filtro/ }).click();
  await page.waitForTimeout(150);
  const sinExtras = await page.evaluate(
    () => document.querySelector('.extras__rotulo')?.textContent?.trim() ?? '',
  );
  linea(
    sinExtras === 'Filtro · sin extras',
    `${etiqueta}: una bebida sin extras lo dice — «${sinExtras}»`,
  );
  await captura(page, `${sufijo}-filtro-sin-extras-y-sin-filas-vacias`);

  /* ---- 2 · El último pedido en la barra de abajo ---- */

  await page.getByRole('button', { name: /^Servir/ }).click();
  await page.waitForTimeout(700);
  await captura(page, `${sufijo}-servido-con-el-aviso-pequeno-encima-de-la-barra`);

  /* ---- 3 · El aviso, pequeño y sin tapar la barra ---- */

  const aviso = await page.evaluate(() => {
    // El último de la cola: el «Deshacer» que importa es el del pedido que se
    // acaba de servir, no el de un aviso anterior que todavía viva.
    const t = [...document.querySelectorAll('.toast')].pop();
    const barra = document.querySelector('.ticket-bar');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const b = barra.getBoundingClientRect();
    const accion = t.querySelector('.toast__action')?.getBoundingClientRect();
    return {
      mensaje: t.textContent.trim(),
      alto: Math.round(r.height),
      ancho: Math.round(r.width),
      anchoPct: Math.round((r.width / innerWidth) * 100),
      fuente: parseFloat(getComputedStyle(t.querySelector('span')).fontSize),
      // Una sola línea: el alto de la píldora no pasa de 48.
      encimaDeLaBarra: r.bottom <= b.top + 1,
      distancia: Math.round(b.top - r.bottom),
      accionAlta: accion ? Math.round(accion.height) : 0,
      // El «Deshacer» no puede quedar tapado por nada.
      libre: (() => {
        if (!accion) return true;
        const el = document.elementFromPoint(accion.left + accion.width / 2, accion.top + accion.height / 2);
        return Boolean(el && (el.classList.contains('toast__action') || el.closest('.toast__action')));
      })(),
    };
  });
  if (!aviso) {
    linea(false, `${etiqueta}: no había ningún aviso en pantalla tras servir`);
  } else {
    linea(
      /bebidas? servidas?/.test(aviso.mensaje) && aviso.mensaje.includes('Deshacer'),
      `${etiqueta}: el aviso del pedido servido lleva su «Deshacer» — «${aviso.mensaje}»`,
    );
    linea(aviso.alto <= 48, `${etiqueta}: el aviso es de una línea (${String(aviso.alto)} px de alto)`);
    linea(
      aviso.anchoPct <= 92,
      `${etiqueta}: el aviso no pasa del 92 % del ancho (${String(aviso.anchoPct)} %, ${String(aviso.ancho)} px)`,
    );
    linea(aviso.fuente === 15, `${etiqueta}: el aviso va a 15 px (${String(aviso.fuente)})`);
    linea(
      aviso.encimaDeLaBarra,
      `${etiqueta}: el aviso queda encima de la barra del pedido y no la tapa (${String(aviso.distancia)} px de separación)`,
    );
    linea(
      aviso.accionAlta >= 44 && aviso.libre,
      `${etiqueta}: «Deshacer» sigue midiendo ${String(aviso.accionAlta)} px y nada lo tapa`,
    );
  }

  await page.waitForTimeout(8200);

  const ultimo = await page.evaluate(() => {
    const barra = document.querySelector('.ticket-bar');
    const texto = document.querySelector('.ticket-bar__texto');
    const boton = barra.querySelector('.btn--action');
    const cs = getComputedStyle(texto);
    return {
      texto: document.querySelector('.ticket-bar__label')?.textContent?.trim() ?? '',
      fuente: parseFloat(getComputedStyle(document.querySelector('.ticket-bar__label')).fontSize),
      // Una línea de verdad: nada de envolver, y con elipsis si no cabe.
      unaLinea: Math.round(texto.getBoundingClientRect().height) <= 26,
      conElipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap',
      altoBarra: Math.round(barra.getBoundingClientRect().height),
      // Y el botón de servir sigue entero dentro de la pantalla.
      botonDentro: boton.getBoundingClientRect().right <= innerWidth + 1,
      botonAncho: Math.round(boton.getBoundingClientRect().width),
    };
  });
  linea(
    /^Último · \d{2}:\d{2} ·/.test(ultimo.texto),
    `${etiqueta}: con el pedido vacío, la barra enseña el último servido — «${ultimo.texto}»`,
  );
  linea(
    ultimo.fuente >= 15 && ultimo.fuente <= 16,
    `${etiqueta}: y lo dice a ${String(ultimo.fuente)} px`,
  );
  linea(
    ultimo.unaLinea && ultimo.conElipsis,
    `${etiqueta}: en una línea y con puntos suspensivos si no cabe`,
  );
  linea(
    ultimo.botonDentro && ultimo.altoBarra <= 80,
    `${etiqueta}: la barra sigue midiendo ${String(ultimo.altoBarra)} px y el botón de servir cabe entero (${String(ultimo.botonAncho)} px)`,
  );
  await captura(page, `${sufijo}-la-barra-de-abajo-con-el-ultimo-pedido-servido`);
  await revisa(page, `${etiqueta} · con el último pedido`);

  // Tocarlo abre la hoja con ese pedido desplegado.
  await page.locator('.ticket-bar__label').click();
  await page.waitForTimeout(500);
  const desplegado = await page.evaluate(() => {
    const fila = document.querySelector('.ticket--sheet .ultimos__fila');
    return {
      abierta: fila?.classList.contains('is-abierta') ?? false,
      expandida: fila?.querySelector('.ultimos__cabeza')?.getAttribute('aria-expanded') ?? '',
      acciones: [...(fila?.querySelectorAll('.ultimos__acciones .btn') ?? [])].map((b) => b.textContent.trim()),
    };
  });
  linea(
    desplegado.abierta && desplegado.expandida === 'true',
    `${etiqueta}: tocarlo abre la hoja en «Últimos pedidos» con ese pedido desplegado (${desplegado.acciones.join(' · ')})`,
  );
  await captura(page, `${sufijo}-la-hoja-abierta-en-ultimos-pedidos-con-el-pedido-desplegado`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // El contador de servidas abre el histórico.
  const contador = await page.evaluate(() => {
    const c = document.querySelector('.barra__count');
    const r = c.getBoundingClientRect();
    return {
      esBoton: c.tagName === 'BUTTON',
      etiqueta: c.getAttribute('aria-label') ?? '',
      alto: Math.round(r.height),
      ancho: Math.round(r.width),
    };
  });
  linea(
    contador.esBoton && contador.etiqueta === 'Ver el histórico de bebidas servidas',
    `${etiqueta}: el contador de servidas es tocable y dice a dónde lleva — «${contador.etiqueta}»`,
  );
  linea(
    contador.alto >= 44 && contador.ancho >= 44,
    `${etiqueta}: y mide ${String(contador.ancho)} × ${String(contador.alto)} px`,
  );
  await page.locator('.barra__count').click();
  await page.waitForTimeout(600);
  const historico = await page.evaluate(() => {
    const hoja = document.querySelector('[role="dialog"][aria-label="Resumen"]');
    const pedidos = hoja?.querySelector('#resumen-pedidos');
    return {
      abierta: Boolean(hoja),
      hayPedidos: Boolean(pedidos),
      titulo: pedidos?.querySelector('.card__title')?.textContent?.trim() ?? '',
      aLaVista: pedidos ? pedidos.getBoundingClientRect().top < innerHeight : false,
    };
  });
  linea(
    historico.abierta && historico.hayPedidos && historico.aLaVista,
    `${etiqueta}: abre el Resumen en su lista de pedidos — «${historico.titulo}»`,
  );
  await captura(page, `${sufijo}-el-contador-abre-el-historico-de-pedidos`);
  await revisa(page, `${etiqueta} · histórico`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ---- 4 · Empezar de cero ---- */

  // Dos bebidas más y una a medias, para que haya algo que reiniciar.
  await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: /^Servir/ }).click();
  await page.waitForTimeout(400);
  await page.locator('.tile-grid .tile', { hasText: /^Cappuccino/ }).click();
  await page.waitForTimeout(200);

  const servidasAntes = await page.evaluate(
    () => document.querySelector('.barra__count-value')?.textContent?.trim() ?? '',
  );

  // Los «Deshacer» de los pedidos viven ocho segundos: se esperan a que se
  // apaguen, para que el único aviso vivo después sea el del reinicio.
  await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, {
    timeout: 12_000,
  });

  await page.getByRole('button', { name: 'Más' }).click();
  await page.waitForTimeout(400);
  const filasMas = await page.evaluate(() =>
    [...document.querySelectorAll('.hoja-fila__nombre')].map((e) => e.textContent.trim()),
  );
  linea(
    filasMas.join(' · ') ===
      'Rápido · Noche · Resumen · Pausar servicio · Cerrar barra · Empezar de cero',
    `${etiqueta}: la hoja «Más» ofrece las seis, con «Empezar de cero» la última — ${filasMas.join(' · ')}`,
  );

  await page.locator('.hoja-fila', { hasText: 'Empezar de cero' }).click();
  await page.waitForTimeout(400);
  const panel = await page.evaluate(() => {
    const mantener = document.querySelector('.reinicio .mantener');
    const cancelar = [...document.querySelectorAll('.reinicio .btn')].find(
      (b) => b.textContent.trim() === 'Cancelar',
    );
    const dentro = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight + 1;
    };
    return {
      aviso: document.querySelector('.reinicio__aviso')?.textContent?.trim() ?? '',
      hayMantener: Boolean(mantener),
      hayCancelar: Boolean(cancelar),
      // La salida y la acción, las dos enteras en pantalla: si «Cancelar» cae
      // por debajo del borde, lo único visible del panel es lo que reinicia.
      cancelarALaVista: dentro(cancelar),
      mantenerALaVista: dentro(mantener),
      // Y «Cancelar» por encima del botón que reinicia.
      cancelarPrimero:
        Boolean(cancelar && mantener) &&
        cancelar.getBoundingClientRect().top < mantener.getBoundingClientRect().top,
      servidas: document.querySelector('.barra__count-value')?.textContent?.trim() ?? '',
    };
  });
  linea(
    panel.hayMantener && panel.hayCancelar && /Se anular/.test(panel.aviso),
    `${etiqueta}: un toque despliega el panel y dice qué se pierde — «${panel.aviso}»`,
  );
  linea(
    panel.cancelarALaVista && panel.mantenerALaVista && panel.cancelarPrimero,
    `${etiqueta}: «Cancelar» y el botón de mantener pulsado están enteros en pantalla, y la salida va primero`,
  );
  linea(
    panel.servidas === servidasAntes,
    `${etiqueta}: y con ese toque no se ha reiniciado nada (siguen ${panel.servidas} servidas)`,
  );
  await captura(page, `${sufijo}-empezar-de-cero-el-panel-dice-que-se-anula`);
  await revisa(page, `${etiqueta} · panel de reinicio`);

  // Soltar antes de tiempo: no pasa nada.
  await aguanta(page, 800, `${sufijo}-empezar-de-cero-el-relleno-a-media-pulsacion`);
  await page.waitForTimeout(600);
  const trasSoltar = await page.evaluate(() => ({
    servidas: document.querySelector('.barra__count-value')?.textContent?.trim() ?? '',
    sigueElPanel: Boolean(document.querySelector('.reinicio')),
  }));
  linea(
    trasSoltar.servidas === servidasAntes && trasSoltar.sigueElPanel,
    `${etiqueta}: soltar a 0,8 s cancela y no reinicia nada (siguen ${trasSoltar.servidas} servidas)`,
  );

  // Aguantando el segundo y medio sí.
  await aguanta(page, MANTENER_MS + 400);
  await page.waitForTimeout(600);

  const trasReiniciar = await page.evaluate(() => ({
    servidas: document.querySelector('.barra__count-value')?.textContent?.trim() ?? '',
    barra: document.querySelector('.ticket-bar__label')?.textContent?.trim() ?? '',
    hoja: Boolean(document.querySelector('.hoja-abajo')),
    aviso: [...document.querySelectorAll('.toast')].pop()?.textContent?.trim() ?? '',
  }));
  linea(
    trasReiniciar.servidas === '0',
    `${etiqueta}: mantenerlo 1,5 s deja el contador en ${trasReiniciar.servidas}`,
  );
  linea(
    trasReiniciar.barra.includes('Sin pedidos todavía') && !trasReiniciar.hoja,
    `${etiqueta}: el pedido a medias se va y la hoja se cierra sola — «${trasReiniciar.barra}»`,
  );
  linea(
    trasReiniciar.aviso.includes('Evento reiniciado') && trasReiniciar.aviso.includes('Deshacer'),
    `${etiqueta}: y queda la tercera red — «${trasReiniciar.aviso}»`,
  );
  await captura(page, `${sufijo}-reiniciado-el-contador-a-cero-con-su-deshacer`);
  await revisa(page, `${etiqueta} · tras reiniciar`);

  await page.locator('.toast__action').last().click();
  await page.waitForTimeout(800);
  const trasDeshacer = await page.evaluate(() => ({
    servidas: document.querySelector('.barra__count-value')?.textContent?.trim() ?? '',
    barra: document.querySelector('.ticket-bar__label')?.textContent?.trim() ?? '',
  }));
  linea(
    trasDeshacer.servidas === servidasAntes,
    `${etiqueta}: «Deshacer» devuelve las ${trasDeshacer.servidas} bebidas (había ${servidasAntes})`,
  );
  linea(
    trasDeshacer.barra.includes('Pedido actual (1)'),
    `${etiqueta}: y el pedido a medias vuelve entero — «${trasDeshacer.barra}»`,
  );
  await captura(page, `${sufijo}-deshacer-devuelve-las-bebidas-y-el-pedido-a-medias`);

  linea(page.errores.length === 0, `${etiqueta}: sin errores de consola${page.errores.length ? `: ${page.errores.join(' | ')}` : ''}`);
  await browser.close();
}

/* ================= El motivo «Reinicio» en el Resumen ================= */

console.log('\n=== El Resumen enseña los pedidos reiniciados ===\n');
{
  const { browser, page } = await abrir(IPHONE);
  await abrirBarra(page, 'Reinicio en el Resumen');
  await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: /^Servir/ }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Más' }).click();
  await page.waitForTimeout(400);
  await page.locator('.hoja-fila', { hasText: 'Empezar de cero' }).click();
  await page.waitForTimeout(300);
  await aguanta(page, MANTENER_MS + 400);
  await page.waitForTimeout(600);

  await page.locator('.barra__count').click();
  await page.waitForTimeout(700);
  const resumen = await page.evaluate(() => {
    const pedido = document.querySelector('#resumen-pedidos .pedido');
    return {
      tachado: pedido?.classList.contains('is-anulado') ?? false,
      motivo: pedido?.querySelector('.pedido__motivo')?.textContent?.trim() ?? '',
      sinAnular: !pedido?.querySelector('.btn'),
    };
  });
  linea(
    resumen.tachado && resumen.motivo === 'Reinicio',
    `Resumen: el pedido reiniciado sale tachado y con su motivo — «${resumen.motivo}»`,
  );
  await captura(page, 'resumen-el-pedido-reiniciado-tachado-con-su-motivo');
  await revisa(page, 'Resumen con reinicio');
  linea(page.errores.length === 0, `Resumen: sin errores de consola${page.errores.length ? `: ${page.errores.join(' | ')}` : ''}`);
  await browser.close();
}

/* ================= El iPad, sin regresión ================= */

for (const [etiqueta, viewport] of [
  ['iPad horizontal', IPAD_H],
  ['iPad vertical', IPAD_V],
]) {
  console.log(`\n=== ${etiqueta} · ${String(viewport.width)} × ${String(viewport.height)} ===\n`);
  const { browser, page } = await abrir(viewport, false);

  await abrirBarra(page, `Prueba ${etiqueta}`);
  await captura(page, `${etiqueta.toLowerCase().replace(/ /g, '-')}-la-barra-como-estaba`);
  await revisa(page, etiqueta);

  await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
  await page.waitForTimeout(250);

  const extras = await page.evaluate(() => {
    const fila = document.querySelector('.extras');
    const controles = [...document.querySelectorAll('.extras .chip, .extras .seg__opt')];
    const rects = controles.map((c) => c.getBoundingClientRect());
    return {
      textos: controles.map((c) => c.textContent.trim()),
      nombreDentro: Boolean(document.querySelector('.extras .extras__bebida')),
      hayRotulo: Boolean(document.querySelector('.extras__rotulo')),
      hayEnvuelta: Boolean(document.querySelector('.extras--envuelta')),
      // Todos a la misma altura: el segmento de la leche lleva su borde por
      // fuera, así que su `top` cae 1 px por debajo del de los chips. Se
      // comparan los centros con tolerancia, no los bordes.
      desalineados: (() => {
        const centros = rects.map((x) => x.top + x.height / 2);
        return centros.filter((c) => Math.abs(c - centros[0]) > 2).length;
      })(),
      alto: Math.round(fila.getBoundingClientRect().height),
      fuentes: [...new Set(controles.map((c) => parseFloat(getComputedStyle(c).fontSize)))],
    };
  });
  linea(
    extras.textos.join(' · ') === 'Vaca · Avena · Sin lactosa · Desca · Doble · Iced · Sirope',
    `${etiqueta}: los mismos siete extras`,
  );
  linea(
    extras.nombreDentro && !extras.hayRotulo && !extras.hayEnvuelta,
    `${etiqueta}: la fila sigue siendo la de siempre, con el nombre dentro`,
  );
  linea(
    extras.desalineados === 0 && extras.alto >= 56 && extras.alto <= 58,
    `${etiqueta}: una sola fila de ${String(extras.alto)} px con todo alineado, como en DESIGN.md`,
  );
  linea(
    extras.fuentes.every((f) => f === 17),
    `${etiqueta}: los chips siguen a 17 px (${extras.fuentes.join(', ')})`,
  );
  await captura(page, `${etiqueta.toLowerCase().replace(/ /g, '-')}-latte-con-sus-extras-en-una-fila`);

  const cabecera = await page.evaluate(() => {
    const cerrar = document.querySelector('.barra__cerrar').getBoundingClientRect();
    const c = document.querySelector('.barra__count');
    const r = c.getBoundingClientRect();
    const grid = document.querySelector('.grid-wrap');
    return {
      cabeceraCabe: cerrar.right <= innerWidth,
      finCabecera: Math.round(cerrar.right),
      contadorBoton: c.tagName === 'BUTTON',
      contadorAlto: Math.round(r.height),
      contadorAncho: Math.round(r.width),
      masEscondido: getComputedStyle(document.querySelector('.barra__mas')).display === 'none',
      grid: grid.scrollHeight <= grid.clientHeight + 1,
    };
  });
  linea(
    cabecera.cabeceraCabe,
    `${etiqueta}: la cabecera sigue cabiendo («Cerrar barra» acaba en ${String(cabecera.finCabecera)} px de ${String(viewport.width)})`,
  );
  linea(
    cabecera.contadorBoton && cabecera.contadorAlto >= 44 && cabecera.contadorAncho >= 44,
    `${etiqueta}: el contador también es tocable aquí (${String(cabecera.contadorAncho)} × ${String(cabecera.contadorAlto)} px)`,
  );
  linea(cabecera.masEscondido, `${etiqueta}: «Más» sigue siendo solo del móvil`);
  linea(cabecera.grid, `${etiqueta}: el grid sigue cabiendo sin desplazar`);

  await page.locator('.barra__count').click();
  await page.waitForTimeout(600);
  const hist = await page.evaluate(() =>
    Boolean(document.querySelector('[role="dialog"][aria-label="Resumen"] #resumen-pedidos')),
  );
  linea(hist, `${etiqueta}: y abre el Resumen en su lista de pedidos`);
  await captura(page, `${etiqueta.toLowerCase().replace(/ /g, '-')}-el-contador-abre-el-historico`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // «Empezar de cero», la vía del iPad: la tarjeta de la barra abierta.
  await irA(page, '/');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Empezar de cero' }).click();
  await page.waitForTimeout(400);
  const panelIpad = await page.evaluate(() => ({
    hayPanel: Boolean(document.querySelector('.card--live .reinicio')),
    aviso: document.querySelector('.reinicio__aviso')?.textContent?.trim() ?? '',
    debajoDeCerrar: (() => {
      const cerrar = [...document.querySelectorAll('.card--live .btn')].find(
        (b) => b.textContent.trim() === 'Cerrar barra',
      );
      const abrir = document.querySelector('.live-destructivo__abrir');
      return Boolean(cerrar && abrir && abrir.getBoundingClientRect().top > cerrar.getBoundingClientRect().bottom);
    })(),
  }));
  linea(
    panelIpad.hayPanel && panelIpad.debajoDeCerrar,
    `${etiqueta}: «Empezar de cero» vive en la tarjeta de la barra abierta, debajo de «Cerrar barra» — «${panelIpad.aviso}»`,
  );
  await captura(page, `${etiqueta.toLowerCase().replace(/ /g, '-')}-empezar-de-cero-en-la-tarjeta-de-la-barra`);
  await revisa(page, `${etiqueta} · Eventos con el panel`, ['.meta a']);

  linea(page.errores.length === 0, `${etiqueta}: sin errores de consola${page.errores.length ? `: ${page.errores.join(' | ')}` : ''}`);
  await browser.close();
}

console.log(`\n${String(n)} capturas en ${CAPTURAS}/`);
if (fallos.length > 0) {
  console.log(`\n${String(fallos.length)} comprobaciones en rojo:`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nTodo en verde.');
}
