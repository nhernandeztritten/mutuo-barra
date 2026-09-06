/**
 * Señales de disposición. `barMode` lo enciende la pantalla de barra al montarse:
 * el shell esconde la navegación y quita el relleno para que la barra ocupe el
 * iPad entero, sin scroll de página (DESIGN.md · Layout de la barra).
 */
import { signal } from '@preact/signals';

export const barMode = signal(false);
