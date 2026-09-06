/** Ordenación de la tabla de eventos cerrados (SPEC §3.5). */
import { describe, expect, it } from 'vitest';
import { ordenarPor, siguienteOrden } from '../orden';

const FILAS = [
  { nombre: 'Boda Ana y Marc', bebidas: 142, coste: 0.84 },
  { nombre: 'Mercado de Ruzafa', bebidas: 38, coste: 0.75 },
  { nombre: 'Ávila, rodaje', bebidas: 96, coste: 1.02 },
];

describe('ordenarPor', () => {
  it('ordena números de menor a mayor y al revés', () => {
    expect(ordenarPor(FILAS, 'bebidas', 'asc').map((f) => f.bebidas)).toEqual([38, 96, 142]);
    expect(ordenarPor(FILAS, 'bebidas', 'desc').map((f) => f.bebidas)).toEqual([142, 96, 38]);
  });

  it('ordena texto con las reglas del castellano: la Á va con la A', () => {
    expect(ordenarPor(FILAS, 'nombre', 'asc').map((f) => f.nombre)).toEqual([
      'Ávila, rodaje',
      'Boda Ana y Marc',
      'Mercado de Ruzafa',
    ]);
  });

  it('compara decimales como números, no como texto', () => {
    expect(ordenarPor(FILAS, 'coste', 'asc').map((f) => f.coste)).toEqual([0.75, 0.84, 1.02]);
  });

  it('no toca el array original', () => {
    const copia = [...FILAS];
    ordenarPor(FILAS, 'bebidas', 'asc');
    expect(FILAS).toEqual(copia);
  });
});

describe('siguienteOrden', () => {
  it('una columna nueva de números empieza de mayor a menor', () => {
    expect(siguienteOrden({ key: 'nombre', dir: 'asc' }, 'bebidas', false)).toEqual({
      key: 'bebidas',
      dir: 'desc',
    });
  });

  it('una columna nueva de texto empieza de la A a la Z', () => {
    expect(siguienteOrden({ key: 'bebidas', dir: 'desc' }, 'nombre', true)).toEqual({
      key: 'nombre',
      dir: 'asc',
    });
  });

  it('tocar dos veces la misma columna la invierte', () => {
    const uno = siguienteOrden({ key: 'nombre', dir: 'asc' }, 'bebidas', false);
    const dos = siguienteOrden(uno, 'bebidas', false);
    expect(dos.dir).toBe('asc');
    expect(siguienteOrden(dos, 'bebidas', false).dir).toBe('desc');
  });
});
