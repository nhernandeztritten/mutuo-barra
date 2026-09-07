/**
 * App shell: rutas de SPEC §5, navegación por tareas y el aviso «Hay una
 * versión nueva · Recargar» del service worker.
 *
 * Tres entradas, ninguna vacía (UX-REVISION-1 §A): Eventos · Resultados ·
 * Carta y ajustes. La barra no es una sección, es el paso 2 de un evento.
 */
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { LocationProvider, Route, Router, useLocation, useRoute } from 'preact-iso';
import { initDb } from './data/db';
import { ToastHost } from './ui/components';
import { barMode } from './ui/layout';
import { conBase, sinBase, useIr } from './ui/navegar';
import { bootstrap, eventById, ready } from './ui/store';
import { Ajustes } from './routes/ajustes';
import { AjustesCarta } from './routes/ajustes-carta';
import { AjustesInsumos } from './routes/ajustes-insumos';
import { Barra } from './routes/barra';
import { Cierre } from './routes/cierre';
import { EventoDetalle } from './routes/evento-detalle';
import { EventoForm } from './routes/evento-form';
import { Eventos } from './routes/eventos';
import { Resultados } from './routes/resultados';
import { Resumen } from './routes/resumen';
import { NoEncontrado } from './routes/no-encontrado';

/** Set by main.tsx when Workbox reports a new build sitting in the wings. */
export const needsRefresh = signal(false);
export const applyUpdate = signal<() => void>(() => window.location.reload());

/**
 * `/evento/:id` es la barra si el evento está abierto, el formulario de
 * preparación si aún no se ha abierto y los resultados si ya se cerró.
 */
function EventoRoute() {
  const { params } = useRoute();
  const event = eventById(params['id']);
  if (event?.status === 'live') return <Barra />;
  if (event?.status === 'closed') return <EventoDetalle />;
  return <EventoForm />;
}

/** `/panel` era la dirección de la fase 2; ahora vive en `/resultados`. */
function PanelRedirect() {
  const route = useIr();
  useEffect(() => route('/resultados', true), []);
  return null;
}

function Nav() {
  // La ruta sin la base: dentro del código las secciones se escriben siempre
  // desde la raíz, viva la app donde viva.
  const path = sinBase(useLocation().path);

  const links = [
    { href: '/', label: 'Eventos', match: '/' },
    { href: '/resultados', label: 'Resultados', match: '/resultados' },
    { href: '/ajustes', label: 'Carta y ajustes', match: '/ajustes' },
  ];

  // Un evento es parte de «Eventos»: la sección no se apaga al entrar en uno.
  const isCurrent = (match: string): boolean => {
    if (match === '/') return path === '/' || path.startsWith('/evento');
    return path === match || path.startsWith(`${match}/`);
  };

  return (
    <nav class="navbar" aria-label="Secciones">
      <span class="wordmark navbar__brand">Mutuo.</span>
      {links.map((link) => (
        <a
          class="navlink"
          key={link.label}
          href={conBase(link.href)}
          aria-current={isCurrent(link.match) ? 'page' : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function UpdateBanner() {
  if (!needsRefresh.value) return null;
  return (
    <div class="update-banner" role="status">
      <span>Hay una versión nueva</span>
      <button type="button" class="btn btn--primary" onClick={() => applyUpdate.value()}>
        Recargar
      </button>
    </div>
  );
}

const bootError = signal<string | null>(null);

export function App() {
  useEffect(() => {
    void (async () => {
      try {
        await initDb();
        await bootstrap();
      } catch (err) {
        console.error(err);
        bootError.value = err instanceof Error ? err.message : String(err);
      }
    })();
  }, []);

  return (
    <LocationProvider>
      <div class={['shell', barMode.value ? 'shell--bar' : ''].filter(Boolean).join(' ')}>
        <UpdateBanner />
        <Nav />
        <main class="shell__main">
          {ready.value ? (
            <Router>
              {/* `conBase`: publicada en una carpeta, el navegador dice
                  `/mutuo-barra/evento/x` y el patrón tiene que decir lo mismo. */}
              <Route path={conBase('/')} component={Eventos} />
              <Route path={conBase('/evento/nuevo')} component={EventoForm} />
              <Route path={conBase('/evento/:id')} component={EventoRoute} />
              <Route path={conBase('/evento/:id/resumen')} component={Resumen} />
              <Route path={conBase('/evento/:id/cerrar')} component={Cierre} />
              <Route path={conBase('/resultados')} component={Resultados} />
              <Route path={conBase('/panel')} component={PanelRedirect} />
              <Route path={conBase('/ajustes')} component={Ajustes} />
              <Route path={conBase('/ajustes/carta')} component={AjustesCarta} />
              <Route path={conBase('/ajustes/insumos')} component={AjustesInsumos} />
              <Route default component={NoEncontrado} />
            </Router>
          ) : bootError.value ? (
            <div class="empty">
              <h2>No se pudo abrir el cuaderno</h2>
              <p class="meta">{bootError.value}</p>
              <p class="meta">Recarga la página. Si sigue igual, abre la app desde el icono de la pantalla de inicio o desde la dirección publicada.</p>
              <button type="button" class="btn btn--primary" onClick={() => location.reload()}>Recargar</button>
            </div>
          ) : (
            <p class="meta">Abriendo el cuaderno…</p>
          )}
        </main>
        <ToastHost />
      </div>
    </LocationProvider>
  );
}
