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
- Subtítulo de un interruptor: 400, 15 px, `--ink-3`. Sin `opacity`: baja el contraste por debajo de lo medido y el medidor no lo ve.
- Nunca por debajo de 15 px en la barra; 14 px permitido solo en tablas del panel.
- Todo lo que se escribe, a 16 px o más: por debajo, Safari hace zoom al enfocar.

## Espaciado y tamaños
Escala 4 px. Tiles 96 px de alto mínimo, chips 56 px, botón principal 72 px, filas del ticket 56 px, controles +/−, «Más» y segmentos de leche 44 × 44 con 8 px de separación. Radio 12 px en tiles y chips, 16 px en hojas, 999 en chips-píldora. Bordes 1 px `--line`; sombra solo en hojas y toasts (`0 8px 24px rgb(0 0 0 / .12)`).

## Fila de extras
Encima del grid, 56 px, la misma altura y el mismo sitio que ocupaban los chips. Enseña **los extras de la última bebida tocada**, no un prefijo: a la izquierda el nombre de la bebida en 500, y a su derecha solo los extras que esa bebida admite. La leche es un segmento de opción única (los tres segmentos ≥ 44 px); el café, un interruptor «Desca»; los extras, interruptores. El extra puesto va en violeta `--accent`. En el iPad la fila se desplaza a lo ancho si no cabe; nunca la página. **En el móvil no se desplaza nada**: ver «Móvil». Una bebida que no admite ningún modificador —Filtro, Cold brew, Té y Agua desde que se retiró la Tapa— lo dice: «Filtro · sin extras». La línea actual del ticket se marca con fondo `--surface-2` y el nombre en 600 — **nunca con una franja lateral de color**.

## Layout de la barra
Horizontal ≥ 1000 px: dos columnas `minmax(0, 1fr) 360px`, cabecera 64 px, sin scroll de página. Vertical o < 1000 px: una columna, ticket como barra inferior de 72 px que se despliega en hoja.
Safe areas: `padding: env(safe-area-inset-*)` en cabecera y barra inferior.

## Móvil: el punto de corte es 560 px
Por debajo de **560 px** (`@media (max-width: 560px)`) la app se dibuja para **una mano**, no para un iPad en su soporte. El iPad está en 1180 × 820 y en 820 × 1180, los dos por encima del corte, así que su disposición no cambia. **Vertical es el modo real**: nadie gira el móvil detrás de una barra con una jarra en la mano; horizontal tiene que ser usable, pero no está optimizado.

Qué cambia:
- **Menú**: wordmark a 16 px y las tres entradas a 15 px, con «Carta y ajustes» acortado a «**Ajustes**». Las tres caben enteras hasta a 375 px; no hay nada que desplazar.
- **Cabecera de la barra**: **una sola fila de 56 px** + safe area. De izquierda a derecha: `‹` (solo el chevrón, con `aria-label` «Volver a Eventos»), el nombre del evento truncado con `title`, las bebidas servidas en 24 px tabulares, el medidor de café reducido a una barra de 28 px y su porcentaje, y **«Más»**. El ritmo de la última hora y los cuatro pasos del evento no caben y se van: el ritmo, a la hoja «Más»; los pasos, a las pantallas donde se miran.
- **«Más»** abre una **hoja desde abajo** (`.hoja-abajo`) con Rápido, Noche, Resumen, Pausar servicio, Cerrar barra y —separada por su línea y la última— **Empezar de cero**. Con una hoja abierta el toast sube al borde **de arriba**: caía encima de una fila y el toque daba en «Deshacer». Cada una en una fila de ≥ 56 px con su nombre y una explicación corta. No es un modal centrado: DESIGN.md los prohíbe en el flujo de servir, y en un móvil el centro de la pantalla es justo donde no llega el pulgar.
- **Grid: tres columnas y tiles de 80 px**, texto de 18 px (nunca por debajo de 17) y relleno de 8 px. No es estética: con dos columnas las catorce bebidas piden siete filas y la última se va por debajo de la barra del pedido, y **con la cola delante nadie desplaza una lista para encontrar un cortado**. La carta entera tiene que estar a la vista de una. En pantallas más bajas de 750 px, el tile baja a 72 px y el hueco a 6 px.
- **Extras en dos filas, todos a la vista** (fase 11). El nombre de la bebida sale de la fila y pasa a un **rótulo de una línea** encima, 15 px `--ink-3` con el nombre en tinta: «Extras de: **Latte**». Debajo, los controles **envueltos**: arriba el segmento de la leche, abajo Desca · Doble · Iced · Sirope, **chips de 44 px** (no 56) y 16 px de letra, 8 px de hueco. Regla dura: **ningún extra fuera de la vista y ningún desplazamiento a lo ancho**. Cuesta 126 px de alto contra los 56 de la fila del iPad, y aun así las catorce bebidas caben de una a 402 × 874 (103 px de holgura) y a 402 × 781 (10 px).
- **Barra inferior del pedido**: la de siempre, con el botón diciendo la cuenta entera («Servir 3 bebidas»). **Con el pedido vacío enseña el último servido** —«Último · 12:41 · Latte · avena, 2 × Cortado», 16 px, una línea con elipsis— y tocarla abre la hoja con ese pedido desplegado. El toast sube por encima de ella: lleva «Deshacer», que es un control de verdad.
- **El aviso, del tamaño del móvil** (fase 11): una línea, 44 px, 15 px de letra, ancho al contenido y como mucho el 92 % del viewport; «Deshacer» como texto subrayado dentro de la misma cápsula, con sus 44 px. Cola máxima de **dos**. En el iPad, 56 px y tres.
- **El contador de «servidas» es tocable** en los dos aparatos y abre el Resumen en su lista de pedidos. Sigue siendo una cifra —sin borde ni relleno—, con 44 px de alto y `aria-label`. El relleno que le da el fondo de pulsación se compensa con margen negativo: la cabecera no puede crecer ni un píxel.
- **«Empezar de cero»**: última fila de la hoja «Más», separada. Doble validación en el sitio —panel que dice qué se pierde, con «Cancelar» antes que la acción, y un botón de **mantener pulsado 1,5 s** con relleno `transform: scaleX` al 14 % de `--danger` (más y el texto rojo baja de 4,5:1); con `prefers-reduced-motion`, cuenta 3 · 2 · 1—. Nunca un modal, nunca un toque.
- **Nada por debajo de 15 px**: los rótulos de los gráficos, las etiquetas y el número de los pasos suben de 13-14 a 15. **Tampoco por encima del corte**: el subtítulo de «Rápido» era la última excepción y también está en 15 px, sin `opacity`, desde la revisión 2.

## Servicio en pausa
Parar no es cerrar. El evento sigue `live` y lo que se para es el servicio: una boda va en dos turnos y la cena está en medio. El estado se dibuja en **ámbar** (`--warn`), nunca en rojo: no es un error ni un cierre, es un turno que se retoma.
- **Cabecera de la barra**: donde iba el ritmo de la última hora aparece «En pausa», en una píldora de contorno ámbar.
- **Tiles apagados**: fondo `--surface-2` y texto `--ink-3`. Se leen, pero no invitan. Un toque no registra nada.
- **La acción principal pasa a «Reanudar servicio»**, en el sitio exacto del botón de servir. El pedido a medias se conserva y vuelve intacto.
- **El ritmo dice «en pausa»**, no un número: parado cae solo hasta cero y eso engaña.
- **Se ofrece** en la hoja «Más» del móvil —separada por su línea y por encima de «Cerrar barra»— y en la tarjeta de la barra abierta de Eventos, que es la vía del iPad.

Detalles de iOS: `100dvh` y nunca `100vh`; `env(safe-area-inset-*)` en cabecera, barra inferior y hojas; todo lo que se escribe a 16 px o más para que Safari no haga zoom al enfocar; `touch-action: manipulation` y sin resaltado de toque.

## Motion
Ease-out (cubic-bezier(.22,1,.36,1)). Pulsación de tile: scale(.97) 90 ms. Línea nueva en el ticket: aparece con translateY(6px)→0 y opacidad, 160 ms. Servir: el ticket se desvanece 180 ms y el contador de cabecera hace un «tick» de escala 1→1,08→1 en 240 ms. Toast entra desde abajo 200 ms, sale 140 ms. `prefers-reduced-motion`: todo pasa a fundido de 120 ms o instantáneo.

## Iconos
lucide-preact, trazo 1,75, 22 px en cabecera y 20 px en línea. Siempre con etiqueta de texto salvo +/− y cerrar.

## Copy
Castellano llano. Verbos en el botón: «Servir 3 bebidas», «Cobrar 6,20 €», «Cerrar barra», «Deshacer». **Un concepto, un nombre**: el pedido en curso es «Pedido actual» en las dos pantallas donde sale, y «pausar» es solo el servicio parado con el evento abierto — una barra que se deja para abrir otra «vuelve al paso 1», no «se pausa». Sin «¿Estás seguro?»: deshacer en su lugar. Errores con causa y salida: «Sin carga registrada: la barra de café no se mostrará. Registrar carga · Abrir igual».

## Prohibido
Franjas laterales de color, texto degradado, cristal, tarjetas anidadas, emojis como iconos, tiles con abreviaturas de dos letras, modales centrados en el flujo de servir, cifras sin tabular.
