/**
 * Detectar si la app se abrió desde el icono de la pantalla de inicio. De esto
 * depende que el aviso de instalar salga o no, así que no puede fallar por el
 * lado de dar un falso «instalada»: sería dejar de avisar de que Safari puede
 * borrar los datos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASOS_INSTALACION, estaInstalada, estadoInstalacion } from '../instalacion';

function conMatchMedia(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('standalone') && standalone,
    media: query,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('estaInstalada', () => {
  it('con display-mode: standalone, está instalada', () => {
    conMatchMedia(true);
    expect(estaInstalada()).toBe(true);
    expect(estadoInstalacion()).toBe('instalada');
  });

  it('en una pestaña normal de Safari, no', () => {
    conMatchMedia(false);
    expect(estaInstalada()).toBe(false);
    expect(estadoInstalacion()).toBe('safari');
  });

  it('las versiones viejas de iPadOS solo tienen `navigator.standalone`', () => {
    conMatchMedia(false);
    vi.stubGlobal('navigator', { standalone: true });
    expect(estaInstalada()).toBe(true);
  });

  it('sin `matchMedia` ni `navigator`, se asume que no está instalada', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('navigator', undefined);
    // Falso negativo a propósito: como mucho se enseña un aviso de más.
    expect(estaInstalada()).toBe(false);
  });
});

describe('los pasos que se enseñan', () => {
  it('son los cuatro de Safari, y el último recuerda abrir desde el icono', () => {
    expect(PASOS_INSTALACION).toHaveLength(4);
    expect(PASOS_INSTALACION[0]).toContain('Safari');
    expect(PASOS_INSTALACION[2]).toContain('Añadir a pantalla de inicio');
    expect(PASOS_INSTALACION[3]).toContain('icono');
  });
});
