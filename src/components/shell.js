/* Shell — sidebar + topbar layout */
import { $, esc, PAPEIS, I, S, D, can, nav, render, modal, closeModal, toast } from './ui.js';

export function renderShell(active, contentFn) {
  const u = S.user;
  const item = (r, ic, lbl, show = true) => show ? `<a href="#/${r}" class="${active === r ? 'active' : ''}" ${active === r ? 'aria-current="page"' : ''}><span class="ic">${I(ic, 17)}</span>${lbl}</a>` : '';

  $('#app').innerHTML = `
  <div class="layout">
    <aside class="sidebar" id="sb">
      <div class="logo">
        <div class="mark"><span style="font-size:18px">${I('school', 20)}</span></div>
        <div><b>Memória Escola</b><small>Ano letivo ${D()?.escola?.anoAtual || 2026}</small></div>
      </div>
      <nav class="nav">
        <div class="nav-sec">Principal</div>
        ${item('home', 'home', 'Dashboard')}
        ${item('memoria', 'archive', 'Memória')}
        ${item('registros', 'note', 'Registros')}
        ${item('busca', 'search', 'Busca inteligente')}
        <div class="nav-sec">Acervo</div>
        ${item('projetos', 'blocks', 'Projetos')}
        ${item('eventos', 'calendar', 'Eventos')}
        ${item('galeria', 'image', 'Galeria')}
        ${item('timeline', 'clock', 'Linha do Tempo')}
        <div class="nav-sec">Pedagógico</div>
        ${item('pedagogico', 'cap', 'Turmas & Disciplinas')}
        ${item('alunos', 'users', 'Alunos', can('revisar') || u.papel === 'professor')}
        <div class="nav-sec">Inteligência</div>
        ${item('ia', 'sparkles', 'Inteligência da Memória')}
        ${item('relatorios', 'chart', 'Relatórios', can('revisar') || can('relatorios'))}
        <div class="nav-sec">Comunicação</div>
        ${item('comunicacao', 'megaphone', 'Conteúdo & Newsletter', can('gerarTextos') || can('historias'))}
        <div class="nav-sec">Gestão</div>
        ${item('configuracoes', 'settings', 'Configurações', can('revisar') || can('permissoes'))}
        ${item('aprovacoes', 'checksq', 'Aprovações', can('aprovar'))}
        ${item('privacidade', 'shield', 'Privacidade & LGPD', can('revisar') || can('permissoes'))}
        ${item('publico', 'globe', 'Página pública')}
      </nav>
      <div class="user-box">
        <button class="user-menu-btn" onclick="openUserMenu()" aria-haspopup="menu" aria-label="Menu do usuário ${esc(u.nome)}">
          <span class="avatar" aria-hidden="true">${u.avatar}</span>
          <span class="who"><b>${esc(u.nome)}</b><span>${PAPEIS[u.papel] || u.papel}</span></span>
          <span class="chev" aria-hidden="true">${I('chevdown', 16)}</span>
        </button>
      </div>
    </aside>
    <div class="mob-overlay" id="mob-ov" style="display:none" onclick="toggleSb(false)"></div>
    <div class="main">
      <div class="topbar">
        <button class="hamb" onclick="toggleSb(true)" aria-label="Abrir menu de navegação">${I('menu', 18)}</button>
        <div class="searchbar"><span class="lens" aria-hidden="true">${I('search', 15)}</span>
          <label class="sr-only" for="global-q">Busca inteligente no acervo</label><input id="global-q" placeholder='Buscar no acervo…' title='Ex.: projetos de robótica de 2026 · fotos do 2º DS na feira'><span class="kbd" aria-hidden="true">Ctrl K</span>
        </div>
        <div class="spacer"></div>
        <button class="theme-btn" onclick="toggleTheme()" aria-label="Alternar entre tema claro e escuro" title="Tema claro/escuro">${document.documentElement.dataset.theme === 'dark' ? I('sun', 17) : I('moon', 17)}</button>
        ${can('registrar') ? `<button class="btn btn-create" onclick="openRegistro()">＋ Registrar atividade</button>` : ''}
      </div>
      <div class="content" id="content"></div>
    </div>
  </div>
  ${can('registrar') ? `<button class="fab" onclick="openRegistro()">＋ Registrar atividade</button>` : ''}`;

  $('#global-q').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) { sessionStorage.setItem('me_q', e.target.value.trim()); nav('/busca'); }
  });
  $('#content').innerHTML = contentFn() || '';
  window.scrollTo(0, 0);
}

export function toggleSb(open) {
  $('#sb').classList.toggle('open', open);
  $('#mob-ov').style.display = open ? 'block' : 'none';
}

export function toggleTheme() {
  const r = document.documentElement, dark = r.dataset.theme === 'dark';
  if (dark) delete r.dataset.theme; else r.dataset.theme = 'dark';
  localStorage.setItem('me_theme', dark ? 'light' : 'dark');
  if (S.token && S.user) render();
}

export function openUserMenu() {
  const u = S.user;
  modal(`
    <div class="modal-head"><h3>${I('user', 18)} ${esc(u.nome)}</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <p style="font-size:13px;margin-bottom:14px;color:var(--dk-ink-2)">${PAPEIS[u.papel] || u.papel} · sessão expira após 30 min de inatividade</p>
      <div style="display:grid;gap:9px">
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="toast('Meu perfil: edição de dados pessoais disponível na próxima versão.')">${I('user', 15)} Meu perfil</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="openSeguranca()">${I('key', 15)} Configurações de segurança</button>
        <button class="btn btn-danger" style="justify-content:flex-start" onclick="closeModal();doLogout()">${I('logout', 15)} Sair</button>
      </div>
    </div>`);
}

export function openSeguranca() {
  modal(`
    <div class="modal-head"><h3>${I('key', 18)} Configurações de segurança</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <div style="display:grid;gap:11px;font-size:13.5px">
        <div class="card card-pad"><b>Sessão</b><p style="margin-top:4px;color:var(--dk-ink-2)">Expiração automática após 30 minutos de inatividade. Logout encerra o token no servidor.</p></div>
        <div class="card card-pad"><b>Verificação em duas etapas (2FA)</b><p style="margin-top:4px;color:var(--dk-ink-2)">${S.user.papel === 'direcao' ? 'Ativa no seu perfil (obrigatória para Direção).' : 'Disponível para perfis de alto privilégio. Ativação individual na próxima versão.'}</p></div>
        <div class="card card-pad"><b>Proteção contra força bruta</b><p style="margin-top:4px;color:var(--dk-ink-2)">Máximo de 5 tentativas de login a cada 15 minutos por origem.</p></div>
      </div>
    </div>`);
}


