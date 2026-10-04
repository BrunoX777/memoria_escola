/* Page renderers — all routes */
import { $, el, esc, fmtData, MESES, PAPEIS, VIS, I, S, D, can,
  turma, proj, disc, evento, usr, midia, midiasDe,
  stat, empty, rowAtividade, galItem, flagMidia, iaSlot,
  modal, closeModal, toast, api, loadDB, nav, render,
  fotosDoContexto, btnVerFotos, abrirGaleria, mudarVis, mudarVisComMotivo,
  openAtividade } from '../components/ui.js';
import { abrirVisao } from './dashboard.js';

const routes = {};
let REG = { files: [], form: {}, ia: null };
export function openRegistro() {
  const db = D();
  REG = { files: [], ia: null };
  modal(`
    <div class="modal-head"><h3>${I('camera', 18)} Registrar atividade</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body" id="reg-body">
      <p style="font-size:12.5px;color:var(--ink-3);margin-bottom:14px">Menos de um minuto: turma → fotos → duas frases → salvar. A IA cuida do resto.</p>
      <div class="frow">
        <div class="field"><label>1 · Turma</label>
          <select id="rg-turma">${db.turmas.filter(t => t.ano === db.escola.anoAtual).map(t => `<option value="${t.id}" ${S.user.turmas?.includes(t.id) ? 'selected' : ''}>${t.nome}</option>`).join('')}<option value="">(sem turma / institucional)</option></select></div>
        <div class="field"><label>2 · Projeto</label>
          <select id="rg-proj"><option value="">(nenhum / selecionar depois)</option>${db.projetos.map(p => `<option value="${p.id}">${p.nome} — ${turma(p.turma)?.nome || ''}</option>`).join('')}<option value="__novo">＋ Criar novo projeto…</option></select></div>
      </div>
      <div id="rg-novoproj" style="display:none" class="field"><label>Nome do novo projeto</label><input id="rg-projnome" placeholder="Ex.: Projeto de Robótica"></div>
      <div class="field"><label>3 · Data</label><input id="rg-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label>4 · Fotos e vídeos</label>
        <div class="dropzone" id="rg-drop" role="button" tabindex="0" aria-label="Enviar fotos ou vídeos">${I('camera', 20)} Toque para tirar/enviar fotos ou vídeos<br><small>ou arraste os arquivos aqui · jpg, png até 10MB · mp4, mov até 20MB</small></div>
        <input type="file" id="rg-file" accept=".jpg,.jpeg,.png,.mp4,.mov,image/jpeg,image/png,video/mp4,video/quicktime" multiple capture="environment" style="display:none">
        <div class="upl-list" id="rg-upl"></div>
      </div>
      <div class="field"><label>5 · O que aconteceu? <span style="font-weight:400;color:var(--ink-3)">(duas frases bastam)</span></label>
        <textarea id="rg-obs" placeholder='Ex.: "Hoje os alunos apresentaram os protótipos do sistema."'></textarea></div>
      <button class="btn btn-create" style="width:100%;justify-content:center" onclick="regAnalisar()">${I('sparkles', 15)} Salvar e deixar a IA organizar</button>
    </div>`);
  $('#rg-proj').addEventListener('change', e => { $('#rg-novoproj').style.display = e.target.value === '__novo' ? 'block' : 'none'; });
  const drop = $('#rg-drop'), file = $('#rg-file');
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); regUpload(e.dataTransfer.files); };
  file.onchange = () => regUpload(file.files);
};

async function regUpload(fileList) {
  const fd = new FormData();
  [...fileList].forEach(f => fd.append('files', f));
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'x-token': S.token }, body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Falha no upload');
    REG.files.push(...j.files);
    renderUplList();
    if (j.rejeitados && j.rejeitados.length) toast(j.rejeitados.map(x => x.nome + ': ' + x.motivo).join(' · '), true);
    if (j.files.length) toast(j.files.length + ' arquivo(s) enviado(s) e validado(s)');
  } catch (e) { toast(e.message, true); }
}
function renderUplList() {
  $('#rg-upl').innerHTML = REG.files.map((f, i) => `
    <div class="upl-item">${f.tipo === 'foto' ? `<img src="${f.url}">` : I('video', 22)}<button class="rm" onclick="REG.files.splice(${i},1);renderUplList()" aria-label="Remover arquivo">${I('x', 16)}</button></div>`).join('');
}
window.regAnalisar = async () => {
  const obs = $('#rg-obs').value.trim();
  let projetoId = $('#rg-proj').value;
  if (projetoId === '__novo') {
    const nome = $('#rg-projnome').value.trim();
    if (!nome) return toast('Dê um nome ao novo projeto', true);
    const np = await api('/projetos', { body: { nome, turma: $('#rg-turma').value || null } });
    D().projetos.push(np.projeto); projetoId = np.projeto.id;
    toast('Projeto criado: ' + nome);
  }
  const payload = { observacao: obs, turmaId: $('#rg-turma').value || null, projetoId: projetoId || null, data: $('#rg-data').value, qtdFotos: REG.files.filter(f => f.tipo === 'foto').length, qtdVideos: REG.files.filter(f => f.tipo === 'video').length };
  REG.form = { turma: $('#rg-turma').value || null, projeto: projetoId || null, data: $('#rg-data').value, observacao: obs };
  const ia = await api('/ia/curar', { body: payload });
  REG.ia = ia;
  renderIAConfirm();
};
function renderIAConfirm() {
  const ia = REG.ia;
  $('#reg-body').innerHTML = `
    <div class="ia-panel">
      <div class="ia-head"><div class="spark">${I('sparkles', 16)}</div><b>A IA organizou o seu registro</b>
        <span class="conf badge ${ia.confianca === 'alta' ? 'b-ok' : ia.confianca === 'média' ? 'b-warn' : 'b-danger'}">confiança ${ia.confianca}</span></div>
      <div class="field"><label>Título sugerido</label><input id="ia-titulo" value="${esc(ia.titulo)}"></div>
      <div class="ia-grid">
        ${iaSlot('Projeto', ia.projeto?.nome || '—')}${iaSlot('Turma', ia.turma?.nome || '—')}
        ${iaSlot('Disciplina', ia.disciplina?.nome || '—')}${iaSlot('Evento', ia.evento?.nome || '—')}
        ${iaSlot('Categoria', ia.categoria)}
      </div>
      <div class="field" style="margin-top:12px"><label>Tags sugeridas <span style="font-weight:400">(clique para remover)</span></label>
        <div id="ia-tags">${ia.tags.map(t => `<span class="chip rm" onclick="rmTag(this)" data-t="${esc(t)}">${esc(t)} ${I('x', 10)}</span>`).join(' ')}</div>
        <input id="ia-newtag" placeholder="+ adicionar tag e Enter" style="margin-top:8px">
      </div>
      <div class="field"><label>Resumo institucional sugerido</label><textarea id="ia-resumo">${esc(ia.resumo)}</textarea></div>
      ${ia.participantes?.length ? `<div class="field"><label>Possíveis participantes (com base na turma — a IA não identifica rostos)</label>
        <div>${ia.participantes.map(p => `<span class="chip ${p.consentimento === 'autorizado' ? '' : 'gray'}">${esc(p.nome)} ${p.consentimento === 'autorizado' ? I('check', 11) : p.consentimento === 'negado' ? I('ban', 11) : I('clock', 11)}</span>`).join(' ')}</div></div>` : ''}
      ${ia.avisos.map(a => `<div class="ia-aviso">${I('alert', 14)} <span>${esc(a)}</span></div>`).join('')}
      <div class="ia-actions">
        <button class="btn btn-primary" onclick="regSalvar(true)">${I('check', 15)} Aceitar e salvar</button>
        <button class="btn btn-ghost" onclick="regSalvar(false)">Salvar sem classificação (revisar depois)</button>
        <button class="btn btn-danger btn-sm" onclick="closeModal()">Rejeitar tudo</button>
      </div>
      <p style="font-size:11px;color:var(--ink-3);margin-top:10px">${I('lock', 12)} Nada será publicado automaticamente. O registro nasce <b>privado</b> e só vai à página pública após aprovação humana.</p>
    </div>`;
  $('#ia-newtag').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      $('#ia-tags').insertAdjacentHTML('beforeend', ` <span class="chip rm" onclick="rmTag(this)" data-t="${esc(e.target.value.trim())}">${esc(e.target.value.trim())} ${I('x', 10)}</span>`);
      e.target.value = '';
    }
  });
}
const iaSlot = (k, v) => `<div class="ia-slot"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
window.rmTag = (elm) => elm.remove();
window.regSalvar = async (confirmado) => {
  const ia = REG.ia, f = REG.form;
  const tags = confirmado ? [...document.querySelectorAll('#ia-tags .chip')].map(c => c.dataset.t) : [];
  try {
    const r = await api('/atividades', { body: {
      titulo: confirmado ? $('#ia-titulo').value : (f.observacao.slice(0, 60) || 'Atividade'),
      turma: ia.turma?.id || f.turma, projeto: ia.projeto?.id || f.projeto,
      evento: confirmado ? (ia.evento?.id || null) : null, disciplina: confirmado ? (ia.disciplina?.id || null) : null,
      data: f.data, observacao: f.observacao, categoria: confirmado ? ia.categoria : 'Pedagógico',
      tags, resumo: confirmado ? $('#ia-resumo').value : '', midias: REG.files,
      confirmadoIA: confirmado, consentimentoOk: !ia.avisos.some(a => a.includes('sem consentimento'))
    }});
    closeModal();
    await loadDB();
    toast('Atividade registrada! ' + (confirmado ? 'Classificada pela IA e confirmada por você.' : 'Ficará nas pendências para classificar.'));
    render();
  } catch (e) { toast(e.message, true); }
};

/* ---------- Modal de atividade ---------- */
/* item 3: aprovação/recusa com motivo opcional registrado na trilha de auditoria */

/* ============================================================
   TIMELINE
   ============================================================ */
routes.timeline = () => {
  const db = D(); const ano = S.anoTL;
  const anos = [...new Set([...db.eventos.map(e => e.ano), ...db.projetos.map(p => p.ano)])].sort();
  const evts = db.eventos.filter(e => e.ano === ano).sort((a, b) => a.mes - b.mes);
  const porMes = {};
  evts.forEach(e => { (porMes[e.mes] = porMes[e.mes] || []).push(e); });
  db.atividades.filter(a => +a.data.slice(0, 4) === ano && !a.evento).forEach(a => {
    const m = +a.data.slice(5, 7); (porMes[m] = porMes[m] || []).push({ _atv: a });
  });
  return `
  <div class="pend info" style="margin-bottom:14px">${I('clock', 16)} <span><b>Linha do tempo</b> = histórico bruto e completo dos registros, mês a mês. Para o <b>resumo editorial do ano</b> (números, destaques e material para reuniões), use a <a href="#/retrospectiva" style="font-weight:700">Retrospectiva →</a></span></div>
  <div class="sec-title" style="margin-top:0"><h2>${I('clock', 18)} Linha do tempo institucional</h2>
    <div class="year-nav">
      <button onclick="S.anoTL=${ano - 1};render()" ${anos.includes(ano - 1) ? '' : 'disabled'} aria-label="Ano anterior">‹</button>
      <span class="y">${ano}</span>
      <button onclick="S.anoTL=${ano + 1};render()" ${anos.includes(ano + 1) ? '' : 'disabled'} aria-label="Próximo ano">›</button>
    </div></div>
  <div class="tl" style="margin-top:24px">
    ${Object.keys(porMes).sort((a, b) => a - b).map(m => `
      <div class="tl-item"><div class="mes">${MESES[m - 1]}</div>
        ${porMes[m].map(e => e._atv ? tlAtv(e._atv) : tlEvt(e, db)).join('')}
      </div>`).join('') || empty('Nenhum registro em ' + ano, 'clock')}
  </div>`;
};
function tlEvt(e, db) {
  const ativs = db.atividades.filter(a => a.evento === e.id);
  const ms = ativs.flatMap(midiasDe);
  const nF = ms.filter(m => m.tipo === 'foto').length, nV = ms.filter(m => m.tipo === 'video').length;
  const ts = e.turmas.map(t => turma(t)?.nome).filter(Boolean);
  return `<div class="card tl-card" style="margin-bottom:10px" onclick="location.hash='#/evento/${e.id}'">
    <b>${esc(e.nome)}</b>
    <div class="meta">${nF} fotos · ${nV} vídeos ${ts.length ? '· ' + ts.join(', ') : ''} · <span class="chip gray">${esc(e.categoria)}</span></div>
  </div>`;
}
function tlAtv(a) {
  const ms = midiasDe(a);
  return `<div class="card tl-card" style="margin-bottom:10px" onclick="openAtividade('${a.id}')">
    <b>${esc(a.titulo)}</b>
    <div class="meta">${ms.filter(m=>m.tipo==='foto').length} fotos · ${ms.filter(m=>m.tipo==='video').length} vídeos · ${turma(a.turma)?.nome || 'Escola'}</div>
  </div>`;
}

/* ============================================================
   PROJETOS
   ============================================================ */
/* Capa padrão por disciplina (item 7): gradiente temático + padrão decorativo + ícone.
   Todas as capas usam o mesmo aspect-ratio (16/9). */
const CAPA_DISC = {
  /* gradientes por disciplina — toda a família na paleta azul/índigo institucional;
     a diferenciação vem do tom + ícone, nunca de cores quentes (regra do design system) */
  'd-ds':   { g: 'linear-gradient(135deg,#102C57,#245A91)', ic: 'monitor' },
  'd-cie':  { g: 'linear-gradient(135deg,#173F7A,#3B82C4)', ic: 'flask' },
  'd-mat':  { g: 'linear-gradient(135deg,#1E3A5F,#2F6BA3)', ic: 'ruler' },
  'd-hist': { g: 'linear-gradient(135deg,#0B1F42,#173F7A)', ic: 'landmark' },
  'd-art':  { g: 'linear-gradient(135deg,#312E81,#6366F1)', ic: 'palette' },
  'd-edf':  { g: 'linear-gradient(135deg,#14345F,#245A91)', ic: 'ball' },
  default:  { g: 'linear-gradient(135deg,#173F7A,#245A91)', ic: 'blocks' }
};
function capaProjeto(p, ph) {
  if (ph) return `<div class="proj-capa" style="background-image:url(${ph.url})" role="img" aria-label="Foto do projeto ${esc(p.nome)}"></div>`;
  const c = CAPA_DISC[p.disciplina] || CAPA_DISC.default;
  return `<div class="proj-capa padrao" style="background:${c.g}" role="img" aria-label="Capa ilustrativa do projeto ${esc(p.nome)}">
    <span class="deco" aria-hidden="true"></span><span class="ic" aria-hidden="true">${I(c.ic, 40)}</span>
    <span class="disc-lbl">${esc(disc(p.disciplina)?.nome || p.categoria)}</span>
  </div>`;
}
routes.projetos = () => {
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('blocks', 18)} Projetos</h2>
    ${can('criarProjeto') ? `<button class="btn btn-create btn-sm" onclick="novoProjeto()">＋ Novo projeto</button>` : ''}</div>
  <div class="grid g3">
    ${db.projetos.map(p => {
      const ativs = db.atividades.filter(a => a.projeto === p.id);
      const ms = ativs.flatMap(midiasDe); const ph = ms.find(m => m.tipo === 'foto' && m.url);
      return `<div class="card" style="overflow:hidden;cursor:pointer" onclick="location.hash='#/projeto/${p.id}'">
        ${capaProjeto(p, ph)}
        <div style="padding:14px 16px">
          <b style="font-size:14.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.nome)}</b>
          <div style="font-size:13px;color:var(--ink-3);margin:3px 0 8px">${turma(p.turma)?.nome || '—'} · ${p.ano} · ${esc(p.categoria)}</div>
          <span class="badge ${p.status === 'concluido' ? 'b-ok' : 'b-brand'}">${p.status === 'concluido' ? 'Concluído' : 'Em andamento'}</span>
          ${!p.descricao ? '<span class="badge b-warn">sem descrição</span>' : ''}
        </div></div>`;
    }).join('')}
  </div>`;
};
window.novoProjeto = () => {
  const db = D();
  modal(`
    <div class="modal-head"><h3>＋ Novo projeto</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="field"><label>Nome</label><input id="np-nome" placeholder="Ex.: Projeto de Robótica"></div>
      <div class="frow">
        <div class="field"><label>Turma</label><select id="np-turma">${db.turmas.filter(t => t.ano === db.escola.anoAtual).map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Disciplina</label><select id="np-disc">${db.disciplinas.map(d => `<option value="${d.id}">${d.nome}</option>`).join('')}</select></div>
      </div>
      <div class="frow">
        <div class="field"><label>Categoria</label><select id="np-cat">${['Tecnologia','Sustentabilidade','Cultural','Competição','Pedagógico','Robótica'].map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Ano</label><input id="np-ano" type="number" value="${db.escola.anoAtual}"></div>
      </div>
      <div class="field"><label>Descrição</label><textarea id="np-desc"></textarea></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="salvarProjeto()">Criar projeto</button>
    </div>`);
};
window.salvarProjeto = async () => {
  const nome = $('#np-nome').value.trim();
  if (!nome) return toast('Informe o nome do projeto', true);
  try {
    await api('/projetos', { body: { nome, turma: $('#np-turma').value, disciplina: $('#np-disc').value, categoria: $('#np-cat').value, ano: +$('#np-ano').value, descricao: $('#np-desc').value } });
    closeModal(); await loadDB(); toast('Projeto criado!'); render();
  } catch (e) { toast(e.message, true); }
};

routes.projeto = (id) => {
  const db = D(); const p = proj(id);
  if (!p) return empty('Projeto não encontrado');
  const ativs = db.atividades.filter(a => a.projeto === id).sort((a, b) => a.data.localeCompare(b.data));
  const ms = ativs.flatMap(midiasDe);
  const ph = ms.find(m => m.tipo === 'foto' && m.url);
  const parts = (p.participantes || []).map(pid => db.alunos.find(a => a.id === pid)).filter(Boolean);
  const podeEditar = p.professor === S.user.id || can('revisar');
  return `
  <div class="proj-hero" style="${ph ? `background-image:url(${ph.url})` : ''}"><div class="ov"></div>
    <div class="in"><h1>${esc(p.nome)}</h1>
      <div class="proj-meta">
        <span class="chip">${I('cap', 12)} ${turma(p.turma)?.nome || '—'}</span><span class="chip">${I('calendar', 12)} ${p.ano}</span>
        <span class="chip">${I('user', 12)} ${usr(p.professor)?.nome || '—'}</span><span class="chip">${I('book', 12)} ${disc(p.disciplina)?.nome || '—'}</span>
        <span class="chip">${I('tag', 12)} ${esc(p.categoria)}</span>
      </div></div></div>

  <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:20px;align-items:start" id="pj-grid">
    <div>
      <div class="card card-pad">
        <div class="sec-title" style="margin:0 0 8px"><h2>Sobre o projeto</h2>
          ${podeEditar ? `<button class="btn btn-ghost btn-sm" onclick="editarProjeto('${p.id}')">${I('note', 14)} Editar</button>` : ''}</div>
        <p style="color:var(--ink-2)">${esc(p.descricao) || '<i style="color:var(--warn-text)">Projeto ainda sem descrição — pendência de organização.</i>'}</p>
        <div class="sec-title"><h2>O que os alunos fizeram</h2></div>
        <ul class="check-list">${(p.etapas || []).map(e => `<li><span class="ck">${I('check', 14)}</span>${esc(e)}</li>`).join('') || '<li>—</li>'}</ul>
        <div class="sec-title"><h2>Resultado</h2></div>
        <p style="color:var(--ink-2)">${esc(p.resultado) || '<i>Resultado ainda não registrado.</i>'}</p>
        <div style="margin-top:12px">${(p.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join(' ')}</div>
      </div>
      <div class="sec-title"><h2>Galeria</h2><span class="sub">${ms.filter(m=>m.tipo==='foto').length} fotos · ${ms.filter(m=>m.tipo==='video').length} vídeos</span></div>
      <div class="gal">${ms.map(galItem).join('') || empty('Sem mídias ainda.', 'camera')}</div>
      <div class="sec-title"><h2>Atividades registradas</h2></div>
      <div class="card">${ativs.map(rowAtividade).join('') || empty('Nenhuma atividade registrada.')}</div>
    </div>
    <div>
      <div class="card card-pad">
        <h2 style="font-size:15px;margin-bottom:10px">${I('clip', 15)} Arquivos</h2>
        ${(p.arquivos || []).map(a => `<div style="display:flex;gap:9px;padding:8px 0;border-bottom:1px dashed var(--border);font-size:13.5px">${I('file', 14)} ${esc(a.nome)}</div>`).join('') || '<p class="empty" style="padding:10px">Nenhum arquivo.</p>'}
      </div>
      <div class="card card-pad" style="margin-top:14px">
        <h2 style="font-size:15px;margin-bottom:10px">${I('users', 15)} Participantes</h2>
        ${parts.map(a => `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px dashed var(--border)">
          <span class="avatar" style="width:30px;height:30px;font-size:10.5px">${a.nome.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
          <span style="flex:1;font-size:13.5px">${esc(a.nome)}</span>
          <span class="badge ${a.consentimentoImagem === 'autorizado' ? 'b-ok' : a.consentimentoImagem === 'negado' ? 'b-danger' : 'b-warn'}" title="consentimento de imagem">${a.consentimentoImagem}</span>
        </div>`).join('') || '<p class="empty" style="padding:10px">Sem participantes vinculados.</p>'}
        <div style="display:flex;gap:9px;padding:8px 0;font-size:13.5px;color:var(--ink-2)">${I('user', 13)} ${usr(p.professor)?.nome || '—'} (professor)</div>
      </div>
      ${can('gerarTextos') || can('registrar') ? `<button class="btn btn-soft" style="width:100%;justify-content:center;margin-top:14px" onclick="openMarketing('projeto','${p.id}')">${I('megaphone', 15)} Gerar conteúdo deste projeto</button>` : ''}
    </div>
  </div>
  <style>@media(max-width:920px){ #pj-grid{grid-template-columns:1fr !important} }</style>`;
};
window.editarProjeto = (id) => {
  const p = proj(id);
  modal(`
    <div class="modal-head"><h3>${I('note', 14)} Editar projeto</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="field"><label>Descrição</label><textarea id="ep-desc">${esc(p.descricao)}</textarea></div>
      <div class="field"><label>Etapas (uma por linha)</label><textarea id="ep-etapas">${(p.etapas || []).map(esc).join('\n')}</textarea></div>
      <div class="field"><label>Resultado final</label><textarea id="ep-res">${esc(p.resultado)}</textarea></div>
      <div class="field"><label>Status</label><select id="ep-st"><option value="andamento" ${p.status === 'andamento' ? 'selected' : ''}>Em andamento</option><option value="concluido" ${p.status === 'concluido' ? 'selected' : ''}>Concluído</option></select></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="salvarEdicaoProjeto('${id}')">Salvar</button>
    </div>`);
};
window.salvarEdicaoProjeto = async (id) => {
  try {
    await api('/projetos/' + id, { method: 'PATCH', body: { descricao: $('#ep-desc').value, etapas: $('#ep-etapas').value.split('\n').filter(Boolean), resultado: $('#ep-res').value, status: $('#ep-st').value } });
    closeModal(); await loadDB(); toast('Projeto atualizado'); render();
  } catch (e) { toast(e.message, true); }
};

/* ============================================================
   TURMAS / DISCIPLINAS / EVENTOS / ALUNOS
   ============================================================ */
routes.turmas = () => {
  const db = D();
  const anos = [...new Set(db.turmas.map(t => t.ano))].sort().reverse();
  if (!anos.length) return `
    <div class="sec-title" style="margin-top:0"><h2>${I('cap', 18)} Turmas</h2>
      ${can('gerenciarTurmas') ? `<button class="btn btn-create btn-sm" onclick="novaTurma()">＋ Nova turma</button>` : ''}</div>
    ${empty('Nenhuma turma cadastrada ainda.' + (can('gerenciarTurmas') ? ' Clique em "＋ Nova turma" para começar.' : ''), 'cap')}`;
  return anos.map((ano, ix) => `
    <div class="sec-title" ${ix === 0 ? 'style="margin-top:0"' : ''}><h2>${I('cap', 18)} Turmas — ${ano}</h2>
      ${ix === 0 && can('gerenciarTurmas') ? `<button class="btn btn-create btn-sm" onclick="novaTurma()">＋ Nova turma</button>` : ''}</div>
    <div class="grid g3">
      ${db.turmas.filter(t => t.ano === ano).map(t => {
        const np = db.projetos.filter(p => p.turma === t.id).length;
        const na = db.atividades.filter(a => a.turma === t.id).length;
        return `<div class="card card-pad" style="cursor:pointer" onclick="location.hash='#/turma/${t.id}'">
          <b style="font-size:16px">${esc(t.nome)}</b>
          <div style="font-size:12px;color:var(--ink-3);margin:2px 0 10px">${esc(t.nivel)} · ${t.ano}</div>
          <div style="display:flex;gap:14px;font-size:12.5px;color:var(--ink-2)"><span>${I('blocks', 12)} ${np} projetos</span><span>${I('note', 12)} ${na} registros</span></div>
        </div>`;
      }).join('')}
    </div>`).join('');
};

window.novaTurma = () => {
  const db = D();
  const profs = db.users.filter(u => u.papel === 'professor');
  modal(`
    <div class="modal-head"><h3>${I('cap', 18)} Nova turma</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="frow">
        <div class="field"><label for="nt-nome">Nome da turma *</label><input id="nt-nome" maxlength="60" placeholder="Ex.: 1º DS, 7º Ano B"></div>
        <div class="field"><label for="nt-ano">Ano letivo</label><input id="nt-ano" type="number" min="2020" max="2035" value="${db.escola.anoAtual}"></div>
      </div>
      <div class="field"><label for="nt-nivel">Nível de ensino</label>
        <input id="nt-nivel" list="nt-niveis" placeholder="Ex.: Ensino Médio Técnico">
        <datalist id="nt-niveis">${['Educação Infantil', 'Ensino Fundamental', 'Ensino Médio', 'Ensino Médio Técnico'].map(n => `<option value="${n}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Professores responsáveis <span style="font-weight:400;color:var(--ink-3)">(opcional — poderão ver os dados dos alunos desta turma)</span></label>
        <div style="display:grid;gap:6px">
          ${profs.map(p => `<label class="check-opt"><input type="checkbox" class="nt-prof" value="${p.id}"> <span class="avatar" style="width:26px;height:26px;font-size:10px" aria-hidden="true">${p.avatar}</span> ${esc(p.nome)}</label>`).join('') || '<span style="font-size:13px;color:var(--ink-3)">Nenhum professor cadastrado.</span>'}
        </div>
      </div>
      <button class="btn btn-create" style="width:100%;justify-content:center" onclick="salvarTurma()">Criar turma</button>
    </div>`);
  setTimeout(() => $('#nt-nome')?.focus(), 80);
};
window.salvarTurma = async () => {
  const nome = $('#nt-nome').value.trim();
  if (!nome) return toast('Informe o nome da turma', true);
  try {
    await api('/turmas', { body: {
      nome, ano: +$('#nt-ano').value || undefined, nivel: $('#nt-nivel').value.trim(),
      professores: [...document.querySelectorAll('.nt-prof:checked')].map(c => c.value)
    } });
    closeModal(); await loadDB(); toast('Turma criada!'); render();
  } catch (e) { toast(e.message, true); }
};

routes.turma = (id) => {
  const db = D(); const t = turma(id);
  if (!t) return empty('Turma não encontrada');
  const projetos = db.projetos.filter(p => p.turma === id);
  const ativs = db.atividades.filter(a => a.turma === id);
  const evts = db.eventos.filter(e => e.turmas.includes(id));
  const ms = ativs.flatMap(midiasDe);
  const profs = t.professores.map(usr).filter(Boolean);
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('cap', 18)} ${esc(t.nome)} — ${t.ano}</h2><span class="sub">${esc(t.nivel)} · tudo o que a turma realizou no ano</span></div>
  <div class="grid g4">
    ${stat(projetos.length, 'Projetos', 'blocks')}${stat(evts.length, 'Eventos', 'calendar')}
    ${stat(ms.filter(m => m.tipo === 'foto').length, 'Fotos', 'camera')}${stat(ms.filter(m => m.tipo === 'video').length, 'Vídeos', 'video')}
  </div>
  <div class="sec-title"><h2>Projetos</h2></div>
  <div class="card">${projetos.map(p => `<div class="item-row" onclick="location.hash='#/projeto/${p.id}'"><div class="thumb" aria-hidden="true">${I('blocks', 20)}</div>
    <div style="flex:1"><div class="tit">${esc(p.nome)}</div><div class="meta">${esc(p.categoria)} · ${disc(p.disciplina)?.nome || ''}</div></div>
    <span class="badge ${p.status === 'concluido' ? 'b-ok' : 'b-brand'}">${p.status}</span></div>`).join('') || empty('Sem projetos.')}</div>
  <div class="sec-title"><h2>Eventos</h2></div>
  <div class="card">${evts.map(e => `<div class="item-row" onclick="location.hash='#/evento/${e.id}'"><div class="thumb" aria-hidden="true">${I('calendar', 20)}</div>
    <div><div class="tit">${esc(e.nome)}</div><div class="meta">${MESES[e.mes - 1]} de ${e.ano}</div></div></div>`).join('') || empty('Sem eventos.')}</div>
  <div class="sec-title"><h2>Galeria da turma</h2></div>
  <div class="gal">${ms.map(galItem).join('') || empty('Sem mídias.', 'camera')}</div>
  <div class="sec-title"><h2>Professores</h2></div>
  <div class="card card-pad" style="display:flex;gap:16px;flex-wrap:wrap">
    ${profs.map(p => `<div style="display:flex;gap:10px;align-items:center"><span class="avatar">${p.avatar}</span><div><b style="font-size:13.5px">${esc(p.nome)}</b><br><small style="color:var(--ink-3)">${PAPEIS[p.papel]}</small></div></div>`).join('') || '—'}
  </div>
  ${can('historias') || can('registrar') ? `<div style="margin-top:18px"><button class="btn btn-create" onclick="preHistoriaTurma('${id}')">${I('bookopen', 15)} Criar história desta turma</button></div>` : ''}`;
};

routes.disciplinas = () => {
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('book', 18)} Disciplinas — ${db.escola.anoAtual}</h2>
    ${can('gerenciarTurmas') ? `<button class="btn btn-create btn-sm" onclick="novaDisciplina()">＋ Nova disciplina</button>` : ''}</div>
  ${!db.disciplinas.length ? empty('Nenhuma disciplina cadastrada ainda.' + (can('gerenciarTurmas') ? ' Clique em "＋ Nova disciplina" para começar.' : ''), 'book') : ''}
  <div class="grid g3">
    ${db.disciplinas.map(d => {
      const projs = db.projetos.filter(p => p.disciplina === d.id);
      const ativs = db.atividades.filter(a => a.disciplina === d.id);
      return `<div class="card card-pad" style="cursor:pointer;border-top:4px solid ${d.cor}" onclick="location.hash='#/disciplina/${d.id}'">
        <b style="font-size:15px">${esc(d.nome)}</b>
        <div style="display:flex;gap:12px;font-size:12.5px;color:var(--ink-2);margin-top:8px"><span>${I('blocks', 12)} ${projs.length}</span><span>${I('note', 12)} ${ativs.length}</span></div>
      </div>`;
    }).join('')}
  </div>`;
};

window.novaDisciplina = () => {
  modal(`
    <div class="modal-head"><h3>${I('book', 18)} Nova disciplina</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="field"><label for="nd-nome">Nome da disciplina *</label><input id="nd-nome" maxlength="60" placeholder="Ex.: Robótica, Língua Portuguesa"></div>
      <div class="field"><label for="nd-cor">Cor de identificação</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input id="nd-cor" type="color" value="#173F7A" style="width:52px;height:44px;padding:4px;cursor:pointer">
          <span style="font-size:12.5px;color:var(--ink-3)">usada na borda dos cards e nos títulos da disciplina</span>
        </div>
      </div>
      <button class="btn btn-create" style="width:100%;justify-content:center" onclick="salvarDisciplina()">Criar disciplina</button>
    </div>`);
  setTimeout(() => $('#nd-nome')?.focus(), 80);
};
window.salvarDisciplina = async () => {
  const nome = $('#nd-nome').value.trim();
  if (!nome) return toast('Informe o nome da disciplina', true);
  try {
    await api('/disciplinas', { body: { nome, cor: $('#nd-cor').value } });
    closeModal(); await loadDB(); toast('Disciplina criada!'); render();
  } catch (e) { toast(e.message, true); }
};

routes.disciplina = (id) => {
  const db = D(); const d = disc(id);
  if (!d) return empty('Disciplina não encontrada');
  const projs = db.projetos.filter(p => p.disciplina === id);
  const ativs = db.atividades.filter(a => a.disciplina === id);
  const ms = ativs.flatMap(midiasDe);
  const turmas = [...new Set(projs.map(p => p.turma).filter(Boolean))];
  return `
  <div class="sec-title" style="margin-top:0"><h2 style="color:${d.cor}">${I('book', 18)} ${esc(d.nome)} — ${db.escola.anoAtual}</h2></div>
  <div class="grid g4">
    ${stat(projs.length, 'Projetos', 'blocks')}${stat(ativs.length, 'Registros', 'note')}
    ${stat(ms.filter(m => m.tipo === 'foto').length + ' · ' + ms.filter(m => m.tipo === 'video').length, 'Fotos · Vídeos', 'camera')}
    ${stat(turmas.length, 'Turmas envolvidas', 'cap')}
  </div>
  <div class="sec-title"><h2>Projetos</h2></div>
  <div class="card">${projs.map(p => `<div class="item-row" onclick="location.hash='#/projeto/${p.id}'"><div class="thumb" aria-hidden="true">${I('blocks', 20)}</div>
    <div style="flex:1"><div class="tit">${esc(p.nome)}</div><div class="meta">${turma(p.turma)?.nome || ''} · ${p.ano}</div></div>
    <span class="badge ${p.status === 'concluido' ? 'b-ok' : 'b-brand'}">${p.status}</span></div>`).join('') || empty('Sem projetos.')}</div>
  <div class="sec-title"><h2>Registros</h2></div>
  <div class="card">${ativs.map(rowAtividade).join('') || empty('Sem registros.')}</div>`;
};

routes.eventos = () => {
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('calendar', 18)} Eventos</h2></div>
  <div class="grid g3">
    ${[...db.eventos].sort((a, b) => b.data.localeCompare(a.data)).map(e => {
      const ativs = db.atividades.filter(a => a.evento === e.id);
      const ms = ativs.flatMap(midiasDe); const ph = ms.find(m => m.tipo === 'foto' && m.url);
      return `<div class="card" style="overflow:hidden;cursor:pointer" onclick="location.hash='#/evento/${e.id}'">
        <div style="aspect-ratio:16/9;background:${ph ? `url(${ph.url}) center/cover` : 'linear-gradient(135deg,#173F7A,#245A91)'};display:grid;place-items:center;font-size:32px;color:#fff">${ph ? '' : I('calendar', 34)}</div>
        <div style="padding:13px 15px"><b>${esc(e.nome)}</b>
          <div style="font-size:12px;color:var(--ink-3);margin-top:2px">${MESES[e.mes - 1]} de ${e.ano} · ${esc(e.categoria)} · ${ms.length} mídias ${!ms.length ? '<span class="badge b-warn">sem fotos</span>' : ''}</div>
        </div></div>`;
    }).join('')}
  </div>`;
};

routes.evento = (id) => {
  const db = D(); const e = evento(id);
  if (!e) return empty('Evento não encontrado');
  const ativs = db.atividades.filter(a => a.evento === id);
  const ms = ativs.flatMap(midiasDe);
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('calendar', 18)} ${esc(e.nome)}</h2><span class="sub">${fmtData(e.data)} · ${esc(e.categoria)}</span></div>
  <div class="card card-pad"><p style="color:var(--ink-2)">${esc(e.descricao)}</p>
    <div style="margin-top:10px">${e.turmas.map(t => `<span class="chip">${I('cap', 12)} ${turma(t)?.nome || t}</span>`).join(' ')}</div></div>
  <div class="sec-title"><h2>Registros do evento</h2></div>
  <div class="card">${ativs.map(rowAtividade).join('') || empty('Nenhum registro vinculado — pendência de organização.', 'clock')}</div>
  <div class="sec-title"><h2>Galeria</h2></div>
  <div class="gal">${ms.map(galItem).join('') || empty('Sem mídias.', 'camera')}</div>`;
};

/* RBAC de alunos (item 1):
   - o servidor já filtra o que cada papel recebe (dadosCompletos true/false)
   - a visualização de dados sensíveis dispara log de auditoria no servidor */
routes.alunos = () => {
  const db = D();
  if (db.nivelAlunos === 'nenhum') return empty('Seu perfil não tem acesso à área de alunos.', 'lock');
  // cadastro de alunos: mesma régua LGPD da visão completa (coordenação e direção)
  const podeCadastrar = db.nivelAlunos === 'completo' && can('revisar');
  // registra na trilha de auditoria que este usuário visualizou dados sensíveis (uma vez por render)
  if (db.alunos.some(a => a.dadosCompletos)) api('/alunos/auditoria-acesso', { body: {} }).catch(() => {});
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('users', 18)} Memória por aluno</h2>
    <div style="display:flex;gap:10px;align-items:center"><span class="sub">${I('lock', 12)} área restrita — LGPD</span>
    ${podeCadastrar ? `<button class="btn btn-create btn-sm" onclick="novoAluno()">＋ Novo aluno</button>` : ''}</div></div>
  ${!db.alunos.length ? empty('Nenhum aluno cadastrado ainda.' + (podeCadastrar ? ' Clique em "＋ Novo aluno" para começar.' : ''), 'users') : ''}
  <div class="pend info" style="margin-bottom:16px">${I('shield', 16)} <span>A identificação de alunos em fotos <b>nunca é pública automaticamente</b>. Os vínculos abaixo vêm de participação declarada em projetos — não de reconhecimento facial. Todo acesso a dados sensíveis é registrado na trilha de auditoria.</span></div>
  ${db.nivelAlunos === 'parcial' ? `<div class="pend warn" style="margin-bottom:16px">${I('lock', 16)} <span>Como professor, você vê o status de autorização de imagem <b>apenas dos alunos das suas turmas</b>. Dos demais, apenas nome e turma.</span></div>` : ''}
  <div class="grid g3">
    ${db.alunos.map(a => {
      const projs = db.projetos.filter(p => (p.participantes || []).includes(a.id));
      const evts = [...new Set(projs.flatMap(p => db.atividades.filter(x => x.projeto === p.id && x.evento).map(x => x.evento)))].map(evento).filter(Boolean);
      const cs = a.consentimentoImagem;
      return `<div class="card card-pad">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
          <span class="avatar" aria-hidden="true">${a.nome.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
          <div><b>${esc(a.nome)}</b><br><small style="color:var(--ink-3);font-size:12.5px">${turma(a.turma)?.nome || ''}${a.dadosCompletos ? ' · ' + (a.menorIdade ? 'menor de idade' : 'maior de idade') : ''}</small></div>
        </div>
        ${a.dadosCompletos
          ? `<span class="badge ${cs === 'autorizado' ? 'b-ok' : cs === 'negado' ? 'b-danger' : 'b-warn'}">imagem: ${cs}</span>`
          : `<span class="badge b-gray" title="Visível apenas para coordenação, direção ou professor responsável pela turma">${I('lock', 10)} dados restritos</span>`}
        <p style="font-size:12.5px;color:var(--ink-3);margin:10px 0 4px;font-weight:700">Participou de:</p>
        ${projs.map(p => `<div style="font-size:13px;padding:3px 0">${I('blocks', 12)} ${esc(p.nome)}</div>`).join('')}
        ${can('permissoes') && a.dadosCompletos && !a.anonimizado ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="event.stopPropagation();anonimizarAluno('${a.id}','${esc(a.nome)}')">${I('shield', 13)} Anonimizar (LGPD)</button>` : ''}
        ${a.anonimizado ? `<span class="badge b-gray" style="margin-top:10px">${I('shield', 10)} anonimizado</span>` : ''}
        ${evts.map(e => `<div style="font-size:13px;padding:3px 0">${I('calendar', 12)} ${esc(e.nome)}</div>`).join('')}
        ${!projs.length && !evts.length ? '<div style="font-size:13px;color:var(--ink-3)">—</div>' : ''}
      </div>`;
    }).join('')}
  </div>`;
};

window.novoUsuario = () => {
  const db = D();
  const turmasAno = db.turmas.filter(t => t.ano === db.escola.anoAtual);
  modal(`
    <div class="modal-head"><h3>${I('key', 18)} Novo acesso</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="pend info" style="margin-bottom:14px">${I('shield', 15)} <span>A senha é armazenada com criptografia (bcrypt) e a criação fica registrada na trilha de auditoria.</span></div>
      <div class="field"><label for="nu-nome">Nome completo *</label><input id="nu-nome" maxlength="80" placeholder="Ex.: Marina Duarte"></div>
      <div class="frow">
        <div class="field"><label for="nu-email">E-mail *</label><input id="nu-email" type="email" placeholder="marina@escola.br"></div>
        <div class="field"><label for="nu-senha">Senha * <span style="font-weight:400;color:var(--ink-3)">(mín. 8 caracteres)</span></label><input id="nu-senha" type="password" minlength="8" autocomplete="new-password"></div>
      </div>
      <div class="field"><label for="nu-papel">Papel *</label>
        <select id="nu-papel" onchange="document.getElementById('nu-turmas-box').style.display = this.value === 'professor' ? 'block' : 'none'">
          <option value="professor" selected>Professor — registra atividades das suas turmas</option>
          <option value="coordenacao">Coordenação — revisa, aprova e gerencia turmas</option>
          <option value="marketing">Marketing — histórias e conteúdo (sem dados sensíveis)</option>
          <option value="direcao">Direção — acesso completo (exige 2FA no login)</option>
        </select></div>
      <div class="field" id="nu-turmas-box"><label>Turmas do professor <span style="font-weight:400;color:var(--ink-3)">(define quais alunos ele pode ver — LGPD)</span></label>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${turmasAno.map(t => `<label class="check-opt"><input type="checkbox" class="nu-turma" value="${t.id}"><span>${esc(t.nome)} · ${t.ano}</span></label>`).join('') || '<small style="color:var(--ink-3)">Nenhuma turma no ano atual.</small>'}
        </div></div>
      <button class="btn btn-create" style="width:100%;justify-content:center" onclick="salvarUsuario()">Criar acesso</button>
    </div>`);
  setTimeout(() => $('#nu-nome')?.focus(), 80);
};
window.salvarUsuario = async () => {
  const nome = $('#nu-nome').value.trim(), email = $('#nu-email').value.trim(), senha = $('#nu-senha').value;
  if (!nome) return toast('Informe o nome', true);
  if (!email) return toast('Informe o e-mail', true);
  if (senha.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres', true);
  try {
    await api('/users', { body: { nome, email, senha, papel: $('#nu-papel').value, turmas: [...document.querySelectorAll('.nu-turma:checked')].map(c => c.value) } });
    closeModal(); await loadDB(); toast('Acesso criado! ' + nome.split(' ')[0] + ' já pode entrar com o e-mail e a senha definidos.'); render();
  } catch (e) { toast(e.message, true); }
};

window.anonimizarAluno = (id, nome) => {
  modal(`
    <div class="modal-head"><h3>${I('shield', 18)} Anonimizar dados — LGPD</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="pend danger" style="margin-bottom:14px">${I('alert', 15)} <span><b>Ação irreversível.</b> O nome será substituído por "Aluno removido (LGPD)", os termos de consentimento serão apagados e os vínculos com projetos desfeitos. Fotos vinculadas deixam de ser publicáveis.</span></div>
      <p style="font-size:13.5px;margin-bottom:14px">Use quando o titular ou responsável solicitar a exclusão dos dados (art. 18 da LGPD). A ação fica registrada na trilha de auditoria.</p>
      <div class="field"><label for="anon-conf">Digite <b>ANONIMIZAR</b> para confirmar a remoção dos dados de "${esc(nome)}"</label><input id="anon-conf" autocomplete="off"></div>
      <button class="btn btn-danger" style="width:100%;justify-content:center" onclick="confirmarAnonimizacao('${id}')">Anonimizar definitivamente</button>
    </div>`);
  setTimeout(() => $('#anon-conf')?.focus(), 80);
};
window.confirmarAnonimizacao = async (id) => {
  if ($('#anon-conf').value.trim().toUpperCase() !== 'ANONIMIZAR') return toast('Digite ANONIMIZAR para confirmar', true);
  try {
    await api('/alunos/' + id + '/anonimizar', { body: {} });
    closeModal(); await loadDB(); toast('Dados anonimizados e registrados na auditoria.'); render();
  } catch (e) { toast(e.message, true); }
};

window.novoAluno = () => {
  const db = D();
  const turmasAno = db.turmas.filter(t => t.ano === db.escola.anoAtual);
  modal(`
    <div class="modal-head"><h3>${I('users', 18)} Novo aluno</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="pend info" style="margin-bottom:14px">${I('shield', 15)} <span>Dados de aluno são sensíveis (LGPD). O cadastro gera registro na trilha de auditoria e cria automaticamente o termo de consentimento correspondente.</span></div>
      <div class="field"><label for="na-nome">Nome completo *</label><input id="na-nome" maxlength="80" placeholder="Ex.: Ana Beatriz Ramos"></div>
      <div class="frow">
        <div class="field"><label for="na-turma">Turma *</label>
          <select id="na-turma">${(turmasAno.length ? turmasAno : db.turmas).map(t => `<option value="${t.id}">${t.nome} (${t.ano})</option>`).join('')}</select></div>
        <div class="field"><label for="na-idade">Faixa etária</label>
          <select id="na-idade"><option value="menor" selected>Menor de idade</option><option value="maior">Maior de idade</option></select></div>
      </div>
      <div class="field"><label for="na-consent">Consentimento de uso de imagem</label>
        <select id="na-consent">
          <option value="pendente" selected>Pendente — aguardando termo assinado</option>
          <option value="autorizado">Autorizado</option>
          <option value="negado">Negado</option>
        </select>
        <div class="hint">Privado por padrão: sem consentimento autorizado, nenhuma mídia com este aluno pode ir à página pública.</div>
      </div>
      <div class="field"><label for="na-resp">Responsável <span style="font-weight:400;color:var(--ink-3)">(opcional)</span></label>
        <input id="na-resp" maxlength="80" placeholder="Ex.: Mãe — Regina Ramos"></div>
      <button class="btn btn-create" style="width:100%;justify-content:center" onclick="salvarAluno()">Cadastrar aluno</button>
    </div>`);
  setTimeout(() => $('#na-nome')?.focus(), 80);
};
window.salvarAluno = async () => {
  const nome = $('#na-nome').value.trim();
  if (!nome) return toast('Informe o nome completo do aluno', true);
  if (!$('#na-turma').value) return toast('Cadastre uma turma antes de cadastrar alunos', true);
  try {
    await api('/alunos', { body: {
      nome, turma: $('#na-turma').value,
      consentimentoImagem: $('#na-consent').value,
      menorIdade: $('#na-idade').value === 'menor',
      responsavel: $('#na-resp').value.trim()
    } });
    closeModal(); await loadDB(); toast('Aluno cadastrado!'); render();
  } catch (e) { toast(e.message, true); }
};

/* ============================================================
   GALERIA DE FOTOS — lightbox com navegação por teclado e swipe.
   Usada pelo Dashboard ("Ver fotos") e por qualquer tela que
   precise exibir fotos de um contexto específico (evento/projeto).
   ============================================================ */

// coleta as fotos (nunca vídeos) ligadas a um item do acervo, sem misturar contextos

// botão padrão "Ver fotos" (só aparece quando o contexto tem fotos)
const btnVerFotos = (tipo, id, contexto, n) =>
  n ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();abrirGaleria('${tipo}','${id}','${esc(contexto)}')">${I('camera', 13)} Ver fotos (${n})</button>` : '';

/* ============================================================
   BUSCA INTELIGENTE
   ============================================================ */
routes.busca = () => {
  const q = sessionStorage.getItem('me_q') || '';
  setTimeout(() => { if (q) { $('#bq').value = q; doBusca(); sessionStorage.removeItem('me_q'); } }, 0);
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('search', 18)} Busca inteligente</h2><span class="sub">pesquise em linguagem natural</span></div>
  <div class="card card-pad">
    <div class="searchbar" style="max-width:none"><span class="lens" aria-hidden="true">${I('search', 15)}</span>
      <label class="sr-only" for="bq">Pesquisar no acervo em linguagem natural</label><input id="bq" placeholder='Ex.: "projetos de robótica de 2026" · "fotos do 2º DS na feira de tecnologia" · "tudo que fizemos em setembro"'></div>
    <div class="filters">
      <select id="bf-ano" aria-label="Filtrar por ano"><option value="">Ano</option>${[...new Set([...db.turmas.map(t => t.ano), ...db.atividades.map(a => +a.data.slice(0, 4)), db.escola.anoAtual])].sort().reverse().map(a => `<option>${a}</option>`).join('')}</select>
      <select id="bf-turma" aria-label="Filtrar por turma"><option value="">Turma</option>${db.turmas.map(t => `<option value="${t.id}">${t.nome} (${t.ano})</option>`).join('')}</select>
      <select id="bf-proj" aria-label="Filtrar por projeto"><option value="">Projeto</option>${db.projetos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
      <select id="bf-disc" aria-label="Filtrar por disciplina"><option value="">Disciplina</option>${db.disciplinas.map(d => `<option value="${d.id}">${d.nome}</option>`).join('')}</select>
      <select id="bf-evt" aria-label="Filtrar por evento"><option value="">Evento</option>${db.eventos.map(e => `<option value="${e.id}">${e.nome}</option>`).join('')}</select>
      <select id="bf-cat" aria-label="Filtrar por categoria"><option value="">Categoria</option>${['Tecnologia','Sustentabilidade','Cultural','Competição','Pedagógico','Institucional'].map(c => `<option>${c}</option>`).join('')}</select>
      <select id="bf-prof" aria-label="Filtrar por professor"><option value="">Professor</option>${db.users.filter(u => u.papel === 'professor').map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}</select>
      <select id="bf-tag" aria-label="Filtrar por tag"><option value="">Tag</option>${db.tagsGlobais.map(t => `<option>${t}</option>`).join('')}</select>
      <select id="bf-mid" aria-label="Filtrar por tipo de mídia"><option value="">Tipo de mídia</option><option value="foto">Fotos</option><option value="video">Vídeos</option></select>
      <button class="btn btn-primary btn-sm" onclick="doBusca()">Buscar</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${['Projetos de robótica de 2026', 'Fotos da turma 2º DS na Feira de Tecnologia', 'Tudo que fizemos em setembro', 'Projetos envolvendo sustentabilidade', 'Eventos da escola em 2026', 'Projetos de matemática'].map(s => `<button class="tab" onclick="$('#bq').value='${s}';doBusca()">${s}</button>`).join('')}
    </div>
  </div>
  <div id="busca-res" style="margin-top:18px"></div>`;
};
window.doBusca = async () => {
  const filtros = {};
  const map = { 'bf-ano': 'ano', 'bf-turma': 'turma', 'bf-proj': 'projeto', 'bf-disc': 'disciplina', 'bf-evt': 'evento', 'bf-cat': 'categoria', 'bf-prof': 'professor', 'bf-tag': 'tag', 'bf-mid': 'tipoMidia' };
  Object.entries(map).forEach(([i, k]) => { const v = $('#' + i)?.value; if (v) filtros[k] = v; });
  const r = await api('/busca', { body: { q: $('#bq').value.trim(), filtros } });
  const interp = Object.entries(r.interpretacao).filter(([k, v]) => k !== 'termos' && v).map(([k, v]) => {
    let label = v;
    if (k === 'turma') label = turma(v)?.nome; if (k === 'disciplina') label = disc(v)?.nome;
    if (k === 'evento') label = evento(v)?.nome; if (k === 'professor') label = usr(v)?.nome;
    if (k === 'mes') label = MESES[v - 1];
    return `<span class="chip ia">${I('sparkles', 11)} ${k}: ${esc(label)}</span>`;
  }).join(' ');
  $('#busca-res').innerHTML = `
    ${interp ? `<div style="margin-bottom:14px"><small style="color:var(--ai-text);font-weight:700">A IA entendeu:</small> ${interp}</div>` : ''}
    ${r.projetos.length ? `<div class="sec-title" style="margin-top:6px"><h2>${I('blocks', 16)} Projetos (${r.projetos.length})</h2></div>
      <div class="card">${r.projetos.map(p => `<div class="item-row" onclick="location.hash='#/projeto/${p.id}'"><div class="thumb" aria-hidden="true">${I('blocks', 20)}</div>
        <div style="flex:1"><div class="tit">${esc(p.nome)}</div><div class="meta">${turma(p.turma)?.nome || ''} · ${p.ano} · ${esc(p.categoria)}</div><div class="desc">${esc(p.descricao)}</div></div></div>`).join('')}</div>` : ''}
    ${r.eventos.length ? `<div class="sec-title"><h2>${I('calendar', 16)} Eventos (${r.eventos.length})</h2></div>
      <div class="card">${r.eventos.map(e => `<div class="item-row" onclick="location.hash='#/evento/${e.id}'"><div class="thumb" aria-hidden="true">${I('calendar', 20)}</div>
        <div><div class="tit">${esc(e.nome)}</div><div class="meta">${MESES[e.mes - 1]} de ${e.ano}</div></div></div>`).join('')}</div>` : ''}
    ${r.atividades.length ? `<div class="sec-title"><h2>${I('note', 16)} Registros (${r.atividades.length})</h2></div>
      <div class="card">${r.atividades.map(rowAtividade).join('')}</div>` : ''}
    ${!r.projetos.length && !r.eventos.length && !r.atividades.length ? empty('Nada encontrado. Tente outros termos ou filtros.', 'search') : ''}`;
};

/* ============================================================
   HISTÓRIAS
   ============================================================ */
routes.historias = () => {
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('bookopen', 18)} Histórias</h2>
    <button class="btn btn-create btn-sm" onclick="novaHistoria()">＋ Criar história</button></div>
  <p style="font-size:13px;color:var(--ink-2);margin-bottom:16px">Selecione registros reais do acervo e a IA monta uma narrativa estruturada — capa, introdução, capítulos, destaques e encerramento. Você revisa tudo antes de publicar.</p>
  <div class="grid g2">
    ${db.historias.map(h => `
      <div class="card" style="overflow:hidden;cursor:pointer" onclick="location.hash='#/historia/${h.id}'">
        <div style="height:150px;background:url(${h.capa}) center/cover"></div>
        <div style="padding:15px 17px">
          <b style="font-size:15px">${esc(h.titulo)}</b>
          <div style="font-size:12px;color:var(--ink-3);margin:4px 0 8px">${h.ano} · ${turma(h.turma)?.nome || 'Escola'} · por ${usr(h.autor)?.nome || '—'}</div>
          <span class="badge ${h.publica ? 'b-brand' : 'b-gray'}">${h.publica ? 'Publicado' : 'Rascunho'}</span>
        </div></div>`).join('') || empty('Nenhuma história ainda. Crie a primeira!', 'bookopen')}
  </div>`;
};
window.preHistoriaTurma = (turmaId) => { sessionStorage.setItem('me_hist_turma', turmaId); nav('/historias'); setTimeout(() => novaHistoria(), 60); };
window.novaHistoria = () => {
  const db = D();
  const pre = sessionStorage.getItem('me_hist_turma'); sessionStorage.removeItem('me_hist_turma');
  modal(`
    <div class="modal-head"><h3>${I('bookopen', 18)} Criar história</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">1 · Selecione os registros que farão parte da história. <small>Ex.: "os projetos do 2º DS em 2026".</small></p>
      <div class="field"><label>Filtrar por turma</label>
        <select id="nh-turma" onchange="filtraRegsHistoria()"><option value="">Todas</option>${db.turmas.map(t => `<option value="${t.id}" ${pre === t.id ? 'selected' : ''}>${t.nome} (${t.ano})</option>`).join('')}</select></div>
      <div id="nh-regs" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:12px"></div>
      <div class="field" style="margin-top:14px"><label>Título (opcional — a IA sugere um)</label><input id="nh-titulo" placeholder="Ex.: 2º DS — Um ano construindo tecnologia"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="gerarHistoria()">${I('sparkles', 15)} Gerar história com IA</button>
    </div>`, true);
  filtraRegsHistoria();
};
window.filtraRegsHistoria = () => {
  const db = D(); const t = $('#nh-turma').value;
  const regs = db.atividades.filter(a => !t || a.turma === t);
  $('#nh-regs').innerHTML = regs.map(a => `
    <label class="item-row" style="cursor:pointer"><input type="checkbox" class="nh-ck" value="${a.id}" style="margin-top:4px">
      <div><div class="tit">${esc(a.titulo)}</div><div class="meta">${fmtData(a.data)} · ${turma(a.turma)?.nome || 'Escola'} · ${midiasDe(a).length} mídias</div></div>
    </label>`).join('') || empty('Sem registros para esse filtro.');
};
window.gerarHistoria = async () => {
  const ids = [...document.querySelectorAll('.nh-ck:checked')].map(c => c.value);
  if (!ids.length) return toast('Selecione ao menos um registro', true);
  try {
    const h = await api('/ia/historia', { body: { registroIds: ids, tituloBase: $('#nh-titulo').value.trim() || null } });
    previewHistoria(h);
  } catch (e) { toast(e.message, true); }
};
let HPREV = null;
function previewHistoria(h) {
  HPREV = h;
  modal(`
    <div class="modal-head"><h3>${I('sparkles', 18)} Prévia gerada pela IA</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      ${(h.avisos || []).map(a => `<div class="ia-aviso" style="margin:0 0 10px">${I('alert', 14)} <span>${esc(a)}</span></div>`).join('')}
      <div class="field"><label>Título</label><input id="hp-titulo" value="${esc(h.titulo)}"></div>
      <div class="field"><label>Introdução</label><textarea id="hp-intro">${esc(h.introducao)}</textarea></div>
      ${h.secoes.map((s, i) => `<div class="field"><label>Capítulo ${i + 1} — ${esc(s.titulo)}</label><textarea data-sec="${i}">${esc(s.texto)}</textarea></div>`).join('')}
      <div class="field"><label>Destaques (um por linha)</label><textarea id="hp-dest">${h.destaques.map(esc).join('\n')}</textarea></div>
      <div class="field"><label>Encerramento</label><textarea id="hp-fim">${esc(h.encerramento)}</textarea></div>
      <div class="ia-actions">
        <button class="btn btn-primary" onclick="salvarHistoria()">${I('check', 15)} Aceitar e salvar como rascunho</button>
        <button class="btn btn-danger btn-sm" onclick="closeModal()">Rejeitar</button>
      </div>
    </div>`, true);
}
window.salvarHistoria = async () => {
  const h = HPREV;
  h.titulo = $('#hp-titulo').value; h.introducao = $('#hp-intro').value;
  document.querySelectorAll('[data-sec]').forEach(t => { h.secoes[+t.dataset.sec].texto = t.value; });
  h.destaques = $('#hp-dest').value.split('\n').filter(Boolean); h.encerramento = $('#hp-fim').value;
  try {
    const r = await api('/historias', { body: h });
    closeModal(); await loadDB(); toast('História salva como rascunho!');
    nav('/historia/' + r.historia.id);
  } catch (e) { toast(e.message, true); }
};

routes.historia = (id) => {
  const db = D(); const h = db.historias.find(x => x.id === id);
  if (!h) return empty('História não encontrada');
  return `
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px;flex-wrap:wrap">
    <span class="badge ${h.publica ? 'b-brand' : 'b-gray'}" style="align-self:center">${h.publica ? 'Publicado' : 'Rascunho'}</span>
    ${can('aprovar') || can('historias') ? `<button class="btn ${h.publica ? 'btn-danger' : 'btn-ok'} btn-sm" onclick="togglePubHistoria('${h.id}',${!h.publica})">${h.publica ? 'Despublicar' : 'Publicar na página pública'}</button>` : ''}
    ${h.publica ? `<a class="btn btn-ghost btn-sm" href="#/publico/${h.id}">${I('link', 14)} Ver página pública</a>` : ''}
    ${can('gerarTextos') || can('registrar') ? `<button class="btn btn-soft btn-sm" onclick="openMarketing('historia','${h.id}')">${I('megaphone', 14)} Gerar conteúdo</button>` : ''}
  </div>
  ${storyHTML(h)}`;
};
function storyHTML(h) {
  return `
  <div class="story">
    <div class="story-capa" style="background-image:url(${h.capa})"><div class="ov"></div>
      <div class="in"><small style="text-transform:uppercase;letter-spacing:.15em;opacity:.8;font-weight:700">${h.ano} · Memória Escola</small>
        <h1>${esc(h.titulo)}</h1></div></div>
    <p class="story-intro">${esc(h.introducao)}</p>
    ${h.secoes.map(s => `<div class="story-sec"><h2>${esc(s.titulo)}</h2><p style="color:var(--ink-2)">${esc(s.texto)}</p>
      ${s.midia ? `<img src="${s.midia}" alt="">` : ''}</div>`).join('')}
    <div class="hl-box"><b>${I('star', 14)} Destaques</b><ul style="margin-top:8px">${h.destaques.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>
    <div class="story-sec"><h2>Encerramento</h2><p style="color:var(--ink-2)">${esc(h.encerramento)}</p></div>
  </div>`;
}
window.togglePubHistoria = async (id, v) => {
  try { await api('/historias/' + id, { method: 'PATCH', body: { publica: v } }); await loadDB(); toast(v ? 'História publicada!' : 'História despublicada'); render(); }
  catch (e) { toast(e.message, true); }
};

/* ============================================================
   MARKETING
   ============================================================ */
routes.marketing = () => {
  const db = D();
  setTimeout(nlHistorico, 0); // carrega o histórico de boletins após o render
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('megaphone', 18)} Conteúdo & Marketing</h2><span class="sub">transforme registros reais em comunicação — sem inventar nada</span></div>
  <div class="pend info" style="margin-bottom:16px">${I('sparkles', 16)} <span>Escolha um registro, projeto ou história e gere legenda de Instagram, notícia para o site, newsletter, resumo para slides ou campanha de matrícula. Sempre com <b>edição humana antes de publicar</b>.</span></div>

  <div class="card card-pad" style="margin-bottom:6px">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px">
      <div style="flex:1;min-width:230px">
        <h2 style="font-size:15px;margin-bottom:3px">${I('mail', 15)} Boletim mensal das famílias</h2>
        <div class="meta" style="font-size:12.5px;color:var(--ink-3)">Montado automaticamente com os registros aprovados do mês (fotos só com consentimento). Revise a prévia e publique no Portal das Famílias.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="month" id="nl-mes" value="${new Date().toISOString().slice(0, 7)}" aria-label="Mês do boletim" style="padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px">
        <button class="btn btn-soft btn-sm" onclick="nlPrevia(this)">${I('search', 14)} Prévia</button>
        <button class="btn btn-sm" onclick="nlPublicar(this)">${I('send', 14)} Publicar no portal</button>
      </div>
    </div>
    <div id="nl-hist" class="meta" style="margin-top:10px;font-size:12px;color:var(--ink-3)"></div>
  </div>

  <div class="sec-title"><h2>A partir de registros aprovados</h2></div>
  <div class="card">${db.atividades.filter(a => a.visibilidade === 'aprovado').map(a => `
    <div class="item-row"><div class="thumb" aria-hidden="true">${I('note', 20)}</div>
      <div style="flex:1"><div class="tit">${esc(a.titulo)}</div><div class="meta">${fmtData(a.data)} · ${turma(a.turma)?.nome || 'Escola'}</div></div>
      <button class="btn btn-soft btn-sm" onclick="openMarketing('atividade','${a.id}')">Gerar conteúdo</button>
    </div>`).join('') || empty('Nenhum registro aprovado ainda.')}</div>
  <div class="sec-title"><h2>A partir de projetos</h2></div>
  <div class="card">${db.projetos.filter(p => p.descricao).map(p => `
    <div class="item-row"><div class="thumb" aria-hidden="true">${I('blocks', 20)}</div>
      <div style="flex:1"><div class="tit">${esc(p.nome)}</div><div class="meta">${turma(p.turma)?.nome || ''} · ${p.ano}</div></div>
      <button class="btn btn-soft btn-sm" onclick="openMarketing('projeto','${p.id}')">Gerar conteúdo</button>
    </div>`).join('')}</div>
  <div class="sec-title"><h2>A partir de histórias</h2></div>
  <div class="card">${db.historias.map(h => `
    <div class="item-row"><div class="thumb" aria-hidden="true">${I('bookopen', 20)}</div>
      <div style="flex:1"><div class="tit">${esc(h.titulo)}</div><div class="meta">${h.ano}</div></div>
      <button class="btn btn-soft btn-sm" onclick="openMarketing('historia','${h.id}')">Gerar conteúdo</button>
    </div>`).join('')}</div>`;
};
/* ---------- Newsletter mensal das famílias ---------- */
window.nlPrevia = async (btn) => {
  const mes = $('#nl-mes').value || new Date().toISOString().slice(0, 7);
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Gerando…';
  try {
    const n = await api('/newsletter/gerar', { body: { mes } });
    modal(`
      <div class="modal-head"><h3>${I('mail', 17)} ${esc(n.titulo)}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
      <div class="modal-body" style="max-height:64vh;overflow-y:auto;background:var(--bg)">${n.html}</div>
      <div class="modal-body" style="display:flex;gap:8px;justify-content:space-between;align-items:center;border-top:1px solid var(--border)">
        <span class="meta" style="font-size:12px">${n.totalAtividades} atividade${n.totalAtividades === 1 ? '' : 's'} · ${n.totalFotos} foto${n.totalFotos === 1 ? '' : 's'} · montado só com conteúdo aprovado</span>
        <button class="btn btn-sm" onclick="closeModal();nlPublicar()">${I('send', 14)} Publicar no portal</button>
      </div>`, true);
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.innerHTML = orig;
};
window.nlPublicar = async (btn) => {
  const mes = ($('#nl-mes') && $('#nl-mes').value) || new Date().toISOString().slice(0, 7);
  const orig = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.innerHTML = 'Publicando…'; }
  try {
    const r = await api('/newsletter/publicar', { body: { mes } });
    toast(`"${r.titulo}" publicado no Portal das Famílias`);
    nlHistorico();
  } catch (e) { toast(e.message, true); }
  if (btn) { btn.disabled = false; btn.innerHTML = orig; }
};
async function nlHistorico() {
  const box = $('#nl-hist'); if (!box) return;
  try {
    const ls = await api('/newsletter');
    box.innerHTML = ls.length
      ? 'Publicados: ' + ls.map(n => `<b>${esc(n.mes)}</b> (${n.totalAtividades} atividades)`).join(' · ') + ` — visíveis em <a href="#/familia" target="_blank">/#/familia</a>`
      : 'Nenhum boletim publicado ainda.';
  } catch (e) { /* sem permissão: silencioso */ }
}

window.openMarketing = (tipo, id) => {
  const db = D();
  let origem = {};
  if (tipo === 'atividade') { const a = db.atividades.find(x => x.id === id); origem = { titulo: a.titulo, resumo: a.resumo || a.observacao, turma: turma(a.turma)?.nome, data: a.data, projeto: proj(a.projeto)?.nome, tags: a.tags, escola: db.escola.nome }; }
  if (tipo === 'projeto') { const p = proj(id); origem = { titulo: p.nome, resumo: p.descricao + (p.resultado ? ' Resultado: ' + p.resultado : ''), turma: turma(p.turma)?.nome, projeto: p.nome, tags: p.tags, escola: db.escola.nome }; }
  if (tipo === 'historia') { const h = db.historias.find(x => x.id === id); origem = { titulo: h.titulo, resumo: h.introducao, turma: turma(h.turma)?.nome, tags: [], escola: db.escola.nome }; }
  modal(`
    <div class="modal-head"><h3>${I('megaphone', 17)} Gerar conteúdo — ${esc(origem.titulo)}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="tabs">
        ${[['instagram', 'Instagram'], ['site', 'Site'], ['newsletter', 'Newsletter'], ['apresentacao', 'Apresentação'], ['matricula', 'Campanha de matrícula']]
          .map(([t, l], i) => `<button class="tab ${i === 0 ? 'on' : ''}" data-mk="${t}" onclick="mkGerar('${t}',this)">${l}</button>`).join('')}
      </div>
      <div id="mk-out"></div>
    </div>`, true);
  window._mkOrigem = origem;
  mkGerar('instagram', document.querySelector('[data-mk="instagram"]'));
};
window.mkGerar = async (tipo, btn) => {
  document.querySelectorAll('[data-mk]').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  $('#mk-out').innerHTML = '<div class="skel-row"><div class="skeleton"></div><div class="skel-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div><div class="skel-row"><div class="skeleton"></div><div class="skel-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div>';
  try {
    const r = await api('/ia/conteudo', { body: { tipo, origem: window._mkOrigem } });
    $('#mk-out').innerHTML = `
      <div class="ia-panel">
        <div class="ia-head"><div class="spark">${I('sparkles', 16)}</div><b>${esc(r.titulo)}</b></div>
        <textarea id="mk-txt" style="width:100%;min-height:220px;border:1.5px solid var(--border);border-radius:12px;padding:14px;background:var(--surface);color:var(--ink)">${esc(r.texto)}</textarea>
        <div class="ia-aviso">${I('alert', 14)} <span>${esc(r.aviso)}</span></div>
        <div class="ia-actions">
          <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText($('#mk-txt').value).then(()=>toast('Copiado!'))">${I('copy', 14)} Copiar texto</button>
        </div>
      </div>`;
  } catch (e) { $('#mk-out').innerHTML = empty(e.message, 'alert'); }
};
window.toast = toast;

/* ============================================================
   RETROSPECTIVA
   ============================================================ */
routes.retrospectiva = () => {
  setTimeout(loadRetro, 0);
  return `
  <div class="pend info" style="margin-bottom:14px">${I('film', 16)} <span><b>Retrospectiva</b> = resumo editorial do ano, pronto para apresentar em reuniões, eventos e materiais institucionais. Para o <b>histórico completo, registro a registro</b>, use a <a href="#/timeline" style="font-weight:700">Linha do tempo →</a></span></div>
  <div id="retro-wrap"><div class="card"><div class="skel-row"><div class="skeleton"></div><div class="skel-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div><div class="skel-row"><div class="skeleton"></div><div class="skel-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div></div></div>`;
};
async function loadRetro() {
  const ano = D().escola.anoAtual;
  const r = await api('/retrospectiva/' + ano);
  const n = r.numeros;
  $('#retro-wrap').innerHTML = `
  <div class="retro-hero">
    <div class="sesi-retro"><img src="/img/sesi-completa-neg.png" alt="SESI — Serviço Social da Indústria"></div>
    <small style="text-transform:uppercase;letter-spacing:.2em;opacity:.7;font-weight:700">Memória Escola apresenta</small>
    <h1>Retrospectiva ${r.ano}</h1>
    <p>Um ano inteiro de projetos, descobertas, desafios e conquistas — em números e momentos.</p>
  </div>
  <div class="sec-title"><h2>${r.ano} em números</h2><span class="sub">pronta para reuniões, eventos e materiais institucionais</span></div>
  <div class="grid g6">
    ${[['projetos', 'Projetos'], ['eventos', 'Eventos'], ['atividades', 'Atividades'], ['fotos', 'Fotos'], ['videos', 'Vídeos'], ['turmas', 'Turmas']]
      .map(([k, l]) => `<div class="card retro-num"><div class="n">${n[k].toLocaleString('pt-BR')}</div><div class="l">${l}</div></div>`).join('')}
  </div>
  ${retroCarrossel(r.ano)}
  <div class="sec-title"><h2>${I('star', 18)} Destaques do ano</h2></div>
  <div class="grid g2">
    ${r.destaques.map(d => `<div class="card card-pad" style="display:flex;gap:12px">
      <div class="thumb" style="width:44px;height:44px;flex:none" aria-hidden="true">${I(d.tipo === 'projeto' ? 'blocks' : 'calendar', 20)}</div>
      <div><b>${esc(d.nome)}</b><p style="font-size:13px;color:var(--ink-2);margin-top:3px">${esc(d.detalhe)}</p></div></div>`).join('')}
  </div>
  <div class="sec-title"><h2>${I('clock', 18)} Principais acontecimentos</h2></div>
  <div class="tl">
    ${r.timeline.map(t => `<div class="tl-item"><div class="mes">${MESES[t.mes - 1]}</div>
      <div class="card tl-card" onclick="location.hash='#/evento/${t.id}'"><b>${esc(t.nome)}</b><div class="meta">${esc(t.descricao)}</div></div></div>`).join('')}
  </div>`;
}

/* ============================================================
   CARROSSEL DE FOTOS DA RETROSPECTIVA
   Somente fotografias do ano, com legenda e contexto. Autoplay
   suave (pausa no hover), setas, indicadores, teclado e swipe.
   ============================================================ */
let CARR = { idx: 0, timer: null, total: 0 };
function retroCarrossel(ano) {
  const db = D();
  const fotos = db.atividades
    .filter(a => (a.data || '').startsWith(String(ano)))
    .flatMap(a => midiasDe(a).filter(m => m.tipo === 'foto' && m.url).map(m => ({ ...m, ctx: a.titulo, data: a.data })))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  CARR = { idx: 0, timer: null, total: fotos.length };
  if (!fotos.length) return '';
  setTimeout(carrAuto, 0); // inicia autoplay depois que o DOM existir
  return `
  <div class="sec-title"><h2>${I('camera', 18)} Nossa retrospectiva em fotos</h2><span class="sub">${fotos.length} momentos que ficaram</span></div>
  <div class="carrossel" id="carrossel" role="region" aria-label="Carrossel de fotos da retrospectiva"
       onmouseenter="carrPausa()" onmouseleave="carrAuto()"
       ontouchstart="carrTouch(event)" ontouchend="carrTouchFim(event)">
    <span class="carr-count" id="carr-count" aria-live="polite">1 / ${fotos.length}</span>
    <div class="carr-track" id="carr-track">
      ${fotos.map((f, i) => `
        <div class="carr-slide">
          <img src="${f.url}" alt="${esc(f.legenda || 'Foto da retrospectiva')}" ${i > 1 ? 'loading="lazy"' : ''} draggable="false">
          <div class="leg">${esc(f.legenda || '')}<small>${esc(f.ctx || '')} · ${fmtData(f.data)}</small></div>
        </div>`).join('')}
    </div>
    ${fotos.length > 1 ? `
      <button class="carr-btn prev" onclick="carrNav(-1)" aria-label="Foto anterior">‹</button>
      <button class="carr-btn next" onclick="carrNav(1)" aria-label="Próxima foto">›</button>
      <div class="carr-dots" role="tablist">${fotos.map((_, i) => `<button role="tab" class="${i === 0 ? 'on' : ''}" onclick="carrIr(${i})" aria-label="Ir para a foto ${i + 1}"></button>`).join('')}</div>` : ''}
  </div>`;
}
function carrRender() {
  const tr = document.getElementById('carr-track');
  if (!tr) return;
  tr.style.transform = `translateX(-${CARR.idx * 100}%)`;
  document.querySelectorAll('.carr-dots button').forEach((d, i) => d.classList.toggle('on', i === CARR.idx));
  const c = document.getElementById('carr-count');
  if (c) c.textContent = `${CARR.idx + 1} / ${CARR.total}`;
}
window.carrNav = (d) => { CARR.idx = (CARR.idx + d + CARR.total) % CARR.total; carrRender(); };
window.carrIr = (i) => { CARR.idx = i; carrRender(); };
window.carrAuto = () => {
  carrPausa();
  if (CARR.total > 1 && document.getElementById('carr-track'))
    CARR.timer = setInterval(() => { if (!document.getElementById('carr-track')) return carrPausa(); carrNav(1); }, 5000);
};
window.carrPausa = () => { if (CARR.timer) { clearInterval(CARR.timer); CARR.timer = null; } };
let carrX0 = null;
window.carrTouch = (e) => { carrX0 = e.touches[0].clientX; carrPausa(); };
window.carrTouchFim = (e) => {
  if (carrX0 === null) return;
  const dx = e.changedTouches[0].clientX - carrX0;
  if (Math.abs(dx) > 40) carrNav(dx > 0 ? -1 : 1);
  carrX0 = null; carrAuto();
};

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */
routes.admin = () => {
  const db = D(); const ano = db.escola.anoAtual;
  const mesAtual = new Date().toISOString().slice(0, 7);
  const regsEsteMs = db.atividades.filter(a => (a.criadoEm || '').startsWith(mesAtual)).length;
  const pendencias = [
    ['warn', db.projetos.filter(p => !p.descricao).length, 'Projetos sem descrição'],
    ['warn', db.eventos.filter(e => !db.atividades.some(a => a.evento === e.id && a.midias.length)).length, 'Eventos sem fotos'],
    ['info', db.atividades.filter(a => a.status === 'pendente').length, 'Registros aguardando classificação'],
    ['info', db.atividades.filter(a => a.visibilidade === 'aguardando').length, 'Conteúdos aguardando aprovação'],
    ['danger', db.midias.filter(m => !m.consentimentoOk).length, 'Registros com problemas de consentimento']
  ];
  const porMes = {};
  db.atividades.filter(a => +a.data.slice(0, 4) === ano).forEach(a => { const m = +a.data.slice(5, 7); porMes[m] = (porMes[m] || 0) + 1; });
  const max = Math.max(1, ...Object.values(porMes));
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('chart', 18)} Dashboard administrativo</h2>
    <span style="display:flex;align-items:center;gap:14px;margin-left:auto"><span class="sub">memória institucional em números</span><span class="sesi-admin"><img src="/img/sesi-completa.png" alt="SESI — Serviço Social da Indústria"></span></span></div>
  <div class="grid g4">
    ${stat(regsEsteMs, 'Registros este mês', 'note', ['ver registros →', 'cta'], "abrirVisao('registros-mes')")}${stat(db.projetos.length, 'Projetos', 'blocks', ['ver projetos →', 'cta'], "abrirVisao('projetos-todos')")}
    ${stat(db.eventos.length, 'Eventos', 'calendar', ['ver eventos →', 'cta'], "abrirVisao('eventos-todos')")}${stat(fotosDoContexto('ano', ano).length, 'Fotos', 'camera', ['ver fotos →', 'cta'], `abrirGaleria('ano', ${ano}, 'Acervo ${ano}')`)}
    ${stat(db.midias.filter(m => m.tipo === 'video').length, 'Vídeos', 'video', ['ver vídeos →', 'cta'], "abrirVisao('videos-todos')")}${stat(db.turmas.length, 'Turmas', 'cap', ['ver turmas →', 'cta'], "abrirVisao('turmas')")}
    ${stat(db.users.filter(u => u.papel === 'professor').length, 'Professores', 'user', ['ver professores →', 'cta'], "abrirVisao('professores')")}${stat(db.historias.length, 'Histórias', 'bookopen', ['ver histórias →', 'cta'], "abrirVisao('historias')")}
  </div>

  <div class="card card-pad" style="margin-top:20px;display:flex;flex-wrap:wrap;align-items:center;gap:14px" id="adm-relatorio">
    <div style="flex:1;min-width:220px">
      <h2 style="font-size:15px;margin-bottom:3px">${I('file', 15)} Relatório institucional ${ano}</h2>
      <div class="meta" style="font-size:12.5px;color:var(--ink-3)">Números, gráfico mensal, pendências, projetos e eventos — pronto para reuniões e prestação de contas.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="baixarRelatorio('pdf', this)">${I('file', 14)} PDF</button>
      <button class="btn btn-soft btn-sm" onclick="baixarRelatorio('docx', this)">${I('file', 14)} Word</button>
      <button class="btn btn-soft btn-sm" onclick="baixarRelatorio('pptx', this)">${I('file', 14)} PowerPoint</button>
    </div>
  </div>
  <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:20px;align-items:start" id="adm-grid">
    <div class="card card-pad">
      <h2 style="font-size:15px;margin-bottom:12px">${I('clock', 15)} Pendências</h2>
      ${pendencias.map(([c, n, l]) => `<div class="pend ${n ? c : 'info'}"><span class="n">${n}</span> ${l}</div>`).join('')}
      ${can('aprovar') ? `<a class="btn btn-soft btn-sm" href="#/aprovacoes" style="margin-top:6px">Ir para aprovações →</a>` : ''}
    </div>
    <div class="card card-pad">
      <h2 style="font-size:15px;margin-bottom:12px">${I('chart', 15)} Evolução do acervo — registros por mês (${ano})</h2>
      <div class="bars">
        ${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `
          <div class="bar-w"><span class="vl">${porMes[m] || ''}</span>
            <div class="bar" style="height:${(porMes[m] || 0) / max * 100}%"></div><span class="lb">${MESES[m - 1].slice(0, 3)}</span></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="sec-title"><h2>${I('camera', 18)} Galerias do acervo</h2><span class="sub">fotos vinculadas a cada evento e projeto</span></div>
  <div class="card">
    ${[
      ...db.eventos.map(e => ({ tipo: 'evento', id: e.id, nome: e.nome, meta: `${MESES[e.mes - 1]} de ${e.ano} · evento`, n: fotosDoContexto('evento', e.id).length })),
      ...db.projetos.map(p => ({ tipo: 'projeto', id: p.id, nome: p.nome, meta: `${turma(p.turma)?.nome || ''} · projeto`, n: fotosDoContexto('projeto', p.id).length }))
    ].filter(g => g.n > 0).map(g => `
      <div class="item-row" style="cursor:default">
        <div class="thumb" aria-hidden="true">${I('camera', 20)}</div>
        <div style="flex:1"><div class="tit">${esc(g.nome)}</div><div class="meta">${g.meta} · ${g.n} foto${g.n > 1 ? 's' : ''}</div></div>
        ${btnVerFotos(g.tipo, g.id, g.nome, g.n)}
      </div>`).join('') || empty('Nenhuma foto no acervo ainda.', 'camera')}
  </div>

  <div class="sec-title"><h2>${I('users', 18)} Usuários e acessos</h2>
    ${can('permissoes') ? `<button class="btn btn-create btn-sm" onclick="novoUsuario()">＋ Novo acesso</button>` : ''}</div>
  <div class="card">
    ${db.users.map(u => `<div class="item-row" style="cursor:default">
      <span class="avatar" aria-hidden="true">${u.avatar}</span>
      <div style="flex:1"><div class="tit">${esc(u.nome)}</div><div class="meta">${PAPEIS[u.papel] || u.papel}${u.turmas?.length ? ' · ' + u.turmas.map(t => turma(t)?.nome).filter(Boolean).join(', ') : ''}</div></div>
      <span class="badge b-brand">${PAPEIS[u.papel] || u.papel}</span></div>`).join('')}
  </div>

  <div class="sec-title"><h2>${I('file', 18)} Logs de atividade</h2><span class="sub">quem fez o quê — trilha de auditoria</span></div>
  <div class="card">${(db.logs || []).slice(0, 12).map(l => `
    <div class="item-row" style="cursor:default"><div class="thumb" style="width:38px;height:38px;font-size:15px">${I('file', 16)}</div>
      <div><div class="tit" style="font-size:13px">${esc(usr(l.quem)?.nome || l.quem)}</div>
      <div class="desc">${esc(l.acao)}</div><div class="meta">${new Date(l.quando).toLocaleString('pt-BR')}</div></div></div>`).join('') || empty('Sem logs.')}</div>
  <style>@media(max-width:920px){ #adm-grid{grid-template-columns:1fr !important} }</style>`;
};

/* ============================================================
   RELATÓRIO INSTITUCIONAL — download em PDF / Word / PowerPoint
   ============================================================ */
window.baixarRelatorio = async (formato, btn) => {
  const rotulos = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint' };
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Gerando…'; }
  try {
    const ano = D()?.escola?.anoAtual || new Date().getFullYear();
    const r = await fetch(`/api/relatorio/${formato}?ano=${ano}`, { headers: { 'x-token': S.token } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.erro || 'Erro ' + r.status);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-memoria-escola-${ano}.${formato}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Relatório ${rotulos[formato]} gerado com sucesso`);
  } catch (e) { toast(e.message, true); }
  if (btn) { btn.disabled = false; btn.innerHTML = original; }
};

/* ============================================================
   APROVAÇÕES
   ============================================================ */
routes.aprovacoes = () => {
  const db = D();
  const aguardando = db.atividades.filter(a => a.visibilidade === 'aguardando');
  const pendClass = db.atividades.filter(a => a.status === 'pendente');
  const midiasProb = db.midias.filter(m => !m.consentimentoOk);
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('checksq', 18)} Aprovações e revisão</h2></div>
  <div class="sec-title"><h2 style="font-size:15px">${I('send', 15)} Conteúdos aguardando aprovação (${aguardando.length})</h2></div>
  <div class="card">${aguardando.map(a => `
    <div class="item-row"><div class="thumb" aria-hidden="true">${I('note', 20)}</div>
      <div style="flex:1"><div class="tit">${esc(a.titulo)}</div><div class="meta">${fmtData(a.data)} · ${turma(a.turma)?.nome || 'Escola'} · por ${usr(a.autor)?.nome}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ok btn-sm" onclick="mudarVisComMotivo('${a.id}','aprovado')">${I('check', 13)} Aprovar</button>
        <button class="btn btn-danger btn-sm" onclick="mudarVisComMotivo('${a.id}','privado')">Recusar</button>
      </div></div>`).join('') || empty('Nada aguardando aprovação.', 'check')}</div>
  <div class="sec-title"><h2 style="font-size:15px">${I('sparkles', 15)} Registros aguardando classificação (${pendClass.length})</h2></div>
  <div class="card">${pendClass.map(rowAtividade).join('') || empty('Tudo classificado.', 'check')}</div>
  <div class="sec-title"><h2 style="font-size:15px">${I('shield', 15)} Mídias com problema de consentimento (${midiasProb.length})</h2></div>
  <div class="card">${midiasProb.map(m => {
    const a = db.atividades.find(x => x.id === m.atividade);
    return `<div class="item-row" style="cursor:default">
      ${m.tipo === 'foto' && m.url ? `<img class="thumb" src="${m.url}">` : `<div class="thumb">${I('video', 20)}</div>`}
      <div style="flex:1"><div class="tit">${esc(m.legenda)}</div><div class="meta">${a ? esc(a.titulo) : ''} — bloqueada para publicação</div></div>
      <button class="btn btn-ok btn-sm" onclick="resolverConsent('${m.id}')">Consentimento confirmado</button>
    </div>`;
  }).join('') || empty('Nenhum problema de consentimento.', 'check')}</div>`;
};
window.resolverConsent = async (id) => {
  try { await api('/midias/' + id, { method: 'PATCH', body: { consentimentoOk: true } }); await loadDB(); toast('Consentimento registrado'); render(); }
  catch (e) { toast(e.message, true); }
};

/* ============================================================
   PRIVACIDADE / LGPD
   ============================================================ */
routes.privacidade = () => {
  const db = D();
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('shield', 18)} Privacidade & LGPD</h2></div>
  <div class="grid g3">
    ${stat(db.consentimentos.filter(c => c.status === 'autorizado').length, 'Consentimentos autorizados', 'checksq')}
    ${stat(db.consentimentos.filter(c => c.status === 'pendente').length, 'Pendentes', 'clock')}
    ${stat(db.consentimentos.filter(c => c.status === 'negado').length, 'Negados', 'ban')}
  </div>
  <div class="sec-title"><h2>Consentimentos de uso de imagem</h2></div>
  <div class="card">${db.consentimentos.map(c => {
    const a = db.alunos.find(x => x.id === c.aluno);
    return `<div class="item-row" style="cursor:default">
      <span class="avatar" style="flex:none">${a ? a.nome.split(' ').map(x => x[0]).slice(0, 2).join('') : '?'}</span>
      <div style="flex:1"><div class="tit">${a ? esc(a.nome) : c.aluno}</div>
        <div class="meta">${turma(a?.turma)?.nome || ''} · responsável: ${esc(c.responsavel)} ${c.data ? '· ' + fmtData(c.data) : ''}</div></div>
      <span class="badge ${c.status === 'autorizado' ? 'b-ok' : c.status === 'negado' ? 'b-danger' : 'b-warn'}">${c.status}</span>
    </div>`;
  }).join('')}</div>
  <div class="sec-title"><h2>Políticas ativas</h2></div>
  <div class="grid g2">
    ${[
      [`${I('lock', 14)} Privado por padrão`, 'Todo registro nasce privado. Nada contendo alunos vai ao público automaticamente.'],
      [`${I('checksq', 14)} Aprovação humana obrigatória`, 'Publicação exige aprovação da coordenação ou direção, com registro de quem aprovou.'],
      [`${I('file', 14)} Trilha de auditoria`, 'Toda publicação, aprovação e alteração fica registrada nos logs de atividade.'],
      [`${I('ban', 14)} Bloqueio por consentimento`, 'Mídias sem consentimento confirmado são bloqueadas para publicação pelo sistema.'],
      [`${I('user', 14)} Sem reconhecimento facial`, 'A IA nunca afirma que um aluno aparece em uma foto. Vínculos são declarados manualmente.'],
      [`${I('calendar', 14)} Retenção de dados`, 'Política de retenção configurável por ano letivo, com possibilidade de remoção definitiva (direito ao esquecimento).']
    ].map(([t, d]) => `<div class="card card-pad"><b style="font-size:14px">${t}</b><p style="font-size:12.5px;color:var(--ink-2);margin-top:5px">${d}</p></div>`).join('')}
  </div>`;
};

/* ============================================================
   GESTÃO PÁGINA PÚBLICA (interno)
   ============================================================ */
routes.publico = () => {
  const db = D(); const pp = db.paginaPublica;
  return `
  <div class="sec-title" style="margin-top:0"><h2>${I('globe', 18)} Página pública</h2>
    <a class="btn btn-primary btn-sm" href="#/publico" onclick="event.preventDefault();window.open(location.origin+'/#/publico','_blank')">${I('link', 14)} Abrir página pública</a></div>
  <div class="pend ${pp.ativa ? 'info' : 'warn'}">${I(pp.ativa ? 'globe' : 'lock', 16)} <span>A página pública está <b>${pp.ativa ? 'ATIVA' : 'desativada'}</b>. Apenas conteúdos explicitamente aprovados aparecem nela.</span>
    ${can('aprovar') || can('permissoes') ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="togglePubPage(${!pp.ativa})">${pp.ativa ? 'Desativar' : 'Ativar'}</button>` : ''}</div>
  <div class="sec-title"><h2>Eventos exibidos publicamente</h2></div>
  <div class="card">${db.eventos.filter(e => e.ano === pp.ano).map(e => {
    const on = pp.itens.includes(e.id);
    return `<div class="item-row" style="cursor:default"><div class="thumb" aria-hidden="true">${I('calendar', 20)}</div>
      <div style="flex:1"><div class="tit">${esc(e.nome)}</div><div class="meta">${MESES[e.mes - 1]} de ${e.ano}</div></div>
      ${can('aprovar') || can('permissoes') ? `<button class="btn ${on ? 'btn-danger' : 'btn-ok'} btn-sm" onclick="togglePubEvento('${e.id}',${!on})">${on ? 'Retirar da página' : 'Exibir na página'}</button>` : `<span class="badge ${on ? 'b-ok' : 'b-gray'}">${on ? 'público' : 'privado'}</span>`}
    </div>`;
  }).join('')}</div>
  <div class="sec-title"><h2>Mídias aprovadas para o público</h2><span class="sub">só aparecem se tiverem consentimento + aprovação</span></div>
  <div class="gal">${db.midias.filter(m => m.tipo === 'foto' && m.url).map(m => `
    <div class="ph"><img src="${m.url}"><span class="cap">${esc(m.legenda)}</span>
      ${can('aprovar') ? `<button class="btn ${m.aprovadaPublico ? 'btn-danger' : 'btn-ok'} btn-sm" style="position:absolute;top:7px;right:7px" onclick="toggleMidiaPub('${m.id}',${!m.aprovadaPublico})">${m.aprovadaPublico ? I('x', 13) : I('check', 13)}</button>` : flagMidia(m)}
    </div>`).join('')}</div>`;
};
window.togglePubPage = async (v) => { try { await api('/publico', { method: 'PATCH', body: { ativa: v } }); await loadDB(); toast('Página pública ' + (v ? 'ativada' : 'desativada')); render(); } catch (e) { toast(e.message, true); } };
window.togglePubEvento = async (id, add) => {
  const pp = D().paginaPublica;
  const itens = add ? [...pp.itens, id] : pp.itens.filter(x => x !== id);
  try { await api('/publico', { method: 'PATCH', body: { itens } }); await loadDB(); toast(add ? 'Evento exibido na página pública' : 'Evento retirado da página pública'); render(); } catch (e) { toast(e.message, true); }
};
window.toggleMidiaPub = async (id, v) => {
  try { await api('/midias/' + id, { method: 'PATCH', body: { aprovadaPublico: v } }); await loadDB(); toast(v ? 'Mídia aprovada para o público' : 'Mídia retirada do público'); render(); }
  catch (e) { toast(e.message, true); }
};

/* ============================================================
   PÁGINA PÚBLICA (sem login)
   ============================================================ */
window.abrirPoliticaPrivacidade = (foco) => {
  modal(`
    <div class="modal-head"><h3>${I('shield', 18)} Política de privacidade</h3><button class="x icon-btn" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body" style="font-size:13.5px;line-height:1.65">
      <p style="margin-bottom:12px"><b>Quais dados tratamos.</b> Registros pedagógicos (atividades, projetos, eventos), fotos e vídeos de atividades escolares e, na área restrita, dados de alunos: nome, turma, faixa etária e situação do consentimento de uso de imagem.</p>
      <p style="margin-bottom:12px"><b>Base legal e finalidade.</b> O tratamento atende ao legítimo interesse educacional e ao consentimento dos responsáveis (art. 7º e 14 da LGPD). Nenhuma imagem identificando aluno é publicada sem termo de consentimento autorizado.</p>
      <p style="margin-bottom:12px"><b>O que NÃO fazemos.</b> Não usamos reconhecimento facial; vínculos entre alunos e fotos são declarados manualmente pela equipe. Não vendemos nem compartilhamos dados com terceiros. Não usamos cookies de rastreamento ou analytics — apenas o armazenamento local necessário para manter sua sessão.</p>
      <p style="margin-bottom:12px"><b>Acesso e auditoria.</b> Dados de alunos são restritos por papel (professores veem apenas suas turmas) e todo acesso a dados sensíveis fica registrado em trilha de auditoria.</p>
      <p style="margin-bottom:12px" ${foco === 'exclusao' ? 'class="pend info"' : ''}><b>Seus direitos (art. 18 LGPD).</b> O titular ou responsável pode solicitar acesso, correção ou <b>exclusão dos dados</b> a qualquer momento pelo e-mail <b>privacidade@escola.br</b> ou na secretaria da escola. A exclusão é feita por anonimização irreversível e registrada em auditoria.</p>
      <p style="color:var(--ink-3);font-size:12px">Encarregado de dados (DPO): secretaria da escola. Última atualização: setembro de 2025.</p>
    </div>`);
};

/* ============================================================
   PORTAL DAS FAMÍLIAS (#/familia)
   Login próprio dos responsáveis, separado do login da equipe.
   Feed apenas com registros aprovados das turmas dos filhos.
   ============================================================ */
let FAM = { token: sessionStorage.getItem('fam_token'), quem: JSON.parse(sessionStorage.getItem('fam_quem') || 'null'), feed: null };

async function apiFam(path, opts = {}) {
  const r = await fetch('/api/familia' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(FAM.token ? { 'x-token-familia': FAM.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && FAM.token) {
    FAM = { token: null, quem: null, feed: null };
    sessionStorage.removeItem('fam_token'); sessionStorage.removeItem('fam_quem');
    toast(j.erro || 'Sessão expirada. Entre novamente.', true);
    renderFamilia();
    throw new Error(j.erro || 'Sessão expirada');
  }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}

async function renderFamilia() {
  document.body.className = '';
  if (!FAM.token) return renderFamiliaLogin();
  try { FAM.feed = await apiFam('/feed'); } catch (e) { return; }
  const f = FAM.feed;
  $('#app').innerHTML = `
  <div class="pub-nav"><img src="/img/logo-memoria-icone.png" alt="" class="pub-logo"><b>Portal das Famílias</b>
    <span style="color:var(--ink-3)">· ${esc(f.escola)}</span>
    <span style="margin-left:auto;display:flex;align-items:center;gap:12px">
      <span style="font-size:13px;color:var(--ink-2)">${esc(f.responsavel.nome)}</span>
      <button class="btn btn-ghost btn-sm" onclick="famSair()">${I('logout', 14)} Sair</button></span></div>
  <div class="pub-wrap" style="max-width:680px">
    <div class="fam-hero">
      <h1>Olá, ${esc(f.responsavel.nome.split(' ')[0])}!</h1>
      <p>Acompanhe aqui o que ${f.filhos.length === 1 ? esc(f.filhos[0].nome.split(' ')[0]) + ' viveu' : 'seus filhos viveram'} na escola — apenas registros aprovados pela coordenação, com fotos autorizadas.</p>
      <div class="fam-filhos">${f.filhos.map(al => `<span class="badge b-brand">${I('cap', 12)} ${esc(al.nome)} · ${esc(al.turma)}</span>`).join('')}</div>
    </div>

    ${f.newsletters.length ? `
    <div class="sec-title"><h2>${I('mail', 17)} Boletim mensal</h2></div>
    ${f.newsletters.map((n, i) => `
      <div class="card" style="margin-bottom:10px">
        <div class="item-row" onclick="famToggleNl('${n.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')famToggleNl('${n.id}')" aria-expanded="${i === 0}">
          <div class="thumb" aria-hidden="true">${I('mail', 20)}</div>
          <div style="flex:1"><div class="tit">${esc(n.titulo)}</div><div class="meta">toque para ${i === 0 ? 'recolher' : 'ler'}</div></div>
          <span aria-hidden="true" style="color:var(--ink-3)">${I('chevdown', 16)}</span></div>
        <div id="nl-${n.id}" style="${i === 0 ? '' : 'display:none;'}padding:6px 14px 16px">${n.html}</div>
      </div>`).join('')}` : ''}

    <div class="sec-title"><h2>${I('note', 17)} Registros da turma</h2><span class="sub">${f.registros.length} registro${f.registros.length === 1 ? '' : 's'}</span></div>
    ${f.registros.map(r => `
    <article class="card fam-post" aria-label="${esc(r.titulo)}">
      ${r.fotos.length ? `<div class="fam-fotos ${r.fotos.length > 1 ? 'multi' : ''}">${r.fotos.slice(0, 4).map(ft => `<img src="${esc(ft.url)}" alt="${esc(ft.legenda || r.titulo)}" loading="lazy">`).join('')}</div>` : ''}
      <div class="fam-body">
        <div class="meta" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--primary-3)">${esc(r.turma)}${r.projeto ? ' · ' + esc(r.projeto) : ''} · ${fmtData(r.data)}</div>
        <h3>${esc(r.titulo)}</h3>
        <p>${esc(r.resumo || '')}</p>
        <div class="fam-acoes">
          <button class="fam-like ${r.euCurti ? 'on' : ''}" onclick="famCurtir('${r.id}', this)" aria-pressed="${r.euCurti}" aria-label="Curtir ${esc(r.titulo)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${r.euCurti ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A4.5 4.5 0 0 0 17.5 4c-1.8 0-3 .9-4 2.2l-1.5 1.8-1.5-1.8C9.5 4.9 8.3 4 6.5 4A4.5 4.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></svg>
            <span class="n">${r.curtidas}</span> curtir</button>
          <span style="font-size:12.5px;color:var(--ink-3)">${r.comentarios.length} comentário${r.comentarios.length === 1 ? '' : 's'}</span>
        </div>
        <div class="fam-coments" id="fc-${r.id}">
          ${r.comentarios.map(c => famComentHTML(c)).join('')}
        </div>
        <div class="fam-nova">
          <input type="text" id="fi-${r.id}" maxlength="500" placeholder="Escreva um comentário carinhoso..." aria-label="Comentar em ${esc(r.titulo)}" onkeydown="if(event.key==='Enter')famComentar('${r.id}')">
          <button class="btn btn-sm" onclick="famComentar('${r.id}')">${I('send', 14)} Enviar</button>
        </div>
      </div>
    </article>`).join('') || empty('Ainda não há registros aprovados para as turmas dos seus filhos.')}
    <p style="text-align:center;color:var(--ink-3);font-size:12px;margin:26px 0">Portal das famílias · conteúdo aprovado pela coordenação · fotos com consentimento LGPD<br><a href="#/">Acesso da equipe →</a></p>
  </div>`;
}

function famComentHTML(c) {
  return `<div class="fam-coment" id="cm-${c.id}">
    <div class="avatar" style="width:28px;height:28px;font-size:10px;flex:none">${esc(c.autor.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase())}</div>
    <div style="flex:1;min-width:0"><b style="font-size:12.5px">${esc(c.autor)}</b>
      <p style="font-size:13px;margin:1px 0 0">${esc(c.texto)}</p></div>
    ${c.meu ? `<button class="x" style="flex:none" onclick="famExcluirComent('${c.id}')" aria-label="Excluir meu comentário">${I('x', 12)}</button>` : ''}
  </div>`;
}

function renderFamiliaLogin() {
  $('#app').innerHTML = `
  <div class="pub-nav"><img src="/img/logo-memoria-icone.png" alt="" class="pub-logo"><b>Portal das Famílias</b>
    <a href="#/" style="margin-left:auto" rel="nofollow">Acesso da equipe</a></div>
  <div class="pub-wrap" style="max-width:420px">
    <div class="logo-app" style="margin-top:30px"><img src="/img/logo-memoria.png" alt="Memória Escola"></div>
    <p class="logo-app-sub">Acompanhe a vida escolar do seu filho</p>
    <div class="card card-pad">
      <div class="field"><label for="fam-email">E-mail do responsável</label><input id="fam-email" type="email" placeholder="voce@familia.br"></div>
      <div class="field"><label for="fam-senha">Senha</label><input id="fam-senha" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')famLogin()"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="famLogin()">Entrar no portal</button>
    </div>
    <div class="demo-users" style="margin-top:16px">
      <p style="font-size:11.5px;color:var(--ink-3);text-align:center;margin-bottom:2px">Demonstração — senha: demo123</p>
      ${[['regina@familia.br', 'Regina Silva', 'Mãe da Maria (2º DS)', 'RS'], ['marcos@familia.br', 'Marcos Santos', 'Pai do Pedro (2º DS)', 'MS'], ['carlos@familia.br', 'Carlos Almeida', 'Pai da Beatriz (8º A)', 'CA']]
        .map(([e, n, p, a]) => `<button onclick="famQuick('${e}')"><span class="avatar" style="width:32px;height:32px;font-size:11px">${a}</span><span class="who"><b>${n}</b><span>${p}</span></span></button>`).join('')}
    </div>
  </div>`;
}

window.famQuick = (e) => { $('#fam-email').value = e; $('#fam-senha').value = 'demo123'; famLogin(); };
window.famLogin = async () => {
  try {
    const r = await apiFam('/login', { body: { email: $('#fam-email').value.trim(), senha: $('#fam-senha').value } });
    FAM.token = r.token; FAM.quem = r.responsavel;
    sessionStorage.setItem('fam_token', r.token); sessionStorage.setItem('fam_quem', JSON.stringify(r.responsavel));
    toast('Bem-vindo(a), ' + r.responsavel.nome.split(' ')[0] + '!');
    renderFamilia();
  } catch (e) { toast(e.message, true); }
};
window.famSair = async () => {
  try { await apiFam('/logout', { body: {} }); } catch (e) { /* sessão já caiu */ }
  FAM = { token: null, quem: null, feed: null };
  sessionStorage.removeItem('fam_token'); sessionStorage.removeItem('fam_quem');
  renderFamilia();
};
window.famToggleNl = (id) => {
  const d = $('#nl-' + id); if (d) d.style.display = d.style.display === 'none' ? '' : 'none';
};
window.famCurtir = async (id, btn) => {
  try {
    const r = await apiFam('/curtir', { body: { atividade: id } });
    btn.classList.toggle('on', r.euCurti);
    btn.setAttribute('aria-pressed', r.euCurti);
    btn.querySelector('svg').setAttribute('fill', r.euCurti ? 'currentColor' : 'none');
    btn.querySelector('.n').textContent = r.curtidas;
  } catch (e) { toast(e.message, true); }
};
window.famComentar = async (id) => {
  const inp = $('#fi-' + id); const t = (inp.value || '').trim();
  if (!t) return;
  try {
    const c = await apiFam('/comentar', { body: { atividade: id, texto: t } });
    $('#fc-' + id).insertAdjacentHTML('beforeend', famComentHTML(c));
    inp.value = '';
  } catch (e) { toast(e.message, true); }
};
window.famExcluirComent = async (id) => {
  try { await apiFam('/comentario/' + id, { method: 'DELETE' }); $('#cm-' + id)?.remove(); }
  catch (e) { toast(e.message, true); }
};

async function renderPublico(historiaId) {
  document.body.className = '';
  if (historiaId) {
    try {
      const h = await api('/publico/historia/' + historiaId);
      $('#app').innerHTML = `
        <div class="pub-nav"><img src="/img/logo-memoria-icone.png" alt="" class="pub-logo"><b>Memória Escola</b>
          <a href="#/publico" style="margin-left:auto">← voltar</a></div>
        <div class="pub-wrap">${storyHTML(h)}</div>`;
    } catch (e) { $('#app').innerHTML = `<div class="pub-wrap">${empty(e.message, 'lock')}<p style="text-align:center"><a href="#/publico">← voltar</a></p></div>`; }
    return;
  }
  const p = await api('/publico');
  if (!p.ativa) { $('#app').innerHTML = `<div class="pub-wrap">${empty('A página pública está desativada no momento.', 'lock')}<p style="text-align:center"><a href="#/">Área restrita →</a></p></div>`; return; }
  $('#app').innerHTML = `
  <div class="pub-nav"><img src="/img/logo-memoria-icone.png" alt="" class="pub-logo"><b>Memória Escola</b><span style="color:var(--ink-3)">· ${esc(p.escola)}</span>
    <span style="margin-left:auto;display:flex;gap:14px"><a href="#/familia">Portal das Famílias</a><a href="#/" rel="nofollow">Acesso da equipe</a></span></div>
  <div class="pub-hero"><small style="text-transform:uppercase;letter-spacing:.2em;opacity:.7;font-weight:700">${esc(p.escola)}</small>
    <h1>${esc(p.titulo)}</h1><p>${esc(p.subtitulo)}</p></div>
  <div class="pub-wrap">
    ${p.historias.length ? `<div class="sec-title"><h2>${I('bookopen', 18)} Nossas histórias</h2></div>
      <div class="grid g2" style="margin-bottom:40px">${p.historias.map(h => `
        <div class="card" style="overflow:hidden;cursor:pointer" onclick="location.hash='#/publico/${h.id}'">
          <div style="height:160px;background:url(${h.capa}) center/cover"></div>
          <div style="padding:16px"><b style="font-size:15px">${esc(h.titulo)}</b>
            <p style="font-size:12.5px;color:var(--ink-2);margin-top:5px">${esc(h.introducao.slice(0, 130))}…</p></div></div>`).join('')}</div>` : ''}
    ${p.eventos.map(e => `
      <div class="pub-ev">
        <div class="dt">${fmtData(e.data)}</div><h2>${esc(e.titulo)}</h2>
        <p style="color:var(--ink-2);margin:6px 0 14px">${esc(e.descricao)}</p>
        ${e.projetos.length ? `<div style="margin-bottom:12px">${e.projetos.map(pr => `<span class="chip">${I('blocks', 11)} ${esc(pr.nome)}${pr.resultado ? ' — ' + esc(pr.resultado) : ''}</span>`).join(' ')}</div>` : ''}
        ${e.fotos.length ? `<div class="gal">${e.fotos.map(f => `<div class="ph"><img src="${f.url}" alt="${esc(f.legenda)}"><span class="cap">${esc(f.legenda)}</span></div>`).join('')}</div>` : '<p style="font-size:12.5px;color:var(--ink-3)">Fotos deste evento em processo de autorização.</p>'}
      </div>`).join('') || empty('Ainda não há conteúdos publicados.')}
    <footer style="text-align:center;color:var(--ink-3);font-size:12px;margin-top:40px;padding-top:20px;border-top:1px solid var(--border-soft)">
      <div class="sesi-pub" style="display:flex;justify-content:center;margin-bottom:12px"><img src="/img/sesi-completa.png" alt="SESI — Serviço Social da Indústria"></div>
      <p>Todos os conteúdos desta página foram aprovados pela escola, com consentimento de uso de imagem. · Feito com Memória Escola</p>
      <p style="margin-top:8px"><a href="#" onclick="event.preventDefault();abrirPoliticaPrivacidade()">Política de privacidade</a> · <a href="#" onclick="event.preventDefault();abrirPoliticaPrivacidade('exclusao')">Solicitar remoção de dados/imagem</a></p>
    </footer>
  </div>`;
  window.scrollTo(0, 0);
}


export function registerAllRoutes(registerRoute) {
  // Register all routes
  Object.keys(routes).forEach(k => registerRoute(k, routes[k]));
  
  // Expose global functions for inline onclick handlers
  window.abrirVisao = abrirVisao;
  window.openRegistro = openRegistro;
  window.regUpload = regUpload;
  window.regAnalisar = regAnalisar;
  window.regSalvar = regSalvar;
  window.rmTag = rmTag;
  window.doBusca = doBusca;
  window.novaHistoria = novaHistoria;
  window.previewHistoria = previewHistoria;
  window.nlHistorico = nlHistorico;
  window.openMarketing = openMarketing;
  window.abrirPoliticaPrivacidade = abrirPoliticaPrivacidade;
}

export { routes };
