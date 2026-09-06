/**
 * La app tiene que funcionar igual publicada en la raíz de un dominio que
 * colgando de una carpeta (GitHub Pages). Si esto falla, publicada en carpeta
 * no encaja ninguna ruta y todo cae en «Aquí no hay nada».
 */
import { describe, expect, it } from 'vitest';
import { BASE, conBaseDe, sinBaseDe } from '../navegar';

const CARPETA = '/mutuo-barra/';

describe('publicada en la raíz', () => {
  it('no toca nada', () => {
    expect(conBaseDe('/', '/evento/abc')).toBe('/evento/abc');
    expect(conBaseDe('/', '/')).toBe('/');
    expect(sinBaseDe('/', '/ajustes/carta')).toBe('/ajustes/carta');
  });

  it('es lo que hay por defecto', () => {
    expect(BASE).toBe('/');
  });
});

describe('publicada en una carpeta', () => {
  it('pega la carpeta delante', () => {
    expect(conBaseDe(CARPETA, '/evento/abc')).toBe('/mutuo-barra/evento/abc');
    expect(conBaseDe(CARPETA, '/ajustes/carta')).toBe('/mutuo-barra/ajustes/carta');
  });

  it('la raíz queda sin barra final, como la normaliza el router', () => {
    expect(conBaseDe(CARPETA, '/')).toBe('/mutuo-barra');
  });

  it('la quita para saber en qué sección estamos', () => {
    expect(sinBaseDe(CARPETA, '/mutuo-barra')).toBe('/');
    expect(sinBaseDe(CARPETA, '/mutuo-barra/resultados')).toBe('/resultados');
  });

  it('ida y vuelta devuelve la misma ruta', () => {
    for (const ruta of ['/', '/evento/nuevo', '/evento/abc/cerrar', '/ajustes/insumos']) {
      expect(sinBaseDe(CARPETA, conBaseDe(CARPETA, ruta))).toBe(ruta);
    }
  });

  it('una ruta que no cuelga de la carpeta se deja como está', () => {
    expect(sinBaseDe(CARPETA, '/otra-cosa')).toBe('/otra-cosa');
    // Y un nombre que solo empieza igual no cuenta como dentro.
    expect(sinBaseDe(CARPETA, '/mutuo-barra-vieja/ajustes')).toBe('/mutuo-barra-vieja/ajustes');
  });
});
