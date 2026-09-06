/**
 * La prueba que de verdad importa: que el iPad registre bebidas con la red
 * cortada. Corre sobre la app construida y servida como en producción.
 *
 *   npm run build && npm run preview &
 *   node scripts/verifica-pwa.mjs
 *
 * 1. El manifest y los iconos se sirven con 200.
 * 2. El service worker se registra y queda activo.
 * 3. Con la red cortada: recarga, crea un evento, abre la barra y sirve.
 * 4. `navigator.storage.persisted()` contesta y Ajustes enseña lo mismo.
 *
 * Guarda las capturas de la prueba en `docs/capturas/fase-4/`.
 */
import { mkdirSync } from 'node:fs';
import { BASE, HORIZONTAL, abrirBarra, abrirNavegador, crearEvento, irA } from './lib/recorrido.mjs';

const CAPTURAS = 'docs/capturas/fase-4';
mkdirSync(CAPTURAS, { recursive: true });

const fallos = [];
const linea = (ok, texto) => {
  if (!ok) fallos.push(texto);
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${texto}`);
};

const { browser, context, page } = await abrirNavegador({ viewport: HORIZONTAL });

console.log(`\n=== PWA sobre ${BASE} ===\n`);

/* ---------- 1. Manifest e iconos ---------- */

const RECURSOS = [
  '/manifest.webmanifest',
  '/sw.js',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/favicon-32.png',
];
for (const ruta of RECURSOS) {
  const res = await page.request.get(`${BASE}${ruta}`);
  linea(res.status() === 200, `${ruta} responde ${res.status()}`);
}

const manifest = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
linea(manifest.name === 'Mutuo · Barra', `el manifest se llama «${manifest.name}»`);
linea(manifest.display === 'standalone', `display: ${manifest.display}`);
linea(manifest.start_url === '/', `start_url: ${manifest.start_url}`);
linea(manifest.icons.length >= 3, `${manifest.icons.length} iconos declarados`);

/* ---------- 2. Service worker ---------- */

await irA(page, '/');
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return {
    activo: reg.active !== null,
    estado: reg.active?.state ?? null,
    scope: reg.scope,
    script: reg.active?.scriptURL ?? null,
  };
});
linea(sw.activo, `el service worker está activo (${sw.estado}) en ${sw.scope}`);

const cabeza = await page.evaluate(() => ({
  title: document.title,
  manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
  appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
}));
linea(cabeza.title === 'Mutuo · Barra', `<title>: «${cabeza.title}»`);
linea(cabeza.manifest !== null, `<link rel="manifest"> apunta a ${cabeza.manifest}`);
linea(
  cabeza.appleIcon === '/icons/apple-touch-icon.png',
  `apple-touch-icon: ${cabeza.appleIcon}`,
);
linea(cabeza.themeColor === '#f5f4f3', `theme-color en claro: ${cabeza.themeColor}`);

// El color del cromo tiene que seguir al interruptor «Noche», no al sistema.
await page.evaluate(() => {
  const boton = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Noche'),
  );
  boton?.click();
});
await irA(page, '/ajustes');
await page.evaluate(() => {
  const boton = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().endsWith('Noche'),
  );
  boton?.click();
});
await page.waitForTimeout(300);
const noche = await page.evaluate(() => ({
  tema: document.documentElement.dataset.theme,
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
}));
linea(
  noche.tema === 'night' && noche.themeColor === '#1c1c1b',
  `theme-color en noche: ${noche.themeColor}`,
);
await page.screenshot({ path: `${CAPTURAS}/40-ajustes-en-noche.png` });

// La sección de instalación, a la que lleva «Cómo hacerlo» del aviso de Eventos.
await irA(page, '/ajustes#instalar');
await page.waitForTimeout(400);
const scrolled = await page.evaluate(() => {
  const el = document.getElementById('instalar');
  const main = document.querySelector('.shell__main');
  return el && main ? el.getBoundingClientRect().top < main.getBoundingClientRect().bottom : false;
});
linea(scrolled, '«/ajustes#instalar» deja la sección de instalación a la vista');
await page.screenshot({ path: `${CAPTURAS}/45-ajustes-instalar-en-el-ipad.png` });

// Y vuelta a claro para el resto de la prueba.
await page.evaluate(() => {
  const boton = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().endsWith('Noche'),
  );
  boton?.click();
});
await page.waitForTimeout(200);

/* ---------- 3. Almacenamiento persistente ---------- */

const almacenamiento = await page.evaluate(async () => ({
  persisted: await navigator.storage.persisted(),
  estimate: (await navigator.storage.estimate()).usage ?? null,
}));
const etiqueta = await page.evaluate(
  () => document.querySelector('.card .etiqueta')?.textContent?.trim() ?? null,
);
linea(
  typeof almacenamiento.persisted === 'boolean',
  `navigator.storage.persisted() = ${almacenamiento.persisted}`,
);
linea(
  (almacenamiento.persisted && etiqueta === 'Protegido') ||
    (!almacenamiento.persisted && etiqueta === 'Sin proteger'),
  `Ajustes enseña «${etiqueta}» y el navegador dice ${almacenamiento.persisted}`,
);

const estadoInstalacion = await page.evaluate(
  () => document.querySelector('#instalar .event-row__name')?.textContent?.trim() ?? null,
);
linea(
  estadoInstalacion === 'Abierta en Safari',
  `estado de instalación en el navegador de la prueba: «${estadoInstalacion}»`,
);

/* ---------- 4. Sin red ---------- */

console.log('\n--- Red cortada ---');
await context.setOffline(true);
linea(
  await page.evaluate(() => !navigator.onLine),
  'el navegador se declara sin conexión',
);

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.body.textContent?.includes('Abriendo el cuaderno'));
await irA(page, '/');
linea(
  (await page.locator('h1.display').first().textContent()) === 'Eventos',
  'la app carga sin red y enseña Eventos',
);
await page.screenshot({ path: `${CAPTURAS}/41-sin-red-carga-la-app.png` });

await crearEvento(page, { nombre: 'Boda sin red', invitados: '90' });
linea(
  (await page.locator('.event-row__name', { hasText: 'Boda sin red' }).count()) > 0,
  'sin red se crea un evento con su carga',
);

await abrirBarra(page);
linea((await page.locator('.tile-grid .tile').count()) === 14, 'sin red se abre la barra entera');
await page.screenshot({ path: `${CAPTURAS}/42-sin-red-barra-abierta.png` });

await page.locator('.tile-grid .tile', { hasText: /^Cortado/ }).first().click();
await page.locator('.tile-grid .tile', { hasText: /^Latte/ }).first().click();
await page.locator('.ticket .btn--action').click();
await page.waitForTimeout(600);
const servidas = await page.locator('.barra__count-value').textContent();
linea(servidas?.trim() === '2', `sin red se sirven bebidas y el contador dice ${servidas?.trim()}`);
await page.screenshot({ path: `${CAPTURAS}/43-sin-red-dos-bebidas-servidas.png` });

// Y sobreviven a una recarga con la red todavía cortada.
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.barra__count-value');
await page.waitForTimeout(400);
const trasRecarga = await page.locator('.barra__count-value').textContent();
linea(
  trasRecarga?.trim() === '2',
  `tras recargar sin red las bebidas siguen ahí (${trasRecarga?.trim()})`,
);
await page.screenshot({ path: `${CAPTURAS}/44-sin-red-tras-recargar.png` });

/* ---------- 5. Vuelta a la red ---------- */

console.log('\n--- Red de vuelta ---');
await context.setOffline(false);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.barra__count-value');
linea(
  (await page.locator('.barra__count-value').textContent())?.trim() === '2',
  'con la red de vuelta no se ha perdido nada',
);

const errores = page.errores.filter((e) => !e.includes('favicon'));
linea(errores.length === 0, `sin errores de consola${errores.length ? `: ${errores.join(' · ')}` : ''}`);

await browser.close();

console.log(`\n${fallos.length === 0 ? 'Todo en verde.' : `${fallos.length} comprobaciones en rojo.`}`);
console.log(`Capturas en ${CAPTURAS}/`);
process.exit(fallos.length === 0 ? 0 : 1);
