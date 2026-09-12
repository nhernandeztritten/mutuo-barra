/**
 * Fase 10 · auditoría de coherencia y de UX, comprobada en el navegador.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-10.mjs
 *
 * Recorre el evento entero a **402 × 874** (el iPhone 17 Pro de Nicolas, que es
 * el aparato real) y comprueba lo que la fase 9 no miraba: que una hoja abierta
 * no tenga ninguna fila tapada, que los campos se escriban a 16 px o más —por
 * debajo Safari hace zoom al enfocar—, que la barra inferior diga el pedido con
 * el mismo nombre que el ticket, y que las acciones que se pueden deshacer se
 * puedan deshacer desde cualquier pantalla.
 *
 * Después repite el iPad en sus dos giros para que no haya regresión.
 *
 * Las capturas van a `docs/capturas/fase-10/`, y cada una se llama por lo que
 * se ve en ella.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env['BASE'] ?? 'http://localhost:4173';
const CAPTURAS = 'docs/capturas/fase-10';
mkdirSync(CAPTURAS, { recursive: true });

const IPHONE = { width: 402, height: 874 };
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

/* ---------- Comprobaciones ---------- */

/** Ningún texto por debajo de 15 px y ninguna página desplazada a lo ancho. */
async function revisa(page, nombre) {
  const r = await page.evaluate(() => {
    const raiz = document.documentElement;
    const out = { scrollW: raiz.scrollWidth, clientW: raiz.clientWidth, pequenos: [], textos: [] };
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
        out.pequenos.push(`${el.className || el.tagName} «${t}» ${Math.round(rr.width)}×${Math.round(rr.height)}`);
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
  });
  const scroll = r.scrollW > r.clientW + 1;
  linea(!scroll, `${nombre}: la página no se desplaza a lo ancho${scroll ? ` (${String(r.scrollW)} > ${String(r.clientW)})` : ''}`);
  linea(r.pequenos.length === 0, `${nombre}: ningún objetivo táctil por debajo de 44 px${r.pequenos.length ? ` — ${r.pequenos.join(' | ')}` : ''}`);
  linea(r.textos.length === 0, `${nombre}: ningún texto por debajo de 15 px${r.textos.length ? ` — ${r.textos.join(' | ')}` : ''}`);
}

/**
 * Con una hoja abierta, ninguna de sus filas puede estar tapada por nada.
 * El aviso con «Deshacer» vive ocho segundos y caía justo encima de «Pausar
 * servicio»: un toque ahí daba en «Deshacer».
 */
async function hojaSinTapones(page, nombre) {
  const tapadas = await page.evaluate(() => {
    const hoja = document.querySelector('[role="dialog"]');
    if (!hoja) return ['no hay ninguna hoja abierta'];
    const fuera = [];
    for (const el of hoja.querySelectorAll('button, a[href], input, textarea, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const arriba = document.elementFromPoint(x, y);
      if (arriba && (arriba === el || el.contains(arriba) || arriba.contains(el))) continue;
      const texto = (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 22);
      fuera.push(`«${texto}» lo tapa ${String(arriba?.className || arriba?.tagName)}`);
    }
    return fuera;
  });
  linea(tapadas.length === 0, `${nombre}: ninguna fila de la hoja está tapada${tapadas.length ? ` — ${tapadas.join(' | ')}` : ''}`);
}

/** Safari hace zoom al enfocar un campo de menos de 16 px. */
async function camposSinZoom(page, nombre) {
  const malos = await page.evaluate(() =>
    [...document.querySelectorAll('input, textarea, select')]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize), id: el.id || el.getAttribute('aria-label') || el.className }))
      .filter((x) => x.fs < 16)
      .map((x) => `${String(x.id)} a ${String(x.fs)}px`),
  );
  linea(malos.length === 0, `${nombre}: todos los campos a 16 px o más${malos.length ? ` — ${malos.join(' | ')}` : ''}`);
}

/* ================= El recorrido en el iPhone ================= */

console.log(`\n=== El evento entero en un iPhone · ${String(IPHONE.width)} × ${String(IPHONE.height)} ===\n`);

const { browser, page } = await abrir(IPHONE);

/* ---------- 1. Eventos, primer uso ---------- */

await irA(page, '/');
await captura(page, 'eventos-primer-uso-con-los-cuatro-pasos');
await revisa(page, 'Eventos (primer uso)');

const cabecera = await page.evaluate(() => {
  const h = document.querySelector('.eventos > header.row');
  const titulo = h.querySelector('.display').getBoundingClientRect();
  const botones = [...h.querySelectorAll('.btn')].map((b) => b.getBoundingClientRect());
  return {
    tituloSolo: botones.every((b) => b.top >= titulo.bottom - 1),
    mismaLinea: botones.length < 2 || botones.every((b) => Math.abs(b.top - botones[0].top) < 2),
  };
});
linea(cabecera.tituloSolo && cabecera.mismaLinea, 'Eventos: el título va en su línea y las acciones en la suya, juntas');

/* ---------- 2. Preparar: datos, lotes y carga ---------- */

await irA(page, '/evento/nuevo');
await page.fill('#ev-nombre', 'Boda Ana y Marc');
await page.fill('#ev-lugar', 'Finca La Alquería, Valencia');
await page.fill('#ev-invitados', '120');
await camposSinZoom(page, 'Preparar');
await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
await page.waitForTimeout(120);
await captura(page, 'preparar-carga-con-las-sugerencias-puestas');
await revisa(page, 'Preparar');

await page.getByRole('button', { name: 'Guardar', exact: true }).click();
await page.waitForSelector('.eventos');

// Vuelta al evento ya guardado: ahí la acción que toca es abrir la barra.
await page.getByRole('button', { name: 'Ver datos' }).click();
await page.waitForSelector('.form');
const jerarquia = await page.evaluate(() => {
  const abrir = [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Guardar y abrir barra'));
  const guardar = [...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Guardar');
  return {
    abrirPrimario: abrir?.classList.contains('btn--primary') ?? false,
    guardarSecundario: guardar?.classList.contains('btn--secondary') ?? false,
    textoOtraBarra: document.body.textContent.includes('se pausa'),
  };
});
linea(jerarquia.abrirPrimario, 'Preparar un evento guardado: «Guardar y abrir barra» es la acción principal');
linea(jerarquia.guardarSecundario, 'y «Guardar» baja a secundaria: una sola principal por pantalla');
linea(!jerarquia.textoOtraBarra, 'en ningún sitio se dice que la otra barra «se pausa»: pausar es otra cosa');
await captura(page, 'preparar-un-evento-guardado-con-abrir-barra-de-principal');

/* ---------- 3. La barra ---------- */

await irA(page, '/');
await page.getByRole('button', { name: 'Abrir barra' }).first().click();
await page.waitForSelector('.tile-grid .tile');
await page.waitForTimeout(400);
await captura(page, 'barra-vacia-las-catorce-bebidas-de-una');
await revisa(page, 'Barra');

const tabs = await page.evaluate(() => {
  const t = document.querySelector('[role="tab"]');
  const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
  return { controla: Boolean(panel), papel: panel?.getAttribute('role') };
});
linea(tabs.controla && tabs.papel === 'tabpanel', 'las pestañas de categoría declaran el grid que filtran (`aria-controls`)');

const medidor = await page.evaluate(() => document.querySelector('.meter')?.getAttribute('aria-label') ?? '');
linea(/^Café restante: .+ % de la carga$/.test(medidor), `el medidor de café dice los gramos sin depender del ratón: «${medidor}»`);

// Una bebida sin ningún modificador lo dice.
await page.locator('.tile-grid .tile', { hasText: /^Filtro/ }).click();
await page.waitForTimeout(150);
// En móvil el nombre de la bebida vive en el rótulo de encima (fase 11); por
// encima del corte sigue dentro de la fila.
const sinExtras = await page.evaluate(
  () =>
    document.querySelector('.extras__rotulo')?.textContent?.trim() ??
    document.querySelector('.extras')?.textContent?.trim() ??
    '',
);
linea(sinExtras === 'Filtro · sin extras', `una bebida sin extras lo dice: «${sinExtras}»`);
await captura(page, 'filtro-sin-extras-en-la-fila-de-arriba');

// Y la Tapa no está en ningún sitio.
const hayTapa = await page.evaluate(() => /tapa/i.test(document.body.textContent ?? ''));
linea(!hayTapa, 'la Tapa no aparece en la barra');

await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
await page.waitForTimeout(150);
const extrasLatte = await page.evaluate(() =>
  [...document.querySelectorAll('.extras .chip, .extras .seg__opt')].map((b) => b.textContent.trim()).join(' · '),
);
linea(
  extrasLatte === 'Vaca · Avena · Sin lactosa · Desca · Doble · Iced · Sirope',
  `el Latte ofrece siete extras y ninguno es la Tapa: ${extrasLatte}`,
);
await captura(page, 'latte-con-sus-siete-extras-sin-tapa');

/* ---------- 4. Servir, y el nombre del pedido ---------- */

await page.getByRole('button', { name: /^Servir/ }).click();
await page.waitForTimeout(500);
await captura(page, 'una-bebida-servida-con-su-deshacer');

/* ---------- 5. La hoja «Más» con el aviso vivo ---------- */

await page.getByRole('button', { name: 'Más' }).click();
await page.waitForTimeout(600);
await captura(page, 'hoja-mas-con-el-aviso-arriba-y-ninguna-fila-tapada');
await hojaSinTapones(page, 'Hoja «Más» con el aviso de «Deshacer» vivo');
await revisa(page, 'Hoja «Más»');

const filasMas = await page.evaluate(() =>
  [...document.querySelectorAll('.hoja-fila__nombre')].map((e) => e.textContent.trim()),
);
linea(
  filasMas.join(' · ') === 'Rápido · Noche · Resumen · Pausar servicio · Cerrar barra',
  `la hoja «Más» ofrece las cinco: ${filasMas.join(' · ')}`,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

/* ---------- 6. La hoja del pedido y «Últimos pedidos» ---------- */

await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).click();
await page.waitForTimeout(120);
await page.locator('.ticket-bar__label').click();
await page.waitForTimeout(400);
await captura(page, 'hoja-del-pedido-con-los-ultimos-pedidos');
await hojaSinTapones(page, 'Hoja del pedido');
await revisa(page, 'Hoja del pedido');

const nombres = await page.evaluate(() => ({
  barra: document.querySelector('.ticket-bar__label')?.textContent?.trim() ?? '',
  ticket: document.querySelector('.ticket--sheet .ticket__head span')?.textContent?.trim() ?? '',
}));
const soloNombre = (t) => t.replace(/\s*\(\d+\).*$/, '');
linea(
  soloNombre(nombres.barra) === soloNombre(nombres.ticket) && soloNombre(nombres.barra) === 'Pedido actual',
  `la barra inferior y el ticket llaman al pedido igual: «${nombres.barra}» / «${nombres.ticket}»`,
);

// Desplegar un pedido servido y anularlo: tiene que poder deshacerse.
// Dentro de la hoja: en móvil la columna del ticket también está en el árbol,
// escondida por CSS, y su lista tiene los mismos selectores.
await page.locator('.ticket--sheet .ultimos__cabeza').first().click();
await page.waitForTimeout(250);
await captura(page, 'un-pedido-desplegado-con-repetir-editar-y-anular');
await page.locator('.ticket--sheet .ultimos__anular').first().click();
await page.waitForTimeout(400);
const anularBarra = await page.evaluate(() => [...document.querySelectorAll('.toast')].pop()?.textContent ?? '');
linea(anularBarra.includes('Deshacer'), `anular desde la barra ofrece deshacerlo: «${anularBarra.trim()}»`);
await page.locator('.toast__action').last().click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

/* ---------- 7. El Resumen, y su «Anular» ---------- */

await page.getByRole('button', { name: 'Más' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Resumen/ }).click();
await page.waitForTimeout(500);
await captura(page, 'resumen-sobre-la-barra');
await revisa(page, 'Resumen');
const hayTapaResumen = await page.evaluate(() => /tapa/i.test(document.body.textContent ?? ''));
linea(!hayTapaResumen, 'la Tapa tampoco aparece en el Resumen');

await page.locator('.pedidos .btn', { hasText: 'Anular' }).first().click();
await page.waitForTimeout(400);
const anularResumen = await page.evaluate(() => [...document.querySelectorAll('.toast')].pop()?.textContent ?? '');
linea(
  anularResumen.includes('Deshacer'),
  `anular desde el Resumen ofrece lo mismo que desde la barra: «${anularResumen.trim()}»`,
);
await captura(page, 'anular-desde-el-resumen-tambien-se-deshace');
await page.locator('.toast__action').last().click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* ---------- 8. Pausar y reanudar desde el móvil ---------- */

await page.getByRole('button', { name: 'Más' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Pausar servicio/ }).click();
await page.waitForTimeout(500);
await captura(page, 'barra-en-pausa-con-reanudar-de-accion-principal');
await revisa(page, 'Barra en pausa');
const enPausa = await page.evaluate(() => ({
  pildora: document.querySelector('.barra__pausa')?.textContent?.trim(),
  boton: document.querySelector('.ticket-bar .btn--action')?.textContent?.trim(),
}));
linea(
  enPausa.pildora === 'En pausa' && enPausa.boton === 'Reanudar servicio',
  `parado: la cabecera dice «${String(enPausa.pildora)}» y el botón grande «${String(enPausa.boton)}»`,
);
await page.getByRole('button', { name: 'Reanudar servicio' }).click();
await page.waitForTimeout(400);

/* ---------- 9. Cerrar con recuento ---------- */

await page.getByRole('button', { name: 'Más' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Cerrar barra/ }).click();
await page.waitForSelector('.form');
await page.waitForTimeout(300);
await captura(page, 'cerrar-con-el-pedido-a-medias-avisando');
await revisa(page, 'Cerrar');
await camposSinZoom(page, 'Cerrar');

// Descartar el pedido a medias también se deshace.
const hayPendiente = await page.locator('.notice .btn', { hasText: 'Descartar' }).count();
if (hayPendiente > 0) {
  await page.locator('.notice .btn', { hasText: 'Descartar' }).click();
  await page.waitForTimeout(300);
  const descartar = await page.evaluate(() => [...document.querySelectorAll('.toast')].pop()?.textContent ?? '');
  linea(descartar.includes('Deshacer'), `descartar el pedido a medias se deshace: «${descartar.trim()}»`);
  await page.locator('.toast__action').last().click();
  await page.waitForTimeout(300);
  const vuelto = await page.locator('.notice .btn', { hasText: 'Descartar' }).count();
  linea(vuelto > 0, 'y el pedido a medias vuelve entero');
  await page.locator('.notice .btn', { hasText: 'Servir ahora' }).click();
  await page.waitForTimeout(400);
} else {
  linea(false, 'no había pedido a medias que descartar: la prueba no ha podido correr');
}

// El recuento, escrito con el teclado.
const primerCampo = page.locator('.recuento__input input').first();
await primerCampo.click();
await primerCampo.fill('2,4');
await page.waitForTimeout(250);
await captura(page, 'recuento-escrito-con-su-desviacion');
await revisa(page, 'Cerrar con recuento');

await page.getByRole('button', { name: 'Cerrar y ver resultados' }).click();
await page.waitForTimeout(700);
await captura(page, 'resultados-del-evento-cerrado');
await revisa(page, 'Resultados del evento');

/* ---------- 10. Resultados y exportar ---------- */

await irA(page, '/resultados');
await page.waitForTimeout(300);
await captura(page, 'resultados-con-el-principal-abajo-y-la-tabla-con-sombra');
await revisa(page, 'Resultados');

const resultados = await page.evaluate(() => {
  const h = document.querySelector('.resultados > header.row');
  const titulo = h.querySelector('.display').getBoundingClientRect();
  const botones = [...h.querySelectorAll('.btn')].map((b) => ({
    texto: b.textContent.trim(),
    r: b.getBoundingClientRect(),
    primario: b.classList.contains('btn--primary'),
  }));
  const wrap = document.querySelector('.tabla-wrap');
  return {
    tituloSolo: botones.every((b) => b.r.top >= titulo.bottom - 1),
    mismaLinea: botones.every((b) => Math.abs(b.r.top - botones[0].r.top) < 2),
    primarios: botones.filter((b) => b.primario).length,
    ayudaRepetida: document.body.textContent.includes('está apagado porque'),
    tablaDesplaza: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
    tablaConSombra: wrap ? getComputedStyle(wrap).backgroundImage.includes('radial-gradient') : false,
  };
});
linea(resultados.tituloSolo && resultados.mismaLinea, 'Resultados: el título en su línea y «Importar» y «Exportar todo» juntos debajo');
linea(resultados.primarios === 1, `Resultados: una sola acción principal (${String(resultados.primarios)})`);
linea(!resultados.ayudaRepetida, 'Resultados: sin la línea de ayuda que repetía lo que ya decían el botón y el estado vacío');
linea(
  !resultados.tablaDesplaza || resultados.tablaConSombra,
  'Resultados: la tabla que se corta por los lados lo enseña con una sombra',
);

await irA(page, '/ajustes');
await page.waitForTimeout(250);
await captura(page, 'carta-y-ajustes');
await revisa(page, 'Carta y ajustes');

await irA(page, '/ajustes/carta');
await page.waitForTimeout(250);
const tapaEnCarta = await page.evaluate(() => /tapa/i.test(document.body.textContent ?? ''));
linea(!tapaEnCarta, 'la Tapa no aparece en la carta de Ajustes');
await captura(page, 'la-carta-sin-la-tapa');
await revisa(page, 'Carta');

await irA(page, '/ajustes/insumos');
await page.waitForTimeout(250);
const insumos = await page.evaluate(() => {
  const texto = document.body.textContent ?? '';
  return { siguen: (texto.match(/Tapa \d+ oz|Tapa vaso frío/g) ?? []).length };
});
linea(insumos.siguen === 3, `los tres insumos de tapa siguen en Insumos por si vuelven (${String(insumos.siguen)})`);
await captura(page, 'insumos-las-tapas-siguen-pero-ya-no-se-cuentan');
await revisa(page, 'Insumos');

linea(page.errores.length === 0, `sin errores de consola${page.errores.length ? `: ${page.errores.join(' | ')}` : ''}`);
await browser.close();

/* ================= El iPad, sin regresión ================= */

for (const [etiqueta, viewport] of [
  ['iPad horizontal', IPAD_H],
  ['iPad vertical', IPAD_V],
]) {
  console.log(`\n=== ${etiqueta} · ${String(viewport.width)} × ${String(viewport.height)} ===\n`);
  const { browser: b2, page: p2 } = await abrir(viewport, false);

  await irA(p2, '/evento/nuevo');
  await p2.fill('#ev-nombre', `Prueba ${etiqueta}`);
  await p2.fill('#ev-invitados', '80');
  await p2.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await p2.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p2.waitForSelector('.eventos');
  await p2.getByRole('button', { name: 'Abrir barra' }).first().click();
  await p2.waitForSelector('.tile-grid .tile');
  await p2.waitForTimeout(400);
  await captura(p2, `${etiqueta.toLowerCase().replace(/ /g, '-')}-la-barra-como-estaba`);
  await revisa(p2, etiqueta);

  const barra = await p2.evaluate(() => {
    const cerrar = document.querySelector('.barra__cerrar').getBoundingClientRect();
    const acciones = [...document.querySelectorAll('.barra__actions > *')].map((b) => b.textContent.trim().split('\n')[0]);
    return {
      cabeceraCabe: cerrar.right <= innerWidth,
      finCabecera: Math.round(cerrar.right),
      acciones,
      masEscondido: getComputedStyle(document.querySelector('.barra__mas')).display === 'none',
      grid: document.querySelector('.grid-wrap').scrollHeight <= document.querySelector('.grid-wrap').clientHeight + 1,
    };
  });
  linea(barra.cabeceraCabe, `${etiqueta}: la cabecera cabe entera («Cerrar barra» acaba en ${String(barra.finCabecera)} px)`);
  linea(barra.masEscondido, `${etiqueta}: «Más» sigue siendo solo del móvil`);
  linea(barra.grid, `${etiqueta}: el grid sigue cabiendo sin desplazar`);

  await p2.locator('.tile-grid .tile', { hasText: /^Latte/ }).click();
  await p2.waitForTimeout(200);
  const extrasIpad = await p2.evaluate(() =>
    [...document.querySelectorAll('.extras .chip, .extras .seg__opt')].map((b) => b.textContent.trim()).join(' · '),
  );
  linea(
    extrasIpad === 'Vaca · Avena · Sin lactosa · Desca · Doble · Iced · Sirope',
    `${etiqueta}: los mismos siete extras que en el móvil`,
  );
  await captura(p2, `${etiqueta.toLowerCase().replace(/ /g, '-')}-latte-con-sus-extras`);

  await irA(p2, '/resultados');
  await p2.waitForTimeout(250);
  await captura(p2, `${etiqueta.toLowerCase().replace(/ /g, '-')}-resultados`);
  await revisa(p2, `${etiqueta} · Resultados`);

  linea(p2.errores.length === 0, `${etiqueta}: sin errores de consola${p2.errores.length ? `: ${p2.errores.join(' | ')}` : ''}`);
  await b2.close();
}

/* ================= La medida conocida de 1024 × 768 ================= */

/**
 * `SPEC §3.2` nombra 1024 × 768 como tamaño soportado y ahí la cabecera de la
 * barra **no cabe**: se desplaza a lo ancho y «Resumen» y «Cerrar barra» se
 * quedan fuera de la vista (llegan desplazando la cabecera, pero nada dice que
 * estén ahí). Viene de antes de esta auditoría y arreglarlo pide rehacer la
 * cabecera, así que aquí solo se mide y se apunta: está en
 * `docs/UX-REVISION-2.md`, «Para después del evento».
 */
console.log('\n=== La medida conocida de 1024 × 768 ===\n');
{
  const { browser: b3, page: p3 } = await abrir({ width: 1024, height: 768 }, false);
  await irA(p3, '/evento/nuevo');
  await p3.fill('#ev-nombre', 'Medida 1024');
  await p3.fill('#ev-invitados', '80');
  await p3.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await p3.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p3.waitForSelector('.eventos');
  await p3.getByRole('button', { name: 'Abrir barra' }).first().click();
  await p3.waitForSelector('.tile-grid .tile');
  await p3.waitForTimeout(400);
  const fin = await p3.evaluate(() => Math.round(document.querySelector('.barra__cerrar').getBoundingClientRect().right));
  console.log(`NOTA  1024 × 768: «Cerrar barra» acaba en ${String(fin)} px de 1024 — apuntado en UX-REVISION-2, no arreglado`);
  await captura(p3, 'medida-conocida-la-cabecera-no-cabe-a-1024');
  await b3.close();
}

console.log(`\n${String(n)} capturas en ${CAPTURAS}/`);
if (fallos.length > 0) {
  console.log(`\n${String(fallos.length)} comprobaciones en rojo:`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nTodo en verde.');
}
