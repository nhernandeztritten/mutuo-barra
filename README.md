# Mutuo · Barra

Cuaderno de barra para el iPad del coffee cart de Mutuo. Registra cada bebida
servida durante un evento **sin internet** y, al cerrar, devuelve qué se sirvió,
qué insumos se consumieron, qué stock queda y cuánto costó de verdad cada bebida.

No es un TPV: el 80 % de los eventos los paga el anfitrión, así que la acción
principal es **servir**, no cobrar. El cobro es un modo del evento.

- Qué es y para quién: [`PRODUCT.md`](PRODUCT.md)
- Dominio, carta, cálculos y técnica: [`docs/SPEC.md`](docs/SPEC.md)
- Tokens, tamaños y motion: [`DESIGN.md`](DESIGN.md)
- Plan de fases: [`docs/PLAN.md`](docs/PLAN.md)
- Decisiones tomadas al construir: [`docs/DECISIONES.md`](docs/DECISIONES.md)
- Sincronizar dos iPads (v2, sin construir): [`docs/SYNC.md`](docs/SYNC.md)

## Estado

**La app está completa de punta a punta y verificada**: se crea un evento con
su carga, se abre la barra, se sirve, se ve el resumen en vivo, se cierra con
recuento, se miran los resultados del evento y se comparan entre eventos, y la
carta y los insumos se editan sin tocar código.

El modo sin internet está **probado de verdad**, no supuesto: con la red
cortada la app carga, crea un evento, abre la barra, sirve y recupera los
pedidos tras recargar (`npm run verifica:pwa`). El contraste y los objetivos
táctiles se miden con scripts, no a ojo.

Lo único que queda es **publicarla**, que necesita una cuenta de Nicolas; los
dos caminos están abajo, en «Publicar».

El menú tiene tres entradas, por tarea:

| Sección | Ruta | Qué hay |
|---|---|---|
| Eventos | `/` | barra abierta, próximos y pasados; es la portada |
| Resultados | `/resultados` | tabla de eventos cerrados, comparativas, exportar e importar |
| Carta y ajustes | `/ajustes` | carta, insumos, dispositivo y «Cómo funciona» |

Un evento recorre siempre los mismos cuatro pasos, y en su pantalla se ve en
cuál está: **1 Preparar → 2 Servir → 3 Cerrar → 4 Resultados**.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173 (ya escucha en toda la red local)
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo, accesible desde la red local |
| `npm run build` | Construye `dist/` con el service worker |
| `npm run preview` | Sirve `dist/` como en producción |
| `npm test` | Tests del dominio, de la capa de datos y de la barra (vitest) |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm run icons` | Regenera los iconos PNG de la PWA |
| `npm run contraste` | Mide el contraste WCAG de cada par texto/fondo, en claro y en noche |
| `npm run verifica:ui` | Mide el grid, los objetivos táctiles y el scroll (necesita `preview`) |
| `npm run verifica:pwa` | Prueba la instalación y el modo sin red (necesita `preview`) |
| `npm run capturas` | Recorre la app entera y guarda las capturas (necesita `preview`) |

Las tres últimas hablan con la app construida:

```bash
npm run build && npm run preview &
npm run verifica:ui && npm run verifica:pwa && npm run capturas
```

## Probar en el iPad por red local

1. Mac e iPad en **la misma red wifi**.
2. En el Mac, arranca el servidor: `npm run dev`.
3. Averigua la IP del Mac: `ipconfig getifaddr en0` (ahora mismo `192.168.1.130`).
4. En Safari del iPad, abre `http://<IP-del-Mac>:5173` — por ejemplo
   `http://192.168.1.130:5173`.

Para probar la app tal como se verá en el evento, construida y con el service
worker activo: `npm run build && npm run preview` y abre el puerto **4173**.

> El service worker (y por tanto el modo offline y la instalación) necesita
> `https` o `localhost`. Por IP en la red local, `http://192.168.1.130:5173`
> sirve para probar la interfaz, pero **no** registra el service worker. Para
> ver el offline de verdad hace falta publicar la app.

## Publicar

Hay dos caminos. Los dos necesitan una cuenta de Nicolas, así que este paso no
se puede dejar hecho desde aquí.

### 1. Vercel (recomendado)

Es el corto y el que deja la app en la raíz del dominio.

1. Sube el repositorio a GitHub (privado sirve).
2. Entra en [vercel.com](https://vercel.com) → **Add New → Project** e importa
   el repositorio.
3. Framework: **Vite**. Build `npm run build`, salida `dist`. Sin variables de
   entorno.
4. **Deploy**. Vercel da una URL `https://…vercel.app`; esa es la que se abre en
   el iPad.

`vercel.json` ya lleva lo que hace falta: todas las direcciones caen en
`index.html` (si no, recargar `/resultados` daría un 404) y las cabeceras de
caché — `no-cache` para `index.html`, `sw.js` y el manifest, para que una
versión nueva se vea; un año e inmutable para `assets/`, que llevan el hash en
el nombre.

### 2. GitHub Pages

Sin cuenta de Vercel, con el repositorio en GitHub.

1. En GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Empuja a `main`. El flujo `.github/workflows/pages.yml` comprueba tipos,
   pasa los tests, construye y publica.
3. La app queda en `https://<usuario>.github.io/<repositorio>/`.

Aquí la app cuelga de una carpeta, no de la raíz, así que el flujo construye con
`VITE_BASE` puesto al nombre del repositorio: `vite.config.ts` lo usa para los
assets, el `start_url` y el `scope` del service worker, y `src/ui/navegar.ts`
para las rutas. Probado sirviendo la carpeta como lo hace Pages: navegación,
recarga directa de una ruta profunda y service worker, todo correcto.

## Instalar en el iPad

1. Abre la URL publicada **en Safari** (no en Chrome).
2. Toca **Compartir**, el cuadrado con la flecha hacia arriba.
3. Baja hasta **Añadir a pantalla de inicio** y confirma.
4. A partir de ahí, **abre siempre la app desde su icono**.

La primera vez hace falta internet, para que se descargue entera. Después
funciona con el iPad en modo avión.

Instalarla no es cosmético: la app arranca a pantalla completa y iPadOS deja de
tratar sus datos como desechables. Sin instalar y sin permiso de almacenamiento
persistente, Safari puede **borrar IndexedDB tras 7 días sin uso**, que es
justo el tiempo que pasa entre un evento y el siguiente. En **Carta y ajustes**
están el estado de instalación, el del almacenamiento y el botón de copia.

## Antes de la boda

Repaso corto la víspera, con el iPad delante:

- [ ] **Rellenar los costes que faltan.** Tónica, licor y sirope están a 0 € y
      marcados «sin costear»: mientras sigan así, el coste de un Espresso tonic
      y de un Cremaet está incompleto. Carta y ajustes → Insumos.
- [ ] **Revisar los precios si se va a vender.** Las 14 bebidas llevan precio
      provisional. Solo importa en los eventos en modo «venta»; si el anfitrión
      paga la tarifa, se pueden dejar como están.
- [ ] **Registrar la carga real.** Lo que sube de verdad al carro, no la
      sugerencia. Sin la carga del café, la barra no enseña cuánto queda.
- [ ] **Comprobar que la app está instalada** y que Ajustes dice «Protegido» en
      Almacenamiento.
- [ ] **Hacer una copia al cerrar.** Carta y ajustes → «Copia de seguridad
      ahora», o desde los resultados del evento. Es la red de seguridad.

## Cómo está montado

```
src/
  data/       modelo, semilla de la carta, Dexie y repositorio (todo el IndexedDB)
    types.ts    tipos de SPEC §2
    seed.ts     19 insumos, 14 productos, 3 grupos de modificadores
    db.ts       Dexie, initDb(), deviceId y almacenamiento persistente
    repo.ts     eventos, pedidos, exportar/importar JSON y CSV
  domain/     funciones puras, sin Dexie y sin DOM, con tests
    modifiers.ts  applyModifiers(): receta final, precio y coste de una bebida
    stats.ts      consumo, estadísticas del evento, cierre y sugerencia de carga
    format.ts     es-ES: «1,50 €», «3,25 kg», «47/h», 24 h
  styles/     tokens.css (claro y noche) y base.css
  ui/         componentes base: botón, chip, tile, input, hoja lateral, toast
  ui/         piezas compartidas: pasos del ciclo, gráficos SVG, archivos, orden
              navegar.ts    rutas con base configurable (raíz o carpeta)
              instalacion.ts  detectar y explicar la instalación en el iPad
  routes/     una pantalla por archivo
    eventos.tsx        portada: barra abierta, próximos, pasados
    evento-form.tsx    paso 1, datos y carga con sugerencia
    barra.tsx          paso 2, la pantalla caliente
    resumen.tsx        hoja lateral sobre la barra y página del evento
    cierre.tsx         paso 3, recuento, notas y resultado en vivo
    evento-detalle.tsx paso 4, resultados de un evento cerrado
    resultados.tsx     comparativa entre eventos, exportar e importar
    ajustes*.tsx       carta, insumos y dispositivo
  app.tsx     rutas de SPEC §5, navegación y aviso de versión nueva
scripts/
  contraste.mjs     ratio WCAG de cada par texto/fondo, leído de tokens.css
  verifica-ui.mjs   grid, objetivos táctiles, foco y scroll, con Playwright
  verifica-pwa.mjs  service worker, iconos y el recorrido completo sin red
  capturas.mjs      el recorrido de la app en capturas
```

Todo es **append-only con uuid y deviceId**: anular un pedido escribe `voidedAt`,
nunca borra la fila. Eso hace que la sincronización de la v2 sea una unión de
conjuntos sin conflictos.

## Copia de seguridad

La red de seguridad del evento es el **JSON completo** (`exportJson`), que se
puede volver a importar sin duplicar nada. Los CSV de líneas y de consumo salen
con `;` y coma decimal para abrirse en Numbers sin pelea.
