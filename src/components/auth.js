/* Authentication — login, 2FA, logout */
import { $, esc, I, S, api, toast, modal, closeModal, nav, render, resetState } from './ui.js';

export function renderLogin() {
  document.body.className = '';
  $('#app').innerHTML = `
  <div class="login-wrap">
    <div class="login-hero">
      <h1>Transforme tudo o que sua escola faz em memória, evidência e história.</h1>
      <p>Memória institucional, registro pedagógico e comunicação escolar — em um só lugar, organizado pela IA e protegido pela LGPD.</p>
      <div class="flow">
        <span>${I('school', 15)} A escola faz</span><span>${I('note', 15)} Alguém registra</span><span>${I('archive', 15)} O sistema organiza</span>
        <span>${I('lock', 15)} A escola preserva</span><span>${I('sparkles', 15)} A IA transforma em memória e conteúdo</span>
      </div>
    </div>
    <div class="login-form"><div class="login-card">
      <div class="logo-app" style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#245A91,#173F7A);display:grid;place-items:center;color:#fff">${I('school', 26)}</div>
        <div><b style="font-size:20px;display:block">Memória Escola</b><small style="font-size:13px;color:var(--ink-3)">Ano letivo 2026</small></div>
      </div>
      <div class="card card-pad">
        <div class="field"><label for="lg-email">E-mail</label><input id="lg-email" type="email" placeholder="voce@escola.br"></div>
        <div class="field"><label for="lg-senha">Senha</label><input id="lg-senha" type="password" placeholder="••••••••"></div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doLogin()">Entrar</button>
        <p style="text-align:center;margin-top:14px"><a href="#/familia">Sou responsável — Portal das Famílias</a><br style="line-height:2"><a href="#/publico">Ver página pública da escola</a></p>
      </div>
      <div class="demo-users">
        <p style="font-size:11.5px;color:var(--ink-3);text-align:center;margin-bottom:2px">Acesso rápido para demonstração — senha: demo123</p>
        ${[['joao@escola.br','João Silva','Professor de DS','JS'],['paula@escola.br','Paula Rocha','Professora de Ciências','PR'],['ana@escola.br','Ana Costa','Coordenação','AC'],['carla@escola.br','Carla Mendes','Marketing','CM'],['roberto@escola.br','Roberto Lima','Direção','RL']]
          .map(([e,n,p,a]) => `<button onclick="quickLogin('${e}')"><span class="avatar" style="width:32px;height:32px;font-size:11px">${a}</span><span class="who"><b>${n}</b><span>${p} · ${e}</span></span></button>`).join('')}
      </div>
    </div></div>
  </div>`;
  $('#lg-senha').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

export async function quickLogin(email) {
  $('#lg-email').value = email;
  $('#lg-senha').value = 'demo123';
  doLogin();
}

export async function doLogin() {
  try {
    const r = await api('/login', { body: { email: $('#lg-email').value.trim(), senha: $('#lg-senha').value } });
    if (r.precisa2fa) return pedir2FA(r);
    concluirLogin(r);
  } catch (e) { toast(e.message, true); }
}

export function concluirLogin(r) {
  S.token = r.token; S.user = r.user; S.db = null;
  localStorage.setItem('me_token', r.token); localStorage.setItem('me_user', JSON.stringify(r.user));
  toast('Bem-vindo(a), ' + r.user.nome.split(' ')[0] + '!');
  nav('/home'); render();
}

export function pedir2FA(r) {
  modal(`
    <div class="modal-head"><h3>${I('key', 18)} Verificação em duas etapas</h3><button class="x" onclick="closeModal()" aria-label="Fechar janela">${I('x', 16)}</button></div>
    <div class="modal-body">
      <p style="font-size:13.5px;margin-bottom:12px">Seu perfil exige uma segunda verificação. Um código de 6 dígitos foi enviado ao seu e-mail.</p>
      ${r.demoCodigo ? `<p style="font-size:12.5px;margin-bottom:12px;padding:9px 12px;border-radius:9px;background:var(--ai-soft);color:var(--ai-text)">${I('bulb', 13)} <b>Modo demonstração:</b> use o código <b style="letter-spacing:2px">${esc(r.demoCodigo)}</b></p>` : ''}
      <div class="field"><label for="tfa-cod">Código de verificação</label>
        <input id="tfa-cod" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"></div>
      <button class="btn btn-primary" style="width:100%" onclick="confirmar2FA('${esc(r.pendId)}')">Confirmar</button>
    </div>`);
  setTimeout(() => $('#tfa-cod')?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar2FA(r.pendId); }), 100);
}

export async function confirmar2FA(pendId) {
  try {
    const r = await api('/login/2fa', { body: { pendId, codigo: $('#tfa-cod').value.trim() } });
    closeModal(); concluirLogin(r);
  } catch (e) { toast(e.message, true); }
}

export async function doLogout() {
  try { await api('/logout', { body: {} }); } catch (e) { /* sessão já pode ter expirado */ }
  resetState(); localStorage.clear(); nav('/'); render();
}

export function exposeAuth() {
  window.quickLogin = quickLogin;
  window.doLogin = doLogin;
  window.confirmar2FA = confirmar2FA;
  window.doLogout = doLogout;
}
