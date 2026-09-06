# Revisión UX 1 — tras la prueba de Nicolas (06/09/2026)

Recorrido completo de la app como usuario nuevo, a 1180 × 820. Escala de severidad 0-4 (Nielsen).

## Hallazgos

| # | Sev | Dónde | Problema | Causa |
|---|---|---|---|---|
| 1 | **4** | Barra → «Cerrar evento», «Resumen»; menú → «Panel», «Ajustes» | Pantallas vacías con texto interno «Fase 3: …». **La barra no se puede cerrar.** | Marcadores de fase expuestos al usuario |
| 2 | 3 | Menú superior | «Barra» como pestaña: la barra no es un lugar, es un estado de un evento; sin evento abierto no hace nada. «Panel» no dice qué es. 4 pestañas, 2 vacías, 1 redundante | Navegación por rutas técnicas en vez de por tareas |
| 3 | 3 | Cabecera de la barra | Tres salidas (Resumen / Pausar / Cerrar evento) sin jerarquía; Pausar y Cerrar no se distinguen; «Un toque» no se entiende sin explicación | Faltan jerarquía y copy explicativo |
| 4 | 2 | Toda la app | El ciclo de vida del evento (preparar → servir → cerrar → resultados) no se ve en ningún sitio | Sin indicador de «dónde estoy» (Trunk Test) |
| 5 | 2 | Inicio, primer uso | No explica qué es la app ni qué pasará después de crear el evento | Estado vacío sin orientación |
| 6 | 2 | Tarjeta «En curso» | Dice «Volver a la barra» pero no ofrece terminar | Falta la acción de cierre donde se busca |
| 7 | 1 | Barra, grid | Pestañas de categoría con 2-4 tiles y media pantalla vacía; un toque de más | Decisión de spec superada por el número real de productos |
| 8 | 1 | Barra, cabecera | El nombre del evento se corta («Evento de ejem…») | Ancho fijo insuficiente |

## Decisiones de rediseño

### A. Navegación global: tres entradas, por tarea
`Eventos` · `Resultados` · `Carta y ajustes`. Desaparecen «Barra» y «Panel». Ninguna entrada puede estar vacía: si una sección no existe, no aparece.

### B. El evento tiene un ciclo visible de cuatro pasos
En toda pantalla de un evento, bajo el nombre, un indicador de pasos:
**1 Preparar → 2 Servir → 3 Cerrar → 4 Resultados**
- `planned` → Preparar (datos y carga). Acción principal: **Abrir barra**.
- `live` → Servir (la barra). Acción terminal: **Cerrar barra**.
- Cerrar = recuento y notas. Acción: **Cerrar y ver resultados**.
- `closed` → Resultados. Acción secundaria: **Reabrir**.
Los pasos ya disponibles son tocables; los futuros, apagados. El paso actual, en petróleo.

### C. Cabecera de la barra
Izquierda: **‹ Eventos** (sale; la barra sigue abierta, y así lo dice el inicio). Centro: cifras. Derecha, en este orden: interruptor **Rápido** (subtítulo de 13 px: «cada toque sirve una bebida»), interruptor **Noche**, botón **Resumen** (abre una hoja lateral sobre la propia barra, sin cambiar de pantalla) y **Cerrar barra** (el único terminal, outline). «Pausar» desaparece.

### D. Inicio
- Con barra abierta: tarjeta dominante «Barra abierta · Boda X · 84 servidas · 47/h» con **Seguir sirviendo** (primario) y **Cerrar barra** (secundario). Texto: «Puedes salir y volver; la barra sigue abierta hasta que la cierres.»
- Sin eventos: bloque **Cómo funciona** con los cuatro pasos en una línea cada uno, y «Nuevo evento» / «Probar con un ejemplo». El bloque se puede volver a ver desde Carta y ajustes → «Cómo funciona».
- Próximos: cada evento con su paso actual y la acción que toca (**Preparar carga** si no tiene carga; **Abrir barra** si la tiene).
- Pasados: fecha, nombre, bebidas, coste/bebida → **Ver resultados**.

### E. Copy
Sin «Panel», «Fase», «placeholder», «live», «planned», «demo». Español llano: «Barra abierta», «Ejemplo», «Resultados», «Recuento», «Queda». Cada interruptor lleva etiqueta y subtítulo si su función no es obvia.

### F. Barra
Grid único agrupado por categoría (decisión previa). Nombre del evento hasta 260 px.

## Criterio de éxito
Un usuario nuevo, sin explicación, debe poder: crear un evento, abrir la barra, servir tres bebidas, cerrar la barra con recuento y ver los resultados, sin encontrar ninguna pantalla vacía ni preguntarse qué significa una etiqueta. Se comprueba con el recorrido completo en navegador y capturas.
