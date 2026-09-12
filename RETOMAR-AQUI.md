# Mutuo · Barra — punto de partida para retomar

**Última sesión**: 12/09/2026 (fase 13: la tira tiene dos estados) · **Evento real**: boda del 12/09/2026 (Nicolas la usa en su **iPhone 17 Pro**, no lleva iPad)
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
| `docs/UX-REVISION-2.md` | Auditoría de coherencia del 11/09: los 18 hallazgos, qué se arregló y **qué se dejó para después del evento** |
| `docs/DECISIONES.md` | **128** decisiones fechadas. Respetarlas o discutirlas, no ignorarlas. Las 123-128 son las de la fase 13 |
| `docs/capturas/fase-*/` | Capturas de verificación de cada fase |

## 4. Cómo está montado

Vite + Preact + TypeScript + `@preact/signals` + Dexie (IndexedDB) + `vite-plugin-pwa`. **Sin CDNs**: fuente Archivo autoalojada, todo tiene que funcionar offline. Tests con vitest + `fake-indexeddb`; verificación real con Playwright (`scripts/capturas*.mjs`, `verifica-ui.mjs`, `verifica-pwa.mjs`, `contraste.mjs`).

**Append-only**: anular un pedido pone `voidedAt`, nunca borra. Todo con uuid + deviceId, para que una sincronización futura sea unión de conjuntos.

```
npm run dev        # 5173, con --host
npm run preview    # 4173, la build, con --host
npm test           # 462 tests
npm run typecheck
npm run capturas            # recorrido completo en navegador real (1180 y 820)
npm run capturas:movil      # el iPhone: 402, 393 y 375
npm run capturas:auditoria  # la fase 10: 402 × 874 + los dos giros del iPad
npm run capturas:peticiones # la fase 11: 402 × 874 y 402 × 781 + el iPad
npm run capturas:pedido     # la fase 12: la tira del pedido y salir de la hoja
npm run capturas:servidos   # la fase 13: los dos estados de la tira
```

## 5. Qué hace la app (estado a 12/09)

**Navegación**: tres entradas (`Eventos · Resultados · Carta y ajustes`) y un ciclo visible de cuatro pasos por evento: **1 Preparar → 2 Servir → 3 Cerrar → 4 Resultados**.

- **Preparar**: datos del evento, carga real con sugerencia por invitados, y bloque **Lotes** (litros de batch/cold brew → gramos de café y agua, que suman a la carga).
- **Servir (la barra)**: sin la **Tapa** (decisión del 11/09: se retiró de la carta; los tres insumos siguen en Ajustes sin contarse, y los pedidos viejos conservan su línea). Se puede **pausar y reanudar el servicio** sin cerrar el evento (bodas a dos turnos); el tiempo en pausa no cuenta en la duración. pestañas de categoría con «Todas» por defecto, grid de bebidas, **fila de extras contextual** (tocas la bebida y arriba salen *solo* sus extras), ticket, **tira de dos estados** sobre la barra en el móvil —«Pedido actual» y «Ya servidos»— (fases 12 y 13), «Servir», deshacer 8 s, **modo Rápido** (cada toque sirve), modo **Noche**, **Resumen** en hoja lateral (también tocando la cifra de **servidas** de la cabecera), **Últimos pedidos** con desplegar / Repetir / **Editar** / Anular, y **«Empezar de cero»** con doble validación (panel + mantener pulsado 1,5 s) y su «Deshacer».
- **Cerrar**: recuento de lo que queda («no contado» si no lo rellenas), notas, resultado en vivo.
- **Resultados**: tabla ordenable entre eventos, comparativas, exportar CSV/JSON e importar (idempotente por uuid).
- **Carta y ajustes**: editar carta y recetas, insumos y costes, **Métodos y ratios** (espresso 1:2, filtro 1:16, cold brew 1:10, infusión 1:100, matcha 1:80), dispositivo, copia de seguridad.

**Ratios**: la app compara cada receta con su ratio clásico y **avisa**, nunca reescribe (los costes del escandallo están medidos). Destapó que el Flat white no cabe en su vaso y que el té no tenía ingrediente.

## 5 bis. Móvil (11/09, ampliado el 12/09)

Corte en **560 px**. En iPhone: menú sin desplazar («Ajustes»), cabecera de una fila con **«Más»** (hoja desde abajo: Rápido, Noche, Resumen, Pausar, Cerrar barra), **grid de 3 columnas** con las 14 bebidas visibles **sin scroll**, y el pedido como barra fija abajo. Medido: holgura +165 px a 402×874 y +72 px con safe areas simuladas.

**Fase 11 (12/09), lo que Nicolas pidió después de probarla**:

- **Extras en dos filas, todos a la vista**, sin desplazar a lo ancho. El nombre de la bebida sale de la fila y pasa a un rótulo de una línea encima («Extras de: **Latte**»); debajo, la leche arriba y Desca · Doble · Iced · Sirope abajo, en chips de 44 px y 16 px de letra.
- **La barra de abajo enseña el último pedido servido** cuando el pedido actual está vacío, y tocarla lo abre desplegado en «Últimos pedidos». **Cambiado en la fase 13**: eso lo cuenta ahora la tira y la barra vuelve a «Pedido actual (0)»; el texto queda de recurso.
- **El contador de «servidas» es tocable** y abre el histórico entero (Resumen → Pedidos). En los dos aparatos.
- **El aviso «Deshacer» cabe en una línea** de 44 px y cola máxima de dos. En el iPad, como estaba.
- **«Empezar de cero»**: última fila de la hoja «Más» y de la tarjeta de la barra abierta en el iPad, con panel + mantener pulsado 1,5 s + «Deshacer» de 8 s. No borra nada: `voidReason: 'reinicio'`.

**Fase 12 (12/09), lo que pidió después de la fase 11**:

- **La tira del pedido en curso**, en el hueco que sobraba entre el grid y la barra del pedido: las líneas del pedido actual en el orden de la hoja, en filas de 44 px, con la cantidad delante, los extras en gris y una **«×»** que quita la línea con su «Deshacer» de 8 s. Tocar el nombre la hace la bebida actual. Vacía, no se dibuja.
- **Cuántas filas se ven lo mide el navegador** (`src/ui/tira.tsx` + el efecto de `barra.tsx`): ranuras de 45 px sobre el hueco real, **menos los 14 px del rótulo** desde la fase 13. En «Pedido actual» siguen siendo **2 filas a 402 × 874 y 1 a 402 × 781**. Con más líneas, la lista se desplaza dentro de sí misma y encima sale «+N más · ver todo», que ocupa una ranura (con una sola no sale).
- **Salir de la hoja**: cabecera pegada arriba con el título y la «X» siempre a la vista en las tres hojas, **asa** de 4 px y **deslizar hacia abajo 80 px para cerrar** en el móvil. Escape, el fondo y el foco, igual que antes.

## 5 ter. Fase 13 (12/09), lo que pidió después de la fase 12

> «Una vez realizado el pedido, me gustaría que se viera directamente dónde se iban acumulando los pedidos. De forma que si me olvido de algo, a simple vista pueda repasarlo. Como arribita de donde sale hacer pedido, que queda un espacio.»

- **La tira tiene dos estados** y **siempre dice cuál enseña**, con un rótulo de 15 px encima, en el mismo sitio y del mismo tamaño: **«Pedido actual»** (la fase 12, sin tocar) y **«Ya servidos»** (los pedidos ya servidos, con el pedido vacío). El color acompaña pero no manda: el vivo es tarjeta blanca con texto en tinta, la historia no es tarjeta —fondo de página con un filo de 1 px— y el texto en `--ink-2`.
- **«Ya servidos»**: la hora delante en tabular, la frase del pedido detrás, el más reciente abajo, **sin «×»** —anular es destructivo y se queda en la hoja—, y tocar una fila abre ese pedido desplegado. Con más pedidos que filas, «+N más · ver todo».
- **La barra de abajo deja de repetir el último pedido**: vuelve a «Pedido actual (0)» / «Toca una bebida». El texto «Último · 12:41 · …» queda de recurso para una pantalla donde la tira no quepa (por debajo de 58 px de hueco), y «Sin pedidos todavía» para cuando no hay nada servido.
- **El presupuesto no es el mismo en los dos estados** y esto es lo que hay que saber antes de tocar nada: con el pedido vacío el **bloque de extras se repliega** (104 px → 0), así que «Ya servidos» tiene **211 px a 402 × 874 y 170 a 402 × 781**, mientras «Pedido actual» tiene **103 y 62**. Por eso servidos enseña tres filas y el pedido una o dos.
- **El rótulo cuesta 14 px de caja para 15 px de letra, y catorce es una cifra medida**: con 20 la tira se quedaría en una fila a 874 y se pasaría 2 px del hueco a 781. Para que cupiera, **la tira dejó de pagar hueco de columna** (margen negativo de `--work-gap`; su rótulo hace de separación) y el efecto que mide ya no resta la separación.
- **Modo Rápido**: sigue sin dibujarse ninguno de los dos estados. La propuesta de llevar «Ya servidos» a Rápido está en `docs/UX-REVISION-2.md` §G, con lo que habría que medir antes.

**Límite conocido, y lo que se gastó para la tira**: con las **14 bebidas** de hoy, el caso apretado es **«Pedido actual» con dos líneas a 402 × 874: 0 px de holgura** (tira de 103 px en 103 de hueco, el rótulo pegado a la última fila de bebidas). A 402 × 781 quedan 4 px. En «Ya servidos» sobran 19 y 23 px con la tira llena. Para que cupiera, el corte de las pantallas bajas subió de 750 a **820 px** —así que el iPhone instalado va con **tiles de 72 px**, el primer recurso que estaba previsto— y el grid dejó de reservar 8 px de cola de desplazamiento en el móvil. **No ampliar la carta ni engordar el rótulo sin volver a medir con `npm run capturas:pedido` y `npm run capturas:servidos`**: el siguiente recurso ya no es el tile, es la carta.

**Sin verificar**: `env(safe-area-inset-*)` reales, `display: standalone` y Safari de verdad. Todo es Chromium con emulación.

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
- **La cabecera de la barra no cabe a 1024 × 768** («Cerrar barra» acaba en 1108 px de 1024). Viene de antes; está en `UX-REVISION-2`, «Para después del evento». A 1180 × 820 cabe con 16 px de sobra.
- **Los tests del escandallo son intocables**: si una cifra cambia, se ha roto algo (Cortado 0,7428 €, Latte con avena 1,1444 €, Flat white 1,277 €, Americano 1,254 €).
- **Verificar en navegador, no solo en tests.** Varios fallos reales (medidor que no pintaba, ritmo a 0/h, toasts apilados) solo se vieron en capturas. En la fase 11, dos más: «Cancelar» del panel de reinicio caía por debajo del borde de la hoja, y el relleno del botón de mantener pulsado bajaba el rojo a 4,47:1 en noche. Ninguno de los dos lo ve un test.
- **Tocar la cabecera de la barra cuesta píxeles.** A 1024 × 768 ya no cabe (1108 px de 1024, medido en cada pasada). Al hacer tocable el contador, su relleno la hacía crecer 16 px: se compensa con margen negativo. Cualquier cosa que se añada ahí tiene que medirse a 1024.
- **`position: sticky` con `top: 0` no se pega al borde de una hoja con relleno.** Medido: la cabecera quedaba 24 px por debajo y por ese hueco asomaba el contenido que pasaba por detrás. Se pega con el relleno en negativo (`inset-block-start: calc(var(--hoja-arriba) * -1)`), y el margen negativo con su relleno del mismo tamaño es lo que hace que tape también el relleno de la hoja.
- **jsdom no tiene `PointerEvent`**, y `fireEvent.pointerDown` ni siquiera llega a despacharlo: en `movil.test.tsx` el gesto de cerrar se manda a mano con un `Event` y sus propiedades encima. Tampoco hay `ResizeObserver` ni captura de puntero: el código los llama con guarda.
- **Un aviso de 3 s puede durar 4,5 en Playwright.** Un `querySelector('.toast')` coge el primero de la cola, que puede ser uno viejo. Buscar el aviso por su texto, no por su posición.
- **`scrollHeight` nunca baja de `clientHeight`.** Medir la holgura de un contenedor con scroll restando esos dos da cero siempre, diga lo que diga el diseño. Se mide contra el borde inferior del último hijo.
- **En Playwright, `page.mouse` no desplaza la página.** Una caja medida hace dos segundos dentro de una hoja que se desplaza ya no está donde estaba, y la pulsación cae en el aire — con la prueba pasando en verde. `scripts/capturas-fase-11.mjs` vuelve a medir antes de cada pulsación y comprueba que el botón se entera (`.is-pulsando`).

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
