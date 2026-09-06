/**
 * Carta y ajustes — SPEC §3.6, portada de la sección.
 *
 * Lo del dispositivo vive aquí; la carta y los insumos tienen su propia
 * pantalla porque se editan de otra manera y con otra cabeza.
 */
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { ChevronRight, Download, HardDrive, Moon, Sun } from 'lucide-preact';
import { APP_VERSION } from '../data/db';
import { exportJson } from '../data/repo';
import { Button } from '../ui/components';
import { guardarArchivo, nombreConFecha } from '../ui/archivos';
import { ComoFunciona, Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import {
  activeProducts,
  ingredients,
  pedirAlmacenamientoPersistente,
  products,
  setDeviceName,
  setTheme,
  settings,
} from '../ui/store';
import { theme } from '../ui/theme';

export function Ajustes() {
  const { route } = useLocation();
  const s = settings.value;
  const [nombre, setNombre] = useState(s?.deviceName ?? '');
  const [busy, setBusy] = useState(false);

  const sinCostear = ingredients.value.filter((i) => i.costSource === 'sin-costear').length;
  const provisionales = products.value.filter((p) => p.priceProvisional).length;

  async function copia(): Promise<void> {
    setBusy(true);
    const json = await exportJson();
    await guardarArchivo({
      nombre: nombreConFecha('copia', 'json'),
      contenido: JSON.stringify(json, null, 2),
      mime: 'application/json',
    });
    setBusy(false);
    showToast('Copia de seguridad guardada');
  }

  async function persistir(): Promise<void> {
    setBusy(true);
    const granted = await pedirAlmacenamientoPersistente();
    setBusy(false);
    showToast(
      granted === true
        ? 'El navegador ya no borrará los datos por su cuenta'
        : granted === false
          ? 'El navegador no lo ha concedido; haz copias de seguridad'
          : 'Este navegador no permite pedirlo: haz copias de seguridad a menudo',
    );
  }

  return (
    <section class="ajustes">
      <header class="stack">
        <h1 class="display">Carta y ajustes</h1>
        <p class="meta">Los cambios de la carta afectan solo a pedidos futuros.</p>
      </header>

      <div class="eventos__group">
        <button type="button" class="event-row event-row--link" onClick={() => route('/ajustes/carta')}>
          <span class="event-row__main">
            <span class="event-row__name">Carta</span>
            <span class="meta">
              {activeProducts.value.length} bebidas activas de {products.value.length}
              {provisionales > 0 ? ` · ${provisionales} con precio provisional` : ''}
            </span>
          </span>
          <ChevronRight size={22} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          class="event-row event-row--link"
          onClick={() => route('/ajustes/insumos')}
        >
          <span class="event-row__main">
            <span class="event-row__name">Insumos</span>
            <span class="meta">
              {ingredients.value.length} insumos
              {sinCostear > 0 ? ` · ${sinCostear} sin costear` : ''}
            </span>
          </span>
          <ChevronRight size={22} strokeWidth={1.75} />
        </button>
      </div>

      <div class="form__block">
        <h2 class="section-title">Dispositivo</h2>
        <div class="form__grid">
          <label class="field" for="aj-nombre">
            <span class="field__label">Nombre de este iPad</span>
            <input
              id="aj-nombre"
              class="input"
              value={nombre}
              placeholder="iPad de la barra"
              onInput={(e) => setNombre((e.currentTarget as HTMLInputElement).value)}
              onBlur={() => void setDeviceName(nombre.trim() || 'iPad de la barra')}
            />
            <span class="meta">Queda grabado en cada pedido, para cuando haya dos iPads.</span>
          </label>

          <div class="field">
            <span class="field__label">Tema</span>
            <button
              type="button"
              class="switch"
              aria-pressed={theme.value === 'night'}
              onClick={() => void setTheme(theme.value === 'night' ? 'light' : 'night')}
            >
              {theme.value === 'night' ? (
                <Moon size={20} strokeWidth={1.75} />
              ) : (
                <Sun size={20} strokeWidth={1.75} />
              )}{' '}
              Noche
            </button>
            <span class="meta">Claro de día, noche cuando la pantalla deslumbra.</span>
          </div>
        </div>

        <div class="card">
          <div class="row">
            <HardDrive size={22} strokeWidth={1.75} />
            <span class="event-row__name">Almacenamiento</span>
            <div class="spacer" />
            {s?.persistentStorage === true ? (
              <Etiqueta tone="accent">Protegido</Etiqueta>
            ) : (
              <Etiqueta tone="warn">Sin proteger</Etiqueta>
            )}
          </div>
          <p class="meta">
            {s?.persistentStorage === true
              ? 'El navegador guarda los datos aunque pasen semanas sin abrir la app.'
              : 'Sin protección, el navegador puede borrar los datos tras unos días sin abrir la app. Pídela y haz copias.'}
          </p>
          <div class="row">
            {s?.persistentStorage === true ? null : (
              <Button disabled={busy} onClick={() => void persistir()}>
                Pedir protección
              </Button>
            )}
            <Button variant="primary" disabled={busy} onClick={() => void copia()}>
              <Download size={20} strokeWidth={1.75} /> Copia de seguridad ahora
            </Button>
          </div>
        </div>

        <p class="meta">Versión {APP_VERSION}</p>
      </div>

      <ComoFunciona />
    </section>
  );
}
