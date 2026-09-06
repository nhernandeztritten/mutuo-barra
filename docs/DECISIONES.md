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

## Pendiente de decidir (fase 2 en adelante)

- **Precios reales**: los 14 de la carta están marcados `priceProvisional: true`. Solo se usan en modo «venta».
- **Insumos sin costear**: tónica, licor, sirope y pajita están a 0 € con `costSource: 'sin-costear'`. Mientras sigan a 0, el coste de un Espresso tonic y de un Cremaet está **incompleto**.
- **Café descafeinado**: se asume el mismo precio que el normal (0,0297 €/g). Sin verificar con factura.
- **Hielo por bebida**: los 120 g son estimación; el escandallo no lo desglosa.
