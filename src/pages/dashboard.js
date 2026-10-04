/* Dashboard page */
import { D, I, can, esc, fmtData, MESES, stat, empty, rowAtividade, midiasDe, turma, fotosDoContexto, abrirGaleria, modal, closeModal, I as icon } from '../components/ui.js';

export function dashboard() {
  const db = D(); const ano = db.escola.anoAtual;
  const ativsAno = db.atividades.filter(a => +a.data.slice(0, 4) === ano);
  const recentes = [...db.atividades].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || '')).slice(0, 5);
  const emAndamento = db.projetos.filter(p => p.status === 'andamento' && p.ano === ano);
  const evtsRec = db.eventos.filter(e => e.ano === ano).sort((a, b) => b.mes - a.mes).slice(0, 3);
  const fotos = fotosDoContexto('ano', ano).length;
  const videos = ativsAno.flatMap(midiasDe).filter(m => m.tipo === 'video').length;
  const pend = db.atividades.filter(a => a.status === 'pendente').length
    + db.projetos.filter(p => !p.descricao).length
    + db.atividades.filter(a => a.visibilidade === 'aguardando').length;

  return `
  <div class="hero-q"><span class="deco" aria-hidden="true">${I('camera', 190)}</span>
    <h1>O que aconteceu hoje na sua escola?</h1>
    <p>Registre em menos de um minuto. A IA organiza, classifica e transforma cada atividade em memória pesquisável.</p>
    <div class="hero-actions">
      ${can('registrar') ? `<button class="btn" onclick="openRegistro()">${I('camera', 16)} Registrar atividade</button>` : ''}
      <button class="btn alt" onclick="location.hash='#/ia'">${I('bookopen', 16)} Criar história</button>
      <button class="btn alt" onclick="location.hash='#/ia'">${I('film', 16)} Retrospectiva ${ano}</button>
    </div>
  </div>

  <div class="sec-title"><h2>Visão geral — ${ano}</h2><span class="sub">memória institucional do ano atual</span></div>
  <div class="grid g6">
    ${stat(ativsAno.length, 'Registros', 'note', ['ver registros →', 'cta'], "abrirVisao('registros')")}
    ${stat(emAndamento.length, 'Projetos ativos', 'blocks', ['ver projetos →', 'cta'], "abrirVisao('projetos')")}
    ${stat(db.eventos.filter(e => e.ano === ano).length, 'Eventos', 'calendar', ['ver eventos →', 'cta'], "abrirVisao('eventos')")}
    ${stat(fotos, 'Fotos', 'camera', ['ver fotos →', 'cta'], `abrirGaleria('ano', ${ano}, 'Acervo ${ano}')`)}
    ${stat(videos, 'Vídeos', 'video', ['ver vídeos →', 'cta'], "abrirVisao('videos')")}
    ${stat(pend, 'Pendências', 'clock', pend ? ['ver pendências →', 'cta'] : ['tudo em dia', 'up'], "abrirVisao('pendencias')")}
  </div>

  <div class="grid" style="grid-template-columns: 1.4fr 1fr; margin-top:22px; align-items:start">
    <div>
      <div class="sec-title" style="margin-top:0"><h2>Registros recentes</h2><a href="#/registros" style="font-size:12.5px">ver todos →</a></div>
      <div class="card">${recentes.map(rowAtividade).join('') || empty('Nenhum registro ainda.')}</div>
    </div>
    <div>
      <div class="sec-title" style="margin-top:0"><h2>Projetos em andamento</h2><a href="#/projetos" style="font-size:12.5px">todos →</a></div>
      <div class="card">${emAndamento.slice(0, 4).map(p => {
        const na = db.atividades.filter(a => a.projeto === p.id);
        const ult = na.map(a => a.data).sort().pop();
        const prog = Math.min(95, 25 + na.length * 18);
        return `<div class="item-row" onclick="location.hash='#/projeto/${p.id}'">
          <div class="thumb" aria-hidden="true">${I('blocks', 20)}</div>
          <div style="flex:1;min-width:0"><div class="tit">${esc(p.nome)}</div>
            <div class="meta">${turma(p.turma)?.nome || '—'} · ${esc(p.categoria)} · ${na.length} registro${na.length === 1 ? '' : 's'}${ult ? ' · atualizado em ' + fmtData(ult) : ''}</div>
            <div class="mini-bar" aria-hidden="true"><i style="width:${prog}%"></i></div></div>
        </div>`; }).join('') || empty('Nenhum projeto em andamento.')}
      </div>
      <div class="sec-title"><h2>Eventos recentes</h2><a href="#/eventos" style="font-size:12.5px">todos →</a></div>
      <div class="card">${evtsRec.map(e => `
        <div class="item-row" onclick="location.hash='#/evento/${e.id}'">
          <div class="thumb" aria-hidden="true">${I('calendar', 20)}</div>
          <div><div class="tit">${esc(e.nome)}</div><div class="meta">${MESES[e.mes - 1]} · ${esc(e.categoria)}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  <style>@media(max-width:920px){ .content .grid[style*="1.4fr"]{grid-template-columns:1fr !important} }</style>`;
}

/* Visão geral — clickable card details */
export function abrirVisao(qual) {
  const db = D(); const ano = db.escola.anoAtual;
  const linkRow = (hash, icone, tit, meta) => `<div class="item-row" onclick="closeModal();location.hash='${hash}'" role="link" tabindex="0" onkeydown="if(event.key==='Enter'){closeModal();location.hash='${hash}'}">
    <div class="thumb" aria-hidden="true">${I(icone, 20)}</div>
    <div style="flex:1;min-width:0"><div class="tit">${tit}</div><div class="meta">${meta}</div></div>
    <span aria-hidden="true" style="color:var(--ink-3)">›</span></div>`;

  let titulo = '', icone = 'note', corpo = '', rodape = '';

  if (qual === 'registros') {
    const itens = db.atividades.filter(a => +a.data.slice(0, 4) === ano).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    titulo = `Registros de ${ano}`; icone = 'note';
    corpo = itens.map(rowAtividade).join('') || empty('Nenhum registro este ano.');
    rodape = `${itens.length} registro${itens.length === 1 ? '' : 's'} em ${ano} · <a href="#/registros" onclick="closeModal()">ver página de registros →</a>`;
  }

  if (qual === 'projetos') {
    const itens = db.projetos.filter(p => p.status === 'andamento' && p.ano === ano);
    titulo = 'Projetos ativos'; icone = 'blocks';
    corpo = itens.map(p => {
      const na = db.atividades.filter(a => a.projeto === p.id);
      return linkRow('#/projeto/' + p.id, 'blocks', esc(p.nome), `${turma(p.turma)?.nome || '—'} · ${esc(p.categoria)} · ${na.length} registro${na.length === 1 ? '' : 's'}`);
    }).join('') || empty('Nenhum projeto em andamento.');
    rodape = `${itens.length} projeto${itens.length === 1 ? '' : 's'} em andamento · <a href="#/projetos" onclick="closeModal()">ver todos →</a>`;
  }

  if (qual === 'eventos') {
    const itens = db.eventos.filter(e => e.ano === ano).sort((a, b) => a.mes - b.mes);
    titulo = `Eventos de ${ano}`; icone = 'calendar';
    corpo = itens.map(e => {
      const na = db.atividades.filter(a => a.evento === e.id);
      return linkRow('#/evento/' + e.id, 'calendar', esc(e.nome), `${MESES[e.mes - 1]} · ${esc(e.categoria)} · ${na.length} registro${na.length === 1 ? '' : 's'}`);
    }).join('') || empty('Nenhum evento este ano.');
    rodape = `${itens.length} evento${itens.length === 1 ? '' : 's'} em ${ano} · <a href="#/eventos" onclick="closeModal()">calendário →</a>`;
  }

  if (qual === 'videos') {
    const ativsAno = db.atividades.filter(a => +a.data.slice(0, 4) === ano);
    const vids = ativsAno.flatMap(a => midiasDe(a).filter(m => m.tipo === 'video').map(m => ({ m, a })));
    titulo = 'Vídeos do acervo'; icone = 'video';
    corpo = vids.map(({ m, a }) => `<div class="item-row" onclick="closeModal();openAtividade('${a.id}')" role="link" tabindex="0">
      <div class="thumb" aria-hidden="true">${I('video', 20)}</div>
      <div style="flex:1;min-width:0"><div class="tit">${esc(m.legenda || 'Vídeo sem legenda')}</div>
      <div class="meta">${esc(a.titulo)} · ${fmtData(a.data)} · ${turma(a.turma)?.nome || 'Escola'}</div></div></div>`).join('') || empty('Nenhum vídeo no acervo deste ano.', 'video');
    rodape = `${vids.length} vídeo${vids.length === 1 ? '' : 's'}`;
  }

  if (qual === 'pendencias') {
    const pendAtivs = db.atividades.filter(a => a.status === 'pendente');
    const pendProjs = db.projetos.filter(p => !p.descricao);
    const pendAprov = db.atividades.filter(a => a.visibilidade === 'aguardando');
    titulo = 'Pendências'; icone = 'clock';
    corpo = [
      ...pendAtivs.map(a => linkRow('#/registros', 'note', esc(a.titulo), `Aguardando classificação · ${fmtData(a.data)}`)),
      ...pendProjs.map(p => linkRow('#/projeto/' + p.id, 'blocks', esc(p.nome), 'Sem descrição')),
      ...pendAprov.map(a => `<div class="item-row" onclick="closeModal();openAtividade('${a.id}')" role="link" tabindex="0">
        <div class="thumb" aria-hidden="true">${I('checksq', 20)}</div>
        <div style="flex:1;min-width:0"><div class="tit">${esc(a.titulo)}</div><div class="meta">Aguardando aprovação de publicação</div></div></div>`)
    ].join('') || empty('Tudo em dia! Nenhuma pendência.');
    rodape = `${pendAtivs.length + pendProjs.length + pendAprov.length} pendência(s) no total`;
  }

  modal(`
    <div class="modal-head"><h3>${I(icone, 18)} ${titulo}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div class="card" style="margin-bottom:14px">${corpo}</div>
      <div style="font-size:12.5px;color:var(--ink-3);text-align:center">${rodape}</div>
    </div>`, true);
}
