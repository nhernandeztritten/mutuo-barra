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

---

## 07/09/2026 · Fase 6

> Nota de numeración: la fase 5 reinició la cuenta en 44 y chocó con las
> decisiones 44-50 de la fase 4. Esta fase sigue desde el número más alto usado
> (58) para no ampliar el solape. Las de la fase 5 se citan como «fase 5 · 44».

### 59. «Últimos pedidos» va encima del botón de servir, no debajo
El encargo pide la sección «al pie de la columna, con el pedido actual arriba».
Tomado al pie de la letra —la sección **debajo** del pie del ticket— el botón
«Servir N bebidas» cambiaba de sitio cada vez que entraba un pedido: la única
acción terminal de una pantalla de cinco segundos por interacción, moviéndose
sola media boda.

El orden que queda es: cabecera · líneas del pedido · **Últimos pedidos** ·
Deshacer último + Servir. El botón no se mueve nunca y la sección sigue estando
al pie de la columna. Lo que cuesta: «Deshacer último» queda separado de las
líneas a las que se refiere. Es un botón fantasma que se usa poco; el de servir
se usa en cada pedido.

Alternativas descartadas: **la sección debajo del pie** (el botón bailando, ya
dicho) y **la sección en la columna izquierda**, bajo el grid, que no compite
con el pedido pero deja el hueco justo —el grid mide 420 px de los 488
disponibles (decisión 41)— y además el encargo pedía la derecha.

### 60. La sección cede espacio la primera, y nunca baja de dos filas
Medido con Playwright a 1180 × 820, y **la primera versión estaba al revés**:
con un pedido de 10 líneas, la lista del pedido se quedaba en 198 px haciendo
scroll interno mientras «Últimos pedidos» conservaba sus 349 px enteros. Lo que
el barista está montando **ahora** perdía contra una lista de consulta.

La causa: `.ticket__list` tenía `flex: 1` —base `0%`—, así que no contaba como
espacio pedido y todo el recorte se lo comía… nadie. Ahora:

- `.ticket__list { flex: 1 1 auto }` (base = su contenido, así reclama sitio);
- `.ultimos { flex: 0 100 auto }` — factor de encogido alto: absorbe el 98 % del
  recorte antes de que lo note el pedido;
- el suelo de la sección es `calc(var(--h-tab) + 2 * var(--h-row) + var(--s-2))`
  = 168 px, con la cabecera fijada a 48 px para que la cuenta cierre.

Medido después: con el pedido vacío la sección ocupa 337 px (cinco filas); con
10 líneas cede a 168 px con **dos filas enteras a la vista** y el que hace
scroll dentro de su caja pasa a ser el pedido. La página no hace scroll en
ninguno de los dos casos.

Dos intentos fallidos por el camino, por si vuelven a hacer falta:
`min-height: 0` dejaba la caja en **1 px** con su lista saliéndose por debajo, y
`min-height: min-content` resuelve al contenido entero (349 px), con lo que no
cedía nada. El suelo tiene que ser un número.

### 61. «Repetir» recalcula con la carta de ahora
Repetir es volver a pedir lo mismo, no clonar un cobro antiguo: se reconstruyen
las líneas con `buildLine` sobre el producto **actual**, así que la receta, el
coste y el precio salen de la carta de hoy. Lo que se conserva del pedido viejo
son las opciones, la cantidad y la nota.

- **Modo normal**: las líneas caen en el pedido actual y se agrupan con lo que
  ya hubiera (un Cortado suelto + repetir un Cortado = una línea, cantidad 2).
- **Modo Rápido**: no hay pedido donde dejarlas, así que se sirven al momento
  con su toast «N bebidas servidas · Deshacer», como cualquier otro toque.

Si una bebida del pedido ya no está activa en la carta, esa línea se cae. Si no
queda ninguna, no se repite nada y se avisa: «Esa bebida ya no está en la
carta». Alternativa descartada: repetir con lo que quede sin decirlo, que es
servir en silencio algo distinto de lo que pone en la fila.

Feedback: la fila hace un fundido de 600 ms (`--t-repeat`, 120 ms con
`prefers-reduced-motion`). Sin ventana emergente, como manda `DESIGN.md`.

### 62. Un pedido anulado no sale en la lista
Lo que se anuló no se sirvió, y repetirlo sería repetir un error. Sale de la
lista y sube el que quedaba fuera, así que se siguen viendo cinco. Donde sí
está —tachado y con su motivo— es en la lista completa del Resumen, que es
donde se audita y adonde lleva «Ver todos».

El desempate del orden es por `id` cuando dos pedidos comparten `servedAt`: en
modo Rápido una ráfaga puede caer en el mismo milisegundo, y sin desempate la
lista bailaba entre repintados.

### 63. «Desca» también aquí, por el mismo motivo que en la fila de extras
La frase se corta a dos líneas en una columna de 360 px, así que el ancho manda
igual que en la fila de chips (decisión 21). «Americano · desca», no «Americano
· descafeinado». La palabra completa sigue en el ticket, en la hoja de la línea
y en la exportación. `CHIP_LABEL` se muda de `barra-parts.tsx` a `etiquetas.ts`
para que la lógica pura de `ultimos.ts` la use sin arrastrar componentes.

### 64. «Ver todos» abre la hoja por su ancla, con el foco puesto ahí
La lista de pedidos es el último bloque del Resumen. Un `scrollIntoView` desde
el contenido **no bastaba**: se desplazaba bien y, un instante después,
`useHoja` enfocaba el primer elemento de la hoja —el botón «Cerrar» de la
cabecera— y ese foco devolvía el scroll arriba. Medido: el bloque quedaba a
1618 px del borde de la hoja.

No se arregla con un temporizador que gane la carrera. `useHoja` acepta ahora un
`anclaId`: si viene, enfoca ese bloque (`tabIndex` −1, `preventScroll`) y lo
desplaza él. Foco y scroll van juntos, que además es lo correcto para un lector
de pantalla: no tiene sentido leer la cabecera y enseñar el final. Medido
después: 0 px del borde.

### 65. «Últimas servidas» del modo Rápido desaparece: es la misma lista
La lista de solo lectura que vivía en el ticket en modo Rápido queda absorbida
por «Últimos pedidos», que hace lo mismo y además repite. Un componente para los
dos modos, no dos que se parecen. Lo que queda del texto viejo es una línea de
pista en el ticket («Cada bebida se sirve al tocarla; sus extras salen en la
fila de arriba»), porque la cabecera sigue diciendo solo «Modo rápido activo».

### 66. Dos huecos de jsdom, tapados en el arranque de las pruebas
`matchMedia` y `Element.prototype.scrollIntoView` no existen en jsdom. No son
huecos del producto —los tiene cualquier navegador— pero sin ellos revienta
cualquier rama que consulte `prefers-reduced-motion` o desplace un bloque. Se
rellenan en `vitest.setup.ts`, con `matchMedia` contestando que **no**: la
preferencia por defecto es la animación completa.

Vale la pena anotarlo: hasta esta fase esas ramas nunca se ejecutaban en las
pruebas y el hueco no se veía. El aviso de método de la decisión 46 vuelve a
aplicar —lo que no se ejecuta, no se comprueba.

---

## 07/09/2026 · Fase 7

> Sigue la numeración desde la 66, la última usada en la fase 6.

### 67. La fila se despliega en el sitio, y solo hay una abierta
El encargo prohíbe las ventanas emergentes centradas en el flujo de servir
(`DESIGN.md`), así que ver un pedido entero no puede abrir una hoja. La fila se
despliega **debajo de sí misma**, en la misma columna, y el objetivo táctil es
la fila entera: 56 px de alto y todo el ancho, no un botón en una esquina. Con
las manos mojadas se toca donde se está mirando.

Solo una abierta a la vez. Con 360 px de columna, dos pedidos desplegados dejan
la lista sin sitio y al barista sin saber cuál está mirando. Abrir otra cierra
la anterior; tocar la abierta la cierra. `aria-expanded` en la cabecera de cada
fila.

Consecuencia: **«Repetir» se muda dentro de la desplegada**, junto a «Editar» y
«Anular». Antes vivía en la fila cerrada, pero un botón dentro del objetivo
táctil de 56 px se lo come. Cuesta un toque más; a cambio, tocar la fila ya no
es una apuesta entre «ver» y «repetir».

### 68. Abierta, la frase de arriba desaparece
La primera versión dejaba la frase resumida («Latte · avena, Cortado · desca,
Americano · desca, Cappuccino · sin…») encima de las mismas cinco bebidas
escritas enteras justo debajo. Se veía en la captura: el mismo pedido dos
veces, una de ellas cortada.

Abierta, la frase deja su sitio al **«hace 3 min»**, que es lo que la hora sola
no contesta —«¿este es el de hace un momento o el de hace media hora?»— y lo
que nadie resta de cabeza a las tres de la mañana. Lo que se pidió lo dice la
lista de abajo, a 18 px y con los extras apagados.

### 69. Se anima al abrir, no al cerrar
`grid-template-rows: 0fr → 1fr` es lo único que anima un alto automático sin
medirlo en JavaScript, y es lo que pedía el encargo. Pero para animar también
el cierre hay que dejar el panel montado siempre, y entonces sus tres botones
siguen en el DOM con la fila cerrada: entran en el orden de tabulación, los
lee un lector de pantalla y los miden con 0 px de alto los guiones de
verificación (`verifica-ui.mjs` mide todo control de la barra).

Se elige **montar el panel solo cuando está abierto** y animar la apertura con
esos mismos fotogramas (180 ms, `--t-desplegar`; 0 ms con
`prefers-reduced-motion`). Cerrar es instantáneo. Lo que se pierde es 180 ms de
salida que nadie mira; lo que se gana es que la fila cerrada no tenga botones
fantasma. Alternativa descartada: dejarlo montado con `visibility: hidden`, que
arregla el foco y la medida pero obliga a colar la excepción en todos los
guiones y a acordarse de ella la próxima vez.

### 70. Corregir es un pedido nuevo con la hora del viejo
Editar **no reescribe** el pedido servido. Se crea otro con las líneas nuevas y
el original se anula con motivo `editado`. El nuevo lleva dos cosas prestadas:

- `servedAt` **del original**: la bebida se sirvió cuando se sirvió. Moverla al
  presente falsearía las franjas de media hora del Resumen y el ritmo de la
  última hora, que es el número con el que Nicolas decide si hace falta un
  segundo barista.
- `replacesOrderId`, para saber a quién sustituye. `createdAt` sí es ahora: es
  cuando se escribió la fila.

Se descartó `replaceOrderLines` —lo que ya hace la fila de extras en modo
Rápido— porque ahí el pedido es de hace dos segundos y aún vive su «Deshacer»;
aquí puede ser de hace media hora y reescribirlo en el sitio borraría lo que
de verdad se sirvió. El modelo es append-only: las dos filas se quedan, y la
sincronización de v2 sigue siendo una unión de conjuntos.

El orden importa: primero se escribe el nuevo y **después** se anula el viejo.
Si algo fallara en medio, lo que queda es el pedido de siempre, no un hueco.

### 71. «Corregido», no «Anulado»
En Resumen → Pedidos el original sale tachado —lo que cuenta es el que lo
sustituye— pero su etiqueta dice **«Corregido»** y va en `--ink-3`, no en rojo.
Nadie se equivocó: se cambió. Poner «Anulado · editado» en rojo contaría mal lo
que pasó y llenaría la lista de una boda de falsas alarmas.

### 72. «Editar» solo con el pedido actual vacío, y se dice por qué
Mezclar una corrección con un pedido a medias serviría las dos cosas juntas y
anularía el original por el camino. Con líneas en el ticket, «Editar» sale
apagado.

El motivo se escribe **en la fila**, debajo de los botones: «Sirve o vacía el
pedido actual para editar». El `title` está puesto también, pero un `title`
solo lo ve quien tiene ratón, y en la barra no hay ratón. La guarda está además
en el estado, no solo en el botón: `onEditarPedido` no hace nada con el ticket
lleno.

### 73. Corrigiendo, el modo Rápido queda en pausa
En Rápido cada toque sirve. Corrigiendo hay que poder tocar tres bebidas y
**luego** confirmar, así que mientras dura la corrección vuelve el ticket con
su botón «Servir», aunque el interruptor siga encendido. Al servir la
corrección se vuelve solo a Rápido. Sin esto, tocar una bebida en medio de una
corrección serviría un pedido nuevo y dejaría la corrección a medias.

### 74. El estado de la corrección se guarda con el ticket
`editingOrderId` va a `localStorage` por evento, al lado de las líneas y por el
mismo motivo (`SPEC §3.2` reglas 9 y 11): recargar en medio de una boda no
puede convertir las líneas de un pedido viejo en un pedido nuevo sin que nadie
se entere.

Dos invariantes que evitan el estado imposible: un ticket vacío **cancela** la
corrección (quitar la última línea vuelve a «Pedido actual»), y al cargar, un id
guardado sin líneas se descarta. Los dos tienen prueba.

### 75. En venta, si el total no cambia no se vuelve a cobrar
Corregir un Espresso a descafeinado no cambia el importe, y volver a abrir la
hoja de cobro sería hacerle repetir al barista una decisión que ya tomó: se
conservan `payment`, `tip` y `cashGiven` del original. Si el total **sí** cambia
(avena, +0,50 €) se abre la hoja con el importe nuevo y el método de antes ya
marcado.

### 76. Servir un pedido nuevo cierra la fila abierta
La lista se reordena por debajo: si no se cerrara, el barista se quedaría
mirando desplegado un pedido distinto del que abrió. Va en `serve()` y no en
`serveTicket()`, para que valga también en modo Rápido, donde no se pasa por el
ticket.

### 77. `--danger` de noche se aclara: 3,91:1 no pasa
«Anular» es texto en rojo sobre `--surface-2` (el fondo de la fila abierta).
Medido con `npm run contraste`, el `--danger` de noche (#e2695c) daba **3,91:1**
sobre ese fondo: por debajo del mínimo de 4,5. Se aclara a **#ec8a7e** (5,19:1).
Los otros tres sitios donde aparece de noche suben con él (medidor en rojo,
desviación, motivo de anulación).

Vale la pena anotar el método: el par no existía hasta esta fase y el guion no
lo medía. Los cuatro pares nuevos de la fila desplegada están ahora en
`scripts/contraste.mjs`, que lee los tokens de `tokens.css` y no una copia a
mano. Lo que no se mide, no se sabe.

### 78. Lo que queda por decidir (para Nicolas)
Corrigiendo, el botón grande sigue diciendo **«Servir 1 bebida»** / «Cobrar
2,00 €», que es lo que pedía el encargo. La cabecera violeta de encima dice
«Editando el pedido de 09:54», así que el estado se ve; pero el botón promete
una bebida más y el contador **no se mueve** al pulsarlo, porque el pedido
sustituye a otro. Si en la boda confunde, decirlo: cambiarlo a «Guardar la
corrección» es una línea.

### 79. Anular es un toque: se quita el motivo (07/09/2026)

Decisión de Nicolas al probar la barra. Anular preguntaba el motivo con cuatro
chips (Error · Devuelto · Otro · Cancelar) antes de hacer nada.

Con cola delante, elegir entre tres motivos cuesta más que el error que
pretendía documentar, y el dato no se usaba en ningún informe: el Resumen solo
lo mostraba junto a «Anulado». Ahora **«Anular» anula al instante** y el aviso
ofrece «Deshacer» durante ocho segundos, que es la salida real de un toque
equivocado; desde el Resumen también se puede recuperar más tarde.

Lo que se guarda no cambia: `voidedAt` y `voidReason: 'anulado'` (constante
`VOID_MANUAL`). Nada se borra. `editado` y `deshacer` siguen distinguiéndose,
porque los pone la app y sirven para no llamar «Anulado» a un pedido corregido.

Descartado: dejar los motivos solo en el Resumen (dos comportamientos distintos
para el mismo botón) y un «¿Seguro?» (lo prohíbe `DESIGN.md`: deshacer, no
confirmar).

### 80. Vuelven las pestañas de categoría, con «Todas» delante (07/09/2026)

Decisión de Nicolas al usar la barra. La fila de encima del grid era una
leyenda: decía qué significaba cada punto de color y, con el grid entero a la
vista, tocarla solo resaltaba unos tiles 400 ms. Un control que no hace nada
útil ocupa sitio y enseña a no tocarlo.

Ahora son **pestañas que filtran el grid**: `Todas · Espresso · Con leche ·
Filtro · Fríos · Especiales · Otros`. «Todas» va primera, es la activa al abrir
la barra y es el estado normal —con catorce bebidas caben todas, que es lo más
rápido—; las demás dejan solo su categoría, para cuando la carta crezca o para
buscar dentro de un grupo sin leer las catorce.

La pestaña **no se mueve al servir**: el barista sigue donde estaba. El punto
de color se queda en el tile y en la pestaña, así que la leyenda no se pierde.
Se retira el resalte de 400 ms (`tile--flash`) y el `scrollIntoView`, que
existían solo para dar algún efecto a un control que no filtraba.

### 81. El aviso de anular dice qué se anuló (07/09/2026)

«Pedido anulado» no distingue entre el pedido que querías anular y el de al
lado. Ahora el aviso dice **«Anulado · Latte · avena, 2 × Cortado»**, la misma
frase que se lee en la fila, y mantiene «Deshacer» ocho segundos (decisión 79).
En el Resumen el pedido sigue tachado con su etiqueta.

## 07/09/2026 · Fase 8 — recetas clásicas por método

### 82. El ratio avisa; no reescribe

Es la decisión que ordena toda la fase, y va primero porque todas las demás
salen de ella. La plataforma ya sabe que un espresso es 1:2 y un batch 1:16,
pero **ningún ratio toca una receta por su cuenta**.

El motivo no es prudencia genérica: los costes del escandallo están **medidos**
(Cortado 0,7428 €, Latte con avena 1,1444 €, Flat white 1,277 €, Americano
1,254 €) y una relación teórica no tiene autoridad para pisarlos. El Filtro
lleva 12 g donde el ratio pide 12,5 y eso no es un error: es lo que Mutuo saca
de verdad.

Así que el ratio calcula, compara y **avisa**, y aplicar el cambio es un toque
de Nicolas en «Usar el ratio», que ajusta la dosis del insumo base **y nada
más**. La prueba de que la línea se respeta es que los cuatro tests del
escandallo pasan sin tocarse, y que hay un test de migración que los vuelve a
medir sobre una base v3 migrada.

Descartado: aplicar el ratio automáticamente al abrir la carta (rompería el
escandallo en silencio) y bloquear el guardado hasta cuadrar (convierte un aviso
en un muro, y el muro estaría equivocado en el Filtro).

### 83. El ratio se aplica a la extracción, no al vaso

El error más fácil de esta función, y el que más cara habría costado: comparar
la dosis contra el volumen servido entero. Un Latte de 256 ml a 1:2 pediría
128 g de café. Toda la carta con leche habría salido «por revisar» el primer
día, y a la tercera vez que un aviso miente nadie los lee.

La cuenta correcta descuenta los líquidos de la receta: el Latte sirve 256 ml
pero **extrae 36**, que a 1:2 son los 18 g que ya tiene. Con esta regla las
catorce bebidas de la carta caen **exactamente** en su dosis actual, salvo el
Filtro, que se queda a un 4 % —dentro de la tolerancia—. Cero avisos de dosis
sobre la carta real: la señal de que la cuenta es la buena.

El caso que obliga a distinguir es el **Americano**: lleva `agua 150` en la
receta, pero esa agua es añadida, no la de la extracción. Por eso cada método
declara `extraccionEnLaReceta`: en un té los 200 ml de agua **son** la
infusión y se escriben; en un espresso los 36 ml de salida no se escriben
nunca. Sin esa distinción el Americano daba 150 ml servidos en vez de 222.

### 84. Tolerancia del 10 %, y la báscula manda en el redondeo

`TOLERANCIA_DOSIS = 0,10`: hasta un 10 % de diferencia no se avisa. Con 12,5 g
esperados, entre 11,25 y 13,75 no pasa nada; 11,5 g calla y 9 g avisa. Es café,
no farmacia, y el Filtro (12 contra 12,5, un 4 %) tiene que poder quedarse como
está sin dar la lata.

Las dosis se redondean a **media unidad** (`REDONDEO_DOSIS_G`), que es lo que
distingue la báscula de la barra. Proponer 12,8125 g sería teatro.

### 85. La hoja de té entra como insumo: un té no puede costar cero

Hallazgo al escribir la revisión, no del encargo: la receta del Té eran agua,
vaso y menaje. La hoja no existía, así que **la infusión salía gratis** en el
escandallo del evento.

Se añade `te_hoja` (g, «Sin costear», con seguimiento de stock) y se mete en la
receta con los 2 g que pide la infusión a 1:100. Como nace a 0 €, el coste del
té **no cambia** —hay un test que lo comprueba comparando antes y después—: lo
que cambia es que ahora se ve, con su etiqueta «Sin costear», y que el Té sale
en «bebidas por revisar» hasta que alguien mire la factura. Nunca se inventa un
número.

### 86. Cinco bebidas por revisar, y ninguna por dosis

Lo que la revisión ha destapado sobre la carta real, que es lo que Nicolas tiene
que decidir:

| Bebida | Aviso |
|---|---|
| Flat white | 192 ml no caben en el vaso de 180 ml |
| Espresso tonic | la Tónica no tiene coste |
| Cremaet | el Licor no tiene coste |
| Carajillo | el Licor no tiene coste |
| Té / infusión | la Hoja de té no tiene coste |

El del **Flat white** es el hallazgo de verdad: 36 g de café dan 72 ml, más
120 ml de leche son 192, y el vaso de 6 oz son 180. Salió al subirlo a doble
dosis (decisión de la fase 7) y nadie lo vio. No se arregla desde aquí porque
las dos salidas —bajar la leche a 108 ml o pasarlo al vaso de 10 oz, que cuesta
3,5 céntimos más— las decide Mutuo, no la app. El aviso no ofrece arreglo
automático a propósito.

Los otros cuatro ya se sabían por Insumos; verlos en la bebida es lo que dice
**cuánto** importan.

### 87. La marca «revisar» va en ámbar y a 15 px, no en rojo

Son avisos, no errores: la carta funciona igual y la barra sirve igual. Por eso
en la lista va una píldora **«revisar»** en `--warn` con contorno, a 15 px —el
mínimo de `DESIGN.md`, no los 13 px de `.etiqueta`— y la cabecera dice «5
bebidas por revisar» en la misma frase de siempre. Nada de números dentro de un
círculo rojo.

Cada aviso, dentro de la hoja, va con un punto ámbar de 10 px y su texto: el
mismo idioma que el punto de categoría del tile. **Nunca una franja lateral**,
que la prohíbe `DESIGN.md`. Los seis pares de color nuevos están medidos en
`scripts/contraste.mjs` (78 pares, todos por encima del mínimo en los dos
temas).

### 88. Crear una bebida propone la receta, y la vía sigue al método

Lo que ahorra teclear a ciegas: eliges método y volumen, y la receta se propone
sola —dosis por ratio, líquido si el método lo escribe, hielo si lo lleva, el
vaso más pequeño en el que quepa y el menaje—. Un cold brew de 250 ml trae 25 g
de café y el vaso frío. En cuanto se toca la receta, la propuesta se calla y
manda la de Nicolas.

**El cold brew va siempre al vaso frío**, quepa o no en uno más pequeño: 125 ml
caben en un vaso de 10 oz, pero un cold brew no se sirve en un vaso de café
caliente. Es la única excepción a «el más pequeño en el que quepa».

Corregido al ver la captura: la hoja enseñaba «Método: Cold brew» y «Cómo se
prepara: Máquina de espresso» a la vez, contradiciéndose. Ahora la **vía sigue
al método** mientras nadie la toque, y el campo de la vía se llama **«Qué ocupa
al servirla»** con la aclaración de que solo la máquina cuenta para el ritmo:
son dos cosas distintas y ahora lo dicen.

Límite conocido de la propuesta: para un método con extracción, el volumen que
escribes es a la vez el servido y el de extracción, porque una bebida recién
creada no lleva leche. Si vas a hacer un latte, propones el espresso y luego
añades la leche a mano; el bloque «Preparación» te avisará entonces si la dosis
no cuadra.

### 89. Los lotes se escriben en Preparar y suman a la carga

La sugerencia de carga contaba `bebidas × 18 g × 1,15`, que es la vía del grupo.
Un batch de 4 L son 250 g más que había que recordar de memoria. Ahora, encima
de la carga y solo si la carta activa tiene bebidas de lote, hay una fila por
método: escribes los litros y contesta «4 L → 250 g de café + 4 L de agua
(1:16)», y esos gramos entran en el café sugerido. Se guardan en `Event.lotes`,
así que siguen ahí la mañana del evento.

Cada fila se enseña solo si su vía existe en la carta activa: si el cold brew
está desactivado, su fila no ocupa sitio.

### 90. La migración v4 solo añade metadatos

`SEED_VERSION` 4. Añade `method` y `servingMl` a las catorce bebidas,
`capacityMl` a los tres vasos, el insumo `te_hoja` y sus 2 g en la receta del
Té. **No toca ninguna dosis, ningún precio y ningún modificador.**

Los seguros son los de siempre: la receta del Té solo se toca si sigue siendo la
que dejó la semilla, y un `method` o un `servingMl` ya puestos a mano no se
pisan. Hay un test que mide los tres costes del escandallo sobre una base v3
recién migrada y comprueba que salen idénticos.

### 91. Lo que queda por decidir (para Nicolas)

- **El Flat white no cabe en su vaso.** Bajar la leche a 108 ml o pasarlo al
  vaso de 10 oz (+0,035 € por bebida). Lo decide Mutuo.
- **La tónica, el licor y la hoja de té siguen a 0 €.** Cuatro bebidas de la
  carta tienen el coste incompleto. Con la factura delante son cinco minutos en
  Ajustes → Insumos.
- **El nombre del tile se recorta a 14 caracteres** desde la fase 3: al crear
  «Cold brew doble» el botón de la barra dice «Cold brew dobl», con la palabra
  partida. No es de esta fase y no se ha tocado, pero ahora que crear bebidas
  cuesta menos se va a ver más. Cortar por palabra en vez de por carácter es un
  rato.
- **El agua de extracción del Filtro dice 192 ml, no 200.** Sale de la dosis
  real (12 g × 16), no de la que pide el ratio. Es lo honesto —es el agua que
  consume de verdad—, pero si al leerlo confunde junto a los «200 ml piden
  12,5 g» de la misma línea, se cambia en una línea.

## Fase 9 — la app en un iPhone (11/09/2026)

Contexto: la boda del 12/09 se sirve desde el **iPhone 17 Pro** de Nicolas, no
desde el iPad. La app estaba hecha para 1180 px.

### 92. El punto de corte es 560 px, y por encima no se toca nada

`@media (max-width: 560px)`. El iPad está en 1180 × 820 y en 820 × 1180, los dos
por encima, así que ni una regla del móvil le llega. La sección va **al final**
de `screens.css` a propósito: así gana a las de `(max-width: 999px),
(orientation: portrait)`, que son las del iPad en vertical.

Casi todo se resuelve con CSS. Solo tres cosas necesitan saber el ancho desde
JavaScript, y para eso está la señal `esMovil` de `ui/layout.ts`: el texto de la
tercera entrada del menú, el del botón de servir y qué controles se dibujan. Sin
`matchMedia` —en las pruebas— contesta que no, así que los 350 tests de antes
siguen viendo la disposición de siempre.

### 93. «Carta y ajustes» se acorta a «Ajustes», y no hay scroll en el menú

Se probaron las dos vías del encargo. Con las tres entradas enteras, el menú
mide 424 px y a 402 se sale por la derecha: habría que desplazarlo para ver la
última, que es tanto como esconderla. Con «Ajustes», y bajando el wordmark a
16 px y las entradas a 15, cabe entero **a 375 px**. Se queda el `overflow-x` de
red de seguridad, pero no hace falta.

### 94. La cabecera de la barra, una fila de 56 px, y lo demás en una hoja de abajo

En vertical la cabecera se partía en dos filas y medía 222 px de una pantalla de
874: una cuarta parte para lo que no se toca. Ahora es una franja de 57 px con lo
único que se mira mientras se sirve —volver, el nombre, las servidas y el café— y
los cuatro controles restantes viven en **«Más»**, una hoja que sube desde abajo.

Hoja de abajo y no modal centrado: `DESIGN.md` los prohíbe en el flujo de servir,
y además en un móvil el centro de la pantalla es justo donde no llega el pulgar.
Cada acción en una fila de ≥ 56 px con su nombre y una línea de explicación
—«Rápido — cada toque sirve una bebida»—, que es sitio que en la cabecera del
iPad no había. «Cerrar barra» va la última, detrás de una línea de separación.

Lo que se cae de la cabecera no se pierde: el ritmo de la última hora se lee
dentro de la hoja «Más», y los cuatro pasos del evento siguen en Preparar, en
Cerrar y en Resultados, que es donde alguien se pregunta dónde está.

### 95. Tres columnas y tiles de 80 px: la carta entera de una, sin desplazar

Nicolas lo probó y lo dijo claro: «tengo que scrollear y en el flujo de trabajo
eso no sirve». Es un requisito duro, no una preferencia: con seis personas
delante nadie desplaza una lista para encontrar un cortado.

La cuenta a 402 × 874, con las safe areas del iPhone 17 Pro instalado (59 arriba,
34 abajo): 59 + 56 de cabecera + 12 + 56 de extras + 8 + 44 de pestañas + 8 + 72
de barra del pedido + 12 + 34 = **361 px ocupados**, y quedan **513 para el
grid**. Con dos columnas, catorce bebidas son siete filas: 7 × 96 + 6 × 12 = 744.
No entra ni de lejos. Con **tres columnas y tiles de 80** son cinco filas:
5 × 80 + 4 × 8 = **432**. Entra, y sobran 81 px.

Medido en el navegador (holgura = hueco del grid − lo que mide el grid):

| Ancho × alto | Columnas | Tile | Holgura | ¿Se desplaza? |
|---|---|---|---|---|
| 402 × 874 | 3 | 80 px | **+165 px** | no |
| 393 × 852 | 3 | 80 px | **+143 px** | no |
| 375 × 667 | 3 | 72 px | **+10 px** | no |
| 402 × 781 (safe areas simuladas) | 3 | 80 px | **+72 px** | no |
| 393 × 759 (safe areas simuladas) | 3 | 80 px | **+50 px** | no |
| 375 × 647 (SE con barra de estado) | 3 | 72 px | **−10 px** | el grid, 10 px |

El texto **no baja de 17 px**: se queda en 18, y el relleno del tile baja de
12/16 a 8 para que «Cappuccino» —la palabra más larga que no se puede partir—
quepa entera en una columna de 113 px. Ningún nombre se recorta en ninguno de
los seis tamaños; «Espresso tonic» y «Matcha latte» se parten en dos líneas con
`text-wrap: balance`, que es lo que ya hacían.

En pantallas más bajas de 750 px (un iPhone SE prestado) el tile baja a 72 px y
el hueco entre tiles a 6, que es el orden de palancas acordado. Ese hueco de 6 px
es lo único de toda la app por debajo del mínimo de 8: se queda porque son dos
tiles de 113 × 72 —no dos controles pequeños— y porque la alternativa era
desplazar. **En un SE con la barra de estado (647 px útiles) faltan 10 px y el
grid se desplaza**; en el 17 Pro y en el iPhone base no.

### 96. Nada por debajo de 15 px, también fuera de la barra

`DESIGN.md` decía «nunca por debajo de 15 px en la barra; 14 solo en tablas del
panel». En un iPad a 60 cm eso se sostiene; en la mano, a la intemperie y de
noche, no. En móvil suben a 15: los rótulos de los gráficos (14), las etiquetas
tipo «Sin proteger» (13), el número de los cuatro pasos (13), la pista de una
cifra del resumen (13) y la flecha de ordenar una tabla (11). Por encima del
corte se quedan como estaban. Las celdas de las tablas de Resultados siguen en
14, que es lo que `DESIGN.md` permite.

Lo mismo con los objetivos táctiles: el enlace «Carta y ajustes» dentro de una
frase medía 98 × 16, y el nombre del evento en la tabla de Resultados 107 × 15.
En móvil los dos pasan a 44 px de alto sin salirse de su frase ni de su celda.

### 97. El copy nombra el aparato que tienes delante

`ui/instalacion.ts` sabe ahora si esto es un iPhone, un iPad o algo que no puede
saber, y lo dice: «Instala la app en **este iPhone**», «Instalar en **este
iPad**». El iPad tiene dos caminos porque desde iPadOS 13 Safari se presenta
como un Mac; lo delata que un Mac de verdad no tiene cinco puntos de contacto.
Si no hay manera de saberlo, «este dispositivo»: inventarse un nombre para la
pantalla que alguien tiene en la mano es peor que no decirlo.

De paso, el campo «Nombre de este iPad» pasa a «Nombre de este dispositivo» y el
valor por defecto de una instalación nueva deja de ser «iPad de la barra» para
ser «Barra de Mutuo». Los que ya están guardados no se tocan.

### 98. El toast sube por encima de la barra del pedido

En vertical, el aviso «3 bebidas servidas · Deshacer» caía justo encima de la
barra inferior y tapaba el botón de servir. «Deshacer» es un control de verdad,
con ocho segundos de vida y consecuencias; no puede competir por el mismo sitio
que la acción principal. En móvil el toast se levanta 72 px + safe area.

### 99. El estado vacío de Eventos tenía dos «Nuevo evento»

Uno en la cabecera y otro debajo del bloque «Cómo funciona», a dos dedos de
distancia. No daba una salida más, daba una duda. Se queda el de la cabecera,
que es el que está en todas las pantallas de la sección.

### 100. Pausar el servicio no es cerrar la barra

Hasta ahora la barra solo tenía una salida terminal —«Cerrar barra», con
recuento— y una blanda, «‹ Eventos», que se va sin que se note que la barra
sigue abierta. Una boda va en **dos turnos**: café después de la comida, parada
durante la cena, otra vez en la fiesta. Faltaba parar sin cerrar el evento.

`Event` gana `pausas: Array<{ desde, hasta | null }>`. El `status` **sigue
siendo `live`**: lo que está parado es el servicio, no el evento. Está en pausa
si el último tramo tiene `hasta === null`. `repo.pauseService` y
`repo.resumeService` son idempotentes —parar lo ya parado no abre un tramo de
cero segundos— y **nada se borra**: cada parada deja su hora de principio y de
final, que es lo que permite rehacer la cuenta después.

El campo es opcional: un evento anterior a esta fase no lo trae, y no tenerlo
significa exactamente lo mismo que tenerlo vacío. No hace falta migración.

### 101. En pausa no se puede tocar una bebida, y la acción principal es volver

Con el servicio parado, los tiles salen apagados y un toque no registra nada. No
es una restricción por gusto: el móvil va en el bolsillo o en una bandeja entre
turno y turno, y un toque suelto es una bebida que nadie sirvió y que se lleva
un café del inventario.

Lo que sí se puede seguir haciendo es **mirar**: el Resumen, «Últimos pedidos» y
el desplegable de cada pedido siguen ahí. Y el pedido a medias que hubiera **no
se toca**: sigue montado cuando se vuelve.

La acción principal de la pantalla pasa a ser **«Reanudar servicio»**, en el
sitio exacto del botón de servir —abajo, donde llega el pulgar en el móvil, y al
pie de la columna del ticket en el iPad—. La mano ya sabe dónde está ese botón;
mover la acción a otro sitio sería pedirle que aprenda dos.

En la cabecera de la barra, donde iba el ritmo de la última hora, aparece **«En
pausa»** en ámbar. Ámbar y no rojo: no es un error ni un cierre, es un turno que
se retoma.

### 102. Estando en pausa, el ritmo dice «en pausa», no un número

El ritmo de la última hora se calcula sobre los últimos 60 minutos. Parado, cae
solo hasta cero sin que pase nada, y un número que se desmorona es peor que no
tener número: invita a mirar la máquina. En la cabecera, en la tarjeta de
Eventos y en el Resumen dice «en pausa». Las franjas de media hora **no se
tocan**: salen de los pedidos y el hueco se ve solo, que es como tiene que
verse.

### 103. La duración de la barra descuenta el tiempo parado

`closeStats.durationMinutes` era `closedAt − openedAt`. Con dos turnos eso
contaba la cena como barra abierta y estropeaba cualquier cuenta de bebidas por
hora. Ahora resta la suma de los tramos (`minutosDeServicio`), y cuando hubo
alguna pausa la cifra de Resultados lo dice debajo: «sin 1 h 30 de pausa».

Dos detalles que importan y tienen su test:

- **Un tramo abierto se corta en `closedAt`**, no en «ahora»: cerrar el evento
  con el servicio parado no puede seguir descontando tiempo para siempre.
- **En una pausa en curso, la duración deja de crecer.** Es la definición misma
  de estar parado.

### 104. Pausar se ofrece en la hoja «Más» y en la tarjeta de Eventos

En el móvil vive en la hoja «Más», separada por su propia línea y **por encima**
de «Cerrar barra»: las dos son salidas, pero solo una es definitiva.

En el iPad la cabecera de la barra no admite un botón más —«Cerrar barra» acaba
en 1164 px de 1180— así que la vía es la **tarjeta de la barra abierta en
Eventos**, que gana «Pausar servicio». Parada, esa tarjeta dice «Barra en
pausa», va en ámbar y ofrece «Reanudar servicio», «Ver la barra» y «Cerrar
barra». Es además donde Nicolas mira cuando vuelve al teléfono después de un
rato, así que es el sitio natural.

### 105. La Tapa sale de la carta (semilla v5)

Nicolas, 11/09/2026: «quita lo de la tapa». No se usaba en barra y ocupaba un
sitio en la fila de extras de nueve de las catorce bebidas, cuatro de las cuales
—Filtro, Cold brew, Té y Agua— **no admitían nada más**: su fila entera era un
chip que nadie tocaba.

Qué se hace y qué no:

- **La opción se borra.** `extra_tapa` desaparece de la semilla y de los
  `allowedModifierGroups` de todas las bebidas. Una lista de `extra` que se
  queda vacía pierde el grupo entero, no se queda como un grupo sin opciones:
  un grupo que no ofrece nada no es un grupo, y en Ajustes se leería como una
  carta rota.
- **Los tres insumos no se borran**, pasan a `trackStock: false`. Es lo
  contrario de un capricho: `tapa_6`, `tapa_10` y `tapa_fria` llevan un coste
  **medido** del escandallo (0,044 €, 0,057 € y 0,121 €) y ese número costó
  medirlo. Borrarlos sería tirarlo; con `trackStock: false` siguen en Ajustes →
  Insumos —si Mutuo las recupera, vuelven con su cifra— pero dejan de pedir un
  número en la carga y en el recuento del cierre, que es lo que ensuciaba.
- **Ni un pedido se toca.** Una línea servida con tapa guarda su receta, su
  coste y su etiqueta congelados, y la tapa sigue sumando en el consumo de aquel
  evento. La historia no se reescribe: es la regla de la app desde la fase 1.
- **El código de la tapa se va con ella.** El efecto `lid` —el que elegía la
  tapa según el vaso que Iced hubiera dejado— sale de `ModifierEffect` y del
  `switch` de `applyModifiers`. Era el único que lo usaba.

El efecto lateral que sí hubo que resolver: **una copia de seguridad anterior
devolvía la Tapa a la carta**. `importJson` solo mete las filas del catálogo que
faltan, y `extra_tapa` faltaría; las tres bebidas que admiten el grupo `extra`
entero (Cortado, Cappuccino, Latte) volverían a ofrecerla, ahora como un chip
que se toca y no hace nada, porque el efecto ya no existe. La importación
descarta las opciones cuyo efecto esta versión no sabe aplicar
(`esOpcionAplicable`). Los pedidos de esa copia sí entran enteros: su receta va
congelada y no depende de la opción.

Dos consecuencias de interfaz:

- **«Filtro · sin extras».** Con la fila de extras enseñando solo el nombre y
  nada más, se lee como algo que está cargando. Decirlo cierra la pregunta.
- **La Tapa sale de «Lo que más se pide cambiar»** del Resumen. Retirada de la
  carta, un «30 % pidió tapa» invita a decidir sobre algo que ya no se puede
  ofrecer. El dato no se pierde: sigue en la línea del pedido y en el CSV.

### 106. El aviso sube arriba cuando hay una hoja abierta

La decisión 98 levantó el aviso por encima de la barra del pedido: «Deshacer» es
un control de verdad y no puede competir por el sitio del botón de servir. La
hoja «Más» del móvil sube desde abajo y llega hasta el 86 % de la pantalla, así
que el aviso volvía a caer encima de una fila —«Pausar servicio»— y un toque ahí
daba en «Deshacer». Medido con `elementFromPoint`, no deducido.

Con un `[role="dialog"]` en pantalla, el aviso se va al borde de arriba. Arriba
no estorba: las hojas llenan desde abajo o por el lado, y la franja superior de
la barra no tiene ningún objetivo táctil en el centro. Va con `:has()`; donde no
exista, se queda como estaba, que es el comportamiento de siempre.

Lo que **no** se hizo: tirar el aviso al abrir la hoja. Habría sido más simple y
habría quitado un «Deshacer» vivo sin pedir permiso, que es justo lo que no se
puede hacer con una bebida mal servida.

### 107. El subtítulo de «Rápido» pasa de 13 a 15 px

`UX-REVISION-1 §C` fijó 13 px para ese subtítulo. `DESIGN.md` dice, más tarde y
con más motivo, que en la barra nada baja de 15 px: se lee a 60-75 cm, de noche,
con las manos mojadas. La fase 9 subió a 15 todos los rótulos del móvil y este se
quedó atrás porque el script de móvil no mide el iPad, y el del iPad no miraba el
tamaño de letra. Lo encontró la fase 10 al mirar las dos cosas a la vez.

Además llevaba `opacity: .8` encima de `--ink-2`, que bajaba el contraste por
debajo de lo que el medidor decía. Ahora el color lo pone `--ink-3`, que está
comprobado: **6,66:1** en claro y **6,19:1** en noche.

El texto se acorta a «**un toque, una bebida**» porque la cabecera del iPad no
tiene sitio: con «cada toque sirve una bebida» a 15 px, «Cerrar barra» se salía
de los 1180 px. Es la misma frase que ya usa la hoja «Más» del móvil, así que de
paso deja de haber dos redacciones del mismo concepto.

### 108. «Pedido actual» también en la barra inferior del móvil

La barra inferior decía «Pedido (3)» y la hoja que ella misma abre, «Pedido
actual (3)». El mismo objeto con dos nombres a un toque de distancia. Manda
«Pedido actual», que es el de `SPEC §3.2` y el que lo distingue de «Últimos
pedidos», la sección que tiene justo debajo.

Se midió antes de cambiarlo, porque el ancho de esa barra es el que es: la
etiqueta más larga posible —«Pedido actual (3) · 8,40 €», en modo venta— cabe en
una línea a 375, 393 y 402 px, y la barra sigue midiendo 72 px.

### 109. Abrir otra barra no «pausa» la anterior: la devuelve al paso 1

Dos pantallas decían que al abrir una barra con otra abierta «aquella se pausa».
No es verdad y, peor, «pausar» ya significa otra cosa exacta desde la fase 9: el
servicio para y el evento sigue `live`. Lo que hace `openEvent` es devolver la
otra a `planned` conservando `openedAt` y todos sus pedidos.

Ahora las dos pantallas lo dicen así: «aquella vuelve al paso 1, "Preparar", y
conserva todos sus pedidos». Un estado, un nombre.

Queda un cabo suelto que no es de copy y está en `UX-REVISION-2`, «Para después
del evento»: esa barra reaparece en Eventos bajo «Próximos · Paso 1 de 4 · listo
para abrir», sin decir que ya sirvió noventa cafés. El dato está guardado; la
portada no lo cuenta.

---

## 12/09/2026 · Fase 11 — las cuatro peticiones de Nicolas

> **Nota de numeración**: el encargo de esta sesión hablaba de «116 decisiones»
> y de seguir desde la 117. En el archivo la última era la **109**, así que
> estas siguen desde la 110. No hay ningún hueco: las 110-116 nunca existieron.

### 110. En el móvil, todos los extras a la vista en dos filas

Nicolas, probándola el día del evento: «debería poder ver todas las opciones
arriba de una». La fila de extras llevaba el nombre de la bebida y siete
controles en 402 px de ancho y se desplazaba a lo ancho: para llegar a «Sirope»
había que arrastrarla. Un extra al que hay que desplazarse, con la cola delante,
es un extra que no se pone — y «de avena» y «sin lactosa» son justo los dos que
más se piden.

Qué se hace, solo por debajo de los 560 px:

- **El nombre de la bebida sale de la fila** y pasa a un rótulo de una línea
  encima, a 15 px y en `--ink-3`, con el nombre en tinta: «Extras de: **Latte**».
  Sin bebida dice «Toca una bebida; sus extras salen aquí» y no se dibuja
  ninguna fila. Sin modificadores, «Filtro · sin extras», que es la frase de la
  decisión 105 movida de sitio.
- **Los extras envuelven en dos filas** con `flex-wrap`: arriba el segmento de
  la leche —Vaca · Avena · Sin lactosa—, abajo Desca · Doble · Iced · Sirope. El
  salto no se deja al azar: un elemento de ancho completo y alto cero detrás del
  segmento obliga a que la leche se quede sola, dijeran lo que dijeran los
  anchos de las palabras.
- **Chips de 44 px, no de 56**, y texto de 16 px. Dos filas de 56 costarían 24 px
  más de alto, y ese alto sale del grid de bebidas. 44 sigue siendo el objetivo
  táctil de `DESIGN.md`.

Medido en el navegador (`npm run capturas:peticiones`):

| | 402 × 874 | 402 × 781 (safe areas fuera) |
|---|---|---|
| Bloque de extras | 126 px (antes 56) | 126 px |
| Alto del tile | 80 px | 80 px |
| Holgura del grid con las 14 bebidas | **103 px** | **10 px** |
| `scrollWidth` del bloque de extras | 378 ≤ 378 | 378 ≤ 378 |

Entra a las dos medidas **sin bajar el tile a 72 px**, que era el primer recurso
previsto. A 402 × 781 quedan 10 px: si la carta creciera, ahí es donde se rompe
primero. El límite de la decisión 95 —más de 15 bebidas activas y vuelve a haber
scroll— se estrecha con esto: hoy caben 14 con 10 px de sobra.

**En el iPad no cambia nada**: la fila sigue midiendo 56 px, en una sola línea,
con el nombre dentro y los chips a 17 px. Medido en los dos giros.

### 111. Con el pedido vacío, la barra de abajo enseña el último servido

«Debajo debería aparecer el último pedido, o para hacer clic y verlo.»

«Pedido actual (0)» no decía nada que el botón de al lado —«Toca una bebida»— no
dijera ya. En su sitio, y **solo en el móvil y solo con el pedido vacío**, va el
último pedido servido en una línea: «Último · 12:41 · Latte · avena, 2 ×
Cortado», a 16 px, con la hora en `--ink-3` y puntos suspensivos si no cabe.
Tocarlo abre la hoja del pedido **con ese pedido ya desplegado** en «Últimos
pedidos», con sus tres acciones. Sin pedidos dice «Sin pedidos todavía».

Qué **no** cambia: en cuanto el pedido tiene una línea vuelve «Pedido actual
(N)» (decisión 108), y en pausa, corrigiendo o en modo Rápido mandan sus
etiquetas. El modo Rápido se queda con «Modo rápido activo» a propósito: ahí el
pedido siempre está vacío, y esa etiqueta es lo único que dice en la barra de
abajo en qué modo estás.

### 112. El contador de «servidas» abre el histórico

«Así como si aprietas en las servidas que se vea un histórico.»

La cifra de la cabecera pasa a ser un botón que abre el Resumen **directamente
en su lista de pedidos** —el histórico entero, con «Anular» y su «Deshacer»—.
Sigue leyéndose como una cifra: sin borde, sin relleno de color y con los mismos
32/24 px. Lo que gana es 44 px de alto, un fondo de pulsación y
`aria-label="Ver el histórico de bebidas servidas"`.

Va en los dos aparatos, no solo en el móvil: en el iPad «Últimos pedidos» está a
la vista en su columna, pero son cinco, y el resto también se busca desde ahí.

Detalle que costó medir: el relleno que le da aire al fondo de la pulsación
**se compensa con un margen negativo**. Sin eso la cabecera crecía 16 px y la
medida conocida de 1024 × 768 —donde ya no cabe— pasaba de 1108 a 1124 px. Con
la compensación vuelve a 1108 clavados, que es el número de `UX-REVISION-2`.

### 113. El aviso, del tamaño del móvil

«El botoncito de deshacer queda un poco grande en relación a la página.»

El aviso estaba dimensionado para el iPad: 56 px de alto, 18 px de letra, ancho
libre y «Deshacer» como una píldora dentro de otra. En un iPhone se comía media
pantalla cada vez que se servía algo. Por debajo de 560 px:

- **Una sola línea**, 44 px de alto, 15 px de letra, ancho al contenido y como
  mucho el 92 % del viewport. Medido: 44 px de alto y 245 px de ancho (61 %) con
  «2 bebidas servidas · Deshacer».
- **«Deshacer» deja de ser una píldora**: texto subrayado y en negrita dentro de
  la misma cápsula, con sus 44 px de objetivo táctil intactos.
- **Cola máxima de dos** en vez de tres. El «Deshacer» que importa es el último,
  y tres cápsulas apiladas llegaban a la fila de extras. En el iPad siguen tres.
- Sigue **encima de la barra del pedido** y sin taparla (decisión 98), y sigue
  subiendo arriba cuando hay una hoja abierta (decisión 106). Los ocho segundos
  de los avisos con acción no se tocan.

### 114. «Empezar de cero» un evento, con doble validación

«La parte de ir al evento, que esté abierto o algo, también se debería poder
empezar de cero, con doble validación.»

El caso es real y es el de hoy: Nicolas abrió la barra del evento de verdad para
probarla y quiere dejarla limpia antes de servir el primer café.

**Qué hace `repo.resetEvent`**, y sobre todo qué no hace:

- Todos los pedidos **vivos** del evento reciben `voidedAt` y
  `voidReason: 'reinicio'`. Nada se borra: es la regla de la app desde la fase 1.
  Salen del contador, del ritmo, del medidor, de «Últimos pedidos» y de las
  estadísticas —que ya descartan lo anulado— y siguen en la lista del Resumen,
  tachados y con la etiqueta **«Reinicio»**, que no es «Anulado»: nadie se
  equivocó, eran las pruebas.
- `openedAt` vuelve a ahora y `pausas` se vacía: lo que se mide es el servicio de
  verdad, no el de las pruebas.
- **`stockStart`, las notas, los lotes y todos los datos del evento se
  conservan.** Reiniciar no es volver a preparar el evento.
- El pedido en curso se vacía, y con él la corrección abierta si la hubiera.

**Dónde**: en la hoja «Más» del móvil, la última fila, separada de «Cerrar
barra» por su propia línea —las dos son destructivas, pero cerrar termina el
evento y esta lo deja en el punto de salida—; y en el iPad, en la tarjeta de la
barra abierta de Eventos, debajo de «Cerrar barra» y separada por una línea.
Es la misma vía que la decisión 104 eligió para pausar, y por el mismo motivo:
la cabecera de la barra del iPad no admite un control más.

**Las tres redes**, en orden:

1. Un toque **no hace nada**: despliega un panel en el sitio —nunca una ventana
   emergente— que dice qué se pierde, con las cifras de verdad: «Se anularán 3
   bebidas servidas y el pedido en curso. La carga y los datos del evento se
   conservan.» Sin nada servido lo dice también: «No hay nada servido todavía:
   solo se pone a cero el reloj de la barra.»
2. Dentro del panel hay que **mantener pulsado 1,5 s**. El progreso se pinta con
   `transform: scaleX`, que no toca el layout; con `prefers-reduced-motion` no
   hay animación y en su sitio baja una cuenta 3 · 2 · 1. Soltar antes cancela y
   no dice nada. Vale también con el teclado —barra o Intro— y la repetición de
   la tecla no reinicia la cuenta.
3. Después, **«Evento reiniciado · Deshacer» ocho segundos**. `undoResetEvent`
   quita el `voidedAt` de **esos pedidos concretos** —un pedido que ya estaba
   anulado antes del reinicio no se toca—, restaura `openedAt` y las `pausas`
   anteriores, y devuelve el pedido a medias entero.

Dos cosas que se decidieron por el camino:

- **«Cancelar» va antes del botón que reinicia**, no después. Medido en el
  navegador: con «Cancelar» debajo, el panel entraba por el pie de una hoja que
  ya llega al 86 % de la pantalla y lo único visible era el botón que reinicia.
  El panel además se desplaza solo hasta quedar entero a la vista. La salida
  tiene que verse antes que la acción.
- **El relleno del progreso va al 14 %, no al 18 %.** A 18 % el rojo del texto
  sobre el fondo ya teñido caía a 4,47:1 en noche, por debajo del mínimo de
  `DESIGN.md`. A 14 % son **5,80:1 en claro y 4,81:1 en noche**, y el par está
  ahora en `npm run contraste` («botón Mantén pulsado con el relleno detrás»)
  para que nadie lo suba sin enterarse. Por lo mismo, pulsado el botón **no**
  oscurece su fondo: refuerza el borde por dentro, que no cambia el contraste ni
  mueve la fila.

### 115. Lo que se encontró y **no** se ha arreglado hoy

En el iPad, el enlace «Carta y ajustes» del pie de Eventos mide **98 × 16 px**.
La regla que le da 44 px de alto a un enlace dentro de una frase vive solo dentro
de `@media (max-width: 560px)` desde la fase 9, así que arriba del corte nunca se
aplicó. Es anterior a esta sesión —se ve en el commit de ayer— y hoy hay una boda
de verdad: tocar CSS que no pide ninguna de las cuatro peticiones, para arreglar
un enlace de ayuda de una pantalla que no es la barra, es un riesgo que no paga.
Queda medido en cada pasada de `npm run capturas:peticiones` con la etiqueta
`NOTA`, como se hizo con la cabecera de 1024 × 768.

## 12/09/2026 · Fase 12 — el pedido a la vista y salir de la hoja

Dos peticiones de Nicolas usándola en el evento, textuales:

> «Por encimita del pedido actual, que al apretar se puede ver lo que se lleva
> del pedido, arriba de eso, que aparezca cuáles bebidas voy cargando, al menos
> la última clickeada, con posibilidad de deshacer o borrarla. Queda un espacio
> ahí. También, al apretar en servidas, te lleva al histórico de pedidos, pero
> cuesta para volver atrás; debería poder hacer todo de una, quizás que se abra
> como pop up, o con una cruz o un movimiento se pueda volver.»

### 116. La tira del pedido en curso, en el hueco que ya sobraba

En el iPad el pedido está siempre a la vista en su columna de 360 px. En el
iPhone está **detrás de un toque**, y con la cola delante ese toque no se da: el
barista monta el pedido a ciegas y lo comprueba al servir, que es tarde.

Entre la última fila de bebidas y la barra del pedido sobraba sitio. Ahí va la
tira, **solo por debajo de 560 px**:

- **El mismo orden que la hoja**: la más reciente la última, pegada a la barra,
  que es donde mira el ojo justo después de tocar una bebida.
- **Una fila de 44 px por línea**: la cantidad delante si hay más de una
  («2 × Cortado»), el nombre, y los extras detrás en `--ink-3` («· avena»), que
  se cortan con elipsis antes que empujar nada. Tocar el nombre convierte esa
  línea en la bebida actual de la fila de extras —el mismo gesto que en la
  hoja—, y se marca con fondo `--surface-2`, nunca con una franja lateral.
- **Una «×» de 44 × 44** al final de la fila, con `aria-label` «Quitar Latte con
  avena del pedido»: quita una unidad si hay más de una y la línea entera si
  queda una.
- **Con el pedido vacío la tira no existe.** Una caja vacía en el hueco no dice
  nada, y el hueco es exactamente igual de útil vacío.

Va **después** del grid y no antes: así el ojo la encuentra pegada a la barra
del pedido y, sobre todo, el grid cede espacio **por abajo**, donde no hay
ninguna bebida. Medido en los dos tamaños: la última bebida queda en el mismo
píxel con la tira puesta y con la tira escondida (687 px a 402 × 874, 635 px a
402 × 781), con cero scroll de grid y cero de página.

En el **iPad no cambia nada**: la tira ni se dibuja.

### 117. Cuántas filas se ven lo mide el navegador, no el diseño

La tentación era fijar «cuatro filas». Con las catorce bebidas de hoy, cuatro
filas (190 px) no caben en ningún iPhone, y lo que se come no es aire: es la
última fila de la carta.

Así que se mide. `ranurasDe(libre)` divide el hueco real —medido contra el borde
inferior de la última bebida, que es la única medida que no miente (la trampa de
`scrollHeight − clientHeight` de la fase 9)— entre ranuras de 45 px: 44 de
objetivo táctil más la línea que separa. Una como mínimo —«al menos la última
clickeada»— y cinco como tope, que son las cuatro filas y el rótulo.

La cuenta suma de vuelta lo que la tira ya está ocupando, así que el número no
depende de si la tira está puesta: sin eso la tira se mediría a sí misma y
oscilaría entre dos tamaños en cada repintado.

**Lo medido**, con las catorce bebidas y una bebida elegida (el bloque de extras
en sus 126 px):

| | 402 × 874 | 402 × 781 (safe areas fuera) |
|---|---|---|
| Alto del tile | 80 px | 72 px |
| Hueco libre sin la tira | 103 px | 62 px |
| Presupuesto de la tira (menos el hueco de la columna) | 95 px | 56 px |
| Ranuras | **2** | **1** |
| Tira con 1 línea | 44 px | 44 px |
| Tira con 2 líneas | 89 px (2 filas) | 44 px (1 fila) |
| Tira con 5 líneas | 88 px: «+4 más · ver todo» y 1 fila | 44 px (1 fila) |
| Holgura que queda | 7 px | 12 px |

Con más líneas de las que caben, la lista **se desplaza dentro de sí misma** y
se va sola a la más reciente al añadir. Encima, un rótulo de 15 px «+N más · ver
todo» que abre la hoja del pedido.

**El rótulo ocupa una ranura**, así que con una sola no sale: enseñar «+4 más» y
ninguna bebida sería cambiar el dato por el aviso de que hay un dato. En ese
caso la cuenta entera la da la barra de abajo, «Pedido actual (5)», que está
justo debajo, mide 44 px y abre la misma hoja. Es el caso del iPhone instalado.

### 118. El presupuesto vertical: el tile a 72 px por debajo de 820 px de alto

A 402 × 781 —el iPhone 17 Pro instalado, que es el aparato de verdad— la holgura
con una bebida elegida era de **10 px**. Ahí no cabe ni una fila de 44.

Dos ajustes, los dos por tamaño de pantalla:

- **El corte de las pantallas bajas sube de 750 a 820 px.** Con eso el iPhone
  instalado pasa a tiles de 72 px y hueco de 6 entre tiles, que es exactamente
  el primer recurso que `DESIGN.md` ya tenía escrito. Devuelve ~48 px. De paso
  cubre el iPhone 15/16 instalado (759 px útiles), que con tiles de 80 ya se
  quedaba sin holgura y nadie lo había medido.
- **El grid deja de reservar 8 px de cola de desplazamiento en el móvil.** Ahí
  el grid no se desplaza nunca —de eso va el grid de tres columnas—, así que esa
  cola es hueco muerto. Son los 8 px que hacen que a 402 × 874 quepan dos filas
  en vez de una.

**Por tamaño de pantalla y no por si la tira está puesta**: se probó la vía de
encoger el grid solo cuando aparece la tira y se descartó. Un grid que encoge al
tocar la primera bebida **mueve los objetivos debajo del dedo**, y con la cola
delante eso es peor que un tile 8 px más bajo. 72 px sigue muy por encima de los
44 de objetivo táctil y el texto no se toca: sigue en 18 px.

El grid ya baja 108 px al tocar la primera bebida porque el bloque de extras
crece (decisión 110). Eso es de la fase 11 y no lo hace la tira; queda apuntado
como `NOTA` en cada pasada de `npm run capturas:pedido`.

### 119. Quitar una bebida tiene red, y la red caduca al servir

Cada «×» deja un aviso «Quitada 1 Latte · Deshacer» de ocho segundos. Se guarda
**la línea entera**, no su id: si era la última unidad la línea deja de existir,
y deshacer tiene que poder reconstruirla con sus extras, su nota y su coste. Si
entretanto volvió a haber una igual, se funden, que es lo mismo que hace
añadirla a mano.

Y una que se vio probándola: **el aviso se retira al servir**. Su «Deshacer»
apunta al pedido que se acaba de servir; pasados dos segundos ese pedido ya no
existe y la línea habría caído en el siguiente, sin que nadie lo notara hasta el
recuento.

El aviso, además, **sube por encima de la tira**: lleva «Deshacer», que es un
control de verdad, y debajo hay ahora una fila de «×». Si cayera encima, un
toque para quitar la bebida siguiente daría en «Deshacer». Es la decisión 98 una
fila más arriba. Lo que ocupa la tira se calcula, no se mide (`altoDeLaTira`),
para que el aviso sepa dónde ponerse en el mismo repintado.

### 120. La cabecera de una hoja va pegada arriba

El diagnóstico de la segunda petición, medido: al tocar «servidas» la hoja del
Resumen se abre **ya desplazada** hasta la lista de pedidos —724 px a 402 × 874,
817 px a 402 × 781— y con eso el título y la «X» se quedaban fuera de la
pantalla. La única salida a la vista no existía, y de ahí «cuesta para volver
atrás».

No se convierte en ventana emergente centrada: `DESIGN.md` las prohíbe en el
flujo de servir y en un móvil el centro de la pantalla es justo donde no llega
el pulgar. Se arregla la hoja, en las tres: la lateral, la de abajo y la del
pedido.

- `position: sticky` en la cabecera, con el título y la **«X» de ≥ 44 px**
  siempre a la vista. Medido con la hoja abierta por el ancla: el botón de
  cerrar cae en (314, 48) y mide 64 × 56 px, entero dentro del viewport, en los
  dos tamaños y en los dos giros del iPad.
- **El margen negativo con su relleno del mismo tamaño** es lo que hace que,
  pegada, tape también el relleno de la hoja. Y `top: 0` **no vale**: medido en
  el navegador, pega la cabecera por debajo del relleno de arriba y por ese
  hueco de 24 px se veía asomar el contenido que pasaba por detrás. Se pega con
  el relleno en negativo.
- **El ancla reserva sitio para la cabecera** (`scroll-margin-block-start` con
  su alto real): abrir por «Pedidos» ya no deja sus primeras líneas debajo del
  título.
- La línea inferior aparece **solo cuando hay algo desplazado debajo**, y va en
  `box-shadow`: un borde que aparece y desaparece mueve la hoja un píxel.

### 121. Deslizar para cerrar, con su asa, y solo en el móvil

El segundo camino de salida, el que la mano intenta sola en un iPhone: arrastrar
la hoja hacia abajo **más de 80 px** la cierra; menos, vuelve a su sitio.

- **No rompe el scroll interno**: el gesto solo arranca cuando nada entre el
  sitio que se toca y la hoja está desplazado. Con la lista a medias, el dedo
  desplaza. Desde el **asa** o la cabecera se arrastra siempre: son el tirador,
  y por eso llevan `touch-action: none` mientras la hoja va en `pan-y`.
- **Asa** de 4 × 36 px centrada arriba, el indicador que la gente ya reconoce.
  Va dentro de la cabecera pegada y posicionada en absoluto: no le roba alto a
  la hoja. En el iPad no se dibuja.
- Con **`prefers-reduced-motion`** la hoja no sigue al dedo: se cierra al soltar
  si el recorrido pasó del umbral, y nada se mueve por el camino.
- **Solo por debajo de 560 px.** En el iPad la hoja entra por el lado, hay
  teclado y ratón, y arrastrar hacia abajo no significa nada: comprobado que
  arrastrar 200 px allí no cierra nada.
- Escape, tocar el fondo y el foco devuelto al abrir y cerrar siguen exactamente
  igual.

### 122. Lo que se encontró de paso y **sí** se ha arreglado

En el iPad, el nombre de una línea del ticket —el botón que la convierte en la
bebida actual— medía **140 × 35 px**. La regla que le da 44 px de alto vivía
solo dentro de `@media (max-width: 560px)` desde la fase 9, así que arriba del
corte nunca se aplicó. Es el mismo patrón que el enlace de la decisión 115.

Este sí se arregla: entra dentro de la fila de 56 px sin moverla, no toca ninguna
medida de la cabecera y es un objetivo que se usa en cada pedido. Lo mide
`npm run capturas:pedido` en los dos giros.

**Sigue sin arreglar** el enlace «Carta y ajustes» del pie de Eventos (98 × 16 px
en el iPad, decisión 115): es de una pantalla que no es la barra y sigue
apuntado como `NOTA` en cada pasada de `capturas:peticiones`.

---

## 12/09/2026 · Fase 13 — la tira tiene dos estados

La petición de Nicolas, textual, después de servir con ella:

> «Una vez realizado el pedido, me gustaría que se viera directamente dónde se
> iban acumulando los pedidos. De forma que si me olvido de algo, a simple
> vista pueda repasarlo. Como arribita de donde sale hacer pedido, que queda un
> espacio. Ver la forma para que quede bien.»

### 123. La tira tiene dos estados, y siempre dice cuál está enseñando

La tira de la fase 12 se dibujaba solo con el pedido a medias. Servido el
pedido desaparecía y el hueco volvía a estar vacío justo en el momento en el
que el barista levanta la cabeza y se pregunta qué acaba de servir.

Ahora, en el mismo sitio y con el mismo presupuesto vertical medido:

- **«Pedido actual»**: las líneas que se están montando, con su «×» y su
  «Deshacer». Es la fase 12 sin tocar.
- **«Ya servidos»**: con el pedido vacío, los pedidos servidos.

Lo que **no** se hace es dejar que la misma caja cambie de significado sin
avisar. Una tira que un segundo enseña lo que vas a servir y al siguiente lo que
ya serviste, con la misma pinta, no es una ayuda: es una manera de servir dos
veces el mismo café. Así que la tira **se nombra a sí misma**, siempre, en los
dos estados y en el mismo sitio: un rótulo de 15 px en `--ink-3` encima de la
lista. Lo que cambia entre estados es la palabra, no el sitio ni el tamaño.

El color **acompaña, no manda**: el estado vivo es una tarjeta blanca
(`--surface`) con el texto en tinta; la historia no es una tarjeta —se hunde en
el fondo de la página (`--bg`) y se marca con un filo de 1 px— y el texto baja a
`--ink-2`. El filo va en `box-shadow: inset` y no en `border` porque un borde de
verdad sumaría 2 px al alto y la cuenta de ranuras va al píxel (la misma razón
por la que la línea de la cabecera de una hoja es una sombra, decisión 120).

Con el pedido vacío y **nada servido** no se dibuja nada: una caja vacía en el
hueco no dice nada. En el **iPad** tampoco existe ninguno de los dos: allí el
pedido y «Últimos pedidos» ya están enteros en la columna de 360 px.

### 124. «Ya servidos»: la hora delante y ninguna «×»

Cada fila es un pedido: la **hora** en tabular `--ink-3` y la frase del pedido
detrás —«Latte · avena, 2 × Cortado»—, cortada con elipsis antes que empujar
nada. La hora no es decoración: es lo que contesta «¿este es el de hace un
momento o el de hace media hora?» sin restar de cabeza, y de paso es la señal de
contenido —no de color— de que eso ya pasó.

- **El más reciente abajo**, pegado a la barra, el mismo criterio que el otro
  estado: lo último es lo que se mira.
- **Tocar una fila** abre la hoja del pedido con **ese** pedido desplegado en
  «Últimos pedidos», donde están Repetir, Editar y Anular. Es el gesto que ya
  existía en la barra de abajo (decisión 111), movido a su fila.
- **Sin «×»**. En «Pedido actual» la «×» quita una línea de algo que todavía no
  existe y tiene ocho segundos de red. Aquí quitar sería **anular un pedido
  servido**: eso cambia el contador, el medidor y el coste del evento, y se
  queda donde está, en la hoja, con su «Deshacer» y su motivo. Una fila de
  «×» de 44 px a un dedo de distancia de las bebidas es una anulación por
  accidente esperando a que haya cola.
- **«+N más · ver todo»** cuando hay más pedidos que filas, igual que en el otro
  estado y abriendo la misma hoja.

### 125. El rótulo cuesta 14 px, y catorce es una cifra medida

El rótulo sale del hueco, que es lo único que la tira tiene. Medido en el
navegador (`npm run capturas:servidos`), el presupuesto de la tira:

| | 402 × 874 | 402 × 781 (el iPhone instalado) |
|---|---|---|
| «Pedido actual» (con una bebida elegida) | **103 px** | **62 px** |
| «Ya servidos» (con el pedido vacío) | **211 px** | **170 px** |

La diferencia no es un error: con el pedido vacío **el bloque de extras se
repliega** —de 104 px a la línea «Toca una bebida; sus extras salen aquí»
(decisión 110)— y deja 108 px libres. Por eso «Ya servidos» puede enseñar tres
filas donde «Pedido actual» enseña una o dos.

Y por eso el rótulo se mide contra el estado apretado, que es «Pedido actual»:

- Con un rótulo de **20 px**, a 402 × 874 la tira se quedaría en una fila en vez
  de dos, y a 402 × 781 se pasaría **2 px** del hueco: empujaría el grid, que es
  la única cosa que la tira no puede hacer.
- Con **14 px** entran exactamente las mismas filas que antes de esta fase en los
  dos tamaños. Son 15 px de letra en una caja de 14 —una línea de rótulo, sin
  aire que regalar— y la comprobación de que ningún texto baja de 15 px sigue en
  verde, porque lo que se mide ahí es el tamaño de la letra.

Para que los 14 px cupieran hizo falta además que **la tira dejara de pagar
hueco de columna**: `.tira` lleva un margen negativo de `--work-gap` (8 px, 6 en
pantallas bajas) y su rótulo hace de separación. El efecto que mide el hueco
cuenta con ello y por eso ya no resta la separación.

**Lo medido, con las catorce bebidas:**

| | 402 × 874 | 402 × 781 |
|---|---|---|
| «Pedido actual», 2 líneas | 103 px de tira (2 filas) · holgura **0** | 58 px (1 fila) · holgura **4** |
| «Ya servidos», 1 pedido | 58 px (1 fila) · holgura 153 | 58 px (1 fila) · holgura 112 |
| «Ya servidos», 3 pedidos | 148 px (3 filas) · holgura 63 | 148 px (3 filas) · holgura 22 |
| «Ya servidos», lleno | 192 px (3 filas + «+4 más») · holgura 19 | 147 px (2 filas + «+5 más») · holgura 23 |

En los cuatro casos y en los dos tamaños, la última bebida se queda en el mismo
píxel (687 y 635 px montando, 579 y 527 con el pedido vacío) y
`scrollHeight === clientHeight` en el grid **y** en la página. El caso apretado
es «Pedido actual» con dos líneas a 402 × 874: **0 px de holgura**, el rótulo
pegado a la última fila de bebidas. Cabe y no empuja nada —está medido—, pero es
el sitio por donde esto se rompe primero si la carta crece o el rótulo engorda.

### 126. La barra de abajo deja de repetir el último pedido

La decisión 111 puso «Último · 12:41 · Latte · avena, 2 × Cortado» en la barra
de abajo porque el hueco de encima estaba vacío. Ya no lo está. Decir lo mismo
dos veces a 44 px de distancia no es insistir, es gastar la única línea que
tiene la barra.

Así que la barra vuelve a **«Pedido actual (0)» / «Toca una bebida»** y el
último pedido lo cuenta la tira, que además enseña los tres anteriores.

**El texto de «Último …» se queda como recurso**, no como norma: sale cuando no
lo cuenta nadie más. Hoy eso es una pantalla donde la tira no cabe ni con su
rótulo y una fila —`cabeLaTira`, 58 px— y el caso de no haber servido nada
todavía, donde la barra sigue diciendo «Sin pedidos todavía». Medido: en los dos
tamaños de verdad la tira cabe de sobra, así que el recurso no se usa; está
escrito para el iPhone que no tenemos delante.

### 127. Un concepto, un nombre: «Pedido actual» y «Ya servidos»

El encargo proponía «En el pedido» / «Servidos». Se cambian los dos, y por el
mismo motivo:

- **«Pedido actual»** y no «En el pedido»: el pedido en curso se llama «Pedido
  actual» en la barra de abajo, en la cabecera de la hoja y en el ticket del
  iPad. `DESIGN.md` lo dice —«un concepto, un nombre»— y `UX-REVISION-2 §2`
  arregló exactamente este fallo hace dos fases. Que el rótulo repita el nombre
  de la barra que tiene justo debajo no es redundancia: es la misma cosa
  llamándose igual a 44 px de distancia.
- **«Ya servidos»** y no «Servidos»: la cabecera de la barra cuenta «8
  **servidas**», que son bebidas, y estas filas son **pedidos**. «Ya» hace el
  trabajo temporal de un vistazo y no se confunde con la cifra de arriba.

### 128. En el modo Rápido no se toca, y queda apuntado

En Rápido cada toque sirve y no hay pedido que montar, así que el hueco está
libre todo el rato y el estado «Ya servidos» encajaría ahí mejor que en ningún
otro sitio: es el modo donde más fácil es perder la cuenta.

No se cambia hoy: el modo Rápido tiene su propia manera de contar lo servido
—la fila de extras sigue editando el último pedido durante ocho segundos— y
mezclar las dos cosas sin medirlo es cambiar un modo que funciona la víspera de
un evento. Queda escrito como propuesta en `docs/UX-REVISION-2.md`.
