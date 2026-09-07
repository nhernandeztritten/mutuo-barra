/**
 * Los últimos pedidos servidos del evento.
 *
 * Existe por una petición concreta de Nicolas: el barista olvida lo que le
 * acaban de pedir y necesita mirarlo sin salir de la barra. Es una lectura,
 * no un registro: la verdad sigue siendo la tabla `orders` de Dexie.
 *
 * Desde la fase 7 la fila también se despliega, así que aquí se prepara todo
 * lo que enseña abierta —una línea por bebida, la nota, el importe y el método
 * de pago— y no solo la frase de una línea.
 *
 * La lógica vive fuera del componente para poder probar el orden, el límite y
 * la exclusión de anulados sin montar la pantalla entera.
 */
import type { EventMode, Order, PaymentMethod } from '../data/types';
import { formatDuration } from '../domain/format';
import { CHIP_LABEL } from './etiquetas';

/** Cuántos pedidos se ven de un vistazo. El resto, en «Ver todos». */
export const ULTIMOS_MAX = 5;

/** Una bebida del pedido: el nombre, y sus modificadores aparte para apagarlos. */
export interface ParteDePedido {
  /** «Latte» o «2 × Cortado». */
  texto: string;
  /** «avena», «desca · tapa», o cadena vacía si la bebida va tal cual. */
  mods: string;
  /** La nota de esa línea, si la hay. Solo se ve con la fila desplegada. */
  nota: string;
  /** Importe de la línea (precio × cantidad). Solo cuenta en modo venta. */
  importe: number;
}

export interface UltimoPedido {
  id: string;
  servedAt: string;
  partes: ParteDePedido[];
  /** El modo con el que se sirvió: en venta la fila abierta enseña el cobro. */
  mode: EventMode;
  total: number;
  payment: PaymentMethod | null;
  /** Nota del pedido entero. */
  note: string;
}

/**
 * Modificadores de una línea, en la forma corta y en minúscula.
 *
 * Se usa `CHIP_LABEL` («Descafeinado» → «Desca») por el mismo motivo que en la
 * fila de extras (decisión 21): aquí el ancho manda —360 px y dos líneas como
 * mucho— y la palabra completa se come la frase. El ticket, la hoja de la
 * línea y la exportación siguen diciendo «Descafeinado».
 */
export function modsDeLinea(modifiers: { optionId: string; label: string }[]): string {
  return modifiers.map((m) => (CHIP_LABEL[m.optionId] ?? m.label).toLowerCase()).join(' · ');
}

/** Una línea servida, leída como la leería el barista: «2 × Cortado» + «avena». */
export function partesDePedido(order: Order): ParteDePedido[] {
  return order.lines.map((line) => ({
    texto: `${line.qty > 1 ? `${line.qty} × ` : ''}${line.productName}`,
    mods: modsDeLinea(line.modifiers),
    nota: line.note,
    importe: Math.round((line.unitPrice * line.qty + Number.EPSILON) * 100) / 100,
  }));
}

/** La frase entera, en texto plano. Es lo que lee un lector de pantalla y lo que etiqueta «Repetir». */
export function fraseDePartes(partes: ParteDePedido[]): string {
  return partes.map((p) => (p.mods ? `${p.texto} · ${p.mods}` : p.texto)).join(', ');
}

/** La frase de un pedido: «Latte · avena, 2 × Cortado, Americano · desca». */
export function frasePedido(order: Order): string {
  return fraseDePartes(partesDePedido(order));
}

/**
 * «hace 3 min», junto a la hora en la fila desplegada.
 *
 * La hora sola no contesta la pregunta que se hace el barista —«¿este pedido
 * es el de hace un momento o el de hace media hora?»— sin restar de cabeza.
 * Por debajo del minuto no se dice un número: «hace 0 min» no significa nada.
 */
export function haceTexto(servedAt: string, now: Date = new Date()): string {
  const minutos = Math.floor((now.getTime() - Date.parse(servedAt)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'ahora mismo';
  return `hace ${formatDuration(minutos)}`;
}

/**
 * Los `max` pedidos no anulados más recientes, el más nuevo primero.
 *
 * Un pedido anulado no está: lo que se anuló no se sirvió, y repetirlo sería
 * repetir un error. Un pedido **corregido** tampoco: está anulado con motivo
 * `editado` y lo que se ve en su lugar es el que lo sustituye, con su misma
 * hora. Los dos siguen existiendo en la lista completa del Resumen, tachados y
 * con su motivo, que es donde se audita.
 *
 * El desempate por `id` es para que dos pedidos servidos en el mismo
 * milisegundo —una ráfaga en modo Rápido— salgan siempre en el mismo orden y
 * la lista no baile entre repintados.
 */
export function ultimosPedidos(orders: Order[], max: number = ULTIMOS_MAX): UltimoPedido[] {
  return [...orders]
    .filter((o) => o.voidedAt === null)
    .sort((a, b) => b.servedAt.localeCompare(a.servedAt) || b.id.localeCompare(a.id))
    .slice(0, max)
    .map((order) => ({
      id: order.id,
      servedAt: order.servedAt,
      partes: partesDePedido(order),
      mode: order.mode,
      total: order.total,
      payment: order.payment,
      note: order.note,
    }));
}
