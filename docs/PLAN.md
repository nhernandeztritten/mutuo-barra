# Plan de construcción — Mutuo · Barra

Orquesta Fable; ejecuta Opus, **un agente por vez**. Cada fase termina con verificación real (tests en verde + capturas a 1180 × 820 y 820 × 1180) antes de abrir la siguiente. Rama `feature/v1-barra`; `main` intacta hasta que Nicolas pida fusionar. Commits temáticos en español.

| Fase | Entrega | Verificación |
|---|---|---|
| 0 · Especificación | `docs/SPEC.md`, `DESIGN.md`, `PRODUCT.md`, este plan | Revisión de Fable |
| 1 · Cimientos | Vite + Preact + TS + Dexie + PWA; tokens CSS claro/noche; dominio puro (`applyModifiers`, `eventConsumption`, `eventStats`, `closeStats`, `loadSuggestion`, formatos) con tests; seed de carta e insumos; shell con rutas y navegación | `npm test` verde, `npm run build` sin errores, app arranca con eventos vacíos |
| 2 · Barra | Eventos (lista, nuevo, abrir, pausar), pantalla de barra completa (chips, tabs, tiles, ticket, servir, deshacer, un toque, modo venta con cobro, modo noche), toasts | Capturas horizontal y vertical; flujo «cortado con avena en dos toques» grabado; deshacer funciona; recarga de página conserva todo |
| 3 · Cierre y datos | Resumen en vivo, anular pedidos, cierre con recuento y resultado, historial, panel con comparativas y gráficos SVG, exportar CSV/JSON, importar JSON, ajustes de carta e insumos | Capturas; export abre en Numbers; import no duplica |
| 4 · Pulido y despliegue **(hecha)** | Grid continuo con leyenda, paso 3 en el cierre, contraste y objetivos táctiles medidos, hojas como diálogos, instalación en el iPad, `vercel.json` y flujo de Pages, `docs/SYNC.md` | 172 tests en verde; 58 pares de contraste medidos sin fallos; prueba offline real con Playwright; 22 capturas. **Falta desplegar**: necesita la cuenta de Nicolas |
| 1.1 · Modo cola | Pedir/Listo, franja de pendientes, tiempos de preparación | Solo si la fase 2 está verificada antes del 10/09 |

## Riesgos conocidos
- **Fecha**: la boda es el 12-13/09. Si el 11/09 la fase 3 no está verificada, se despliega la fase 2 sola: registrar y exportar JSON ya salva los datos del evento.
- **Storage de Safari**: sin `navigator.storage.persist()` y sin instalar en pantalla de inicio, iPadOS puede borrar IndexedDB tras 7 días sin uso. La app pide persistencia y recuerda instalar. La copia JSON es la red de seguridad.
- **Despliegue**: publicar requiere la cuenta de Nicolas (Vercel o GitHub). Mientras tanto se prueba en el iPad por red local con `npm run dev -- --host`.
