/**
 * Nombres cortos de modificador, para los sitios donde el ancho manda.
 *
 * Vive en su propio módulo —y no dentro de `barra-parts.tsx`— para que la
 * lógica pura de `ultimos.ts` pueda usarlo sin arrastrar componentes.
 *
 * La palabra completa («Descafeinado») sigue siendo la de la hoja de la línea,
 * el ticket y la exportación (decisión 21). Aquí se abrevia solo donde caben
 * pocos caracteres: la fila de extras y la frase de «Últimos pedidos».
 */
export const CHIP_LABEL: Record<string, string> = { cafe_descafeinado: 'Desca' };

/**
 * Cómo se escribe cada método de pago. Aquí y no en una pantalla concreta
 * porque lo dicen dos: la lista de pedidos del Resumen y la fila desplegada de
 * «Últimos pedidos».
 */
export const PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  invitacion: 'Invitación',
};
