/**
 * Fase 7 — desplegar, anular y editar un pedido de «Últimos pedidos»,
 * verificado en el navegador de verdad.
 *
 *   npm run build && npm run preview &
 *   node scripts/capturas-fase-7.mjs
 *
 * Los ocho puntos del encargo, en este orden: un pedido de cinco bebidas que
 * se despliega y se cierra · una sola abierta a la vez · repetir desde la
 * desplegada · anular con su deshacer · editar un Latte servido y comprobar en
 * el Resumen que conserva la hora y que el original queda «Corregido» ·
 * editar apagado con el pedido actual lleno · recargar a mitad de una
 * corrección · servir con una fila abierta · y lo mismo en vertical.
 *
 * Las capturas van a `docs/capturas/fase-7/`.
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

const CAPTURAS = 'docs/capturas/fase-7';
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

const toca = (page, nombre) =>
  page.locator('.tile-grid .tile', { hasText: new RegExp(`^${nombre}`) }).first().click();

const extra = (page, nombre) =>
  page.locator('.extras button', { hasText: new RegExp(`^${nombre}$`) }).click();

const fila = (page, i = 0) => page.locator('.ultimos__fila').nth(i);

async function abrir(page, i = 0) {
  await fila(page, i).locator('.ultimos__cabeza').click();
  await page.waitForTimeout(300);
}

const frases = (page) => page.locator('.ultimos__frase').allTextContents();
const servidas = (page) => page.locator('.barra__count-value').textContent();

const { browser, page } = await abrirNavegador({ viewport: HORIZONTAL });
console.log(`\n=== Desplegar, anular y editar sobre ${BASE} a 1180 × 820 ===\n`);

await irA(page, '/');
await crearEvento(page, { nombre: 'Boda Ana y Marc' });
await abrirBarra(page);

/* ---------- 1. Un pedido de cinco bebidas: cerrado, abierto, cerrado ---------- */

// Cinco bebidas distintas y con extras: es el pedido del encargo y el que
// obliga a la frase a no caber en dos líneas.
for (const [bebida, extraDe] of [
  ['Latte', 'Avena'],
  ['Cortado', 'Desca'],
  ['Americano', 'Desca'],
  ['Cappuccino', 'Sin lactosa'],
  ['Flat white', 'Avena'],
]) {
  await toca(page, bebida);
  await extra(page, extraDe);
  await page.waitForTimeout(150);
}
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(600);

const cerrada = await page.evaluate(() => {
  const f = document.querySelector('.ultimos__frase');
  return {
    alto: Math.round(document.querySelector('.ultimos__cabeza').getBoundingClientRect().height),
    cortada: f.scrollHeight > f.clientHeight + 1,
    lineas: Number.parseInt(getComputedStyle(f).webkitLineClamp || '0', 10),
    panel: document.querySelectorAll('.ultimos__panel').length,
    expandida: document.querySelector('.ultimos__cabeza').getAttribute('aria-expanded'),
  };
});
linea(cerrada.alto >= 56, `la fila cerrada mide ${cerrada.alto} px: se toca entera`);
linea(cerrada.lineas === 2, `la frase se corta a ${cerrada.lineas} líneas con elipsis`);
linea(cerrada.cortada, 'y con cinco bebidas la frase no cabe: se ve la elipsis');
linea(cerrada.panel === 0 && cerrada.expandida === 'false', 'cerrada no hay panel ni `aria-expanded`');
await captura(page, 'fila-cerrada-cinco-bebidas-con-elipsis');

await abrir(page);
const abierta = await page.evaluate(() => {
  const panel = document.querySelector('.ultimos__panel');
  const bebidas = [...panel.querySelectorAll('.ultimos__bebida')];
  return {
    expandida: document.querySelector('.ultimos__cabeza').getAttribute('aria-expanded'),
    bebidas: bebidas.map((b) => b.textContent.trim()),
    px: bebidas.map((b) =>
      Number.parseFloat(getComputedStyle(b.querySelector('.ultimos__bebida-nombre')).fontSize),
    ),
    cuando: document.querySelector('.ultimos__fila.is-abierta .ultimos__cabeza')?.textContent.trim(),
    frase: panel.parentElement.querySelectorAll('.ultimos__frase').length,
    acciones: [...panel.querySelectorAll('.ultimos__acciones button')].map((b) => ({
      texto: b.textContent.trim(),
      w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height),
    })),
    modales: document.querySelectorAll('[role="dialog"]').length,
  };
});
linea(abierta.expandida === 'true', 'al tocarla se despliega en el sitio (`aria-expanded` a true)');
linea(
  abierta.bebidas.length === 5,
  `enseña una línea por bebida: ${abierta.bebidas.length} líneas para 5 bebidas`,
);
linea(
  abierta.px.every((p) => p >= 18),
  `y a ${abierta.px[0]} px, legible a 60-75 cm`,
);
linea(
  /^\d{2}:\d{2}(ahora mismo|hace )/.test((abierta.cuando ?? '').replace(/\s+/g, '')) ||
    /^\d{2}:\d{2}\s*(ahora mismo|hace )/.test(abierta.cuando ?? ''),
  `con la hora y el tiempo relativo: «${abierta.cuando}»`,
);
linea(
  abierta.frase === 0,
  'y sin repetir la frase de arriba: lo que se lee es el pedido línea a línea',
);
linea(
  abierta.acciones.map((a) => a.texto).join(' · ') === 'Repetir · Editar · Anular',
  `y las tres acciones: ${abierta.acciones.map((a) => a.texto).join(' · ')}`,
);
linea(
  abierta.acciones.every((a) => a.w >= 44 && a.h >= 44),
  'las tres miden 44 px o más',
);
linea(abierta.modales === 0, 'sin ventana emergente centrada de por medio');
await captura(page, 'fila-desplegada-cinco-bebidas-legibles');

await abrir(page);
linea(
  (await page.locator('.ultimos__panel').count()) === 0,
  'tocarla otra vez la cierra',
);

/* ---------- 2. Una sola abierta a la vez ---------- */

await servir(page, ['Espresso']);
await page.waitForTimeout(300);
await abrir(page, 1);
linea((await page.locator('.ultimos__panel').count()) === 1, 'una fila abierta');
await abrir(page, 0);
const soloUna = await page.evaluate(() => ({
  paneles: document.querySelectorAll('.ultimos__panel').length,
  abierta: document.querySelector('.ultimos__fila.is-abierta')?.getAttribute('data-pedido'),
  primera: document.querySelector('.ultimos__fila')?.getAttribute('data-pedido'),
}));
linea(
  soloUna.paneles === 1 && soloUna.abierta === soloUna.primera,
  'abrir otra cierra la anterior: solo hay una desplegada a la vez',
);
await captura(page, 'solo-una-fila-abierta-a-la-vez');

/* ---------- 3. Repetir desde la desplegada ---------- */

// La fila 0 está desplegada, así que su frase resumida ya no está: lo que se
// lee son sus líneas.
const aRepetir = (await fila(page, 0).locator('.ultimos__bebida-nombre').allTextContents()).join(', ');
await fila(page, 0).locator('.ultimos__repetir').click();
await page.waitForTimeout(500);
const repetido = await page.evaluate(() => ({
  filas: document.querySelectorAll('.ticket__row').length,
  texto: document.querySelector('.ticket__row')?.textContent.trim(),
  boton: document.querySelector('.ticket__foot .btn--action')?.textContent.trim(),
}));
linea(
  repetido.filas === 1 && (repetido.boton ?? '').includes('Servir'),
  `«Repetir» desde la desplegada rellena el pedido actual: «${repetido.boton}» con «${aRepetir}»`,
);
await captura(page, 'repetir-desde-la-desplegada');

// Se vacía para no arrastrarlo al resto del recorrido.
await page.locator('.ticket__foot .btn--action').click();
await page.waitForTimeout(600);

/* ---------- 4. Anular de un toque, y deshacer ----------
   Desde el 07/09/2026 «Anular» no pregunta el motivo: en barra, con cola
   delante, elegir entre tres costaba más que el error que documentaba. Es un
   toque y ocho segundos de «Deshacer» (`src/ui/motivos.tsx`). Este script se
   quedó con los chips de antes y llevaba en rojo desde entonces. */

for (const b of ['Cortado', 'Filtro', 'Cold brew']) {
  await servir(page, [b]);
}
await page.waitForTimeout(300);

const antesDeAnular = await servidas(page);
const seisFrases = await frases(page);
await abrir(page, 0);
const anuladoId = await fila(page, 0).getAttribute('data-pedido');
await fila(page, 0).locator('.ultimos__anular').click();
await page.waitForTimeout(250);

linea(
  (await page.locator('.ultimos .chip--mini').count()) === 0,
  '«Anular» no pregunta el motivo: un toque y ocho segundos para deshacerlo',
);
linea(
  (await page.locator('[role="dialog"]').count()) === 0,
  'y sin ventana emergente, como el Resumen',
);
await captura(page, 'anular-de-un-toque-sin-preguntar-el-motivo');
await page.waitForTimeout(400);

const trasAnular = await page.evaluate((id) => ({
  sigue: document.querySelectorAll(`.ultimos__fila[data-pedido="${id}"]`).length,
  filas: document.querySelectorAll('.ultimos__fila').length,
  servidas: document.querySelector('.barra__count-value').textContent,
  toast: [...document.querySelectorAll('.toast')].pop()?.textContent.trim(),
}), anuladoId);
linea(trasAnular.sigue === 0, 'el pedido anulado desaparece de la lista');
linea(
  trasAnular.filas === 5 && (await frases(page))[4] !== seisFrases[4],
  'y sube el que estaba fuera: se siguen viendo cinco',
);
linea(
  Number(trasAnular.servidas) < Number(antesDeAnular),
  `el contador de la cabecera baja: ${antesDeAnular} → ${trasAnular.servidas}`,
);
linea(
  (trasAnular.toast ?? '').startsWith('Anulado ·') && (trasAnular.toast ?? '').includes('Deshacer'),
  `con su aviso: «${trasAnular.toast}»`,
);
await captura(page, 'pedido-anulado-sube-el-siguiente');

await page.locator('.toast__action').last().click();
await page.waitForTimeout(600);
const trasDeshacer = await page.evaluate((id) => ({
  vuelve: document.querySelectorAll(`.ultimos__fila[data-pedido="${id}"]`).length,
  servidas: document.querySelector('.barra__count-value').textContent,
}), anuladoId);
linea(
  trasDeshacer.vuelve === 1 && trasDeshacer.servidas === antesDeAnular,
  `«Deshacer» lo devuelve a la lista y al contador (${trasDeshacer.servidas})`,
);
await captura(page, 'deshacer-la-anulacion-lo-devuelve');

/* ---------- 5. Editar un Latte servido: de vaca a avena ---------- */

await servir(page, ['Latte']);
await page.waitForTimeout(400);

const laHora = await fila(page, 0).locator('.ultimos__hora').textContent();
const idOriginal = await fila(page, 0).getAttribute('data-pedido');
const servidasAntes = await servidas(page);

/** Consumo teórico de un insumo, leído del Resumen. */
async function consumoDe(nombre) {
  await page.locator('.ultimos__vertodos').click();
  await page.waitForSelector('#resumen-pedidos');
  await page.waitForTimeout(500);
  const valor = await page.evaluate((buscado) => {
    const medidor = [...document.querySelectorAll('.medidor')].find((m) =>
      m.textContent.toLowerCase().includes(buscado.toLowerCase()),
    );
    const detalle = medidor?.querySelector('.medidor__detalle')?.textContent ?? '';
    const num = detalle.match(/^([\d.,]+)\s*(ml|L|g|kg|ud)/);
    if (!num) return 0;
    const n = Number.parseFloat(num[1].replace(/\./g, '').replace(',', '.'));
    return num[2] === 'L' || num[2] === 'kg' ? n * 1000 : n;
  }, nombre);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return valor;
}

const avenaAntes = await consumoDe('avena');
const lecheAntes = await consumoDe('leche');

await abrir(page, 0);
await fila(page, 0).locator('.ultimos__editar').click();
await page.waitForTimeout(500);

const editando = await page.evaluate(() => ({
  cabecera: document.querySelector('.barra__cols .ticket__head')?.textContent.trim(),
  filas: document.querySelectorAll('.ticket__row').length,
  texto: document.querySelector('.ticket__row')?.textContent.trim(),
  paneles: document.querySelectorAll('.ultimos__panel').length,
  cancelar: [...document.querySelectorAll('.barra__cols .ticket__head button')].some(
    (b) => b.textContent.trim() === 'Cancelar',
  ),
  altoCancelar: Math.round(
    document.querySelector('.ticket__cancelar')?.getBoundingClientRect().height ?? 0,
  ),
}));
linea(
  (editando.cabecera ?? '').includes(`Editando el pedido de ${laHora}`),
  `la cabecera del ticket pasa a «Editando el pedido de ${laHora}»`,
);
linea(editando.filas === 1, 'con las líneas del pedido cargadas en el pedido actual');
linea(
  editando.cancelar && editando.altoCancelar >= 44,
  `y un «Cancelar» de ${editando.altoCancelar} px`,
);
linea(editando.paneles === 0, 'la fila se cierra: lo que se mira ahora es el ticket');
linea(
  (await servidas(page)) === servidasAntes,
  'el pedido original no se toca hasta confirmar: el contador no se mueve',
);
await captura(page, 'editando-el-pedido-cabecera-y-cancelar');

await extra(page, 'Avena');
await page.waitForTimeout(300);
linea(
  (await page.locator('.ticket__row').first().textContent())?.includes('avena'),
  'la fila de extras funciona igual: el Latte pasa a avena',
);
await captura(page, 'editando-latte-cambiado-a-avena');

await page.locator('.ticket__foot .btn--action').click();
await page.waitForTimeout(800);

const trasCorregir = await page.evaluate(() => ({
  cabecera: document.querySelector('.barra__cols .ticket__head')?.textContent.trim(),
  toast: [...document.querySelectorAll('.toast')].pop()?.textContent.trim(),
  servidas: document.querySelector('.barra__count-value').textContent,
  primera: document.querySelector('.ultimos__frase')?.textContent.trim(),
  hora: document.querySelector('.ultimos__hora')?.textContent.trim(),
}));
linea(
  (trasCorregir.toast ?? '').includes('Pedido corregido') &&
    (trasCorregir.toast ?? '').includes('Deshacer'),
  `al servir avisa: «${trasCorregir.toast}»`,
);
linea(
  trasCorregir.servidas === servidasAntes,
  `el contador no se mueve: ${servidasAntes} antes y después`,
);
linea(
  trasCorregir.primera === 'Latte · avena' && trasCorregir.hora === laHora,
  `y en la lista está «${trasCorregir.primera}» con la hora de siempre (${trasCorregir.hora})`,
);
linea(
  (trasCorregir.cabecera ?? '').includes('Pedido actual'),
  'la cabecera vuelve a «Pedido actual»',
);
await captura(page, 'pedido-corregido-conserva-la-hora');

/* ---------- 5 bis. En el Resumen, el original sale «Corregido» ---------- */

await page.locator('.ultimos__vertodos').click();
await page.waitForSelector('#resumen-pedidos');
await page.waitForTimeout(700);

const enResumen = await page.evaluate((id) => {
  const li = document.querySelector(`#resumen-pedidos .pedido:has(+ *)`);
  void li;
  const filas = [...document.querySelectorAll('#resumen-pedidos .pedido')].map((el) => ({
    texto: el.textContent.trim(),
    anulado: el.classList.contains('is-anulado'),
    corregido: el.classList.contains('is-corregido'),
    tachado: getComputedStyle(el.querySelector('.pedido__linea')).textDecorationLine,
    motivo: el.querySelector('.pedido__motivo')?.textContent.trim() ?? '',
  }));
  return { filas, id };
}, idOriginal);

const corregido = enResumen.filas.find((f) => f.corregido);
const vivo = enResumen.filas.find((f) => !f.anulado && f.texto.includes('avena'));
linea(
  corregido !== undefined && corregido.motivo === 'Corregido',
  `el original sale como «${corregido?.motivo}», no como «Anulado»`,
);
linea(
  corregido?.tachado.includes('line-through') === true,
  'y tachado, que es lo que ya no cuenta',
);
linea(vivo !== undefined, `y el corregido está vivo: «${vivo?.texto.slice(0, 40)}»`);
await captura(page, 'resumen-original-corregido-tachado');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/* ---------- 5 ter. El consumo: sube la avena, baja la leche ---------- */

const avenaDespues = await consumoDe('avena');
const lecheDespues = await consumoDe('leche');
linea(
  avenaDespues - avenaAntes === 220,
  `el consumo de avena sube los 220 ml del Latte corregido: ${avenaAntes} → ${avenaDespues} ml`,
);
linea(
  lecheAntes - lecheDespues === 220,
  `y el de leche baja lo mismo: ${lecheAntes} → ${lecheDespues} ml`,
);

/* ---------- 6. Editar con el pedido actual lleno ---------- */

await toca(page, 'Cortado');
await page.waitForTimeout(250);
await abrir(page, 0);
const bloqueado = await page.evaluate(() => {
  const b = document.querySelector('.ultimos__editar');
  return {
    apagado: b.disabled,
    title: b.getAttribute('title'),
    aviso: document.querySelector('.ultimos__aviso')?.textContent.trim(),
  };
});
linea(bloqueado.apagado === true, '«Editar» está apagado con el pedido actual lleno');
linea(
  bloqueado.title === 'Sirve o vacía el pedido actual para editar' &&
    bloqueado.aviso === bloqueado.title,
  `y dice por qué, escrito donde se mira: «${bloqueado.aviso}»`,
);
await captura(page, 'editar-apagado-con-el-pedido-lleno');

/* ---------- 7. Servir con una fila abierta la cierra ---------- */

const antesDeServir = await page.locator('.ultimos__fila').first().getAttribute('data-pedido');
await page.locator('.ticket__foot .btn--action').click();
await page.waitForTimeout(800);

const trasServir = await page.evaluate((id) => ({
  paneles: document.querySelectorAll('.ultimos__panel').length,
  primera: document.querySelector('.ultimos__fila')?.getAttribute('data-pedido'),
  antes: id,
  frase: document.querySelector('.ultimos__frase')?.textContent.trim(),
}), antesDeServir);
linea(trasServir.paneles === 0, 'servir un pedido nuevo cierra la fila que estuviera abierta');
linea(
  trasServir.primera !== trasServir.antes && trasServir.frase === 'Cortado',
  `y el nuevo aparece arriba: «${trasServir.frase}»`,
);
await captura(page, 'servir-cierra-la-fila-abierta');

/* ---------- 8. Recargar a mitad de una corrección ---------- */

await abrir(page, 0);
await fila(page, 0).locator('.ultimos__editar').click();
await page.waitForTimeout(400);
const horaEnEdicion = (await page.evaluate(
  () => document.querySelector('.barra__cols .ticket__head')?.textContent.trim(),
))?.match(/\d{2}:\d{2}/)?.[0];

await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.barra__header');
await page.waitForTimeout(800);

const trasRecargar = await page.evaluate(() => ({
  cabecera: document.querySelector('.barra__cols .ticket__head')?.textContent.trim(),
  filas: document.querySelectorAll('.ticket__row').length,
  texto: document.querySelector('.ticket__row')?.textContent.trim(),
}));
linea(
  (trasRecargar.cabecera ?? '').includes(`Editando el pedido de ${horaEnEdicion}`),
  `tras recargar sigue «Editando el pedido de ${horaEnEdicion}»`,
);
linea(trasRecargar.filas >= 1, `con sus líneas: «${trasRecargar.texto?.slice(0, 30)}»`);
await captura(page, 'recargar-a-mitad-de-la-correccion');

// Se cancela para dejar la barra limpia.
await page.locator('.ticket__cancelar').click();
await page.waitForTimeout(400);

/* ---------- 8 bis. Nada de esto hace scroll de página ---------- */

await abrir(page, 0);
const medidas = await page.evaluate(() => {
  const lista = document.querySelector('.ultimos__lista');
  const fila = document.querySelector('.ultimos__fila.is-abierta');
  const caja = lista.getBoundingClientRect();
  const r = fila.getBoundingClientRect();
  const chicos = [...document.querySelectorAll('.ultimos button')]
    .filter((el) => !el.hasAttribute('disabled'))
    .map((el) => el.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0)
    .filter((b) => b.width < 44 || b.height < 44).length;
  const texto = [...document.querySelectorAll('.ultimos__panel *')]
    .map((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    .filter((px) => px > 0 && px < 15).length;
  return {
    chicos,
    texto,
    visible: r.top >= caja.top - 1 && r.top < caja.bottom,
    listaScroll: lista.scrollHeight > lista.clientHeight + 1,
    pagina:
      document.documentElement.scrollHeight > document.documentElement.clientHeight ||
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
linea(medidas.chicos === 0, `ningún control de la sección baja de 44 px (${medidas.chicos} fallos)`);
linea(medidas.texto === 0, `ningún texto de la fila desplegada baja de 15 px (${medidas.texto})`);
linea(medidas.visible, 'la fila abierta queda a la vista dentro de la lista');
linea(!medidas.pagina, 'y la página no hace scroll: el desbordamiento es de la lista');
await captura(page, 'fila-abierta-sin-scroll-de-pagina');

/* ---------- 8 ter. Modo noche ---------- */

await page.locator('.switch[aria-pressed]', { hasText: 'Noche' }).click();
await page.waitForTimeout(400);
linea(
  (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'night',
  'la fila desplegada se pinta también en modo noche',
);
await captura(page, 'fila-desplegada-en-modo-noche');
await page.locator('.switch[aria-pressed]', { hasText: 'Noche' }).click();
await page.waitForTimeout(300);

// Se cierra la fila antes de cambiar de orientación: si no, el toque de abajo
// la cerraría en vez de abrirla.
await abrir(page, 0);

/* ---------- 9. Vertical, dentro de la hoja del pedido ---------- */

await page.setViewportSize(VERTICAL);
await page.waitForTimeout(500);
console.log('\n=== Lo mismo a 820 × 1180 (vertical) ===\n');

await page.locator('.ticket-bar__label').click();
await page.waitForSelector('.ticket--sheet');
await page.waitForTimeout(400);

await page.locator('.ticket--sheet .ultimos__fila').first().locator('.ultimos__cabeza').click();
await page.waitForTimeout(400);

const enVertical = await page.evaluate(() => {
  const hoja = document.querySelector('.ticket--sheet');
  const panel = hoja?.querySelector('.ultimos__panel');
  const acciones = [...(panel?.querySelectorAll('.ultimos__acciones button') ?? [])].map((b) => ({
    texto: b.textContent.trim(),
    h: Math.round(b.getBoundingClientRect().height),
  }));
  return {
    dentro: panel !== null && panel !== undefined,
    acciones,
    scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
linea(enVertical.dentro, 'en vertical la fila también se despliega, dentro de la hoja del pedido');
linea(
  enVertical.acciones.length === 3 && enVertical.acciones.every((a) => a.h >= 44),
  `con sus tres acciones a 44 px: ${enVertical.acciones.map((a) => a.texto).join(' · ')}`,
);
linea(!enVertical.scrollX, 'y sin scroll horizontal de página');
await captura(page, 'vertical-fila-desplegada-en-la-hoja');

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
