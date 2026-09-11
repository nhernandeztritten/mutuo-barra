# Mutuo · Barra — punto de partida para retomar

**Última sesión**: 11/09/2026 · **Evento real**: boda del 12/09/2026 (Nicolas la usa en su **iPhone 17 Pro**, no lleva iPad)
**Qué leer**: este archivo entero. Con esto se continúa sin conocer la conversación anterior.

---

## 1. Qué es

El **cuaderno de barra** del coffee cart de Mutuo (Valencia, Nicolas y su pareja). **No es un TPV.** Registra cada bebida servida en un evento, sin internet, y al cerrar da consumo real, coste por bebida y resultados comparables entre eventos.

Lo que Square no sabe: qué llevabas cargado, cuánto queda y cuánto costó de verdad cada bebida en *ese* evento. Lo que Cartpath/Flashquotes no tocan: lo que pasa **entre** que se abre y se cierra la barra.

**Cliente y datos de negocio**: `~/Projects/iamasters-os/clients/mutuo/` (escandallo, tarifa, vías de producción, competencia). La carta y los costes de esta app salen de ahí.

## 2. Dónde está

| | |
|---|---|
| Repo | `~/Projects/mutuo-barra` · rama **`feature/v1-barra`** (61+ commits) |
| `main` | **Intacta**, solo el commit inicial. No fusionar hasta que Nicolas lo pida |
| GitHub | https://github.com/nhernandeztritten/mutuo-barra (**público**, decisión suya del 11/09) |
| **Publicada** | **https://nhernandeztritten.github.io/mutuo-barra/** |
| Despliegue | GitHub Actions → Pages, automático en cada empujón a `feature/v1-barra` o `main` |
| Local para el iPad/iPhone | `npm run preview` (4173) y la IP del Mac; **ojo**: por http con IP no hay service worker, así que **no funciona offline** por esa vía |

## 3. Documentos que mandan (leer antes de tocar)

| Archivo | Qué contiene |
|---|---|
| `docs/SPEC.md` | Dominio, carta, modificadores, cálculos, pantallas |
| `DESIGN.md` | Paleta violeta de Mutuo, tamaños táctiles, motion, **prohibiciones** |
| `docs/UX-REVISION-1.md` | Por qué la navegación es como es. **Leer antes de tocarla** |
| `docs/DECISIONES.md` | 90+ decisiones fechadas. Respetarlas o discutirlas, no ignorarlas |
| `docs/capturas/fase-*/` | Capturas de verificación de cada fase |

## 4. Cómo está montado

Vite + Preact + TypeScript + `@preact/signals` + Dexie (IndexedDB) + `vite-plugin-pwa`. **Sin CDNs**: fuente Archivo autoalojada, todo tiene que funcionar offline. Tests con vitest + `fake-indexeddb`; verificación real con Playwright (`scripts/capturas*.mjs`, `verifica-ui.mjs`, `verifica-pwa.mjs`, `contraste.mjs`).

**Append-only**: anular un pedido pone `voidedAt`, nunca borra. Todo con uuid + deviceId, para que una sincronización futura sea unión de conjuntos.

```
npm run dev        # 5173, con --host
npm run preview    # 4173, la build, con --host
npm test           # 350 tests
npm run typecheck
npm run capturas   # recorrido completo en navegador real
```

## 5. Qué hace la app (estado a 11/09)

**Navegación**: tres entradas (`Eventos · Resultados · Carta y ajustes`) y un ciclo visible de cuatro pasos por evento: **1 Preparar → 2 Servir → 3 Cerrar → 4 Resultados**.

- **Preparar**: datos del evento, carga real con sugerencia por invitados, y bloque **Lotes** (litros de batch/cold brew → gramos de café y agua, que suman a la carga).
- **Servir (la barra)**: pestañas de categoría con «Todas» por defecto, grid de bebidas, **fila de extras contextual** (tocas la bebida y arriba salen *solo* sus extras), ticket, «Servir», deshacer 8 s, **modo Rápido** (cada toque sirve), modo **Noche**, **Resumen** en hoja lateral, **Últimos pedidos** con desplegar / Repetir / **Editar** / Anular.
- **Cerrar**: recuento de lo que queda («no contado» si no lo rellenas), notas, resultado en vivo.
- **Resultados**: tabla ordenable entre eventos, comparativas, exportar CSV/JSON e importar (idempotente por uuid).
- **Carta y ajustes**: editar carta y recetas, insumos y costes, **Métodos y ratios** (espresso 1:2, filtro 1:16, cold brew 1:10, infusión 1:100, matcha 1:80), dispositivo, copia de seguridad.

**Ratios**: la app compara cada receta con su ratio clásico y **avisa**, nunca reescribe (los costes del escandallo están medidos). Destapó que el Flat white no cabe en su vaso y que el té no tenía ingrediente.

## 6. Decisiones que esperan a Nicolas

1. **Flat white**: con doble dosis son 192 ml en un vaso de 180. ¿Bajar la leche a 108 ml o pasar al vaso de 10 oz (+0,035 €/bebida)?
2. **Insumos sin costear**: tónica, licor, hoja de té y pajita a 0 €. Cuatro bebidas con el coste incompleto.
3. **Precios provisionales**: los 14 precios son inventados; solo cuentan en modo venta.
4. **Extras por línea o por unidad**: hoy un extra se aplica a toda la línea agrupada («2 × Latte» → los dos con avena).
5. **Descafeinado**: se asume el mismo precio por kilo que el normal, sin verificar en factura.
6. **Hielo**: 120 g por bebida fría es estimación, no medida.

## 7. Trampas aprendidas (no volver a pisarlas)

- **`crypto.randomUUID` no existe por http con IP**: Safari y Chromium no lo exponen en contexto no seguro. Hay un generador propio en `src/data/uuid.ts`. Fue lo que dejó la app colgada en «Abriendo el cuaderno…».
- **El service worker solo se registra en https o localhost.** Por la IP del Mac nunca, así que **offline solo funciona con la app publicada e instalada**.
- **`launch.json` del navegador integrado** se busca en `~/Projects/.claude/`, no en el del proyecto.
- **Nicolas rechaza en bloque una interfaz con jerga interna**: ningún botón puede llevar a una pantalla vacía, ninguna etiqueta puede decir «Fase 3» ni «placeholder».
- **Nada de ventanas emergentes centradas en la barra.** Hojas laterales o desde abajo, sí.
- **Los tests del escandallo son intocables**: si una cifra cambia, se ha roto algo (Cortado 0,7428 €, Latte con avena 1,1444 €, Flat white 1,277 €, Americano 1,254 €).
- **Verificar en navegador, no solo en tests.** Varios fallos reales (medidor que no pintaba, ritmo a 0/h, toasts apilados) solo se vieron en capturas.

## 8. Método de trabajo

Fable/Opus **orquesta**, Opus **ejecuta**, **un agente por vez**. Cada fase termina con: `typecheck` + `test` + `build` en verde **y** verificación en navegador real con capturas, antes de abrir la siguiente. Commits temáticos en castellano. `main` intacta.

## 9. Para el evento de mañana

1. Abrir **https://nhernandeztritten.github.io/mutuo-barra/** en **Safari** del iPhone.
2. Compartir → **Añadir a pantalla de inicio**.
3. Abrir **siempre desde el icono**, nunca desde Safari.
4. Carta y ajustes → Almacenamiento debe decir **«Protegido»**; si no, «Pedir protección».
5. **Probarla hoy en casa con el modo avión encendido**, no mañana en la finca.
6. En Preparar, anotar la carga real (kilos de café, litros de leche) antes de salir.
7. Al terminar: cerrar la barra con el recuento y **«Copia de seguridad ahora»**.
