# Mutuo · Barra — Especificación v1

**Fecha**: 06/09/2026 · **Primera prueba real**: boda del 12-13/09/2026 (6 días)
**Qué es**: aplicación para el iPad de la barra de café de Mutuo. Registra cada bebida servida durante un evento, sin internet, y al cerrar el evento devuelve qué se sirvió, qué insumos se consumieron, qué stock queda y cuánto costó. Esos datos alimentan un panel comparativo entre eventos (ordenador) y, en v2, se sincronizan entre dispositivos.
**Qué NO es**: no cobra con tarjeta (no hay datáfono integrado), no emite facturas, no gestiona clientes.

Referencia observada: Square Register en una cafetería (7 fotos). Lo que copiamos: grid de productos por categoría + ticket lateral + un botón grande de confirmación + variantes por producto. Lo que corregimos: Square está hecho para cobrar; en Mutuo el 80 % de los eventos el anfitrión paga la tarifa y el invitado no paga nada, así que la acción primaria es **servir**, no cobrar. El cobro es un modo del evento, no el centro.

---

## 1. Usuarios y escena

Dos personas (Nicolas y su pareja), baristas, en una carpa o jardín, de 18:00 a 23:00, con sol de tarde y después luces cálidas. iPad en soporte a un brazo de distancia, manos mojadas, cola de 4-6 personas, **5 segundos por interacción**. Registrar un cortado con avena tiene que costar **dos toques**.

Consecuencias de diseño: tema claro de alto contraste (sol), tiles y botones ≥ 56 px, nada que requiera scroll en la pantalla principal en horizontal, cero texto pequeño, deshacer siempre visible, ningún diálogo de confirmación en el flujo caliente.

## 2. Modelo de dominio

### 2.1 Insumo (`Ingredient`)
Materia prima o consumible con coste unitario. Todo coste **con IVA incluido** (criterio del escandallo).

| id | nombre | unidad receta | unidad stock | coste/unidad receta | origen del dato |
|---|---|---|---|---|---|
| cafe | Café | g | kg | 0,0297 € (29,70 €/kg) | escandallo, medido |
| cafe_desca | Café descafeinado | g | kg | 0,0297 € | asumido igual, SIN VERIFICAR |
| leche | Leche entera | ml | L | 0,00096 € | escandallo, medido |
| avena | Bebida de avena | ml | L | 0,00219 € | escandallo, medido |
| sin_lactosa | Leche sin lactosa | ml | L | 0,0014 € | ratios (5 L ≈ 7 €), ESTIMACIÓN |
| agua | Agua filtrada | ml | L | 0,00038 € | ratios (34 L ≈ 13 €), ESTIMACIÓN |
| hielo | Hielo | g | kg | 0,00035 € | escandallo |
| matcha | Matcha | g | g | 0,0908 € | vías de producción (2,5 g = 0,227 €) |
| vaso_6 | Vaso 6 oz | ud | ud | 0,062 € | escandallo |
| vaso_10 | Vaso 10 oz | ud | ud | 0,097 € | escandallo |
| vaso_frio | Vaso frío 425 ml | ud | ud | 0,142 € | escandallo |
| tapa_6 | Tapa 6 oz | ud | ud | 0,044 € | escandallo |
| tapa_10 | Tapa 10 oz | ud | ud | 0,057 € | escandallo |
| tapa_fria | Tapa vaso frío | ud | ud | 0,121 € | escandallo |
| menaje | Servilleta + removedor + azúcar | ud | ud | 0,031 € | escandallo (0,014+0,007+0,010) |
| tonica | Tónica | ml | L | 0 € | SIN COSTEAR |
| licor | Licor (cremaet / 43) | ml | L | 0 € | SIN COSTEAR (escandallo §6) |
| sirope | Sirope | ml | L | 0 € | SIN COSTEAR |
| pajita | Pajita | ud | ud | 0 € | SIN COSTEAR |

Los insumos con coste 0 se muestran en Ajustes con la etiqueta **«Sin costear»** para que Nicolas los rellene. Nunca se inventa un número.

Campos: `id, name, unit ('g'|'ml'|'ud'), stockUnit ('kg'|'L'|'ud'|'g'), stockFactor (1000 para g→kg y ml→L, 1 para ud/g), costPerUnit, costSource ('medido'|'estimado'|'sin-costear'), trackStock (bool: aparece en carga y recuento), sortOrder`.

### 2.2 Producto (`Product`)
Bebida de la carta. Tiene receta base (lista de `{ingredientId, qty}`), categoría, vía de producción, precio provisional y qué grupos de modificadores admite.

Vías (del modelo de Mutuo): `grupo` (espresso, consume máquina y barista) · `lote_caliente` (filtro batch) · `lote_frio` (cold brew, matcha frío) · `envasado` (latas). La vía sirve para las métricas de ritmo: solo `grupo` cuenta contra el techo de 50 bebidas/h por barista.

Carta inicial (v1, editable en Ajustes). Todas las recetas incluyen 1 `menaje`. Café 18 g salvo indicación.

**Doble dosis (decisión de Nicolas, 07/09/2026)**: el **Americano** y el **Flat white** se sacan con 36 g de café. Como ya son dobles, no admiten el modificador «Doble».

| Categoría | Producto | Vía | Receta | Precio provisional* |
|---|---|---|---|---|
| Espresso | Espresso | grupo | cafe 18 · vaso_6 | 2,00 |
| Espresso | Americano | grupo | **cafe 36** · agua 150 · vaso_10 | 2,50 |
| Con leche | Cortado | grupo | cafe 18 · leche 120 · vaso_6 | 2,20 |
| Con leche | Flat white | grupo | **cafe 36** · leche 120 · vaso_6 | 3,00 |
| Con leche | Cappuccino | grupo | cafe 18 · leche 130 · vaso_6 | 3,00 |
| Con leche | Latte | grupo | cafe 18 · leche 220 · vaso_10 | 3,20 |
| Filtro | Filtro | lote_caliente | cafe 12 · vaso_10 | 2,80 |
| Fríos | Cold brew | lote_frio | cafe 12,5 · hielo 120 · vaso_frio | 3,50 |
| Fríos | Espresso tonic | grupo | cafe 18 · tonica 200 · hielo 120 · vaso_frio | 3,80 |
| Fríos | Matcha latte | lote_frio | matcha 2,5 · leche 200 · vaso_10 | 3,80 |
| Especiales | Cremaet | grupo | cafe 18 · licor 30 · vaso_6 | 3,50 |
| Especiales | Carajillo | grupo | cafe 18 · licor 30 · vaso_6 | 3,50 |
| Otros | Té / infusión | lote_caliente | agua 200 · vaso_10 | 2,00 |
| Otros | Agua | envasado | vaso_10 · agua 250 | 1,00 |

\* **Los precios son provisionales y NO están decididos por Mutuo.** Solo se usan en modo «venta por bebida». Ajustes los muestra con la etiqueta «provisional» hasta que se editen. El hielo por bebida (120 g) es una estimación: el escandallo no lo desglosa.

Campos: `id, name, shortName (≤ 12 car. para el tile), category, via, recipe[], price, priceProvisional (bool), allowedModifierGroups[], active, sortOrder`.

### 2.3 Modificadores (`Modifier`)
Cambian la receta y opcionalmente el precio. Se agrupan; un grupo `single` admite una opción, `multi` varias.

| Grupo | Tipo | Opción | Efecto en receta | Δ precio provisional |
|---|---|---|---|---|
| leche | single | Vaca (default) | — | — |
| leche | single | Avena | sustituye `leche` por `avena` (misma cantidad) | +0,50 |
| leche | single | Sin lactosa | sustituye `leche` por `sin_lactosa` | +0,30 |
| cafe | single | Normal (default) | — | — |
| cafe | single | Descafeinado | sustituye `cafe` por `cafe_desca` | — |
| extra | multi | Doble | +18 g del café que lleve (normal o desca) | +0,80 |
| extra | multi | Iced | sustituye vaso_6/vaso_10 por `vaso_frio`, añade hielo 120 g | +0,30 |
| extra | multi | Sirope | + sirope 10 ml | +0,40 |
| extra | multi | Tapa | + tapa del tamaño del vaso (tapa_6 / tapa_10 / tapa_fria) | — |

`allowedModifierGroups`: bebidas con leche → leche, cafe, extra · **Flat white → leche, cafe, extra (Iced, Sirope, Tapa): ya es doble** · Espresso → cafe, extra (Doble, Iced, Tapa) · **Americano → cafe, extra (Iced, Tapa): ya es doble** · Filtro → extra (Tapa) · Cold brew → extra (Tapa) · Espresso tonic → cafe, extra (Doble) · Matcha → leche, extra (Iced, Tapa) · Cremaet/Carajillo → cafe · Té/Agua → extra (Tapa).

Regla de aplicación: los modificadores se aplican sobre la receta base en orden `leche → cafe → extra`, y el resultado (receta final + precio final) **se congela en la línea del pedido**. Editar la carta después no reescribe la historia.

### 2.4 Evento (`Event`)
`id (uuid), name, type ('boda'|'privado'|'activacion'|'rodaje'|'mercado'|'otro'), date (ISO), venue, guestsExpected, drinksPerGuest (default 1,2), hoursContracted, baristas (default 2), mode ('incluido'|'venta'), status ('planned'|'live'|'closed'), openedAt, closedAt, stockStart {ingredientId: qtyRecipeUnits}, stockEnd {ingredientId: qtyRecipeUnits} | null, guestsReal, setupMinutes, teardownMinutes, notes, createdAt, updatedAt`.

Solo puede haber **un evento `live`** a la vez. Abrir otro pide pausar el actual (pasa a `planned` conservando pedidos; se puede reabrir).

**Sugerencia de carga** al crear el evento (solo sugerencia; Nicolas escribe lo que carga de verdad):
`bebidas previstas = guestsExpected × drinksPerGuest` → café = bebidas × 18 g × 1,15 · leche = bebidas × 120 ml (ratio Nobil, conservador) · avena = bebidas × 10 % × 200 ml · vasos 6 oz = bebidas × 55 % × 1,1 · vasos 10 oz = bebidas × 35 % × 1,1 · vasos fríos = bebidas × 10 % × 1,1 · hielo = bebidas × 30 g. Los porcentajes vienen del mix de boda del escandallo. Se muestra como «Sugerido: 3,25 kg» junto al campo, con botón «Usar sugerencia».

### 2.5 Pedido (`Order`) y líneas (`OrderLine`)
Un pedido es un grupo de bebidas servidas a la vez (una persona pide tres).
`Order: id (uuid), eventId, createdAt, servedAt, deviceId, mode, lines[], subtotal, tip, total, payment ('efectivo'|'tarjeta'|'bizum'|'invitacion'|null), cashGiven, voidedAt | null, voidReason, note`
`OrderLine: id, productId, productName, modifiers [{groupId, optionId, label}], qty, unitPrice, unitCost, usage {ingredientId: qty} (receta final por unidad), note`

`usage` y `unitCost` se calculan al añadir la línea y se guardan. Consumo del evento = Σ líneas no anuladas × qty × usage.

Todo es **append-only con uuid + deviceId**: anular es poner `voidedAt`, nunca borrar. Esto hace trivial la sincronización futura (unión de conjuntos sin conflictos).

## 3. Pantallas y flujos

### 3.1 Eventos (inicio)
- Si hay evento `live`: tarjeta grande «En curso · Boda Ana y Marc · 84 bebidas · 47/h» con botón **Volver a la barra**.
- Próximos (planned, ordenados por fecha) con **Abrir barra**. Pasados (closed) con resumen en una línea (bebidas · coste/bebida) y acceso al detalle.
- **Nuevo evento**: formulario en una sola página con dos bloques: *Datos* (nombre, tipo, fecha, lugar, invitados, horas, baristas, modo de cobro) y *Carga* (stock inicial de los insumos `trackStock`, con sugerencia). Se puede guardar sin carga y rellenarla al abrir.
- Estado vacío del primer uso: «Sin eventos todavía» + botón Nuevo evento + enlace «Probar con un evento de ejemplo» (crea uno de demostración marcado como tal).

### 3.2 Barra (pantalla principal, `live`)
Layout horizontal (1180 × 820 referencia iPad 10.ª gen; también 1024 × 768 y 1194 × 834):

```
┌ Cabecera 64 px: MUTUO. · Boda Ana y Marc · 84 servidas · 47/h · café ▮▮▮▯ 62 % · [Resumen] [Pausar] ┐
├───────────────────────────────────────────────┬──────────────────────────────┤
│ Extras de la última bebida 56 px:             │ Pedido actual (3)            │
│   Latte · [Vaca|Avena|Sin lactosa] Desca      │ ─ Cortado · avena     1 [−+] │
│   Doble Iced Sirope Tapa                      │ ─ Latte               2 [−+] │
│ Leyenda de categorías 48 px                   ├──────────────────────────────┤
│ Grid de tiles (auto-fit, min 150 px, alto 96) │ Últimos pedidos   Ver todos  │ 48 px
│   [Cortado] [Flat white] [Cappuccino] [Latte] │ 09:11 Latte · avena [Repetir]│
│                                               │ 09:10 2 × Cortado   [Repetir]│
│                                               │  Deshacer último             │
│                                               │ ┌──────────────────────────┐ │
│                                               │ │   Servir 3 bebidas       │ │ 72 px
│                                               │ └──────────────────────────┘ │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

Reglas:
1. **Tocar un tile añade la bebida al pedido**, sin modificadores, y esa línea pasa a ser **la bebida actual**.
2. La fila de 56 px de arriba es **la de los extras de la bebida actual** —postfija, no un prefijo que armar antes (decisión 46)—. Antes de tocar nada dice «Toca una bebida; sus extras salen aquí». Con una bebida actual enseña su nombre y **solo los extras que ese producto admite**, por grupo: `leche` como segmento de opción única (Vaca · Avena · Sin lactosa), `cafe` como interruptor único «Desca», `extra` como interruptores. Tocar uno lo pone o lo quita **en esa línea**; si al hacerlo la línea coincide con otra, se funden. El extra puesto va en violeta. Un extra que no aplica **no se enseña**, así que no hay nada que ignorar ni ningún chip que sacudir.
3. Misma bebida + mismos modificadores → se agrupa (qty +1).
4. Tocar el nombre de una línea **la convierte en la bebida actual** (se marca con fondo `--surface-2` y el nombre en 600). Su botón **«Más»** (44 px, al final de la fila) abre la hoja lateral (no modal centrado) con los grupos de modificadores del producto y una nota; cambiar y cerrar. La hoja no se abre con una pulsación larga: con las manos mojadas es una apuesta (decisión 47).
5. **Servir**: guarda el pedido con `servedAt = now`, vacía el pedido y **la fila de extras vuelve al estado vacío**; muestra toast «3 bebidas servidas · Deshacer» durante 8 s. Deshacer anula el pedido (voidedAt) y lo devuelve al ticket. «Deshacer último» quita la última línea y la fila pasa a la anterior.
6. **Modo Rápido** (interruptor en cabecera, off por defecto): cada tile registra y sirve una bebida al instante, sin ticket. Para picos. La fila de extras edita **la última bebida servida** durante los 8 s que vive su «Deshacer»: tocar un extra reescribe las líneas de ese pedido ya guardado —mismo `id`, `usage` y `unitCost` recalculados— sin crear otro ni anular ninguno. Pasados los 8 s, o si se deshace el pedido, la fila vuelve al estado vacío.
6 bis. **«Últimos pedidos»**, al pie de la columna derecha y **en los dos modos** (decisión 65): los **5 pedidos no anulados más recientes** del evento, el más nuevo arriba. Cada fila lleva la hora en tabular (`--ink-3`) y las líneas en una frase —«Latte · avena, 2 × Cortado, Americano · desca», modificadores en `--ink-3` y abreviados como en la fila de chips (decisión 63)—, cortada a dos líneas con elipsis. Cabecera «Últimos pedidos» + enlace **«Ver todos»**, que abre la hoja de Resumen **directamente en su lista de pedidos**, donde está «Anular» (decisión 64). Vacía dice «Todavía no hay pedidos servidos». La lista es una región `aria-live` polite.
   - **«Repetir»** (≥ 44 px, secundario) en cada fila: recalcula las líneas con la carta de ahora, conservando opciones, cantidad y nota. En modo normal caen en el pedido actual y **se agrupan** con lo que ya hubiera; en Rápido se sirven al momento con su toast «N bebidas servidas · Deshacer». Si la bebida ya no está activa, se avisa y no se repite nada. Feedback: la fila hace un fundido breve; sin ventanas emergentes (decisión 61).
   - El pedido recién servido entra arriba mientras se vacía el pedido actual; el «Deshacer» del toast lo saca de la lista y lo devuelve al pedido. Lo anulado no aparece (decisión 62).
   - La sección va **encima** del botón de servir, que no se mueve nunca (decisión 59). Si el pedido actual crece, la sección cede espacio la primera hasta un mínimo de **dos filas enteras**; a partir de ahí hace scroll el pedido dentro de su caja, nunca la página (decisión 60). En vertical va dentro de la hoja del pedido, debajo de las líneas.
7. Modo `venta`: los tiles muestran el precio, el botón dice «Cobrar 6,20 €» y abre la hoja de cobro: Efectivo (importes rápidos: exacto, 5, 10, 20 → cambio) · Tarjeta · Bizum · Invitación; propina opcional. Confirmar = servir.
8. Cabecera: bebidas servidas del evento, ritmo de la última hora (bebidas de la vía `grupo` en los últimos 60 min), barra de café restante (`stockStart.cafe − consumo teórico`) que pasa a ámbar < 25 % y a rojo < 10 %. Si no hay `stockStart.cafe`, la barra no se muestra y aparece «Sin carga registrada» tocable.
9. **Pausar** lleva a Eventos sin cerrar. Nada se pierde: el pedido en curso se conserva en memoria del evento.
10. En vertical (portrait) el ticket se pliega en una barra inferior «Pedido (3) · Servir» que se despliega hacia arriba.
11. Sin scroll vertical en el grid en horizontal con ≤ 12 productos por categoría; si hay más, el grid hace scroll dentro de su contenedor, nunca la página.

### 3.3 Resumen en vivo (pestaña dentro del evento live)
Sin salir del evento: bebidas por hora (barras por franjas de 30 min), top 5 bebidas, reparto de leches (vaca / avena / sin lactosa), consumo teórico vs carga para cada insumo con stock (barras), ritmo actual vs techo (`baristas × 50`). Lista de pedidos del evento con hora, líneas y **Anular** (pide motivo en un chip: error / devuelto / otro).

### 3.4 Cerrar evento
Página de cierre, tres bloques:
1. **Recuento**: por cada insumo con `stockStart`: cargado · consumo teórico · **queda (input)** → consumido real y desviación %. Todos opcionales; si no se rellena, el real = teórico y se marca «sin recuento».
2. **Notas**: invitados reales, minutos de montaje y desmontaje, incidencias (texto).
3. **Resultado**: bebidas servidas · bebidas por invitado · pico (máximo en 15 min × 4, en beb/h) · coste teórico · coste real (si hay recuento) · coste por bebida · merma % · ingresos y propinas (modo venta) · duración real (openedAt→closedAt).
Botón «Cerrar evento». Un evento cerrado se puede **Reabrir** desde su detalle (corrige recuentos).

### 3.5 Historial y Panel (`/panel`, pensado para ordenador pero funciona en iPad)
- Tabla de eventos cerrados: fecha, nombre, tipo, invitados, bebidas, beb/invitado, coste/bebida, ritmo pico, ingresos.
- Comparativas (gráficos sencillos SVG propios, sin librería): bebidas por evento, coste por bebida por evento, mix por categoría acumulado, leches acumuladas, curva horaria media (bebidas por franja desde apertura).
- **Exportar**: CSV de pedidos (una fila por línea), CSV de consumos por evento, JSON completo (copia de seguridad). **Importar** JSON (fusiona por uuid, no duplica). En iPad, exportar usa `navigator.share` con archivo si está disponible; si no, descarga.

### 3.6 Ajustes
- **Carta**: lista de productos por categoría, activar/desactivar, editar nombre corto, precio (con etiqueta «provisional»), receta (insumo + cantidad), modificadores admitidos, orden. Crear producto nuevo. Crear modificador nuevo dentro de un grupo.
- **Insumos**: coste unitario, origen del dato (medido / estimado / sin costear), seguimiento de stock sí/no.
- **Dispositivo**: nombre del dispositivo (para `deviceId`), estado de almacenamiento persistente, versión de la app, botón «Copia de seguridad ahora».

## 4. Cálculos (funciones puras, con tests)

- `applyModifiers(product, selections) → {usage, unitPrice, unitCost}`
- `eventConsumption(orders) → {ingredientId: qty}` (excluye anulados)
- `eventStats(event, orders, products) → {served, byProduct, byCategory, byMilk, perHalfHour[], lastHourRate, peakRate15, costTheoretical, revenue, tips, drinksPerGuest}`
- `closeStats(event, orders, ingredients) → {realConsumption, deviationPct, costReal, costPerDrink, wastePct}`
- `loadSuggestion(guests, drinksPerGuest) → {ingredientId: qty}`
- `formatMoney`, `formatQty` (es-ES, coma decimal, «3,25 kg», «17,5 L», «180 ud»)

## 5. Técnica

- **PWA** instalable en pantalla de inicio del iPad, 100 % offline tras la primera carga. Vite 5 + Preact 10 + TypeScript + `@preact/signals` + `preact-iso` (rutas) + Dexie 4 (IndexedDB) + `vite-plugin-pwa` (Workbox, precache de todo, `registerType: 'autoUpdate'` con aviso «Hay una versión nueva · Recargar»). Fuente Archivo autoalojada (`@fontsource/archivo`), iconos `lucide-preact`. CSS a mano con tokens, sin Tailwind ni CDN (offline).
- `navigator.storage.persist()` al arrancar; mostrar en Ajustes si se concedió.
- iOS: `apple-mobile-web-app-capable`, `apple-touch-icon` 180 px, `viewport-fit=cover`, `env(safe-area-inset-*)`, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`, `user-select: none` en tiles y chips, evitar zoom por doble toque, inputs numéricos con `inputmode="decimal"` y ≥ 16 px para que Safari no haga zoom.
- Tests: vitest para el dominio (cálculos) y para la capa de datos con `fake-indexeddb`.
- Rutas: `/` eventos · `/evento/nuevo` · `/evento/:id` (barra si live, detalle si no) · `/evento/:id/resumen` · `/evento/:id/cerrar` · `/panel` · `/ajustes` (+ `/ajustes/carta`, `/ajustes/insumos`).
- Idioma: castellano, formato es-ES, 24 h. Sin i18n.
- Sin backend en v1. **v2** (documentada en `docs/SYNC.md`, no construida): Supabase con tablas espejo `events/orders` y `merge` por uuid; el modelo append-only de v1 ya lo permite.

---

## 6. Referencias investigadas y qué tomamos de cada una (06/09/2026)

| Referencia | Qué hace bien | Qué tomamos | Qué NO copiamos |
|---|---|---|---|
| **Square Register** (fotos en cafetería) | Grid por categoría, ticket lateral, un botón grande, variantes por producto | La estructura de dos columnas y la confirmación única | El cobro como centro, las abreviaturas de dos letras en los tiles, las variantes en modal centrado, impuestos/descuentos en el flujo caliente |
| **Posso** (cafe ePOS, UK) | «Flat white con avena en dos toques», pantalla de barista, informes de top bebidas / horas punta / modificadores más pedidos | La regla de los dos toques (tile + extra, desde la fase 5), el informe de modificadores más pedidos (leches) | Nada más: es un TPV de tienda |
| **Loyverse** | Recetas con descuento de stock por ingrediente, tickets abiertos, horas de más trabajo | La receta por ingrediente | **Su limitación**: no muestra stock sin internet. La barra de café restante de Mutuo funciona 100 % offline |
| **joe / KDS de barista** | Cola cronológica, ticket con modificadores legibles, tiempos de preparación | El «modo cola» opcional para cuando una persona toma nota y otra prepara (v1.1) | Segunda pantalla, enrutado por estaciones |
| **dev.pro · 10 tácticas UX para TPV** | Distancia de visión de 75 cm → fuentes y botones grandes; color por categoría; modo claro/oscuro para luz interior/exterior; avisar de stock antes del turno | Tamaños, código de color sutil por categoría, **modo noche** manual en la cabecera, aviso de carga incompleta al abrir la barra | Gamificación, upsell por IA, roles |
| **Cartpath / Flashquotes** (software para coffee carts) | Presupuestos, reservas, lista de carga automática, ingresos por tipo de servicio | Confirmación de que **nadie cubre el día del evento ni el consumo real**: ese es el hueco de esta app. La calculadora de Mutuo ya cubre el presupuesto | Reservas, facturación, CRM |
| **Espresso Parts · planificar un carro** | La leche es el cuello de botella real; con dos personas, separar tomar nota de preparar; el batch descarga la máquina | Reparto por leches en el resumen; modo cola (v1.1); separar vía `grupo` en el ritmo | — |
| **Tally / contadores de bebidas** | Un toque = una unidad, estadísticas por hora, CSV | El **modo un toque** y la exportación CSV | La lógica de cuentas por socio |

**Posicionamiento de la app**: no es un TPV. Es el **cuaderno de barra** de Mutuo: lo que Square no sabe (qué llevabas cargado, cuánto queda, cuánto costó de verdad cada bebida en ese evento) y lo que Cartpath no toca (lo que pasa entre que se abre y se cierra la barra).

## 7. Añadidos tras la investigación

- **Modo noche**: interruptor en la cabecera de la barra (sol/luna). Persiste por dispositivo. Los tokens de color tienen las dos variantes desde el día uno.
- **Color por categoría**: cada categoría tiene un color de acento suave (punto de 10 px en la esquina del tile y color de la pestaña activa). Nunca franjas laterales.
- **Aviso al abrir la barra** si no hay carga registrada de café: «Sin carga registrada: la barra de café restante no se mostrará» con botón «Registrar carga» y «Abrir igual».
- **Modificadores más pedidos** en el resumen y el panel (% con avena, % descafeinado, % iced).
- **Modo cola** (v1.1, tras verificar el núcleo): al activarlo, «Servir» pasa a «Pedir»; los pedidos aparecen en una franja de pendientes en la columna derecha con su hora y modificadores; tocar «Listo» los marca `servedAt`. Sirve cuando una persona toma nota y otra prepara. Los tiempos de preparación entran en las métricas.
