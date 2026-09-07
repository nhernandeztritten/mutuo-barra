/**
 * Mide el contraste WCAG de cada par texto/fondo que se usa de verdad en la
 * app, leyendo los valores de `src/styles/tokens.css` (no una copia a mano).
 *
 *   node scripts/contraste.mjs          → tabla y salida 1 si algo falla
 *   node scripts/contraste.mjs --json   → JSON para otro script
 *
 * Reglas: texto normal ≥ 4,5:1 · texto grande (≥ 24 px, o ≥ 18,66 px en negrita)
 * ≥ 3:1. Los pares con `alpha` (texto translúcido) o `elemAlpha` (elemento
 * entero atenuado, como un botón deshabilitado) se componen antes de medir,
 * porque lo que ve el ojo es el color ya mezclado.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');

/* ---------- Leer los tokens de cada tema ---------- */

function bloque(selector) {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`No encuentro ${selector} en tokens.css`);
  const abre = css.indexOf('{', i);
  const cierra = css.indexOf('\n}', abre);
  return css.slice(abre + 1, cierra);
}

function vars(texto) {
  const out = {};
  for (const [, name, value] of texto.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const claro = vars(bloque(':root {'));
const noche = { ...claro, ...vars(bloque("[data-theme='night']")) };

/* ---------- Color ---------- */

function resolve(token, tema) {
  let value = tema[token];
  if (value === undefined) throw new Error(`Token desconocido: ${token}`);
  let guard = 0;
  while (value.startsWith('var(') && guard++ < 5) {
    const inner = value.slice(4, value.lastIndexOf(')')).split(',')[0].trim();
    value = tema[inner] ?? value;
  }
  return value;
}

function toRgb(value) {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  const rgb = hex.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`No sé leer el color «${value}»`);
}

/** Composición alfa: `top` con opacidad `a` sobre `bottom`. */
const mix = (top, bottom, a) => top.map((c, i) => Math.round(c * a + bottom[i] * (1 - a)));

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- Los pares que existen en la pantalla ---------- */

/**
 * `grande`: el par se juzga con el umbral 3:1 porque el texto es ≥ 24 px o
 * ≥ 18,66 px en negrita. Todo lo demás va contra 4,5:1.
 */
const PARES = [
  // --- Barra: la pantalla que se lee a 75 cm ---
  { id: 'meta sobre el fondo', fg: '--ink-3', bg: '--bg', nota: '«sin recuento», pies de página' },
  { id: 'meta sobre superficie', fg: '--ink-3', bg: '--surface', nota: '«servidas», ritmo, precio del tile' },
  { id: 'texto del tile', fg: '--ink', bg: '--surface', nota: 'nombre de la bebida, 20 px' },
  { id: 'chip en reposo', fg: '--ink', bg: '--surface-2', nota: 'Avena, Desca…' },
  { id: 'chip armado', fg: '--accent-ink', bg: '--accent', nota: 'chip en violeta' },
  { id: 'subtítulo de Rápido', fg: '--ink-2', bg: '--surface', alpha: 0.8, nota: '13 px, opacidad 0,8' },
  { id: 'modificadores del ticket', fg: '--ink-3', bg: '--surface', nota: '«avena · doble», 15 px' },
  { id: 'cabecera del ticket', fg: '--ink', bg: '--surface-2', nota: '«Pedido actual (3)»' },
  { id: 'botón Servir', fg: '--primary-ink', bg: '--primary', nota: 'la acción de la barra' },
  {
    id: 'botón deshabilitado «Toca una bebida»',
    fg: '--ink-2',
    bg: '--surface-2',
    nota: 'sin opacidad: par de colores propio',
  },
  { id: 'botón fantasma deshabilitado', fg: '--ink-3', bg: '--surface', nota: '«Deshacer último»' },
  { id: 'interruptor apagado', fg: '--ink-2', bg: '--surface', nota: 'Noche, Rápido' },
  { id: 'encabezado de categoría', fg: '--ink-2', bg: '--bg', nota: 'leyenda del grid, 15 px' },
  { id: 'aviso «Sin carga registrada»', fg: '--warn', bg: '--surface', nota: 'contorno ámbar' },
  { id: 'medidor de café en ámbar', fg: '--warn', bg: '--surface', nota: '< 25 %' },
  { id: 'medidor de café en rojo', fg: '--danger', bg: '--surface', nota: '< 10 %' },
  { id: 'contador de la cabecera', fg: '--ink', bg: '--surface', grande: true, nota: '32 px' },
  { id: 'toast', fg: '--bg', bg: '--ink', nota: 'aviso con Deshacer' },
  // --- Fila desplegada de «Últimos pedidos» (fase 7) ---
  {
    id: 'bebida de la fila desplegada',
    fg: '--ink',
    bg: '--surface-2',
    nota: '«2 × Cortado», 18 px sobre el fondo de la fila abierta',
  },
  {
    id: 'extras de la fila desplegada',
    fg: '--ink-3',
    bg: '--surface-2',
    nota: '«avena · desca» y el «hace 3 min», 15 px',
  },
  {
    id: '«Anular» de la fila desplegada',
    fg: '--danger',
    bg: '--surface-2',
    nota: 'texto en rojo, la única acción que no se deshace tocando otra vez',
  },
  {
    id: 'cabecera del ticket corrigiendo',
    fg: '--accent-text',
    bg: '--accent-soft',
    nota: '«Editando el pedido de 09:54»',
  },
  // --- Resto de la app ---
  { id: 'cuerpo sobre el fondo', fg: '--ink', bg: '--bg' },
  { id: 'sección en versalitas', fg: '--ink-3', bg: '--bg', nota: '.section-title, 15 px' },
  { id: 'navegación inactiva', fg: '--ink-2', bg: '--surface' },
  { id: 'navegación activa', fg: '--primary-ink', bg: '--primary' },
  { id: 'enlace', fg: '--accent-text', bg: '--bg' },
  { id: 'enlace sobre superficie', fg: '--accent-text', bg: '--surface' },
  { id: 'etiqueta neutra', fg: '--ink-2', bg: '--surface-2', nota: '«Ejemplo», 13 px' },
  { id: 'etiqueta de acento', fg: '--accent-text', bg: '--accent-soft', nota: '«Protegido»' },
  { id: 'etiqueta de aviso', fg: '--warn', bg: '--bg', nota: '«Sin proteger»' },
  { id: 'desviación en rojo', fg: '--danger', bg: '--bg', nota: 'cierre y resultados' },
  { id: 'barra de progreso llena', fg: '--primary', bg: '--primary-soft', nota: 'no es texto: 3:1', grande: true },

  // Fase 8: las recetas clásicas por método. La marca «revisar» va sobre la
  // fila de la carta (`--surface`), no sobre el fondo; el aviso y su lectura
  // viven dentro de la hoja, que también es `--surface`.
  { id: 'marca «revisar» de la carta', fg: '--warn', bg: '--surface', nota: 'contorno ámbar, 15 px' },
  { id: 'texto de un aviso de receta', fg: '--ink', bg: '--surface', nota: '«192 ml no caben…», 16 px' },
  { id: 'lectura del ratio', fg: '--ink-2', bg: '--surface', nota: '«Ratio 1:16 · 200 ml piden 12,5 g», 16 px' },
  { id: 'punto ámbar del aviso', fg: '--warn', bg: '--surface', nota: 'no es texto: 3:1', grande: true },
  { id: 'cuenta de un lote', fg: '--ink-2', bg: '--bg', nota: '«4 L → 250 g de café», 15 px' },
  { id: 'campo de un ratio', fg: '--ink-2', bg: '--bg', nota: '«1 g de café por __ ml», 15 px' },
];

function medir(tema, nombreTema) {
  return PARES.map((par) => {
    const bajo = toRgb(resolve(par.bajo ?? '--bg', tema));
    const bg0 = toRgb(resolve(par.bg, tema));
    const fg0 = toRgb(resolve(par.fg, tema));
    const fgSobreBg = par.alpha ? mix(fg0, bg0, par.alpha) : fg0;
    const elem = par.elemAlpha ?? 1;
    const bg = elem < 1 ? mix(bg0, bajo, elem) : bg0;
    const fg = elem < 1 ? mix(fgSobreBg, bajo, elem) : fgSobreBg;
    const r = ratio(fg, bg);
    const minimo = par.grande ? 3 : 4.5;
    return {
      tema: nombreTema,
      id: par.id,
      fg: par.fg,
      bg: par.bg,
      ratio: Math.round(r * 100) / 100,
      minimo,
      pasa: r >= minimo,
      nota: par.nota ?? '',
    };
  });
}

const filas = [...medir(claro, 'claro'), ...medir(noche, 'noche')];
const fallan = filas.filter((f) => !f.pasa);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(filas, null, 2));
} else {
  for (const tema of ['claro', 'noche']) {
    console.log(`\n=== Tema ${tema} ===`);
    for (const f of filas.filter((x) => x.tema === tema)) {
      const marca = f.pasa ? 'OK  ' : 'FALLA';
      console.log(
        `${marca} ${String(f.ratio).padStart(6)}:1  (mín ${f.minimo})  ${f.id}` +
          (f.nota ? `  — ${f.nota}` : ''),
      );
    }
  }
  console.log(
    `\n${filas.length} pares medidos · ${fallan.length} por debajo del mínimo` +
      (fallan.length > 0 ? `: ${fallan.map((f) => `${f.tema}/${f.id}`).join(', ')}` : ''),
  );
}

process.exit(fallan.length > 0 ? 1 : 0);
