/* Router — hash-based routing */
import { S, loadDB, nav } from '../components/ui.js';
import { renderShell, toggleSb, toggleTheme, openUserMenu, openSeguranca } from '../components/shell.js';
import { renderLogin } from '../components/auth.js';
import { setRender } from '../components/ui.js';

const routes = {};

export function registerRoute(name, fn) {
  routes[name] = fn;
}

export function getRoutes() {
  return routes;
}

let renderInProgress = false;

export function render() {
  if (renderInProgress) return;
  renderInProgress = true;

  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [route, param] = hash.split('/');

  if (route === 'publico') return renderPublico(param);
  if (route === 'familia') return renderFamilia();

  if (!S.token || !S.user) { renderInProgress = false; return renderLogin(); }
  if (!S.db) {
    loadDB().then(() => {
      renderInProgress = false;
      render();
    }).catch(() => {
      S.token = null; localStorage.clear();
      renderInProgress = false;
      renderLogin();
    });
    return;
  }

  const view = routes[route] || routes.home;
  renderShell(route, () => view(param));
  renderInProgress = false;
}

export function initRouter() {
  setRender(render);
  window.addEventListener('hashchange', render);
  window.toggleSb = toggleSb;
  window.toggleTheme = toggleTheme;
  window.openUserMenu = openUserMenu;
  window.openSeguranca = openSeguranca;
}

// These are imported here to avoid circular deps — set by pages module
let renderPublico = () => {};
let renderFamilia = () => {};

export function setPublicRenderer(fn) { renderPublico = fn; }
export function setFamilyRenderer(fn) { renderFamilia = fn; }
