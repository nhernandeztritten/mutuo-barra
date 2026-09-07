# Decisiones — Mutuo · Barra

Registro de las decisiones que no estaban resueltas en `docs/SPEC.md` y de las
contradicciones encontradas al construir. Regla: cuando la spec y el escandallo
no coinciden, gana el escandallo (los números medidos).

---

## 06/09/2026 · Fase 1

### 1. El escandallo cuadra: no hubo que tocar ninguna receta
Verificado antes de escribir código, con los costes de SPEC §2.1:

- **Cortado** = 18 g café (0,5346) + 120 ml leche (0,1152) + vaso 6 oz (0,062) + menaje (0,031) = **0,7428 €**
- **Latte con avena** = 18 g café (0,5346) + 220 ml avena (0,4818) + vaso 10 oz (0,097) + menaje (0,031) = **1,1444 €**

Ambos entran en la tolerancia de ±0,005 € de la spec. Las recetas de §2.2 se
sembraron tal cual. Hay un test por cada cifra.

### 2. «4 grupos de modificadores» → son 3
El encargo de la fase 1 pedía sembrar 4 grupos de modificadores. `SPEC §2.3`
define exactamente **tres**: `leche` (3 opciones), `cafe` (2) y `extra` (4), nueve
opciones en total. Se sembraron los 3 de la spec. Si Mutuo quiere un cuarto
grupo (por ejemplo «temperatura» o «azúcar»), se añade en Ajustes sin tocar el
código: el modelo ya lo admite.

### 3. `allowedModifierGroups` guarda también qué opciones admite cada producto
`SPEC §2.2` declara el campo como una lista de grupos, pero `§2.3` restringe por
opción: un Espresso admite el grupo `extra` pero **solo** Doble, Iced y Tapa, no
Sirope. Con una lista de ids de grupo no se puede expresar eso.

Se mantiene el nombre del campo y se enriquece su contenido:
`{ groupId: string; optionIds?: string[] }`. Sin `optionIds`, el producto admite
todas las opciones del grupo. Alternativas descartadas: un campo paralelo
`excludedOptions` (dos fuentes de verdad para la misma regla) y aplicar los
modificadores sin filtrar y dejar que fallen solos (perdía el motivo por el que
se ignoran, que la barra necesita para hacer parpadear el chip).

### 4. Orden de aplicación de los `extra`
La spec fija el orden entre grupos (leche → cafe → extra) pero no dentro de
`extra`, y ahí sí importa: **Tapa** tiene que ver el vaso que **Iced** ya cambió.
Se aplica por `sortOrder` de la opción: Doble (10) → Iced (20) → Sirope (30) →
**Tapa (40), siempre la última**. Consecuencia: el orden en que el barista toca
los chips es irrelevante, y hay un test que lo comprueba en los dos sentidos.

### 5. Un modificador que no aplica no cobra ni etiqueta
Si un modificador se ignora (grupo no admitido, opción no admitida, o nada
sobre lo que actuar — Avena en una bebida sin leche), **no suma su Δ precio ni
aparece en las etiquetas de la línea**. Vuelve en `ignored[]` con el motivo, que
es lo que la barra usa para la sacudida del chip de `SPEC §3.2 regla 2`.

Las opciones por defecto (Vaca, Normal) sí cuentan como aplicadas —son un no-op
deliberado— pero no generan etiqueta: el ticket dice «Cortado», no «Cortado ·
vaca · normal».

### 6. El pico de 15 min usa franjas fijas, no ventana deslizante
`SPEC §3.4` pide «máximo en 15 min × 4». Se calcula con franjas fijas de 15 min
ancladas en `openedAt`, igual que las franjas de 30 min del resumen. Es
determinista, coherente entre las dos métricas y comparable entre eventos. Una
ventana deslizante daría un pico algo más alto y variable; si Nicolas lo prefiere,
es un cambio de una función.

### 7. El ritmo de un evento cerrado se mide contra `closedAt`
`lastHourRate` necesita un «ahora». En un evento `live` es el reloj; en uno
`closed` sería siempre 0 al abrirlo días después. Se usa `closedAt` como
referencia cuando el evento está cerrado, así el histórico enseña el ritmo de la
última hora **de la barra**, no de hoy.

### 8. La sugerencia de carga redondea los vasos hacia arriba, sin basura binaria
No se carga medio vaso: los vasos van con `Math.ceil`. Pero `200 × 0,55 × 1,1`
da `121,00000000000003` en coma flotante, que redondeaba a 122. Se limpia a 6
decimales antes del techo. Hay un test para ese caso exacto.

### 9. Importar JSON: qué gana en cada tabla
Fusión por uuid, nunca duplica:
- **eventos**: gana el `updatedAt` más nuevo;
- **pedidos**: son inmutables, pero **una anulación entrante siempre gana** (nunca se «des-anula» un pedido);
- **catálogo** (insumos, productos, modificadores): solo se añade lo que falta, para no pisar ediciones locales de la carta;
- **ajustes**: no se importan. El `deviceId` es de este iPad.

### 10. CSV con `;` y coma decimal
Los CSV salen con separador `;`, decimales con coma y BOM UTF-8. Es lo que
Numbers y Excel en español abren sin pelea. Con `,` como separador, Numbers en
es-ES parte las cifras por la mitad.

### 11. `Event` se exporta también como `BarEvent`
El tipo se llama `Event` como manda `SPEC §2.4`, pero ese nombre choca con el
`Event` del DOM dentro de los módulos de interfaz. `src/data/types.ts` exporta
los dos nombres; la UI usa `BarEvent`.

### 12. Trazabilidad del stock: qué insumo se cuenta
`trackStock: false` en agua filtrada, menaje y pajitas. El agua es de red
filtrada y no se agota; el menaje es un paquete (servilleta + removedor +
azúcar) que no se cuenta por unidades en el cierre. Los 16 restantes sí. Se
cambia desde Ajustes sin tocar código.

---

## 06/09/2026 · Fase 2

### 13. Los chips son interruptores, no acumuladores
Segundo toque sobre un chip armado lo desarma. Dentro de un grupo `single`
(leche, café), armar una opción desarma la otra: no hay forma de pedir «avena y
sin lactosa» a la vez, porque no existe esa bebida. Consecuencia práctica: nunca
se acumula dos veces el mismo `optionId`, así que el ticket no puede quedarse con
un «Doble Doble» invisible. Alternativa descartada: dejar que se acumulen y
resolverlo en `applyModifiers`; escondía el error hasta el momento de servir.

### 14. «Barra» en la navegación, sin evento en curso, lleva a Eventos
No a «Nuevo evento». La barra se abre desde su evento, y ahí es donde están el
aviso de carga y el de otra barra abierta. Además el enlace deja de marcarse como
sección actual mientras no haya barra abierta, para no teñir dos pestañas a la vez.

### 15. El pedido en curso vive en `localStorage`, no en Dexie
Un pedido a medias se guarda en `mutuo-barra:ticket:<eventId>` en cada cambio.
`localStorage` es **síncrono**: si Safari mata la pestaña entre el toque y el
`await` de IndexedDB, la línea ya está escrita. Con Dexie habría una ventana de
milisegundos en la que se pierde la última bebida, y esa es justo la que más
duele. El pedido es efímero y pequeño (unas pocas líneas), así que no necesita el
modelo append-only; lo que se sirve sí va a Dexie con uuid y `deviceId`.

Consecuencia: cada evento tiene su propia clave, así que pausar una barra y abrir
otra no mezcla pedidos, y volver a la primera recupera el suyo.

### 16. `/evento/:id` despacha por estado
`live` → la barra · `planned` → el formulario de edición (con Datos y Carga) ·
`closed` → el detalle con estadísticas y «Reabrir». Es lo que dice `SPEC §5` con
una sola ruta, y evita inventar `/evento/:id/editar`.

### 17. Al servir, el ticket se vacía al instante; lo que se desvanece es una copia
`DESIGN.md` pide un fundido de 180 ms del ticket. Vaciarlo *después* del fundido
abre una ventana de 180 ms en la que una bebida tocada entra en un ticket que va a
borrarse. Se vacía primero y se pinta una copia congelada durante el fundido. La
animación es la misma; la bebida no se pierde.

### 18. Servir no tiene candado
La primera versión bloqueaba `servir` mientras había una escritura en vuelo. En
modo un toque eso se come el segundo y el tercer toque de una ráfaga, que es
exactamente para lo que existe ese modo. Cada pedido es una fila con su uuid: dos
escrituras simultáneas no se pisan. Se quitó el candado.

### 19. «Deshacer» en modo un toque no devuelve nada al ticket
En modo un toque no hay ticket a la vista, solo la lista de últimos servidos.
Deshacer anula el pedido (`voidedAt`, motivo «deshacer») y el contador baja. En
modo normal sí devuelve las líneas al ticket, que es donde el barista las espera.

### 20. La barra de café mide `cafe`, no `cafe` + `cafe_desca`
`SPEC §3.2 regla 8` dice `stockStart.cafe − consumo teórico`. El descafeinado es
otro insumo, con su propia línea de carga y su propio recuento: sumarlo aquí daría
un porcentaje que no corresponde a ningún saco real. Si Nicolas quiere ver el
descafeinado en la cabecera, es una segunda barra, no una suma.

### 21. «Desca» solo en la fila de chips
El nombre de la opción es «Descafeinado» en la hoja lateral, en el ticket y en la
exportación. En la fila de chips se abrevia a «Desca» —como pide `SPEC §3.2`—
porque siete chips de 56 px tienen que caber sin scroll. La prohibición de
`DESIGN.md` es sobre abreviaturas de dos letras en los **tiles**, no sobre la
palabra que el barista usa en voz alta.

### 22. El evento de ejemplo nace con la carga sugerida
«Probar con un evento de ejemplo» crea un `planned` (boda, 120 invitados, modo
incluido, `isDemo: true`) **con la carga sugerida ya rellenada**. Sin carga, el
ejemplo enseñaría la barra sin lo más característico de la app —cuánto café
queda—, que es justo lo que ningún competidor hace.

### 23. La carga se escribe en unidad de stock y se guarda en unidad de receta
El campo pide kg, L o ud (que es como se compra y como se cuenta) y se multiplica
por `stockFactor` al guardar. El texto se redondea a dos decimales para que
coincida con la sugerencia que se enseña al lado: la sugerencia de café de 120
invitados es 2 981 g y el campo dice «2,98», no «2,981». Nadie carga un gramo.

### 24. Los toasts se vacían al salir de la barra
Encontrado construyendo: el «Deshacer» de un toast de 8 s sobrevivía a «Pausar».
Pulsarlo después intentaba anular un pedido y devolver líneas a un ticket que ya
no estaba montado. Ahora la barra vacía la cola al desmontarse.

### 25. `barMode`, una señal, en vez de `:has()` en CSS
La barra ocupa el iPad entero: sin navegación y sin relleno. Se marca con una
señal que la pantalla enciende al montarse y apaga al salir, no con
`.shell:has(.barra)`. Es explícito, se ve en el árbol de componentes y no depende
del soporte de `:has()` en el Safari que tenga el iPad.

### 26. «Guardar y abrir barra» en el formulario de un evento próximo
El aviso «Sin carga registrada» ofrece «Registrar carga», que lleva al
formulario. Sin un botón de abrir ahí, el barista tenía que volver a Eventos y
buscar el evento otra vez. El botón cierra el círculo en la pantalla en la que ya
está.

---

## Pendiente de decidir (fase 2 en adelante)

- **Precios reales**: los 14 de la carta están marcados `priceProvisional: true`. Solo se usan en modo «venta».
- **Insumos sin costear**: tónica, licor, sirope y pajita están a 0 € con `costSource: 'sin-costear'`. Mientras sigan a 0, el coste de un Espresso tonic y de un Cremaet está **incompleto**.
- **Café descafeinado**: se asume el mismo precio que el normal (0,0297 €/g). Sin verificar con factura.
- **Hielo por bebida**: los 120 g son estimación; el escandallo no lo desglosa.
- **«Invitación» suma al subtotal** (fase 2): un pedido cobrado como invitación
  guarda el precio congelado de sus líneas, así que entra en `revenue`. Está bien
  para el coste, mal para los ingresos. Se decide en la fase 3, al construir el
  cierre: o se excluye `payment: 'invitacion'` de `revenue`, o se guarda con
  precio 0 y se pierde el «cuánto se regaló». La segunda opción parece peor.

---

## 06/09/2026 · Fase 3

### 27. La barra deja de ser una sección y pasa a ser el paso 2 de un evento
El menú tiene tres entradas por tarea —**Eventos · Resultados · Carta y
ajustes**— y ninguna puede estar vacía (UX-REVISION-1 §A). «Barra» desaparece
porque no es un lugar: sin evento abierto no significaba nada, y con evento
abierto duplicaba la tarjeta del inicio. «Panel» desaparece porque no decía qué
era; `/panel` redirige a `/resultados` para no romper un enlace guardado.

### 28. El indicador de pasos, en la barra, es una línea de texto y no cuatro pastillas
`Pasos` tiene dos formas. En Eventos, el evento y el cierre pinta las cuatro
pastillas tocables. En la cabecera de la barra pinta **«Paso 2 de 4 · Servir»**.
Motivo: cuatro pastillas legibles no caben en una cabecera de 64 px sin bajar de
15 px, y `DESIGN.md` prohíbe texto más pequeño en la pantalla que se lee a 75 cm
con las manos mojadas. La línea contesta la misma pregunta —dónde estoy— y el
salto al paso 3 lo da «Cerrar barra», que está en esa misma cabecera.

El subtítulo del interruptor **Rápido** sí baja a 13 px: lo fija UX-REVISION-1
§C de forma explícita, y es la única excepción al mínimo de 15 px en la barra.

### 29. La cabecera de la barra tiene una salida blanda y una terminal
`‹ Eventos` sale sin cerrar nada (y el inicio lo dice: «la barra sigue abierta
hasta que la cierres»). **Cerrar barra**, con contorno, es la única acción
terminal. **Pausar** desaparece: hacía lo mismo que salir pero con otro nombre,
y el barista no podía distinguirla de cerrar. `pauseEvent` sigue en el
repositorio porque abrir otra barra pausa la anterior; ya no hay botón.

### 30. Grid único agrupado; las pestañas vuelven solo por encima de 16 productos
Con 14 bebidas en seis categorías, las pestañas escondían el 80 % de la carta
para ahorrar un scroll. Ahora hay **un solo grid** con un encabezado de 15 px y
el punto de color por categoría. Por encima de **16 productos activos** vuelven
las pestañas, ya no como filtro sino como atajos de scroll.

**Lo que no cabe, y por qué**: a 1180 × 820 el grid mide 871 px y el hueco
disponible es 652 px, así que las dos últimas categorías quedan bajo el borde y
hay que arrastrar. La cuenta es cerrada: seis encabezados + seis filas de tiles
de 96 px + los huecos no entran en 652 px. Bajar el tile a ~72 px lo arreglaría,
pero 96 px es una medida de `DESIGN.md` y no se toca sin que lo decida Nicolas.
Las dos palancas quedan anotadas para la fase 4: menos categorías o tiles más
bajos.

### 31. Una invitación no es un ingreso
Resuelta la duda que quedó abierta en la fase 2. Un pedido con
`payment: 'invitacion'` **no suma a `revenue`**, pero conserva el precio
congelado de sus líneas y aparece en dos contadores nuevos: `compedCount`
(bebidas regaladas) y `compedValue` (lo que habrían valido). Así el coste sigue
completo, la caja cuadra y se sabe cuánto se regaló. La propina sí suma aunque
la bebida fuera de invitación: es dinero recibido.

### 32. Los avisos duran 3 s; los que llevan acción, 8 s
`showToast` decide el tiempo por sí mismo: 3 s para informar, 8 s cuando hay un
«Deshacer» que pulsar. Un deshacer que se va en tres segundos no sirve de nada,
y un aviso informativo de ocho tapa la barra media boda.

### 33. Reabrir no borra nada y se explica en la propia pantalla
Reabrir devuelve el evento al paso 1 conservando pedidos y recuento. Se dice con
esas palabras bajo el botón, porque «Reabrir» a secas se puede leer como
«empezar de cero».

### 34. Los colores de los gráficos son los de la marca, en otro orden
Las seis categorías ya tienen color en `DESIGN.md` (punto del tile, encabezado
del grupo). Cambiarlos solo para los gráficos rompería la regla de que el color
sigue a la entidad, así que se mantienen. Lo que sí cambia es el **orden de los
segmentos** en las barras apiladas: `Espresso · Fríos · Con leche · Filtro ·
Otros · Especiales`. Con el orden de la carta, violeta y azul quedaban pegados y
el validador de paleta daba ΔE 13,6 (por debajo de 15: dos colores que ni con
vista normal se distinguen). Con este orden, el peor par adyacente sube a 17,9 y
pasa las dos comprobaciones de separación.

Los avisos que quedan del validador —cuatro de los seis colores son de croma
baja y la arena no llega a 3:1 sobre el fondo— son consecuencia de la paleta
«restringida» de la marca y se compensan como manda el método: **leyenda
siempre, valor y porcentaje escritos en cada segmento, y la tabla de Resultados
como gemelo en texto**. Ninguna cifra vive solo en un color.

### 35. La línea de referencia es lo único discontinuo de un gráfico
Rejilla y ejes van en línea sólida de 1 px. La discontinua se reserva para un
umbral de verdad: el techo de la barra (`baristas × 25` por media hora) y la
media de coste por bebida entre eventos. Las etiquetas de valor y de umbral
llevan un halo de 3 px del color del fondo para que no se pisen cuando una
columna llega justo a la línea.

### 36. Un coste a 0 € se queda «Sin costear», diga lo que diga el desplegable
En Ajustes → Insumos se puede elegir el origen del dato, pero si el coste es 0
se guarda como `sin-costear`. Es la regla de no inventar un número: mientras la
tónica y el licor sigan a 0 €, el coste de un Espresso tonic y de un Cremaet
está incompleto y la pantalla lo dice.

### 37. El precio deja de ser provisional en cuanto se toca
`priceProvisional` pasa a `false` al editar el campo del precio, no al guardar
sin más. Guardar una bebida sin tocar el precio la deja provisional: el
compromiso de Mutuo con ese número no ha cambiado.

### 38. La versión sale de `package.json`
`vite.config.ts` inyecta `__APP_VERSION__` y `db.ts` lo usa. Antes había un
`'1.0.0-fase1'` escrito a mano que iba a envejecer sin que nadie se diera cuenta.

### 39. Exportar prueba primero la hoja de Compartir del iPad
`guardarArchivo` intenta `navigator.share({ files })` y, si el navegador no lo
admite o el usuario cancela, descarga el archivo. **Aviso**: esa primera vía no
se ha podido probar en el navegador de las capturas —sin escritorio no hay hoja
de Compartir y la llamada se queda colgada—, así que lo verificado de punta a
punta es la descarga. Queda para la fase 4, con el iPad delante.

### 40. El pedido a medias no se pierde al cerrar
La pantalla de cierre lee el ticket en curso y, si tiene bebidas, avisa arriba
con dos salidas: **Servir ahora** (lo guarda como un pedido más) o **Descartar**.
Antes se quedaba en `localStorage` sin que nadie volviera a verlo.

---

## 06/09/2026 · Fase 4

### 41. El grid pierde las filas de encabezado y gana una leyenda
La decisión 30 dejaba anotado que el grid agrupado no cabía: seis encabezados
más seis filas de tiles medían 871 px en un hueco de 652. Se quitan los
encabezados y queda **un grid continuo**: los tiles se ordenan por categoría (la
de la carta, no la alfabética) y luego por `sortOrder`, conservan el punto de
color y fluyen en `repeat(auto-fit, minmax(150px, 1fr))`.

Medido con Playwright a 1180 × 820 (`scripts/verifica-ui.mjs`): **14 tiles en 4
filas × 4 columnas, el grid mide 420 px en un hueco de 484 px, sobran 64**. El
tile sigue en los 96 px de `DESIGN.md`; no hubo que tocarlo.

Encima del grid, donde estaban las pestañas, va una **leyenda de una línea**
(punto + nombre, 15 px) que explica qué significa cada color. Es tocable, pero
no filtra: si el grid tiene scroll lleva a su primer tile, y si cabe entero
—como ahora— resalta sus tiles 400 ms con borde violeta. Filtrar escondería
bebidas para ahorrar un scroll que ya no existe, que es justo el error de la
decisión 30. Las pestañas y el umbral de 16 productos desaparecen del código.

### 42. La pantalla de cierre dice «3 Cerrar», aunque el evento siga abierto
El indicador leía solo `event.status`, y en `/evento/:id/cerrar` el evento
todavía es `live` —la barra no se cierra hasta pulsar el botón—, así que
marcaba «2 Servir» en la pantalla del paso 3. `Pasos` acepta ahora un `paso`
que fuerza cuál está encendido. El paso que deja de ser el actual queda
**disponible**, no apagado: desde el cierre se vuelve a la barra tocando
«2 Servir», que es donde se busca.

### 43. Los nombres cortos dejan de abreviar, y una base ya sembrada se entera
«Esp. tonic» y «Té/infusión» eran abreviaturas sin motivo: con cuatro columnas
caben «Espresso tonic» y «Té / infusión» a 20 px sin bajar el tamaño ni recortar.
`DESIGN.md` prohíbe las abreviaturas en los tiles, así que era una deuda.

El problema no era cambiar la semilla sino que **`initDb` solo siembra si la
base está vacía**: el iPad de Nicolas se habría quedado con los nombres viejos
para siempre. Se sube `SEED_VERSION` a 2 y se añade una migración mínima que
solo toca el producto **si su nombre corto sigue siendo el de la semilla**: lo
que él haya escrito en Ajustes no se pisa.

### 44. «Queda» vacío dice «sin contar», no «0 kg»
El placeholder `0 kg` se leía como un recuento hecho que daba cero, que es lo
contrario de lo que significa una celda vacía. Ahora pone «sin contar» y la
unidad la sigue dando la columna de al lado. La fila cambia a la desviación en
vivo en cuanto se escribe algo, como ya hacía.

### 45. El botón deshabilitado deja de ser una opacidad
`.btn:disabled { opacity: .45 }` dejaba «Toca una bebida» —blanco sobre petróleo
al 45 % encima del ticket— en **2,2:1 en claro y 2:1 en noche**, muy por debajo
del 4,5:1. La opacidad no es un color: compone los dos, texto y fondo, contra lo
que haya detrás. Ahora el estado deshabilitado tiene su propio par —arena
(`--surface-2`) con `--ink-2`, **6,34:1 en claro y 7,93:1 en noche**— y el
fantasma («Deshacer último») baja a `--ink-3` sobre superficie, 6,66:1.

Medido con `npm run contraste`, que lee `tokens.css` y compone las opacidades
antes de calcular. **58 pares medidos, ninguno por debajo del mínimo.** Los más
justos, todos por encima: chip armado 4,56:1 (claro), «Sin proteger» 4,55:1
(claro), «Servir» en noche 4,72:1, «Protegido» 4,62:1 (claro), medidor en rojo
4,62:1 (noche). El subtítulo de «Rápido», que es el sospechoso habitual por ir a
13 px con opacidad 0,8, da 5,17:1 en claro y 6,54:1 en noche.

### 46. Una hoja es un diálogo, no un panel que tapa
Las hojas tenían `role="dialog"` y `aria-modal` pero no se comportaban como
tales: con teclado o con VoiceOver se seguía navegando la barra de detrás, y
Escape no hacía nada. El hook `useHoja` mete el foco dentro al abrir, hace que
Tab dé la vuelta, cierra con Escape y devuelve el foco a donde estaba. Lo usan
las tres hojas y también el ticket desplegado en vertical, que hasta ahora era
un `aside` sin papel.

**Aviso de método**: el efecto que ata el teclado corre después del primer
pintado, así que un script que pulse Escape en el mismo milisegundo en que se
abre la hoja no encuentra nada escuchando. No es un fallo del producto —son
milisegundos— pero sí lo era del script de verificación, que ahora espera a que
la hoja se lleve el foco.

### 47. Nada se anima por `width`
El medidor de café restante transicionaba `width`, que obliga al navegador a
rehacer el layout de la cabecera entera en cada bebida servida. Pasa a
`transform: scaleX(var(--pct))`. Es la única animación de la app que tocaba una
propiedad de layout; el resto ya iba por `transform` y `opacity`.

Con `prefers-reduced-motion`, los tiempos ya bajaban a 120 ms desde los tokens;
ahora además las hojas y los avisos **se funden en vez de desplazarse** y la
sacudida del chip pasa a 0 ms (era un `200ms` escrito a mano, ahora es
`--t-shake`).

### 48. El contador vivo ya no repite la hora
La región `aria-live` de la barra decía «84 bebidas servidas a las 21:14», y
como la hora se refresca sola cada 30 segundos, un lector de pantalla repetía la
frase entera media boda. Se queda solo el número, que es lo que cambia cuando
pasa algo.

### 49. `100dvh` en vez de `100vh`
En Safari, `100vh` cuenta una barra de herramientas que a veces no está, y la
barra inferior del ticket se salía de la pantalla en vertical. Se deja `100vh`
como respaldo para navegadores viejos y `100dvh` encima.

### 50. Objetivos táctiles, medidos y no supuestos
`scripts/verifica-ui.mjs` recorre la barra con Playwright y mide cada control
con `getBoundingClientRect`: **32 controles en la barra, ninguno por debajo de
44 × 44 y ninguna pareja vecina a menos de 8 px**. Lo mismo en la hoja de
modificadores y en el resumen. También comprueba que ninguna de las diez rutas
hace scroll horizontal a 1180, 1024, 820 ni 768 px de ancho.

### 51. Instalar se recomienda, no se promete: en iPadOS no hay botón que instale
Safari en iPadOS no dispara `beforeinstallprompt`, así que ofrecer un botón
«Instalar» sería mentir. Lo único honesto son los pasos: Compartir → Añadir a
pantalla de inicio. Salen en tres sitios y con tres tonos distintos:

- **Eventos**: un bloque discreto de una línea con «Cómo hacerlo» y «Ahora no».
  Se descarta para siempre (`installHintDismissed` en ajustes) y no aparece si
  `display-mode: standalone` dice que ya está instalada.
- **Carta y ajustes → Instalar en el iPad** (`/ajustes#instalar`, adonde lleva
  «Cómo hacerlo»): los cuatro pasos, el estado actual —«Instalada» o «Abierta en
  Safari»— y el motivo por el que importa.
- **README**, para quien monte el iPad la primera vez.

La detección usa `display-mode: standalone` y, para iPadOS viejo,
`navigator.standalone`. Si ninguna de las dos contesta se asume **no instalada**:
un aviso de más no rompe nada; dejar de avisar sí.

### 52. Ajustes lee el almacenamiento de ahora, no el del arranque
`persistentStorage` se escribía en `initDb` y se enseñaba desde ahí. Si el
permiso se concedía después —al instalar la app, por ejemplo—, la etiqueta
seguía diciendo «Sin proteger» hasta el siguiente arranque. Ajustes llama ahora
a `navigator.storage.persisted()` al entrar y corrige el ajuste si no coinciden.

Verificado en Chromium: `persisted() = false` y la pantalla dice «Sin proteger».
Sin engagement previo, Chromium no concede persistencia, así que ese `false` es
el estado real y la pantalla no lo maquilla.

### 53. El tema se pinta antes de que arranque la app
El ajuste vive en IndexedDB, que es asíncrono: a las 23:00, un barista con
«Noche» puesto se comía un fogonazo blanco de un par de décimas en cada
arranque. `applyTheme` deja un espejo síncrono en `localStorage` y un script de
seis líneas en `index.html` pone `data-theme` y el `theme-color` antes del
primer pintado.

Por lo mismo hay **un solo `theme-color`**, no dos con `prefers-color-scheme`:
«Noche» es un interruptor manual del barista, no el ajuste del sistema, y el
color del cromo tiene que seguir al interruptor. Medido: `#f5f4f3` en claro y
`#1c1c1b` en noche.

### 54. La prueba offline es un recorrido completo, no un ping
`scripts/verifica-pwa.mjs` construye, sirve como en producción, espera a
`navigator.serviceWorker.ready`, **corta la red** y entonces: recarga, crea un
evento con carga, abre la barra con sus 14 bebidas, sirve dos, recarga otra vez
—todavía sin red— y comprueba que las dos siguen ahí. Después devuelve la red y
vuelve a comprobarlo. 30 comprobaciones, todas en verde, y cinco capturas en
`docs/capturas/fase-4/`.

### 55. La app sabe dónde vive: `VITE_BASE` y `src/ui/navegar.ts`
Vercel deja la app en la raíz de un dominio; GitHub Pages la cuelga del nombre
del repositorio (`/mutuo-barra/`). `preact-iso` compara la ruta del navegador
tal cual, así que publicada en una carpeta **ninguna ruta encajaba** y todo
caía en «Aquí no hay nada» — un fallo que solo se ve al desplegar, nunca en
desarrollo.

`VITE_BASE` alimenta a la vez el `base` de Vite (assets), el `start_url` y el
`scope` del manifest, el `navigateFallback` del service worker y una constante
`__APP_BASE__`. La regla dentro del código no cambia: **las rutas se escriben
siempre desde la raíz** (`/evento/:id`), y la base se pega en los dos únicos
sitios por donde una ruta sale al navegador —el `href` de un enlace y el
`route()` de un salto, que ahora pasa por `useIr()`— y se quita en el único por
el que entra: saber en qué sección estamos.

Verificado de verdad, no supuesto: construido con `VITE_BASE=/mutuo-barra/`,
servido desde una carpeta como lo hace Pages y recorrido con Playwright.
Navegación entre secciones, creación de evento, barra con sus 14 tiles, recarga
directa de `/mutuo-barra/resultados` y `scope` del service worker en
`http://localhost:4199/mutuo-barra/`. Cero errores de consola.

Alternativas descartadas: **enrutar por hash** (`#/evento/x`), que funciona en
cualquier sitio pero ensucia todas las direcciones y rompe los enlaces ya
guardados; y **publicar solo en la raíz**, que habría sido más simple pero deja
a Nicolas sin la salida de emergencia si no quiere abrir cuenta en Vercel.

### 56. Las cabeceras de caché, o una versión nueva no llega nunca
`vercel.json` marca `index.html`, `sw.js` y el manifest como `no-cache`, y
`assets/*` como inmutable durante un año. No es afinar: los assets llevan el
hash en el nombre y no cambian jamás, pero si la CDN cachea `index.html` o
`sw.js`, el iPad se queda con la versión vieja indefinidamente y el aviso «Hay
una versión nueva» no se dispara nunca.

En GitHub Pages no hay control de cabeceras. Lo que sí hace falta ahí es
`404.html`, que es una copia de `index.html`: Pages no sabe de rutas de una app,
así que al recargar `/mutuo-barra/resultados` devuelve el 404 — y ese 404 es la
propia app, que lee la dirección y pinta lo que toca.

### 57. Con el ticket desplegado, la barra inferior se esconde
Lo vio una captura del recorrido en vertical, no un test: con la hoja del ticket
abierta, el «Servir» de la barra inferior asomaba por detrás del «Servir 1
bebida» de la hoja, atenuado por el fondo. Dos botones iguales, uno de ellos
inalcanzable. La barra inferior se oculta mientras la hoja está abierta.

Es el argumento para mirar las capturas y no solo el verde de los tests: ningún
aserto habría cazado esto.

### 58. El recorrido completo también es un script
`npm run capturas` hace de punta a punta lo que haría Nicolas —primer uso, nuevo
evento con carga, abrir barra, cortado con avena en dos toques, servir, resumen,
cerrar con recuento, resultados, exportar— y comprueba 24 cosas por el camino a
la vez que guarda 16 capturas, en horizontal y en vertical. Verificado en esta
pasada: el grid entero a la vista (420 px de 484), «Paso 2 de 4 · Servir» en la
barra y «3 Cerrar» en el cierre, tres archivos al exportar, el ticket como
diálogo en vertical y el modo noche.

---

## 07/09/2026 · Fase 5

### 44. Americano y Flat white llevan doble: 36 g de café
Decisión de Nicolas. Las dos bebidas se sacan con doble carga; el resto de la
carta sigue con 18 g. Consecuencia inmediata: **dejan de admitir el modificador
«Doble»**. Sumarlo daría 54 g, que no es ninguna bebida que Mutuo sirva, y el
consumo de café del evento saldría inflado justo en la métrica que más importa
—la barra de café restante de la cabecera.

Coste recalculado con los precios de `SPEC §2.1` (café 0,0297 €/g):

- **Flat white** = 36 g café (1,0692) + 120 ml leche (0,1152) + vaso 6 oz (0,062)
  + menaje (0,031) = **1,2774 €** (antes 0,7428).
- **Americano** = 36 g café (1,0692) + 150 ml agua (0,057) + vaso 10 oz (0,097)
  + menaje (0,031) = **1,2542 €** (antes 0,7196).

**Corrección al encargo**: el encargo de esta fase pedía comprobar el Americano
contra «0,663 + 0,5346 = 1,198 €». Ese 0,663 se deja fuera los 150 ml de agua
filtrada (0,057 €), que sí están en la receta de `SPEC §2.2`. El número bueno es
**1,254 €**. El del Flat white sí cuadraba. Hay un test por cada cifra.

### 45. La migración de la dosis se guarda por la receta, no por la versión sola
Los iPads tienen la semilla v2 en IndexedDB. `SEED_VERSION` sube a 3 y al
arrancar se comparan las recetas guardadas del Americano y del Flat white con
**la receta exacta que dejó la v2**. Si coinciden, se sube el café a 36 g y se
retira `extra_doble`; si no coinciden en cualquier insumo o cantidad, la editó
Nicolas en Ajustes y no se toca nada, tampoco los modificadores.

Alternativa descartada: mirar solo si el café sigue a 18 g. Habría pisado el
caso de una receta ajustada en la leche o en el vaso, que también es una edición
suya. La regla es simple de contar: *lo que tú tocaste es tuyo*.

Los modificadores se editan **quitando** la opción de la lista que hubiera, no
reemplazando la lista entera; si el producto las admitía todas (sin `optionIds`)
la lista se materializa con las opciones del grupo menos la retirada. Así un
extra que Nicolas añada por su cuenta sobrevive a la migración.

### 46. Los extras van después de la bebida, y son los de esa bebida
Los siete chips eran un **prefijo**: se armaban antes de tocar el tile y valían
para cualquier bebida, así que había que enseñarlos todos aunque cinco no
aplicaran. De ahí salía la regla 2 de `SPEC §3.2` —la sacudida del chip que no
aplica—, que es un error que la interfaz provocaba y luego avisaba.

La fila pasa a ser **postfija y contextual**: la misma altura (56 px) y el mismo
sitio, pero enseña los extras de **la última bebida tocada** y solo los que esa
bebida admite. Tocar un extra lo pone o lo quita en esa línea del pedido.
Consecuencias:

- El extra imposible **no existe en pantalla**: Avena no sale en un Espresso,
  Doble no sale en un Americano. La sacudida y su código desaparecen.
- Cada grupo se pinta como lo que es, en vez de siete píldoras iguales: `leche`
  es un segmento de opción única (Vaca · Avena · Sin lactosa) con la activa
  marcada, `cafe` es un solo interruptor «Desca», `extra` son interruptores.
- Un cortado con avena **sigue costando dos toques** (`SPEC §1`): antes chip +
  tile, ahora tile + chip. No se pierde velocidad, se gana no equivocarse.
- Si al poner un extra la línea coincide con otra igual, se funden. Dos Lattes
  tocados por separado y avenados uno a uno acaban en una línea de cantidad 2.

**Lo que cuesta**: el extra se aplica a **toda la línea**. Si el barista toca
Latte dos veces (se agrupan en cantidad 2) y luego pone Avena, las dos llevan
avena. Para separar una hay que bajar la cantidad y tocar otra vez. La
alternativa —partir la línea en dos al poner un extra— hacía imposible el caso
contrario (dos lattes de avena para la misma persona) y dejaba la fila editando
algo distinto de lo que el barista acababa de tocar. Se elige la regla simple de
contar: **la fila edita la línea, no la unidad**. Si en la boda estorba, se
cambia en una función.

Las opciones por defecto (Vaca, Normal) dejan de guardarse en `optionIds`: si se
guardaran, un Latte con «Vaca» marcado y un Latte sin marcar serían dos líneas
distintas en el ticket y la misma bebida en el vaso.

### 47. La hoja de una línea se abre con «Más», no con una pulsación larga
El encargo dejaba elegir entre mantener pulsado ≥ 400 ms o un botón de 44 px.
Se elige el botón. Motivo de `SPEC §1`: manos mojadas y cinco segundos por
interacción. Una pulsación larga no se ve, no se aprende sola y compite con el
toque corto, que ahora hace otra cosa —convertir esa línea en la actual—; medio
segundo de más o de menos daría una acción distinta. El botón se ve, tiene
etiqueta («Más», nunca un icono suelto: lo prohíbe `DESIGN.md`) y no depende del
pulso de nadie.

### 48. La línea actual se marca con fondo, nunca con una franja
`DESIGN.md` prohíbe las franjas laterales de color. La línea que edita la fila
lleva fondo `--surface-2` y el nombre en 600, que es el mismo par que ya usa la
cabecera del ticket.

### 49. En modo Rápido la fila edita el pedido ya guardado
En Rápido cada toque sirve, así que no hay línea que editar: lo que hay es un
pedido en Dexie de hace dos segundos. La fila lo sigue editando **mientras vive
su toast «Deshacer»** (8 s, decisión 32): tocar un extra llama a
`replaceOrderLines`, que reescribe las líneas conservando `id`, `servedAt`,
`deviceId` y propina, y recalcula `usage` y `unitCost`.

No rompe el modelo append-only: no se crea otro pedido ni se borra ninguno, y el
uuid con el que se sincronizará en v2 no cambia. Un pedido **anulado no se
edita**: lo que se anuló, anulado se queda. Alternativa descartada: anular y
volver a crear. Habría dejado la mitad de la boda con pedidos anulados por
«deshacer» que nadie deshizo, y el histórico dejaría de contar lo que pasó.

### 50. La explicación del modo Rápido vive en la fila, no en el subtítulo
El encargo pedía poner «cada toque sirve; los extras, justo después» en el
subtítulo del interruptor **si cabía**. Medido a 1180 × 820: no cabe. Con ese
texto, «Cerrar barra» —la única acción terminal de la barra— se salía del borde
derecho de la pantalla. Se comprueba en una captura de la fase 5 y el fallo se
ve a simple vista.

El subtítulo se queda en «cada toque sirve una bebida» y la explicación pasa a
la fila, que es donde ocurre: con Rápido encendido y nada servido todavía dice
«Toca una bebida: se sirve al momento y sus extras salen aquí», y con una bebida
servida enseña «Cortado · servida» seguido de sus extras. El «· servida» va
pegado al nombre y no al final de la fila porque la fila se desplaza a lo ancho
y cualquier cosa detrás del último extra se sale de la vista.

`scripts/verifica-ui.mjs` mide ahora que la cabecera cabe entera y que «Cerrar
barra» no se sale, para que un texto largo no vuelva a comérsela en silencio.
