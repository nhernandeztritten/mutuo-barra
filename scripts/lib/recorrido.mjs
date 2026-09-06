/**
 * Piezas compartidas por los scripts de verificación: abrir el navegador,
 * crear un evento con carga y llegar a la barra. Todo por la interfaz, sin
 * tocar IndexedDB por debajo: lo que se comprueba es lo que hace el barista.
 */
import { chromium } from 'playwright';

export const BASE = process.env['BASE'] ?? 'http://localhost:4173';

/** iPad 10.ª gen en horizontal, la referencia de DESIGN.md. */
export const HORIZONTAL = { width: 1180, height: 820 };
export const VERTICAL = { width: 820, height: 1180 };

export async function abrirNavegador({ viewport = HORIZONTAL, offline = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    deviceScaleFactor: 2,
    offline,
  });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.errores = errores;
  return { browser, context, page };
}

/** Espera a que el shell haya abierto la base y pintado la ruta. */
export async function irA(page, ruta = '/') {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.body.textContent?.includes('Abriendo el cuaderno'));
  await page.waitForTimeout(150);
}

/** Crea un evento con su carga y lo deja en «Preparar». Devuelve su id. */
export async function crearEvento(page, { nombre = 'Boda Ana y Marc', invitados = '120' } = {}) {
  await irA(page, '/evento/nuevo');
  await page.fill('#ev-nombre', nombre);
  await page.fill('#ev-lugar', 'Finca La Alquería, Valencia');
  await page.fill('#ev-invitados', invitados);
  await page.getByRole('button', { name: 'Usar todas las sugerencias' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  // La portada, no una URL concreta: publicada en carpeta la raíz no lleva
  // barra final y `waitForURL` con la barra no llegaría nunca.
  await page.waitForSelector('.eventos');
  return nombre;
}

/** Desde Eventos, abre la barra del primer evento próximo. */
export async function abrirBarra(page) {
  await page.getByRole('button', { name: 'Abrir barra' }).first().click();
  await page.waitForSelector('.barra__header', { timeout: 5000 });
  await page.waitForSelector('.tile-grid .tile');
}

/** Sirve un pedido tocando tiles por su nombre corto y pulsando el botón grande. */
export async function servir(page, nombres) {
  for (const nombre of nombres) {
    await page.locator('.tile-grid .tile', { hasText: new RegExp(`^${nombre}`) }).first().click();
  }
  await page.locator('.ticket .btn--action').click();
  await page.waitForTimeout(400);
}

export function tabla(filas) {
  return filas.map((f) => `  ${f}`).join('\n');
}
