# SYNC — sincronizar dos iPads (v2, no construida)

Documento de diseño. **Nada de esto está escrito todavía**: la v1 funciona con
un solo iPad y sin internet, y así se estrena en la boda del 12-13/09/2026. Esto
es lo que habría que hacer cuando haya un segundo iPad en la barra, o cuando
Nicolas quiera ver los eventos desde el ordenador sin pasarse un JSON.

## Por qué es fácil, y qué lo hizo fácil

La v1 ya guarda todo **append-only, con uuid y `deviceId`**: anular un pedido
escribe `voidedAt`, nunca borra la fila; cada pedido nace con su uuid en el
dispositivo que lo creó. Eso significa que fusionar dos bases es una **unión de
conjuntos**, no una negociación. Es la decisión que hace que este documento sea
de una página y no de diez.

`importJson` ya hace exactamente esa fusión desde un archivo. La v2 no inventa
una regla nueva: cambia el archivo por una tabla remota.

## Forma

Supabase (Postgres gestionado) con dos tablas espejo de las de Dexie. Nada de
lógica en el servidor: la app sigue mandando, y el servidor es un buzón.

**`events`** — `id` (uuid, clave), `device_id`, `updated_at` (timestamptz), y el
resto de campos del evento tal como están en `docs/SPEC.md §2.4`.

**`orders`** — `id` (uuid, clave), `event_id`, `device_id`, `created_at`,
`served_at`, `voided_at`, `updated_at`, y las líneas en una columna `jsonb`. Las
líneas no se normalizan: se escriben una vez y no se editan nunca, así que
partirlas en filas solo añadiría trabajo.

El catálogo (insumos, productos, modificadores) **no se sincroniza en la v2**.
Se edita en un iPad y se lleva al otro con el JSON, como ahora. Sincronizarlo
abre la puerta a que dos personas cambien la misma receta a la vez, que es el
único conflicto de verdad que tiene este modelo, y no compensa mientras la carta
la lleve una persona.

## Cuándo sube y cuándo baja

**Nunca durante un pedido.** La barra escribe en IndexedDB y sigue. La
sincronización es un trabajo aparte que se dispara:

- al recuperar la conexión (`online`),
- al abrir y al cerrar una barra,
- y con un botón «Sincronizar ahora» en Carta y ajustes, para cuando alguien
  quiera asegurarse.

**Subida**: todo lo que tenga `updated_at` posterior al último envío, en un solo
lote por tabla (`upsert` por `id`). Un lote y no una fila por petición: en una
boda se acumulan cientos de pedidos y la red del recinto es la que es.

**Bajada**: `select * where updated_at > last_sync`. Se guarda `last_sync` por
dispositivo, no por tabla.

**Fusión**: la misma que `importJson`, que ya está escrita y probada:

| Tabla | Regla |
|---|---|
| `orders` | Unión por uuid. Nunca hay conflicto: un pedido se escribe una vez. La única mutación posible es la anulación, y **una anulación entrante siempre gana** (nunca se «des-anula»). |
| `events` | Gana el `updated_at` mayor. Es el único sitio donde puede haber conflicto, y es raro: dos personas cerrando el mismo evento a la vez. |

## Lo que hay que decidir antes de escribirlo

1. **Quién entra.** Dos baristas y un ordenador. Lo más simple que funciona es
   una clave de proyecto con RLS por `device_id`, sin cuentas ni contraseñas: si
   hace falta un login, el iPad tiene que iniciar sesión en mitad de un evento, y
   eso es exactamente lo que no puede pasar.
2. **Qué pasa si dos iPads abren el mismo evento.** Hoy `openEvent` pausa la otra
   barra del propio dispositivo. Con dos iPads eso es lo normal, no un error: los
   dos sirven del mismo evento y los pedidos se suman. Hay que quitar el aviso
   «Ya hay una barra abierta» cuando la otra barra sea de otro dispositivo.
3. **El contador de la cabecera.** Con dos iPads, «84 servidas» es la suma de los
   dos, y no puede parpadear cada vez que llega una bajada. O se enseña el total
   local y se dice «+ lo de la otra barra al sincronizar», o se espera a que el
   contador sea del evento y no del dispositivo. Es la única decisión de interfaz
   que la v2 obliga a tomar.
4. **La copia de seguridad sigue mandando.** Sincronizar no sustituye al JSON:
   si Supabase está caído la noche de la boda, la barra tiene que funcionar
   igual, y la red de seguridad sigue siendo el archivo.

## Lo que no se va a hacer

- **Tiempo real.** Nadie mira el iPad del otro. Sincronizar cada pocos minutos
  sobra y ahorra una capa entera de suscripciones.
- **Resolver conflictos a mano.** No hay pantalla de «elige una versión». Con
  `updated_at` mayor gana y se acabó; si alguna vez duele, se sabrá porque un
  cierre pisó a otro, y entonces se hablará.
- **Borrar de verdad.** El modelo es append-only y se queda así. Nada de
  `DELETE`.
