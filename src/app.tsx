/**
 * App shell: routes of SPEC §5, minimal navigation, theme and the
 * «Hay una versión nueva · Recargar» notice from the service worker.
 */
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { LocationProvider, Route, Router, useLocation } from 'preact-iso';
import { initDb } from './data/db';
import { getLiveEvent } from './data/repo';
import type { BarEvent } from './data/types';
import { ToastHost } from './ui/components';
import { applyTheme } from './ui/theme';
import {
  Ajustes,
  AjustesCarta,
  AjustesInsumos,
  Barra,
  Cierre,
  Eventos,
  EventoNuevo,
  NoEncontrado,
  Panel,
  Resumen,
} from './routes/placeholders';

const liveEvent = signal<BarEvent | undefined>(undefined);
const ready = signal(false);

/** Set by main.tsx when Workbox reports a new build sitting in the wings. */
export const needsRefresh = signal(false);
export const applyUpdate = signal<() => void>(() => window.location.reload());

function Nav() {
  const { path } = useLocation();
  const live = liveEvent.value;
  const barPath = live ? `/evento/${live.id}` : null;

  const links: { href: string | null; label: string }[] = [
    { href: '/', label: 'Eventos' },
    { href: barPath, label: 'Barra' },
    { href: '/panel', label: 'Panel' },
    { href: '/ajustes', label: 'Ajustes' },
  ];

  return (
    <nav class="navbar" aria-label="Secciones">
      <span class="wordmark navbar__brand">Mutuo.</span>
      {links.map((link) =>
        link.href === null ? (
          <span class="navlink" key={link.label} aria-disabled="true" style={{ opacity: 0.45 }}>
            {link.label}
          </span>
        ) : (
          <a
            class="navlink"
            key={link.label}
            href={link.href}
            aria-current={path === link.href || (link.href !== '/' && path.startsWith(link.href)) ? 'page' : undefined}
          >
            {link.label}
          </a>
        ),
      )}
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
      const { settings } = await initDb();
      applyTheme(settings.theme);
      liveEvent.value = await getLiveEvent();
      ready.value = true;
    })();
  }, []);

  return (
    <LocationProvider>
      <div class="shell">
        <UpdateBanner />
        <Nav />
        <main class="shell__main">
          {ready.value ? (
            <Router>
              <Route path="/" component={Eventos} />
              <Route path="/evento/nuevo" component={EventoNuevo} />
              <Route path="/evento/:id" component={Barra} />
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
