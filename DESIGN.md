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
- `--accent` violeta #715aff (chip armado, foco, selección) · `--accent-ink` #ffffff · `--accent-text` #6248f5 (violeta sobre claro, 4,5:1)
- `--warn` #b3541e · `--danger` #a3271c · `--ok` = primary
Noche:
- `--bg` #1c1c1b · `--surface` #262625 · `--surface-2` #33322f · `--ink` #f0efed · `--ink-2` #cfcbc4 · `--ink-3` #aaa59d · `--line` #3d3b38
- `--primary` #2a8f88 (petróleo aclarado para 4,5:1 con texto blanco no, con texto #0e1a19: usar `--primary-ink` #0b1615) · `--accent` #9d8bff · `--accent-text` #b6a8ff · `--warn` #e08a4a · `--danger` #e2695c

Color por categoría (punto de 10 px en el tile y subrayado de la pestaña): Espresso tinta · Con leche arena oscura #b9a98f · Filtro petróleo · Fríos #3f7fc8 · Especiales violeta · Otros gris #808080. Solo acento; el fondo del tile es siempre `--surface`.

Estrategia: **restringida**. Un color de acción (petróleo), un color de estado armado (violeta). Todo lo demás neutro.

## Tipografía
Archivo (autoalojada), una sola familia:
- Display (contadores de cabecera, resultado de cierre): 300, 32-40 px, tracking −0,02em, tabular.
- Tile de producto: 500, 20 px, dos líneas máximo, `text-wrap: balance`.
- Chip: 500, 17 px. Línea de ticket: 500, 18 px; modificadores 400, 15 px `--ink-3`.
- Botón principal: 600, 22 px. Cuerpo: 400, 16-17 px, line-height 1,5.
- Nunca por debajo de 15 px en la barra; 14 px permitido solo en tablas del panel.

## Espaciado y tamaños
Escala 4 px. Tiles 96 px de alto mínimo, chips 56 px, botón principal 72 px, filas del ticket 56 px, controles +/− 44 × 44 con 8 px de separación. Radio 12 px en tiles y chips, 16 px en hojas, 999 en chips-píldora. Bordes 1 px `--line`; sombra solo en hojas y toasts (`0 8px 24px rgb(0 0 0 / .12)`).

## Layout de la barra
Horizontal ≥ 1000 px: dos columnas `minmax(0, 1fr) 360px`, cabecera 64 px, sin scroll de página. Vertical o < 1000 px: una columna, ticket como barra inferior de 72 px que se despliega en hoja.
Safe areas: `padding: env(safe-area-inset-*)` en cabecera y barra inferior.

## Motion
Ease-out (cubic-bezier(.22,1,.36,1)). Pulsación de tile: scale(.97) 90 ms. Línea nueva en el ticket: aparece con translateY(6px)→0 y opacidad, 160 ms. Servir: el ticket se desvanece 180 ms y el contador de cabecera hace un «tick» de escala 1→1,08→1 en 240 ms. Toast entra desde abajo 200 ms, sale 140 ms. Chip que no aplica: sacudida de 2 px, 200 ms. `prefers-reduced-motion`: todo pasa a fundido de 120 ms o instantáneo.

## Iconos
lucide-preact, trazo 1,75, 22 px en cabecera y 20 px en línea. Siempre con etiqueta de texto salvo +/− y cerrar.

## Copy
Castellano llano. Verbos en el botón: «Servir 3 bebidas», «Cobrar 6,20 €», «Cerrar evento», «Deshacer». Sin «¿Estás seguro?»: deshacer en su lugar. Errores con causa y salida: «Sin carga registrada: la barra de café no se mostrará. Registrar carga · Abrir igual».

## Prohibido
Franjas laterales de color, texto degradado, cristal, tarjetas anidadas, emojis como iconos, tiles con abreviaturas de dos letras, modales centrados en el flujo de servir, cifras sin tabular.
