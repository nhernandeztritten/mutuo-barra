/**
 * El indicador del ciclo: qué paso está encendido y a dónde se puede saltar en
 * cada estado del evento (UX-REVISION-1 §B).
 */
import { describe, expect, it } from 'vitest';
import { pasoActual, pasosDeEvento } from '../pasos';

const EV = 'ev-1';
const estados = (status: 'planned' | 'live' | 'closed') =>
  pasosDeEvento(EV, status).map((p) => p.estado);

describe('paso actual por estado', () => {
  it('sin abrir está en Preparar, abierto en Servir y cerrado en Resultados', () => {
    expect(pasoActual('planned')).toBe(1);
    expect(pasoActual('live')).toBe(2);
    expect(pasoActual('closed')).toBe(4);
  });
});

describe('evento sin abrir', () => {
  it('solo Preparar está encendido; el resto, apagado', () => {
    expect(estados('planned')).toEqual(['actual', 'futuro', 'futuro', 'futuro']);
  });

  it('el paso actual lleva a la propia pantalla del evento', () => {
    expect(pasosDeEvento(EV, 'planned')[0]?.href).toBe(`/evento/${EV}`);
  });

  it('no se puede saltar a cerrar un evento que no se ha abierto', () => {
    expect(pasosDeEvento(EV, 'planned')[2]?.href).toBeNull();
  });
});

describe('barra abierta', () => {
  it('Preparar queda hecho, Servir es el actual y Cerrar está disponible', () => {
    expect(estados('live')).toEqual(['hecho', 'actual', 'disponible', 'futuro']);
  });

  it('Cerrar lleva a la pantalla de cierre', () => {
    expect(pasosDeEvento(EV, 'live')[2]?.href).toBe(`/evento/${EV}/cerrar`);
  });

  it('con la barra abierta no se vuelve a editar los datos', () => {
    expect(pasosDeEvento(EV, 'live')[0]?.href).toBeNull();
  });
});

describe('evento cerrado', () => {
  it('solo Resultados está encendido; los tres primeros, apagados', () => {
    expect(estados('closed')).toEqual(['futuro', 'futuro', 'futuro', 'actual']);
  });

  it('ninguno de los tres primeros es tocable: es de solo lectura', () => {
    const pasos = pasosDeEvento(EV, 'closed');
    expect(pasos.slice(0, 3).every((p) => p.href === null)).toBe(true);
    expect(pasos[3]?.href).toBe(`/evento/${EV}`);
  });
});

describe('nombres', () => {
  it('son los cuatro del ciclo, en orden', () => {
    expect(pasosDeEvento(EV, 'live').map((p) => p.name)).toEqual([
      'Preparar',
      'Servir',
      'Cerrar',
      'Resultados',
    ]);
  });
});
