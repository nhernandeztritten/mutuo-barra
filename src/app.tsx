/**
 * App shell: rutas de SPEC §5, navegación mínima, tema y el aviso
 * «Hay una versión nueva · Recargar» del service worker.
 */
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { LocationProvider, Route, Router, useLocation, useRoute } from 'preact-iso';
import { initDb } from './data/db';
import { ToastHost } from './ui/components';
import { barMode } from './ui/layout';
import { bootstrap, eventById, liveEvent, ready } from './ui/store';
import { Barra } from './routes/barra';
import { EventoDetalle } from './routes/evento-detalle';
import { EventoForm } from './routes/evento-form';
import { Eventos } from './routes/eventos';
import { Ajustes, AjustesCarta, AjustesInsumos, Cierre, NoEncontrado, Panel, Resumen } from './routes/placeholders';

/** Set by main.tsx when Workbox reports a new build sitting in the wings. */
export const needsRefresh = signal(false);
export const applyUpdate = signal<() => void>(() => window.location.reload());

/**
 * `/evento/:id` es la barra si el evento está `live`, el formulario si está
 * `planned` y el detalle si está `closed` (SPEC §5).
 */
function EventoRoute() {
  const { params } = useRoute();
  const event = eventById(params['id']);
  if (event?.status === 'live') return <Barra />;
  if (event?.status === 'closed') return <EventoDetalle />;
  return <EventoForm />;
}

function Nav() {
  const { path } = useLocation();
  const live = liveEvent.value;
  // Sin evento en curso, «Barra» lleva a Eventos: ahí está «Abrir barra».
  const barPath = live ? `/evento/${live.id}` : '/';

  const links: { href: string; label: string; match: string | null }[] = [
    { href: '/', label: 'Eventos', match: '/' },
    // Sin barra abierta, «Barra» no se marca como sección actual en Eventos.
    { href: barPath, label: 'Barra', match: live ? barPath : null },
    { href: '/panel', label: 'Panel', match: '/panel' },
    { href: '/ajustes', label: 'Ajustes', match: '/ajustes' },
  ];

  const isCurrent = (match: string | null): boolean => {
    if (match === null) return false;
    if (match === '/') return path === '/';
    return path === match || path.startsWith(`${match}/`);
  };

  return (
    <nav class="navbar" aria-label="Secciones">
      <span class="wordmark navbar__brand">Mutuo.</span>
      {links.map((link) => (
        <a
          class="navlink"
          key={link.label}
          href={link.href}
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

export function App() {
  useEffect(() => {
    void (async () => {
      await initDb();
      await bootstrap();
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
              <Route path="/" component={Eventos} />
              <Route path="/evento/nuevo" component={EventoForm} />
              <Route path="/evento/:id" component={EventoRoute} />
              <Route path="/evento/:id/resumen" component={Resumen} />
              <Route path="/evento/:id/cerrar" component={Cierre} />
              <Route path="/panel" component={Panel} />
              <Route path="/ajustes" component={Ajustes} />
              <Route path="/ajustes/carta" component={AjustesCarta} />
              <Route path="/ajustes/insumos" component={AjustesInsumos} />
              <Route default component={NoEncontrado} />
            </Router>
          ) : (
            <p class="meta">Abriendo el cuaderno…</p>
          )}
        </main>
        <ToastHost />
      </div>
    </LocationProvider>
  );
}
