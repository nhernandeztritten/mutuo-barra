/**
 * Carta y ajustes — SPEC §3.6, portada de la sección.
 *
 * Lo del dispositivo vive aquí; la carta y los insumos tienen su propia
 * pantalla porque se editan de otra manera y con otra cabeza.
 */
import { useEffect, useState } from 'preact/hooks';
import { ChevronRight, Download, HardDrive, Moon, Smartphone, Sun } from 'lucide-preact';
import { APP_VERSION } from '../data/db';
import { exportJson } from '../data/repo';
import { METODOS, RATIOS_CLASICOS, ratiosEfectivos, revisarReceta } from '../domain/recetas';
import { Button } from '../ui/components';
import { useIr } from '../ui/navegar';
import { guardarArchivo, nombreConFecha } from '../ui/archivos';
import { PASOS_INSTALACION, estaInstalada, esteDispositivo } from '../ui/instalacion';
import { ComoFunciona, Etiqueta } from '../ui/piezas';
import { showToast } from '../ui/toast';
import {
  activeProducts,
  ingredients,
  pedirAlmacenamientoPersistente,
  products,
  ratios,
  refrescarAlmacenamiento,
  setDeviceName,
  setTheme,
  settings,
} from '../ui/store';
import { theme } from '../ui/theme';

export function Ajustes() {
  const route = useIr();
  const s = settings.value;
  const [nombre, setNombre] = useState(s?.deviceName ?? '');
  const [busy, setBusy] = useState(false);

  const sinCostear = ingredients.value.filter((i) => i.costSource === 'sin-costear').length;
  const provisionales = products.value.filter((p) => p.priceProvisional).length;
  const porRevisar = products.value.filter(
    (p) => revisarReceta(p, ingredients.value, ratios.value).length > 0,
  ).length;
  const vigentes = ratiosEfectivos(ratios.value);
  const ratiosEditados = METODOS.filter(
    (m) => m.ratio > 0 && vigentes[m.id] !== RATIOS_CLASICOS[m.id],
  ).length;
  const instalada = estaInstalada();

  useEffect(() => {
    // Lo que enseña la etiqueta tiene que ser el estado de ahora, no el que se
    // decidió al arrancar: instalar la app puede cambiarlo.
    void refrescarAlmacenamiento();
    // Se llega aquí desde «Cómo hacerlo» del aviso de Eventos.
    if (window.location.hash === '#instalar') {
      document.getElementById('instalar')?.scrollIntoView({ block: 'start' });
    }
  }, []);

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
              {porRevisar > 0 ? ` · ${porRevisar} por revisar` : ''}
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

        <button
          type="button"
          class="event-row event-row--link"
          onClick={() => route('/ajustes/ratios')}
        >
          <span class="event-row__main">
            <span class="event-row__name">Métodos y ratios</span>
            <span class="meta">
              Las recetas clásicas de cada método
              {ratiosEditados > 0 ? ` · ${ratiosEditados} cambiado${ratiosEditados === 1 ? '' : 's'}` : ''}
            </span>
          </span>
          <ChevronRight size={22} strokeWidth={1.75} />
        </button>
      </div>

      <div class="form__block">
        <h2 class="section-title">Dispositivo</h2>
        <div class="form__grid">
          <label class="field" for="aj-nombre">
            <span class="field__label">Nombre de este dispositivo</span>
            <input
              id="aj-nombre"
              class="input"
              value={nombre}
              placeholder="Barra de Mutuo"
              onInput={(e) => setNombre((e.currentTarget as HTMLInputElement).value)}
              onBlur={() => void setDeviceName(nombre.trim() || 'Barra de Mutuo')}
            />
            <span class="meta">Queda grabado en cada pedido, para cuando sirvan dos a la vez.</span>
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

      <div class="form__block" id="instalar">
        <h2 class="section-title">Instalar en {esteDispositivo()}</h2>
        <div class="card">
          <div class="row">
            <Smartphone size={22} strokeWidth={1.75} />
            <span class="event-row__name">
              {instalada ? 'Instalada' : 'Abierta en Safari'}
            </span>
            <div class="spacer" />
            {instalada ? (
              <Etiqueta tone="accent">Desde el icono</Etiqueta>
            ) : (
              <Etiqueta tone="warn">Sin instalar</Etiqueta>
            )}
          </div>
          <p class="meta">
            {instalada
              ? 'La app arranca a pantalla completa y el sistema deja de tratar sus datos como desechables.'
              : 'Sin instalar, Safari puede borrar los datos de la app tras siete días sin abrirla, que es lo que pasa entre un evento y el siguiente.'}
          </p>
          <ol class="como__list">
            {PASOS_INSTALACION.map((paso, i) => (
              <li class="como__item" key={paso}>
                <span class="como__num num" aria-hidden="true">
                  {i + 1}
                </span>
                <span class="como__text">{paso}</span>
              </li>
            ))}
          </ol>
          <p class="meta">
            La primera vez hace falta internet. Después funciona en modo avión.
          </p>
        </div>
      </div>

      <ComoFunciona />
    </section>
  );
}
