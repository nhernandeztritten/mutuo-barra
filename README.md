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

## Estado

**La app está completa de punta a punta**: se crea un evento con su carga, se
abre la barra, se sirve, se ve el resumen en vivo, se cierra con recuento, se
miran los resultados del evento y se comparan entre eventos, y la carta y los
insumos se editan sin tocar código. Quedan para el final el pulido, la
instalación en el iPad y el despliegue.

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
| `npm test` | Tests del dominio y de la capa de datos (vitest) |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm run icons` | Regenera los iconos PNG de la PWA |

## Probar en el iPad por red local

1. Mac e iPad en **la misma red wifi**.
2. En el Mac, arranca el servidor: `npm run dev`.
3. Averigua la IP del Mac: `ipconfig getifaddr en0` (ahora mismo `192.168.1.130`).
4. En Safari del iPad, abre `http://<IP-del-Mac>:5173` — por ejemplo
   `http://192.168.1.130:5173`.

Para probar la app tal como se verá en el evento, construida y con el service
worker activo: `npm run build && npm run preview` y abre el puerto **4173**.

### Instalar en la pantalla de inicio

En Safari: **Compartir → Añadir a pantalla de inicio**. Importa hacerlo, no es
cosmético: instalada, la app arranca a pantalla completa y iPadOS deja de
considerar sus datos desechables. Sin instalar y sin permiso de almacenamiento
persistente, Safari puede **borrar IndexedDB tras 7 días sin uso**.

> El service worker (y por tanto el modo offline y la instalación) necesita
> `https` o `localhost`. Por IP en la red local, `http://192.168.1.130:5173`
> sirve para probar la interfaz, pero **no** registra el service worker. El
> offline real se verifica con el despliegue.

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
```

Todo es **append-only con uuid y deviceId**: anular un pedido escribe `voidedAt`,
nunca borra la fila. Eso hace que la sincronización de la v2 sea una unión de
conjuntos sin conflictos.

## Copia de seguridad

La red de seguridad del evento es el **JSON completo** (`exportJson`), que se
puede volver a importar sin duplicar nada. Los CSV de líneas y de consumo salen
con `;` y coma decimal para abrirse en Numbers sin pelea.
