/**
 * Sacar y meter archivos desde el aparato que lleve la barra: puede ser un
 * iPhone o un iPad, así que aquí no se nombra ninguno.
 *
 * En iOS y iPadOS, `navigator.share` con archivos es lo que abre la hoja de
 * Compartir (Archivos, AirDrop, Correo). Si no está —o si quien la usa la
 * cancela— se cae a una descarga normal, que es lo que hace el navegador de
 * escritorio.
 */

export interface ArchivoSalida {
  nombre: string;
  contenido: string;
  mime: string;
}

function descargar(archivo: ArchivoSalida): void {
  const blob = new Blob([archivo.contenido], { type: `${archivo.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita que la URL siga viva durante el clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** @returns cómo salió el archivo, para el aviso que ve el usuario. */
export async function guardarArchivo(archivo: ArchivoSalida): Promise<'compartido' | 'descargado'> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (typeof File === 'function' && nav.canShare && nav.share) {
    const file = new File([archivo.contenido], archivo.nombre, { type: archivo.mime });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: archivo.nombre });
        return 'compartido';
      } catch {
        // Cancelar la hoja de Compartir no es un error: se descarga y ya está.
      }
    }
  }
  descargar(archivo);
  return 'descargado';
}

/** Abre el selector de archivos y devuelve el texto del elegido. */
export function pedirArchivo(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

/** `mutuo-barra-pedidos-2026-09-06.csv` */
export function nombreConFecha(base: string, ext: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `mutuo-barra-${base}-${hoy}.${ext}`;
}
