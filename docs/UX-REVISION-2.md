# Revisión UX 2 — coherencia y arreglos (11/09/2026)

Recorrido completo a **402 × 874** (iPhone 17 Pro, el aparato de mañana) y
comprobación de que el iPad no ha cambiado, a 1180 × 820 y a 820 × 1180.
Escala de severidad 0-4 (Nielsen). Todo lo que dice «arreglado» está
comprobado en el navegador: `npm run capturas:auditoria`, capturas en
`docs/capturas/fase-10/`.

La revisión salió de dos preguntas de Nicolas: que la Tapa desapareciera de la
app, y que el recorrido entero fuera coherente, de móvil primero y respetuoso
con las reglas de UX/UI.

---

## Hallazgos arreglados

### Lenguaje: la misma cosa, dos nombres

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 1 | **3** | Preparar · aviso de otra barra abierta | «Al abrir esta, aquella **se pausa** y conserva sus pedidos». Pero `openEvent` devuelve la otra barra a `planned`. Desde la fase 9 «pausar» tiene un significado exacto en esta app —el servicio para y el evento sigue `live`— y aquí se usaba para otra cosa. Dos estados con el mismo nombre es la manera más rápida de perder la confianza en el dato | Dice lo que hace: «aquella vuelve al paso 1, "Preparar", y conserva todos sus pedidos». Lo mismo en el aviso de Eventos, que además ahora explica la consecuencia en vez de solo nombrar el choque |
| 2 | 2 | Barra inferior del móvil ↔ cabecera del ticket | La barra decía «Pedido (3)» y la hoja que esa misma barra abre, «Pedido actual (3)». El mismo objeto, a un toque de distancia | «Pedido actual (N)» en los dos. Medido a 375, 393 y 402 px en modo venta: la etiqueta más larga («Pedido actual (3) · 8,40 €») cabe en una línea y la barra sigue midiendo 72 px |
| 3 | 2 | Interruptor «Rápido» ↔ hoja «Más» | Dos redacciones del mismo concepto: «cada toque sirve una bebida» en la cabecera y la misma frase en la hoja, que al cambiar el tamaño de letra habría divergido | «Un toque, una bebida» en los dos sitios |
| 4 | 1 | Comentarios de `src/ui/archivos.ts`, `db.ts`, `main.tsx`, `store.ts` | Hablaban de «el iPad» como si fuera el único aparato. Mañana la barra la lleva un iPhone | Dicen «el aparato», «iOS y iPadOS». En `layout.ts` se quedan: ahí «iPad» es una medida literal (1180 y 820 px, por encima del corte) |
| 5 | 1 | `eventos.tsx` | Un comentario decía «Pausar y abrir esta», de una versión anterior del botón | Dice lo que hace el botón de hoy |

### Comportamiento: la misma acción, dos maneras

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 6 | **3** | Resumen · lista de pedidos | «Anular» no se podía deshacer. El mismo «Anular» de la barra sí, con ocho segundos. La misma acción con dos comportamientos según la pantalla, y el Resumen —una lista larga, con el dedo— es justo donde más fácil es equivocarse de fila | «Anular» del Resumen lleva «Deshacer», igual que el de la barra |
| 7 | **3** | Cerrar · pedido a medias | «Descartar» no se podía deshacer. Es la **única** acción de la app que borra de verdad —lo demás deja su fila con `voidedAt`— y está pegada a «Servir ahora», con prisa y a punto de cerrar | Lleva «Deshacer», y el pedido vuelve entero con sus cantidades |
| 8 | **3** | Hoja «Más» con un aviso vivo | El aviso «1 bebida servida · Deshacer» caía **encima** de la fila «Pausar servicio». Medido con `elementFromPoint`: un toque en esa fila daba en «Deshacer». No es teoría, se ve en `docs/capturas/fase-9/07-hoja-mas.png` | Con un diálogo abierto, el aviso sube al borde de arriba. Es la decisión 98 una capa más arriba: «Deshacer» es un control de verdad y no puede competir por el sitio de otra acción. Donde `:has()` no exista se queda como estaba |

### Jerarquía: una sola acción principal por pantalla

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 9 | 2 | Resultados, a 402 px | «Importar» (secundario) se colaba en la línea del título y «Exportar todo» (principal) caía solo en la línea siguiente. La jerarquía al revés, y por accidente: era `flex-wrap` repartiendo como podía | El título ocupa su línea entera y los dos botones bajan juntos, en su orden. Comprobado también en Eventos |
| 10 | 2 | Preparar un evento ya guardado | «Guardar» era el principal y «Guardar y abrir barra» el secundario. `UX-REVISION-1 §B` dice que la acción del paso 1 es **abrir la barra** | Se invierten. En un evento **nuevo** ese botón no existe y «Guardar» sigue siendo el principal |

### Estados que faltaban

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 11 | 2 | Fila de extras | Al retirarse la Tapa, Filtro, Cold brew, Té y Agua se quedaron sin ningún modificador, y la fila enseñaba el nombre de la bebida y nada más: se lee como algo que está cargando | «Filtro · sin extras» |

### Accesibilidad

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 12 | 2 | Subtítulo de «Rápido», en la barra | 13 px **y** `opacity: .8`. `DESIGN.md` manda que en la barra nada baje de 15 px, y la fase 9 subió todos los rótulos del móvil; este se quedó atrás porque el iPad no se mide en ese script. Se lee a 60-75 cm, de noche y con las manos mojadas | 15 px, color `--ink-3` y sin opacidad. Contraste medido: **6,66:1** en claro y **6,19:1** en noche (antes, con la opacidad encima, no llegaba). El texto se acorta a «un toque, una bebida» para que la cabecera no crezca |
| 13 | 2 | Medidor de café | Los gramos restantes solo los decía un `title`, y en un móvil no hay ratón que se pare encima: en el iPhone el medidor enseña la barra y el porcentaje, y los gramos no los podía leer nadie | `aria-label` completo: «Café restante: 2,98 kg, el 100 % de la carga» |
| 14 | 2 | Pestañas de categoría | `role="tab"` sin panel ni `aria-controls`: para un lector de pantalla eran botones sueltos que no decían qué gobiernan | `aria-controls` al grid, que pasa a `role="tabpanel"` con su nombre |
| 15 | 2 | Tabla de Resultados | Diez columnas: en un móvil se corta por la derecha y nada decía que hubiera más | Sombras de desplazamiento en los dos lados. Aparecen solo cuando hay algo escondido hacia ese lado y se apagan solas al llegar al final, sin JavaScript |

### Coste cognitivo

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 16 | 1 | Resultados vacío | Tres veces lo mismo: el `title` del botón apagado, una línea suelta debajo de la cabecera y el estado vacío | Fuera la línea suelta. El `title` y el estado vacío se quedan, que son los que tienen contexto |
| 17 | 1 | Modo Rápido | La fila de extras y el ticket decían casi la misma frase a la vez | El ticket se queda en «Cada bebida se sirve al tocarla»; lo de los extras lo dice la fila, que es donde se mira |

### Herramientas de verificación

| # | Sev | Dónde | Qué pasaba | Qué se hizo |
|---|---|---|---|---|
| 18 | 2 | `npm run capturas:editar` y `scripts/capturas-fase-8.mjs` | Los dos llevaban **en rojo desde el 07/09**, y nadie lo había mirado. El primero esperaba los chips de motivo de «Anular» que la app quitó ese mismo día; el segundo buscaba un botón «Eventos» que en `barMode` no existe, porque el menú de arriba se esconde. Un script de verificación en rojo que nadie corre es peor que no tenerlo | Los dos en verde, con el comentario de por qué estaban rotos |

---

## Para después del evento

Nada de esto se ha tocado: o es grande, o es arriesgado para esta noche, o las
dos cosas. Está aquí para que la siguiente sesión lo encuentre.

### A · Sev 3 — A 1024 × 768 la cabecera de la barra no cabe

`SPEC §3.2` nombra 1024 × 768 como tamaño soportado (iPad 9.ª gen, iPad mini en
horizontal). Ahí la cabecera mide más que la pantalla: **«Cerrar barra» acaba en
1108 px de 1024**, y «Resumen» en 1040. La cabecera tiene `overflow-x: auto`, así
que se llega desplazándola a mano, pero nada dice que estén ahí: para el barista,
la única salida terminal de la barra no existe.

Viene de antes de esta auditoría —medido en el commit anterior: 1130 px— y de
hecho **ha mejorado 22 px** al acortar el subtítulo de «Rápido». Pero sigue sin
caber, y arreglarlo de verdad pide rehacer la cabecera: bajar el corte del móvil,
mover los interruptores a una hoja «Más» también en tabletas pequeñas, o esconder
el subtítulo y los gramos por debajo de 1100 px.

No se toca hoy porque el aparato de mañana es un iPhone y el iPad de Nicolas está
en 1180 × 820, donde la cabecera cabe con 16 px de sobra (medido).
`npm run capturas:auditoria` imprime la cifra en cada pasada, con la etiqueta
`NOTA`, para que no se vuelva a perder de vista.

### B · Sev 2 — Pausar desde la barra en el iPad

En el móvil, «Pausar servicio» está en la hoja «Más», a un toque. En el iPad hay
que **salir de la barra** e ir a la tarjeta de Eventos. Reanudar, en cambio, sí se
puede desde la barra: con el servicio parado, el botón grande dice «Reanudar
servicio». Se puede volver pero no se puede ir.

Es la decisión 104, tomada con un motivo medido: la cabecera no admite un botón
más. La salida está atada al hallazgo A: resuelto el ancho de la cabecera, cabe.

### C · Sev 2 — La barra que se deja atrás desaparece de la vista

Al abrir una barra con otra abierta, `openEvent` devuelve la primera a `planned`.
Conserva `openedAt` y todos sus pedidos —no se pierde nada— pero en Eventos
reaparece bajo «Próximos» con «Paso 1 de 4 · listo para abrir», como si no hubiera
servido nunca. El dato está en la base; la portada no lo cuenta.

Lo mínimo sería que un evento `planned` **con pedidos** lo dijera en su fila y
ofreciera ver su resumen. Es una pantalla nueva de estado, no un retoque.

### D · Sev 2 — El recuento del cierre mezcla unidades en la misma fila

«Leche entera · Cargado: 17,28 L · Teórico: 130 ml». Las dos cifras son del mismo
insumo y de la misma fila, y están en unidades distintas porque `formatQty` elige
la unidad por el tamaño del número. Comparar —que es para lo único que sirve esa
fila— obliga a convertir de cabeza. La columna «Desviación» da la respuesta, pero
las dos cifras de al lado se leen antes.

El arreglo es una unidad por fila, la de stock, y tocar `formatQty` o su uso en el
cierre. Se deja porque es la pantalla con la que se cierra el evento de mañana y
un error ahí cambia cifras.

### E · Sev 1 — Desviaciones de cinco cifras

Cuando lo cargado y lo servido no se parecen, sale «+10.115,4 %». Es aritmética
correcta y ruido a la vez. En un evento de verdad, con doscientas bebidas, la
cifra es sensata; el caso feo aparece con eventos de prueba o de una sola bebida.
Un tope de lectura («más de +500 %») lo contaría mejor.

### F · Sev 1 — El aviso de anular tiene dos redacciones

Desde la barra: «Anulado · Cold brew». Desde el Resumen: «Pedido anulado». El de
la barra es mejor —nombra lo que se ha anulado—, pero el del Resumen tendría que
decir lo mismo. Lo importante, que las dos se puedan deshacer, ya está (hallazgo 6).

---

### G · Propuesta (12/09, fase 13) — «Ya servidos» también en el modo Rápido

La fase 13 da a la tira un segundo estado: con el pedido vacío enseña los
pedidos ya servidos. **En el modo Rápido no se dibuja**, y ahí es justo donde
más falta haría: en Rápido cada toque sirve, el pedido siempre está vacío, el
hueco está libre todo el rato y no hay ticket donde repasar nada. Es el modo en
el que es más fácil perder la cuenta de lo que acabas de servir.

No se cambia en la fase 13 por dos motivos, los dos de prudencia: el modo Rápido
ya tiene su propia manera de contar lo servido —la fila de extras sigue editando
el último pedido durante los ocho segundos que vive su «Deshacer» (SPEC §3.2
regla 6)— y habría que medir si las dos cosas conviven sin que una fila de la
tira contradiga lo que la fila de extras está editando.

Lo que habría que medir antes de hacerlo:

- El presupuesto vertical en Rápido, que **no** es el de la fase 13: allí el
  bloque de extras **sí** está desplegado mientras vive el «Deshacer» del último
  pedido, así que el hueco oscila entre 211 px y 103 px (a 402 × 874) cada ocho
  segundos. Una tira que cambia de tamaño sola, con la cola delante, es
  exactamente lo que la decisión 118 no quiere.
- Si la fila que se está editando debe marcarse en la tira, y cómo, sin usar el
  fondo `--surface-2`, que ahí significa otra cosa.

## Lo que no se ha tocado a propósito

- **La navegación de `UX-REVISION-1`**: tres entradas, el ciclo de cuatro pasos,
  la barra como paso 2 de un evento.
- **El grid de tres columnas del móvil** y el corte en 560 px. Sigue midiéndose en
  cada pasada: las catorce bebidas caben de una a 402, 393 y 375 px.
- **Las 104 decisiones de `DECISIONES.md`**. Las tres que esta revisión discute
  —la 98 sobre el aviso, la 104 sobre pausar y el subtítulo de 13 px de
  `UX-REVISION-1 §C`— quedan escritas como decisiones 106 a 109.

## Cómo se comprueba

```
npm run typecheck      # sin errores
npm test               # 389 tests
npm run build
npm run verifica:ui    # 1180 × 820: objetivos, foco, hojas, scroll
npm run contraste      # 78 pares medidos
npm run verifica:pwa   # offline de verdad, con la red cortada
npm run capturas       # recorrido completo en 1180 y 820
npm run capturas:ultimos
npm run capturas:movil # 402, 393 y 375
npm run capturas:auditoria  # esta revisión: 402 × 874 + los dos giros del iPad
```
