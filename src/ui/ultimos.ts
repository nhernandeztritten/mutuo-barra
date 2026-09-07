/**
 * Los últimos pedidos servidos del evento.
 *
 * Existe por una petición concreta de Nicolas: el barista olvida lo que le
 * acaban de pedir y necesita mirarlo sin salir de la barra. Es una lectura,
 * no un registro: la verdad sigue siendo la tabla `orders` de Dexie.
 *
 * La lógica vive fuera del componente para poder probar el orden, el límite y
 * la exclusión de anulados sin montar la pantalla entera.
 */
import type { Order } from '../data/types';
import { CHIP_LABEL } from './etiquetas';

/** Cuántos pedidos se ven de un vistazo. El resto, en «Ver todos». */
export const ULTIMOS_MAX = 5;

/** Una bebida de la frase: el nombre, y sus modificadores aparte para pintarlos apagados. */
export interface ParteDePedido {
  /** «Latte» o «2 × Cortado». */
  texto: string;
  /** «avena», «desca · tapa», o cadena vacía si la bebida va tal cual. */
  mods: string;
}

export interface UltimoPedido {
  id: string;
  servedAt: string;
  partes: ParteDePedido[];
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
 * Los `max` pedidos no anulados más recientes, el más nuevo primero.
 *
 * Un pedido anulado no está: lo que se anuló no se sirvió, y repetirlo sería
 * repetir un error. Sigue existiendo en la lista completa del Resumen, tachado
 * y con su motivo, que es donde se audita.
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
    .map((order) => ({ id: order.id, servedAt: order.servedAt, partes: partesDePedido(order) }));
}
