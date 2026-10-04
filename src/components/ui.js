/* Shared UI helpers — used by all pages */
import { $, el, esc, fmtData, MESES, PAPEIS, VIS } from '../core/utils.js';
import { S, resetState } from '../core/state.js';
import { I } from '../core/icons.js';

export { $, el, esc, fmtData, MESES, PAPEIS, VIS, I, S };

/* ---------- API wrapper ---------- */
export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(S.token ? { 'x-token': S.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && path !== '/login' && !path.startsWith('/login/')) {
    resetState();
    localStorage.clear();
    toast(j.erro || 'Sessão expirada. Entre novamente.', true);
    nav('/'); render();
    throw new Error(j.erro || 'Sessão expirada');
  }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}

/* ---------- Toast ---------- */
export function toast(msg, err) {
  const t = el(`<div class="toast ${err ? 'err' : ''}">${err ? I('alert', 15) : I('check', 15)} ${esc(msg)}</div>`);
  $('#toast-root').appendChild(t); setTimeout(() => t.remove(), 3600);
}

/* ---------- Modal ---------- */
export function modal(html, wide) {
  closeModal();
  const bg = el(`<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`);
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  bg.addEventListener('keydown', e => {
    if (e.key === 'Escape') return closeModal();
    if (e.key !== 'Tab') return;
    const foci = [...bg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !x.disabled && x.offsetParent !== null);
    if (!foci.length) return;
    const first = foci[0], last = foci[foci.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $('#modal-root').appendChild(bg);
  setTimeout(() => {
    const alvo = bg.querySelector('input, select, textarea') || bg.querySelector('.modal-body button') || bg.querySelector('button');
    if (alvo) alvo.focus();
  }, 60);
  return bg;
}
export function closeModal() { $('#modal-root').innerHTML = ''; }

/* ---------- Data helpers ---------- */
export const D = () => S.db;
export const turma = id => D()?.turmas.find(t => t.id === id);
export const proj = id => D()?.projetos.find(p => p.id === id);
export const disc = id => D()?.disciplinas.find(d => d.id === id);
export const evento = id => D()?.eventos.find(e => e.id === id);
export const usr = id => D()?.users.find(u => u.id === id);
export const midia = id => D()?.midias.find(m => m.id === id);
export const midiasDe = a => (a?.midias || []).map(midia).filter(Boolean);
export const can = p => (D()?.permissoes || []).includes(p);

export async function loadDB() { S.db = await api('/bootstrap'); }

/* ---------- Stat / Empty ---------- */
export const stat = (n, l, i, sub, onclick) => {
  const inner = `<span class="ico" aria-hidden="true">${I(i, 17)}</span><span class="num">${n}</span><span class="lbl">${l}</span>${sub ? `<span class="sub ${sub[1] || ''}">${sub[0]}</span>` : ''}`;
  return onclick
    ? `<button type="button" class="card stat stat-click" onclick="${onclick}" aria-label="${l}: ${n}. Abrir detalhes">${inner}</button>`
    : `<div class="card stat">${inner}</div>`;
};
export const empty = (t, big = 'archive') => `<div class="empty"><div class="big">${I(big, 30)}</div>${t}</div>`;
export const iaSlot = (k, v) => `<div class="ia-slot"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;

/* ---------- Activity row ---------- */
export function rowAtividade(a) {
  const ms = midiasDe(a); const ph = ms.find(m => m.tipo === 'foto' && m.url);
  const [vl, vc] = VIS[a.visibilidade] || VIS.privado;
  return `<div class="item-row" onclick="openAtividade('${a.id}')">
    ${ph ? `<img class="thumb" src="${ph.url}">` : `<div class="thumb" aria-hidden="true">${I('note', 20)}</div>`}
    <div style="flex:1;min-width:0">
      <div class="tit">${esc(a.titulo)} ${a.status === 'pendente' ? '<span class="badge b-warn">aguardando classificação</span>' : ''}</div>
      <div class="meta">${fmtData(a.data)} · ${turma(a.turma)?.nome || 'Escola'} ${a.projeto ? '· ' + esc(proj(a.projeto)?.nome) : ''} · ${ms.filter(m=>m.tipo==='foto').length} fotos, ${ms.filter(m=>m.tipo==='video').length} vídeos</div>
      <div class="desc">${esc(a.resumo || a.observacao)}</div>
    </div>
    <span class="badge ${vc}" style="flex:none">${vl}</span>
  </div>`;
}

/* ---------- Gallery item ---------- */
export const flagMidia = m => `<span class="flag badge ${m.consentimentoOk ? (m.aprovadaPublico ? 'b-ok' : 'b-gray') : 'b-danger'}">${m.consentimentoOk ? (m.aprovadaPublico ? 'pública' : 'privada') : 'sem consent.'}</span>`;
export function galItem(m) {
  if (m.tipo === 'video') return `<div class="gal-item video"><span class="play-overlay">${I('play', 24)}</span><span class="cap">${esc(m.legenda)}</span></div>`;
  return `<div class="gal-item"><img src="${m.url}" alt="${esc(m.legenda)}" loading="lazy"></div>`;
}

/* ---------- Visibility controls ---------- */
export async function mudarVis(id, v, motivo) {
  try { await api('/atividades/' + id, { method: 'PATCH', body: { visibilidade: v, motivo: motivo || '' } }); await loadDB(); closeModal(); toast('Visibilidade atualizada'); render(); }
  catch (e) { toast(e.message, true); }
}
export function mudarVisComMotivo(id, v) {
  modal(`
    <div class="modal-head"><h3>${v === 'aprovado' ? 'Aprovar publicação' : 'Tornar privado'}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="field"><label for="vis-motivo">Motivo (opcional — fica registrado na trilha de auditoria)</label>
        <textarea id="vis-motivo" placeholder="Ex.: consentimentos conferidos; conteúdo adequado para publicação."></textarea></div>
      <div style="display:flex;gap:9px">
        <button class="btn ${v === 'aprovado' ? 'btn-ok' : 'btn-danger'}" onclick="mudarVis('${id}','${v}',$('#vis-motivo').value)">Confirmar</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      </div>
    </div>`);
}

/* ---------- Activity modal ---------- */
export function openAtividade(id) {
  const a = D().atividades.find(x => x.id === id); if (!a) return;
  const ms = midiasDe(a);
  const [vl, vc] = VIS[a.visibilidade] || VIS.privado;
  modal(`
    <div class="modal-head"><h3>${esc(a.titulo)}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <span class="badge ${vc}">${vl}</span>
        ${a.status === 'pendente' ? '<span class="badge b-warn">aguardando classificação</span>' : '<span class="badge b-brand">classificado</span>'}
      </div>
      <div class="ia-grid" style="margin-bottom:14px">
        ${iaSlot('Data', fmtData(a.data))}${iaSlot('Turma', turma(a.turma)?.nome || '—')}
        ${iaSlot('Projeto', proj(a.projeto)?.nome || '—')}${iaSlot('Evento', evento(a.evento)?.nome || '—')}
        ${iaSlot('Disciplina', disc(a.disciplina)?.nome || '—')}${iaSlot('Registrado por', usr(a.autor)?.nome || '—')}
      </div>
      ${a.resumo ? `<p style="font-size:14px;margin-bottom:10px"><b>Resumo:</b> ${esc(a.resumo)}</p>` : ''}
      <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px"><b>Observação do professor:</b> "${esc(a.observacao)}"</p>
      <div style="margin-bottom:14px">${(a.tags||[]).map(t => `<span class="chip">${esc(t)}</span>`).join(' ')}</div>
      ${ms.length ? `<div class="gal" style="margin-bottom:16px">${ms.map(galItem).join('')}</div>` : ''}
      ${(a.historicoAprovacao || []).length ? `
        <div style="margin-bottom:14px;border:1px solid var(--dk-border);border-radius:11px;padding:12px 14px">
          <b style="font-size:13px">${I('file', 14)} Histórico de aprovação</b>
          ${(a.historicoAprovacao||[]).map(h => `
            <div style="font-size:12.5px;margin-top:7px;color:var(--dk-ink-2)">
              <b style="color:var(--dk-ink)">${esc(h.nome)}</b> (${PAPEIS[h.papel] || h.papel}) ${esc(h.acao)}
              em ${new Date(h.quando).toLocaleString('pt-BR')}${h.motivo ? ` — motivo: "${esc(h.motivo)}"` : ''}
            </div>`).join('')}
        </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${a.visibilidade === 'privado' && (a.autor === S.user.id || can('aprovar')) ? `<button class="btn btn-soft btn-sm" onclick="mudarVis('${a.id}','aguardando')">${I('send', 14)} Enviar para aprovação</button>` : ''}
        ${a.visibilidade === 'aguardando' && can('aprovar') ? `<button class="btn btn-ok btn-sm" onclick="mudarVisComMotivo('${a.id}','aprovado')">${I('check', 14)} Aprovar publicação</button>` : ''}
        ${a.visibilidade !== 'privado' && can('aprovar') ? `<button class="btn btn-danger btn-sm" onclick="mudarVisComMotivo('${a.id}','privado')">${I('lock', 14)} Tornar privado</button>` : ''}
      </div>
    </div>`);
}

/* ---------- Lightbox / Gallery ---------- */
let LB = null;

export function fotosDoContexto(tipo, id) {
  const db = D();
  let ativs = [];
  if (tipo === 'projeto')   ativs = db.atividades.filter(a => a.projeto === id);
  if (tipo === 'evento')    ativs = db.atividades.filter(a => a.evento === id);
  if (tipo === 'turma')     ativs = db.atividades.filter(a => a.turma === id);
  if (tipo === 'atividade') ativs = db.atividades.filter(a => a.id === id);
  if (tipo === 'ano')       ativs = db.atividades.filter(a => (a.data || '').startsWith(String(id)));
  return ativs.flatMap(midiasDe).filter(m => m.tipo === 'foto' && m.url);
}

export function abrirGaleria(tipo, id, contexto) {
  const fotos = fotosDoContexto(tipo, id);
  if (!fotos.length) return toast('Nenhuma foto neste conteúdo ainda.', true);
  LB = { fotos, idx: 0, contexto: contexto || '' };
  const root = document.createElement('div');
  root.id = 'lb-root';
  document.body.appendChild(root);
  renderLightbox();
  document.addEventListener('keydown', lbTeclas);
}

function renderLightbox() {
  if (!LB) return;
  const f = LB.fotos[LB.idx];
  const e = document.getElementById('lb-root');
  e.innerHTML = `
  <div class="lightbox" role="dialog" aria-modal="true" aria-label="Galeria de fotos${LB.contexto ? ' — ' + esc(LB.contexto) : ''}" onclick="if(event.target===this)fecharGaleria()">
    <button class="lb-close" onclick="fecharGaleria()" aria-label="Fechar galeria">${I('x', 18)}</button>
    <div class="lb-stage" ontouchstart="lbTouch(event)" ontouchend="lbTouchFim(event)">
      ${LB.fotos.length > 1 ? `<button class="lb-btn prev" onclick="lbNav(-1)" aria-label="Foto anterior">‹</button>` : ''}
      <img class="lb-img" src="${f.url}" alt="${esc(f.legenda || 'Foto do acervo')}" draggable="false">
      ${LB.fotos.length > 1 ? `<button class="lb-btn next" onclick="lbNav(1)" aria-label="Próxima foto">›</button>` : ''}
    </div>
    <div class="lb-bar">
      <div class="cap">${esc(f.legenda || '')}</div>
      ${LB.contexto ? `<div class="ctx">${esc(LB.contexto)}</div>` : ''}
      <span class="lb-count">${LB.idx + 1} de ${LB.fotos.length}</span>
    </div>
  </div>`;
  e.querySelector('.lb-close')?.focus();
}

export function lbNav(d) { if (!LB) return; LB.idx = (LB.idx + d + LB.fotos.length) % LB.fotos.length; renderLightbox(); }
export function fecharGaleria() { LB = null; document.getElementById('lb-root')?.remove(); document.removeEventListener('keydown', lbTeclas); }
function lbTeclas(e) {
  if (e.key === 'Escape') fecharGaleria();
  if (e.key === 'ArrowLeft') lbNav(-1);
  if (e.key === 'ArrowRight') lbNav(1);
}
let lbX0 = null;
export function lbTouch(e) { lbX0 = e.touches[0].clientX; }
export function lbTouchFim(e) {
  if (lbX0 === null) return;
  const dx = e.changedTouches[0].clientX - lbX0;
  if (Math.abs(dx) > 40) lbNav(dx > 0 ? -1 : 1);
  lbX0 = null;
}

export const btnVerFotos = (tipo, id, contexto, n) =>
  n ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();abrirGaleria('${tipo}','${id}','${esc(contexto)}')">${I('camera', 13)} Ver fotos (${n})</button>` : '';

/* ---------- Navigation ---------- */
export function nav(h) { location.hash = h; }

/* ---------- Render (set by router) ---------- */
let renderFn = null;
export function setRender(fn) { renderFn = fn; }
export function render() { if (renderFn) renderFn(); }

/* ---------- Expose to window for inline handlers ---------- */
export function exposeGlobals() {
  window.$ = $;
  window.toast = toast;
  window.modal = modal;
  window.closeModal = closeModal;
  window.openAtividade = openAtividade;
  window.mudarVis = mudarVis;
  window.mudarVisComMotivo = mudarVisComMotivo;
  window.abrirGaleria = abrirGaleria;
  window.fecharGaleria = fecharGaleria;
  window.lbNav = lbNav;
  window.lbTouch = lbTouch;
  window.lbTouchFim = lbTouchFim;
  window.nav = nav;
  window.render = render;
  window.S = S;
  window.I = I;
  window.api = api;
  window.loadDB = loadDB;
  window.D = D;
  window.turma = turma;
  window.proj = proj;
  window.disc = disc;
  window.evento = evento;
  window.usr = usr;
  window.midia = midia;
  window.midiasDe = midiasDe;
  window.can = can;
  window.MESES = MESES;
  window.PAPEIS = PAPEIS;
  window.VIS = VIS;
  window.fmtData = fmtData;
  window.esc = esc;
  window.el = el;
  window.stat = stat;
  window.empty = empty;
  window.rowAtividade = rowAtividade;
  window.galItem = galItem;
  window.iaSlot = iaSlot;
  window.flagMidia = flagMidia;
  window.fotosDoContexto = fotosDoContexto;
  window.btnVerFotos = btnVerFotos;
}
