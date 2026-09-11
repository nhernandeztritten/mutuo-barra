# DESIGN.md — Mutuo · Barra

## Escena
Barista bajo una carpa, de 18:00 con sol lateral a 23:00 con guirnaldas cálidas. iPad en soporte a 60-75 cm, manos mojadas, cola de seis personas, cinco segundos por interacción. **Tema claro de alto contraste por defecto; modo noche manual** para cuando la pantalla es lo más brillante del recinto.

## Registro
Producto (herramienta). El diseño sirve a la velocidad y a la lectura a distancia. Nada decorativo en la pantalla de barra.

## Identidad
Marca cerrada de Mutuo, variante violeta (nunca la naranja). Wordmark «MUTUO.» en la cabecera, 20 px de alto, tinta.

## Color (tokens, OKLCH con equivalencia hex de marca)
Claro:
- `--bg` hueso #f5f4f3 · `--surface` #ffffff · `--surface-2` arena #dfd6cb (chips en reposo, cabecera del ticket)
- `--ink` tinta #262625 · `--ink-2` #4a4845 · `--ink-3` #5f5c57 (mínimo para texto, 4,5:1 sobre hueso) · `--line` #e4dfd8
- `--primary` petróleo #005f5a (Servir/Cobrar, pestaña activa) · `--primary-ink` #ffffff
- `--accent` violeta #715aff (extra puesto, foco, selección) · `--accent-ink` #ffffff · `--accent-text` #6248f5 (violeta sobre claro, 4,5:1)
- `--warn` #b3541e · `--danger` #a3271c · `--ok` = primary
Noche:
- `--bg` #1c1c1b · `--surface` #262625 · `--surface-2` #33322f · `--ink` #f0efed · `--ink-2` #cfcbc4 · `--ink-3` #aaa59d · `--line` #3d3b38
- `--primary` #2a8f88 (petróleo aclarado para 4,5:1 con texto blanco no, con texto #0e1a19: usar `--primary-ink` #0b1615) · `--accent` #9d8bff · `--accent-text` #b6a8ff · `--warn` #e08a4a · `--danger` #ec8a7e (aclarado desde #e2695c: en rojo sobre `--surface-2` —«Anular» de la fila desplegada— el anterior se quedaba en 3,91:1)

Color por categoría (punto de 10 px en el tile y subrayado de la pestaña): Espresso tinta · Con leche arena oscura #b9a98f · Filtro petróleo · Fríos #3f7fc8 · Especiales violeta · Otros gris #808080. Solo acento; el fondo del tile es siempre `--surface`.

Estrategia: **restringida**. Un color de acción (petróleo), un color de estado puesto (violeta). Todo lo demás neutro.

## Tipografía
Archivo (autoalojada), una sola familia:
- Display (contadores de cabecera, resultado de cierre): 300, 32-40 px, tracking −0,02em, tabular.
- Tile de producto: 500, 20 px, dos líneas máximo, `text-wrap: balance`.
- Chip: 500, 17 px. Línea de ticket: 500, 18 px; modificadores 400, 15 px `--ink-3`.
- Botón principal: 600, 22 px. Cuerpo: 400, 16-17 px, line-height 1,5.
- Nunca por debajo de 15 px en la barra; 14 px permitido solo en tablas del panel.

## Espaciado y tamaños
Escala 4 px. Tiles 96 px de alto mínimo, chips 56 px, botón principal 72 px, filas del ticket 56 px, controles +/−, «Más» y segmentos de leche 44 × 44 con 8 px de separación. Radio 12 px en tiles y chips, 16 px en hojas, 999 en chips-píldora. Bordes 1 px `--line`; sombra solo en hojas y toasts (`0 8px 24px rgb(0 0 0 / .12)`).

## Fila de extras
Encima del grid, 56 px, la misma altura y el mismo sitio que ocupaban los chips. Enseña **los extras de la última bebida tocada**, no un prefijo: a la izquierda el nombre de la bebida en 500, y a su derecha solo los extras que esa bebida admite. La leche es un segmento de opción única (los tres segmentos ≥ 44 px); el café, un interruptor «Desca»; los extras, interruptores. El extra puesto va en violeta `--accent`. La fila se desplaza a lo ancho si no cabe; nunca la página. La línea actual del ticket se marca con fondo `--surface-2` y el nombre en 600 — **nunca con una franja lateral de color**.

## Layout de la barra
Horizontal ≥ 1000 px: dos columnas `minmax(0, 1fr) 360px`, cabecera 64 px, sin scroll de página. Vertical o < 1000 px: una columna, ticket como barra inferior de 72 px que se despliega en hoja.
Safe areas: `padding: env(safe-area-inset-*)` en cabecera y barra inferior.

## Móvil: el punto de corte es 560 px
Por debajo de **560 px** (`@media (max-width: 560px)`) la app se dibuja para **una mano**, no para un iPad en su soporte. El iPad está en 1180 × 820 y en 820 × 1180, los dos por encima del corte, así que su disposición no cambia. **Vertical es el modo real**: nadie gira el móvil detrás de una barra con una jarra en la mano; horizontal tiene que ser usable, pero no está optimizado.

Qué cambia:
- **Menú**: wordmark a 16 px y las tres entradas a 15 px, con «Carta y ajustes» acortado a «**Ajustes**». Las tres caben enteras hasta a 375 px; no hay nada que desplazar.
- **Cabecera de la barra**: **una sola fila de 56 px** + safe area. De izquierda a derecha: `‹` (solo el chevrón, con `aria-label` «Volver a Eventos»), el nombre del evento truncado con `title`, las bebidas servidas en 24 px tabulares, el medidor de café reducido a una barra de 28 px y su porcentaje, y **«Más»**. El ritmo de la última hora y los cuatro pasos del evento no caben y se van: el ritmo, a la hoja «Más»; los pasos, a las pantallas donde se miran.
- **«Más»** abre una **hoja desde abajo** (`.hoja-abajo`) con Rápido, Noche, Resumen y —separada por una línea y la última— Cerrar barra. Cada una en una fila de ≥ 56 px con su nombre y una explicación corta. No es un modal centrado: DESIGN.md los prohíbe en el flujo de servir, y en un móvil el centro de la pantalla es justo donde no llega el pulgar.
- **Grid: tres columnas y tiles de 80 px**, texto de 18 px (nunca por debajo de 17) y relleno de 8 px. No es estética: con dos columnas las catorce bebidas piden siete filas y la última se va por debajo de la barra del pedido, y **con la cola delante nadie desplaza una lista para encontrar un cortado**. La carta entera tiene que estar a la vista de una. En pantallas más bajas de 750 px, el tile baja a 72 px y el hueco a 6 px.
- **Barra inferior del pedido**: la de siempre, con el botón diciendo la cuenta entera («Servir 3 bebidas»). El toast sube por encima de ella: lleva «Deshacer», que es un control de verdad.
- **Nada por debajo de 15 px**: los rótulos de los gráficos, las etiquetas y el número de los pasos suben de 13-14 a 15. Por encima del corte se quedan como estaban.

Detalles de iOS: `100dvh` y nunca `100vh`; `env(safe-area-inset-*)` en cabecera, barra inferior y hojas; todo lo que se escribe a 16 px o más para que Safari no haga zoom al enfocar; `touch-action: manipulation` y sin resaltado de toque.

## Motion
Ease-out (cubic-bezier(.22,1,.36,1)). Pulsación de tile: scale(.97) 90 ms. Línea nueva en el ticket: aparece con translateY(6px)→0 y opacidad, 160 ms. Servir: el ticket se desvanece 180 ms y el contador de cabecera hace un «tick» de escala 1→1,08→1 en 240 ms. Toast entra desde abajo 200 ms, sale 140 ms. `prefers-reduced-motion`: todo pasa a fundido de 120 ms o instantáneo.

## Iconos
lucide-preact, trazo 1,75, 22 px en cabecera y 20 px en línea. Siempre con etiqueta de texto salvo +/− y cerrar.

## Copy
Castellano llano. Verbos en el botón: «Servir 3 bebidas», «Cobrar 6,20 €», «Cerrar evento», «Deshacer». Sin «¿Estás seguro?»: deshacer en su lugar. Errores con causa y salida: «Sin carga registrada: la barra de café no se mostrará. Registrar carga · Abrir igual».

## Prohibido
Franjas laterales de color, texto degradado, cristal, tarjetas anidadas, emojis como iconos, tiles con abreviaturas de dos letras, modales centrados en el flujo de servir, cifras sin tabular.
