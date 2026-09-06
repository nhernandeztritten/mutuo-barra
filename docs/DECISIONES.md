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
