/**
 * Ordenación de la tabla de Resultados. Fuera del componente para poder
 * probarla: la tabla es lo primero que Nicolas va a mirar en el ordenador.
 */

export type Direccion = 'asc' | 'desc';

/**
 * Ordena por una columna sin tocar el array original. Los números se comparan
 * como números; el texto, con las reglas del castellano (para que «Ó» caiga
 * donde toca y no al final).
 */
export function ordenarPor<T>(filas: T[], key: keyof T, dir: Direccion): T[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), 'es') * factor;
  });
}

/**
 * Qué dirección toca al tocar una cabecera: la primera vez, la más útil de esa
 * columna (los números empiezan de mayor a menor, el texto de la A a la Z);
 * después, se invierte.
 */
export function siguienteOrden<T>(
  actual: { key: T; dir: Direccion },
  key: T,
  esTexto: boolean,
): { key: T; dir: Direccion } {
  if (actual.key === key) return { key, dir: actual.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: esTexto ? 'asc' : 'desc' };
}
