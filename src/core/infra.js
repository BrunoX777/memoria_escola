/* Infrastructure: fetch interception, image path replacement, backup */
import { LDB } from './db.js';
import { API } from './api.js';
import { ASSETS } from '../data/assets.js';
import { toast } from '../components/ui.js';

export function initInfra() {
  LDB.carregar();

  const fetchOriginal = window.fetch ? window.fetch.bind(window) : null;

  function resposta({ status, json, blob, mime }) {
    const corpo = blob ? blob : new Blob([JSON.stringify(json)], { type: 'application/json' });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? (mime || 'application/json') : null) },
      json: async () => (blob ? {} : json),
      text: async () => (blob ? '' : JSON.stringify(json)),
      blob: async () => corpo
    };
  }

  window.fetch = async function (entrada, opcoes) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    if (!/^\/api\//.test(url)) {
      if (fetchOriginal) return fetchOriginal(entrada, opcoes);
      throw new Error('Sem rede nesta versão offline.');
    }
    const o = opcoes || {};
    const caminho = url.replace(/^\/api/, '');
    const metodo = (o.method || (o.body ? 'POST' : 'GET')).toUpperCase();
    const headers = {};
    for (const k in (o.headers || {})) headers[k.toLowerCase()] = o.headers[k];

    let corpo = null, extra = {};
    if (o.body instanceof FormData) {
      extra.arquivos = o.body.getAll('files');
    } else if (typeof o.body === 'string') {
      try { corpo = JSON.parse(o.body); } catch (e) { corpo = {}; }
    }

    try {
      const publica = API.rotaPublica(metodo, caminho.split('?')[0]);
      const r = publica || await API.rota(metodo, caminho, corpo, headers, extra);
      return resposta(r);
    } catch (e) {
      console.error('[api local]', e);
      return resposta({ status: 500, json: { erro: 'Falha interna: ' + e.message } });
    }
  };

  /* ---------- image path replacement ---------- */
  const MAPA = ASSETS;
  const precisaTrocar = v => typeof v === 'string' && (v.startsWith('/assets/') || v.startsWith('/img/'));
  const RE_CAMINHO = /\/(?:img|assets)\/[A-Za-z0-9._-]+/g;
  const trocarTexto = (s) => s.indexOf('/img/') < 0 && s.indexOf('/assets/') < 0
    ? s : s.replace(RE_CAMINHO, m => MAPA[m] || m);

  const descInner = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, enumerable: descInner.enumerable,
    get() { return descInner.get.call(this); },
    set(v) { descInner.set.call(this, typeof v === 'string' ? trocarTexto(v) : v); }
  });

  function trocarEm(no) {
    if (!no || no.nodeType !== 1) return;
    if (no.tagName === 'IMG' && precisaTrocar(no.getAttribute('src'))) {
      const alvo = MAPA[no.getAttribute('src')];
      if (alvo) no.setAttribute('src', alvo);
    }
    const estilo = no.getAttribute && no.getAttribute('style');
    if (estilo && estilo.indexOf('url(') >= 0) {
      const novo = estilo.replace(/url\((['"]?)(\/(?:assets|img)\/[^'")]+)\1\)/g, (m, q, cam) => MAPA[cam] ? `url("${MAPA[cam]}")` : m);
      if (novo !== estilo) no.setAttribute('style', novo);
    }
    if (no.querySelectorAll) {
      no.querySelectorAll('img[src^="/assets/"],img[src^="/img/"]').forEach(img => {
        const alvo = MAPA[img.getAttribute('src')];
        if (alvo) img.setAttribute('src', alvo);
      });
      no.querySelectorAll('[style*="url("]').forEach(elm => {
        const s = elm.getAttribute('style');
        const novo = s.replace(/url\((['"]?)(\/(?:assets|img)\/[^'")]+)\1\)/g, (m, q, cam) => MAPA[cam] ? `url("${MAPA[cam]}")` : m);
        if (novo !== s) elm.setAttribute('style', novo);
      });
    }
  }

  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(trocarEm);
      else if (m.type === 'attributes') trocarEm(m.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });

  document.addEventListener('DOMContentLoaded', () => trocarEm(document.body));

  /* ---------- backup ---------- */
  function baixar(nome, texto, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.exportarBackup = function () {
    const data = new Date().toISOString().slice(0, 10);
    baixar(`memoria-escola-backup-${data}.json`, LDB.exportar(), 'application/json');
    toast('Backup exportado. Guarde o arquivo em local seguro.');
  };

  window.restaurarBackup = function () {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          LDB.importar(fr.result);
          alert('Backup restaurado. A página será recarregada.');
          localStorage.removeItem('me_token'); localStorage.removeItem('me_user');
          location.reload();
        } catch (e) { alert('Não foi possível restaurar: ' + e.message); }
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  window.zerarDados = function () {
    if (!confirm('Isto apaga tudo o que foi registrado neste navegador e volta ao conteúdo inicial de demonstração.\n\nDeseja continuar?')) return;
    LDB.zerar();
    localStorage.removeItem('me_token'); localStorage.removeItem('me_user');
    location.reload();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const barra = document.createElement('div');
    barra.className = 'offline-bar';
    barra.innerHTML =
      '<span class="ob-tag">Offline · dados neste navegador</span>' +
      '<button type="button" onclick="exportarBackup()">Exportar backup</button>' +
      '<button type="button" onclick="restaurarBackup()">Restaurar</button>' +
      '<button type="button" onclick="zerarDados()">Recomeçar</button>';
    document.body.appendChild(barra);
  });
}
