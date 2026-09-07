/**
 * Fase 6 — «Últimos pedidos», verificado en el navegador de verdad.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-6.mjs
 *
 * Los siete puntos del encargo, en este orden: estado vacío · un pedido con su
 * hora y su frase · el orden · el límite de cinco · «Repetir» en modo normal
 * agrupando · «Repetir» en Rápido sirviendo · «Deshacer» quitándolo de la lista
 * · «Ver todos» · y la sección dentro de la hoja del pedido en vertical.
 *
 * Las capturas van a `docs/capturas/fase-6/`.
 */
import { mkdirSync } from 'node:fs';
import {
  BASE,
  HORIZONTAL,
  VERTICAL,
  abrirBarra,
  abrirNavegador,
  crearEvento,
  irA,
  servir,
} from './lib/recorrido.mjs';

const CAPTURAS = 'docs/capturas/fase-6';
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

/** Las frases de la sección, de arriba abajo. */
const frases = (page) => page.locator('.ultimos__frase').allTextContents();

/** Toca un tile por su nombre corto. */
const toca = (page, nombre) =>
  page.locator('.tile-grid .tile', { hasText: new RegExp(`^${nombre}`) }).first().click();

const { browser, page } = await abrirNavegador({ viewport: HORIZONTAL });
console.log(`\n=== Últimos pedidos sobre ${BASE} a 1180 × 820 ===\n`);

/* ---------- 1. Barra recién abierta: estado vacío ---------- */

await irA(page, '/');
await crearEvento(page, { nombre: 'Boda Ana y Marc' });
await abrirBarra(page);

linea(
  (await page.locator('.ultimos__titulo').textContent()) === 'Últimos pedidos',
  'la sección se llama «Últimos pedidos» y está a la vista nada más abrir',
);
linea(
  (await page.locator('.ultimos__vacio').textContent()) === 'Todavía no hay pedidos servidos',
  'el estado vacío dice «Todavía no hay pedidos servidos»',
);
linea(
  (await page.locator('.ultimos__lista').getAttribute('aria-live')) === 'polite',
  'la lista es una región aria-live polite',
);
await captura(page, 'seccion-vacia-columna-derecha');

/* ---------- 2. Servir: la frase, la hora y el orden ---------- */

await toca(page, 'Latte');
await page.locator('.extras button', { hasText: /^Avena$/ }).click();
await page.waitForTimeout(150);
await toca(page, 'Cortado');
await toca(page, 'Cortado');
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(500);

const primera = await frases(page);
linea(
  primera[0] === 'Latte · avena, 2 × Cortado',
  `la frase del pedido es la esperada: «${primera[0]}»`,
);
const hora = await page.locator('.ultimos__hora').first().textContent();
linea(/^\d{2}:\d{2}$/.test(hora ?? ''), `y lleva su hora delante: ${hora}`);
linea(
  (await page.locator('.ticket__foot .btn--action').textContent())?.includes('Toca una bebida'),
  'el pedido actual se vació al mismo tiempo',
);
await captura(page, 'primer-pedido-con-hora-y-frase');

await servir(page, ['Espresso']);
const dos = await frases(page);
linea(
  dos[0] === 'Espresso' && dos[1] === 'Latte · avena, 2 × Cortado',
  'el pedido nuevo se pone arriba y el anterior baja',
);
await captura(page, 'orden-el-mas-nuevo-arriba');

/* ---------- 3. Solo se ven cinco ---------- */

for (const bebida of ['Cappuccino', 'Americano', 'Flat white', 'Espresso']) {
  await servir(page, [bebida]);
}
const filas = await page.locator('.ultimos__fila').count();
linea(filas === 5, `con seis pedidos servidos solo se ven cinco filas (${filas})`);
linea(
  !(await frases(page)).includes('Latte · avena, 2 × Cortado'),
  'y el más viejo ha salido de la lista',
);
await captura(page, 'limite-de-cinco-filas');

/* ---------- 4. «Repetir» en modo normal: agrupa ---------- */

// Primero se sirve un Cortado, para tenerlo en la lista…
await servir(page, ['Cortado']);
await page.waitForTimeout(200);
linea((await frases(page))[0] === 'Cortado', 'hay un Cortado servido, el primero de la lista');

// …y después se pone otro Cortado en el pedido actual, para ver que al
// repetir se agrupa con él en vez de abrir una segunda línea.
await toca(page, 'Cortado');
await page.waitForTimeout(200);
linea(
  (await page.locator('.ticket__row').count()) === 1,
  'y un Cortado suelto en el pedido actual antes de repetir',
);

await page.locator('.ultimos__fila').first().locator('.ultimos__repetir').click();
await page.waitForTimeout(400);

const filasTicket = await page.locator('.ticket__row').count();
const cantidad = await page.locator('.ticket__row .ticket__qty').first().textContent();
linea(
  filasTicket === 1 && cantidad === '2',
  `«Repetir» agrupa con el Cortado que ya había: ${String(filasTicket)} línea, cantidad ${cantidad}`,
);
linea(
  (await page.locator('.ticket__foot .btn--action').textContent())?.includes('Servir 2 bebidas'),
  'y el botón pasa a «Servir 2 bebidas» sin servir nada por su cuenta',
);
linea((await page.locator('.sheet').count()) === 0, 'sin ventana emergente de por medio');
await captura(page, 'repetir-en-modo-normal-agrupa');

// Se sirve para dejar el pedido limpio antes del modo Rápido.
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(500);

/* ---------- 5. «Repetir» en modo Rápido: sirve ---------- */

await page.locator('.switch--stacked').click();
await page.waitForTimeout(250);
linea(
  (await page.locator('.ticket__head').textContent())?.includes('Modo rápido activo'),
  'la cabecera del ticket sigue diciendo «Modo rápido activo»',
);
linea(
  (await page.locator('.ultimos__titulo').count()) === 1,
  'y «Últimos pedidos» sigue ahí: es el mismo componente en los dos modos',
);

const servidasAntes = await page.locator('.barra__count-value').textContent();
const aRepetir = (await frases(page))[0];
await page.locator('.ultimos__fila').first().locator('.ultimos__repetir').click();
await page.waitForTimeout(600);

const servidasDespues = await page.locator('.barra__count-value').textContent();
linea(
  Number(servidasDespues) > Number(servidasAntes),
  `en Rápido «Repetir» sirve al instante: ${servidasAntes} → ${servidasDespues} servidas`,
);
linea((await frases(page))[0] === aRepetir, 'y el pedido nuevo aparece arriba con la misma frase');
const toast = await page.locator('.toast').last().textContent();
linea(
  toast?.includes('servida') && toast.includes('Deshacer'),
  `con su aviso de siempre: «${toast?.trim()}»`,
);
await captura(page, 'repetir-en-rapido-sirve-al-instante');

/* ---------- 6. Deshacer lo quita de la lista ---------- */

await page.locator('.switch--stacked').click();
await page.waitForTimeout(250);
await servir(page, ['Latte']);
await page.waitForTimeout(200);

// Se identifica por su id y no por la posición: con la lista llena a cinco,
// quitar uno hace subir al sexto y el recuento no se mueve.
const recienServido = await page.locator('.ultimos__fila').first().getAttribute('data-pedido');
linea(recienServido !== null, 'el pedido recién servido encabeza la lista');

await page.locator('.toast__action').last().click();
await page.waitForTimeout(600);

linea(
  (await page.locator(`.ultimos__fila[data-pedido="${recienServido}"]`).count()) === 0,
  'deshacer quita el pedido de la lista: lo anulado no se repite',
);
linea(
  (await page.locator('.ultimos__fila').count()) === 5,
  'y sube el que estaba fuera: se siguen viendo cinco',
);
linea(
  (await page.locator('.ticket__row').count()) === 1 &&
    (await page.locator('.ticket__row').first().textContent())?.includes('Latte'),
  'y lo devuelve al pedido actual',
);
await captura(page, 'deshacer-lo-saca-de-la-lista');

/* ---------- 7. «Ver todos» ---------- */

await page.locator('.ultimos__vertodos').click();
await page.waitForSelector('#resumen-pedidos');
await page.waitForTimeout(700);

const anclado = await page.evaluate(() => {
  const hoja = document.querySelector('.sheet__body') ?? document.querySelector('.sheet');
  const card = document.getElementById('resumen-pedidos');
  if (!hoja || !card) return null;
  const h = hoja.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  return { dentro: c.top >= h.top - 8 && c.top < h.bottom, top: Math.round(c.top - h.top) };
});
linea(
  anclado !== null && anclado.dentro,
  `«Ver todos» abre el Resumen ya en la lista de pedidos (a ${String(anclado?.top)} px del borde de la hoja)`,
);
linea(
  (await page.locator('#resumen-pedidos').textContent())?.includes('Anular'),
  'y ahí está «Anular», que es donde vive',
);
await captura(page, 'ver-todos-abre-el-resumen-en-pedidos');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* ---------- 8. Nada de la barra hace scroll de página ---------- */

const scrollPagina = await page.evaluate(() => ({
  x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
}));
linea(!scrollPagina.x && !scrollPagina.y, 'la barra sigue sin hacer scroll de página en horizontal');

const medidas = await page.evaluate(() => {
  const chico = [...document.querySelectorAll('.ultimos button')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width < 44 || r.height < 44);
  const texto = [...document.querySelectorAll('.ultimos__frase, .ultimos__hora, .ultimos__vacio')]
    .map((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    .filter((px) => px < 15);
  const lista = document.querySelector('.ultimos__lista');
  return { chico: chico.length, texto: texto.length, altoLista: Math.round(lista?.clientHeight ?? 0) };
});
linea(medidas.chico === 0, `ningún control de la sección baja de 44 px (${medidas.chico} fallos)`);
linea(medidas.texto === 0, `ningún texto baja de 15 px (${medidas.texto} fallos)`);
linea(
  medidas.altoLista >= 112,
  `la lista deja sitio para dos filas como mínimo: ${medidas.altoLista} px`,
);

/* ---------- 8 bis. Con el pedido lleno, la sección cede ---------- */

const reposo = await page.evaluate(() => ({
  ultimos: Math.round(document.querySelector('.ultimos')?.getBoundingClientRect().height ?? 0),
  pedido: Math.round(document.querySelector('.ticket__list')?.getBoundingClientRect().height ?? 0),
}));

for (const b of ['Espresso', 'Americano', 'Cortado', 'Flat white', 'Cappuccino', 'Latte', 'Filtro', 'Cold brew', 'Cremaet', 'Carajillo']) {
  await toca(page, b);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(400);

const lleno = await page.evaluate(() => {
  const lista = document.querySelector('.ultimos__lista');
  const caja = lista.getBoundingClientRect();
  const enteras = [...lista.querySelectorAll('.ultimos__fila')].filter((f) => {
    const r = f.getBoundingClientRect();
    return r.top >= caja.top - 0.5 && r.bottom <= caja.bottom + 0.5;
  }).length;
  const pedido = document.querySelector('.ticket__list');
  return {
    ultimos: Math.round(document.querySelector('.ultimos').getBoundingClientRect().height),
    pedido: Math.round(pedido.getBoundingClientRect().height),
    pedidoScroll: pedido.scrollHeight > pedido.clientHeight + 1,
    filasEnteras: enteras,
    pagina: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  };
});

linea(
  lleno.ultimos < reposo.ultimos && lleno.pedido > reposo.pedido,
  `con 10 líneas la sección cede espacio al pedido: ${reposo.ultimos}→${lleno.ultimos} px de sección, ${reposo.pedido}→${lleno.pedido} px de pedido`,
);
linea(
  lleno.filasEnteras >= 2,
  `y nunca baja de dos filas enteras a la vista (${lleno.filasEnteras})`,
);
linea(
  lleno.pedidoScroll && !lleno.pagina,
  'a partir de ahí el scroll es del pedido, dentro de su caja, nunca de la página',
);
await captura(page, 'pedido-largo-la-seccion-cede-a-dos-filas');

/* ---------- 8 ter. Modo noche ---------- */

await page.locator('.switch[aria-pressed]', { hasText: 'Noche' }).click();
await page.waitForTimeout(400);
const noche = await page.evaluate(() => {
  const fila = document.querySelector('.ultimos__fila');
  const frase = document.querySelector('.ultimos__frase');
  return {
    tema: document.documentElement.getAttribute('data-theme'),
    frase: getComputedStyle(frase).color,
    fondo: getComputedStyle(fila.closest('.ticket')).backgroundColor,
  };
});
linea(
  noche.tema === 'night',
  `la sección se pinta también en modo noche (frase ${noche.frase} sobre ${noche.fondo})`,
);
await captura(page, 'seccion-en-modo-noche');
await page.locator('.switch[aria-pressed]', { hasText: 'Noche' }).click();
await page.waitForTimeout(300);

/* ---------- 9. Vertical: dentro de la hoja del pedido ---------- */

await page.setViewportSize(VERTICAL);
await page.waitForTimeout(400);
console.log('\n=== Lo mismo a 820 × 1180 (vertical) ===\n');

linea(
  !(await page.locator('.barra__cols > .ticket .ultimos').isVisible()),
  'en vertical la sección no se queda colgando en la columna escondida',
);
await captura(page, 'vertical-barra-inferior');

await page.locator('.ticket-bar__label').click();
await page.waitForSelector('.ticket--sheet');
await page.waitForTimeout(400);

const enLaHoja = await page.evaluate(() => {
  const hoja = document.querySelector('.ticket--sheet');
  const seccion = hoja?.querySelector('.ultimos');
  const lista = hoja?.querySelector('.ticket__list');
  if (!hoja || !seccion || !lista) return null;
  const s = seccion.getBoundingClientRect();
  return { dentro: true, debajo: s.top >= lista.getBoundingClientRect().top, visible: s.height > 0 };
});
linea(
  enLaHoja?.dentro === true && enLaHoja.debajo && enLaHoja.visible,
  'en vertical la sección va dentro de la hoja del pedido, debajo de las líneas',
);
linea(
  (await page.locator('.ultimos__fila').count()) > 0,
  'con sus filas y su «Repetir» a mano',
);
await captura(page, 'vertical-seccion-dentro-de-la-hoja');

const scrollVertical = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
linea(!scrollVertical, 'y sin scroll horizontal de página en vertical');

/* ---------- Cierre ---------- */

linea(page.errores.length === 0, `sin errores de consola (${page.errores.length})`);
if (page.errores.length > 0) console.log(page.errores.join('\n'));

await browser.close();

console.log(`\n${n} capturas en ${CAPTURAS}/`);
if (fallos.length > 0) {
  console.log(`\n${fallos.length} comprobaciones en rojo:`);
  for (const f of fallos) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones en verde.\n');
