import { LDB } from './db.js';
import { AI } from '../services/ai.js';
import { RELATORIO } from '../services/reports.js';

const API = (function () {
  const D = () => LDB.get();
  const uid = LDB.uid, log = LDB.log, save = LDB.gravar;

  const ok = (json) => ({ status: 200, json });
  const err = (status, erro) => ({ status, json: { erro } });

  /* ---------- permissões (idênticas ao servidor) ---------- */
  const PERM = {
    professor:   ['registrar', 'upload', 'criarProjeto', 'editarTurmaPropria', 'consultar'],
    coordenacao: ['registrar', 'upload', 'criarProjeto', 'consultar', 'revisar', 'aprovar', 'gerenciarTurmas', 'retrospectiva'],
    marketing:   ['consultar', 'historias', 'gerarTextos', 'exportar'],
    direcao:     ['consultar', 'revisar', 'aprovar', 'retrospectiva', 'relatorios', 'permissoes', 'historias', 'gerarTextos', 'gerenciarTurmas']
  };
  const can = (user, acao) => (PERM[user.papel] || []).includes(acao);

  /* ---------- sessões da equipe ---------- */
  const TTL = 30 * 60 * 1000;
  function usuarioDaSessao(headers) {
    const tk = headers['x-token'];
    const sessoes = LDB.lerSessoes();
    const s = sessoes[tk];
    if (!s || s.tipo !== 'equipe') return { erro: 'Não autenticado' };
    if (Date.now() - s.ultimoAcesso > TTL) {
      delete sessoes[tk]; LDB.gravarSessoes(sessoes);
      return { erro: 'Sessão expirada por inatividade. Entre novamente.' };
    }
    s.ultimoAcesso = Date.now(); LDB.gravarSessoes(sessoes);
    const u = D().users.find(x => x.id === s.uid);
    return u ? { user: u } : { erro: 'Usuário inválido' };
  }
  function responsavelDaSessao(headers) {
    const tk = headers['x-token-familia'];
    const sessoes = LDB.lerSessoes();
    const s = sessoes[tk];
    if (!s || s.tipo !== 'familia') return { erro: 'Não autenticado' };
    if (Date.now() - s.ultimoAcesso > TTL) {
      delete sessoes[tk]; LDB.gravarSessoes(sessoes);
      return { erro: 'Sessão expirada. Entre novamente.' };
    }
    s.ultimoAcesso = Date.now(); LDB.gravarSessoes(sessoes);
    const r = (D().responsaveis || []).find(x => x.id === s.rid);
    return r ? { responsavel: r } : { erro: 'Responsável inválido' };
  }
  function abrirSessao(campos) {
    const tk = LDB.novoToken();
    const sessoes = LDB.lerSessoes();
    sessoes[tk] = Object.assign({ ultimoAcesso: Date.now() }, campos);
    LDB.gravarSessoes(sessoes);
    return tk;
  }

  /* ---------- proteção contra tentativas em série ---------- */
  let tentativas = { n: 0, desde: 0 };
  const MAX_TENT = 5, JANELA = 15 * 60 * 1000;
  function bloqueado() {
    if (tentativas.n >= MAX_TENT && Date.now() - tentativas.desde < JANELA)
      return Math.ceil((JANELA - (Date.now() - tentativas.desde)) / 60000);
    if (Date.now() - tentativas.desde >= JANELA) tentativas = { n: 0, desde: 0 };
    return 0;
  }
  function falhou() {
    if (!tentativas.n) tentativas.desde = Date.now();
    tentativas.n++;
    if (tentativas.n === MAX_TENT) log('sistema', '[SEGURANÇA] Bloqueio temporário de login após 5 tentativas inválidas.');
  }

  /* ---------- visão de alunos conforme o papel (LGPD) ---------- */
  function visaoAlunos(user) {
    const db = D();
    if (can(user, 'revisar') || can(user, 'permissoes'))
      return { alunos: db.alunos.map(a => ({ ...a, dadosCompletos: true })), nivel: 'completo' };
    if (user.papel === 'professor') {
      return {
        nivel: 'parcial',
        alunos: db.alunos.map(a => (user.turmas || []).includes(a.turma)
          ? { ...a, dadosCompletos: true }
          : { id: a.id, nome: a.nome, turma: a.turma, dadosCompletos: false })
      };
    }
    return { alunos: [], nivel: 'nenhum' };
  }

  const pend2fa = {};

  /* ============================================================
     ROTEADOR
     ============================================================ */
  async function rota(metodo, caminho, corpo, headers, extra) {
    const db = D();
    const p = caminho.split('?')[0];
    const query = new URLSearchParams(caminho.split('?')[1] || '');
    const b = corpo || {};

    /* ---------------- autenticação ---------------- */
    if (p === '/login' && metodo === 'POST') {
      const min = bloqueado();
      if (min) return err(429, `Muitas tentativas de login. Tente novamente em ${min} min.`);
      const email = String(b.email || '').trim().toLowerCase();
      const u = db.users.find(x => x.email === email);
      if (!u || !LDB.conferirSenha(b.senha, u.senha)) { falhou(); return err(401, 'Credenciais inválidas'); }
      tentativas = { n: 0, desde: 0 };
      if (u.papel === 'direcao') {
        const codigo = String(Math.floor(100000 + Math.random() * 900000));
        const pid = uid('2fa');
        pend2fa[pid] = { uid: u.id, codigo, expira: Date.now() + 5 * 60 * 1000, tentativas: 0 };
        return ok({ precisa2fa: true, pendId: pid, demoCodigo: codigo });
      }
      const tk = abrirSessao({ tipo: 'equipe', uid: u.id });
      log(u.id, 'Fez login no sistema.');
      return ok({ token: tk, user: { id: u.id, nome: u.nome, papel: u.papel, avatar: u.avatar, turmas: u.turmas }, sessaoMin: 30 });
    }

    if (p === '/login/2fa' && metodo === 'POST') {
      const pe = pend2fa[b.pendId];
      if (!pe || Date.now() > pe.expira) { delete pend2fa[b.pendId]; return err(401, 'Código expirado. Faça login novamente.'); }
      if (++pe.tentativas > 5) { delete pend2fa[b.pendId]; return err(429, 'Muitas tentativas. Faça login novamente.'); }
      if (String(b.codigo) !== pe.codigo) return err(401, 'Código incorreto.');
      delete pend2fa[b.pendId];
      const u = db.users.find(x => x.id === pe.uid);
      const tk = abrirSessao({ tipo: 'equipe', uid: u.id });
      log(u.id, 'Fez login com verificação em duas etapas (2FA).');
      return ok({ token: tk, user: { id: u.id, nome: u.nome, papel: u.papel, avatar: u.avatar, turmas: u.turmas }, sessaoMin: 30 });
    }

    /* ---------------- portal das famílias (sessão própria) ---------------- */
    if (p === '/familia/login' && metodo === 'POST') {
      const min = bloqueado();
      if (min) return err(429, `Muitas tentativas de login. Tente novamente em ${min} min.`);
      const email = String(b.email || '').trim().toLowerCase();
      const r = (db.responsaveis || []).find(x => x.email === email);
      if (!r || !LDB.conferirSenha(b.senha, r.senha)) { falhou(); return err(401, 'E-mail ou senha inválidos'); }
      tentativas = { n: 0, desde: 0 };
      const tk = abrirSessao({ tipo: 'familia', rid: r.id });
      log('familia:' + r.id, `Responsável ${r.nome} entrou no portal das famílias.`);
      return ok({ token: tk, responsavel: { id: r.id, nome: r.nome, parentesco: r.parentesco } });
    }

    if (p.startsWith('/familia/')) return rotaFamilia(metodo, p, b, headers);

    /* ---------------- daqui para baixo exige login da equipe ---------------- */
    const sess = usuarioDaSessao(headers);
    if (sess.erro) return err(401, sess.erro);
    const user = sess.user;

    if (p === '/logout' && metodo === 'POST') {
      const sessoes = LDB.lerSessoes(); delete sessoes[headers['x-token']]; LDB.gravarSessoes(sessoes);
      log(user.id, 'Encerrou a sessão (logout).');
      return ok({ ok: true });
    }

    if (p === '/bootstrap' && metodo === 'GET') {
      const va = visaoAlunos(user);
      return ok({
        escola: db.escola, turmas: db.turmas, disciplinas: db.disciplinas, projetos: db.projetos,
        eventos: db.eventos, atividades: db.atividades, midias: db.midias,
        alunos: va.alunos, nivelAlunos: va.nivel, historias: db.historias,
        users: db.users.map(u => ({ id: u.id, nome: u.nome, papel: u.papel, avatar: u.avatar, turmas: u.turmas })),
        tagsGlobais: db.tagsGlobais, paginaPublica: db.paginaPublica,
        consentimentos: can(user, 'revisar') ? db.consentimentos : [],
        logs: can(user, 'relatorios') || can(user, 'revisar') ? db.logs.slice(0, 60) : [],
        permissoes: PERM[user.papel] || []
      });
    }

    if (p === '/alunos/auditoria-acesso' && metodo === 'POST') {
      const va = visaoAlunos(user);
      if (va.nivel === 'nenhum') return err(403, 'Sem permissão');
      const nomes = va.alunos.filter(a => a.dadosCompletos).map(a => a.nome);
      if (nomes.length) log(user.id, `[AUDITORIA-LGPD] Visualizou dados sensíveis de aluno(s): ${nomes.join(', ')}.`);
      return ok({ ok: true, registrados: nomes.length });
    }

    /* ---------------- upload (arquivos ficam no próprio navegador) ---------------- */
    if (p === '/upload' && metodo === 'POST') {
      if (!can(user, 'upload') && !can(user, 'registrar')) return err(403, 'Sem permissão');
      const aceitos = [], rejeitados = [];
      const LIMITE_FOTO = 2.5 * 1024 * 1024;
      for (const f of (extra && extra.arquivos) || []) {
        const ehVideo = /^video\//.test(f.type);
        if (!ehVideo && !/^image\//.test(f.type)) { rejeitados.push({ nome: f.name, motivo: 'tipo de arquivo não aceito' }); continue; }
        if (ehVideo) {
          // sem servidor não há onde guardar o arquivo de vídeo: registra a referência
          aceitos.push({ url: '', tipo: 'video', nome: f.name });
          continue;
        }
        if (f.size > LIMITE_FOTO) { rejeitados.push({ nome: f.name, motivo: 'foto acima de 2,5 MB (limite desta versão offline)' }); continue; }
        try {
          const dataUrl = await lerComoDataURL(f);
          const assinatura = await conferirAssinatura(f);
          if (!assinatura) { rejeitados.push({ nome: f.name, motivo: 'conteúdo do arquivo não é uma imagem válida' }); continue; }
          aceitos.push({ url: dataUrl, tipo: 'foto', nome: f.name.replace(/[^\w.\- ]/g, '_') });
        } catch (e) { rejeitados.push({ nome: f.name, motivo: 'falha ao ler o arquivo' }); }
      }
      if (rejeitados.length) log(user.id, `Upload rejeitado na validação: ${rejeitados.map(r => r.nome + ' (' + r.motivo + ')').join('; ')}.`);
      return ok({ files: aceitos, rejeitados });
    }

    /* ---------------- IA ---------------- */
    if (p === '/ia/curar' && metodo === 'POST') return ok(AI.curarRegistro(b));

    if (p === '/ia/historia' && metodo === 'POST') {
      if (!can(user, 'historias') && !can(user, 'retrospectiva') && user.papel !== 'professor') return err(403, 'Sem permissão');
      const h = AI.gerarHistoria(b);
      return h ? ok(h) : err(400, 'Selecione ao menos um registro');
    }

    if (p === '/ia/conteudo' && metodo === 'POST') {
      if (!can(user, 'gerarTextos') && !can(user, 'registrar')) return err(403, 'Sem permissão');
      const r = AI.gerarConteudo(b);
      return r ? ok(r) : err(400, 'Tipo inválido');
    }

    /* ---------------- atividades ---------------- */
    if (p === '/atividades' && metodo === 'POST') {
      if (!can(user, 'registrar')) return err(403, 'Seu perfil não pode registrar atividades');
      const id = uid('r');
      const midias = (b.midias || []).map(m => {
        const mid = uid('m');
        db.midias.push({ id: mid, tipo: m.tipo, url: m.url, legenda: m.legenda || m.nome || '', atividade: id, consentimentoOk: !!b.consentimentoOk, aprovadaPublico: false });
        return mid;
      });
      const atv = {
        id, titulo: b.titulo || 'Atividade', turma: b.turma || null, projeto: b.projeto || null,
        evento: b.evento || null, disciplina: b.disciplina || null,
        data: b.data || new Date().toISOString().slice(0, 10),
        autor: user.id, observacao: b.observacao || '', categoria: b.categoria || 'Pedagógico',
        tags: b.tags || [], midias, status: b.confirmadoIA ? 'classificado' : 'pendente',
        visibilidade: 'privado', resumo: b.resumo || '', criadoEm: new Date().toISOString()
      };
      db.atividades.unshift(atv);
      (b.tags || []).forEach(t => { if (!db.tagsGlobais.includes(t)) db.tagsGlobais.push(t); });
      save();
      log(user.id, `Registrou a atividade "${atv.titulo}".`);
      return ok({ ok: true, atividade: atv });
    }

    if (p.startsWith('/atividades/') && metodo === 'PATCH') {
      const a = db.atividades.find(x => x.id === p.slice(13));
      if (!a) return err(404, 'Não encontrado');
      if (b.visibilidade) {
        if (b.visibilidade === 'aprovado' && !can(user, 'aprovar')) return err(403, 'Apenas coordenação/direção aprovam publicação');
        if (b.visibilidade === 'aguardando' && a.autor !== user.id && !can(user, 'aprovar')) return err(403, 'Sem permissão');
        if (b.visibilidade === 'aprovado') {
          const problemas = a.midias.map(m => db.midias.find(x => x.id === m)).filter(m => m && !m.consentimentoOk);
          if (problemas.length) return err(400, `Bloqueado: ${problemas.length} mídia(s) sem consentimento confirmado. Resolva antes de aprovar.`);
        }
        a.visibilidade = b.visibilidade;
        a.historicoAprovacao = a.historicoAprovacao || [];
        a.historicoAprovacao.push({
          usuario: user.id, nome: user.nome, papel: user.papel, quando: new Date().toISOString(),
          acao: b.visibilidade === 'aprovado' ? 'aprovou' : b.visibilidade === 'aguardando' ? 'enviou para aprovação' : 'tornou privado / recusou',
          motivo: (b.motivo || '').slice(0, 300)
        });
        log(user.id, `Alterou visibilidade de "${a.titulo}" para ${b.visibilidade}${b.motivo ? ' — motivo: ' + b.motivo : ''}.`);
      }
      ['titulo', 'resumo', 'tags', 'categoria', 'status', 'projeto', 'evento', 'disciplina'].forEach(k => { if (b[k] !== undefined) a[k] = b[k]; });
      save();
      return ok({ ok: true, atividade: a });
    }

    /* ---------------- projetos ---------------- */
    if (p === '/projetos' && metodo === 'POST') {
      if (!can(user, 'criarProjeto')) return err(403, 'Sem permissão');
      const pr = {
        id: uid('p'), nome: b.nome, ano: b.ano || db.escola.anoAtual, turma: b.turma || null,
        professor: user.id, disciplina: b.disciplina || null, categoria: b.categoria || 'Pedagógico',
        descricao: b.descricao || '', etapas: b.etapas || [], resultado: '', participantes: [],
        tags: b.tags || [], arquivos: [], status: 'andamento'
      };
      db.projetos.push(pr); save();
      log(user.id, `Criou o projeto "${pr.nome}".`);
      return ok({ ok: true, projeto: pr });
    }

    if (p.startsWith('/projetos/') && metodo === 'PATCH') {
      const pr = db.projetos.find(x => x.id === p.slice(10));
      if (!pr) return err(404, 'Projeto não encontrado');
      if (pr.professor !== user.id && !can(user, 'revisar')) return err(403, 'Sem permissão');
      ['descricao', 'resultado', 'etapas', 'tags', 'status', 'categoria'].forEach(k => { if (b[k] !== undefined) pr[k] = b[k]; });
      save();
      log(user.id, `Editou o projeto "${pr.nome}".`);
      return ok({ ok: true, projeto: pr });
    }

    /* ---------------- mídias ---------------- */
    if (p.startsWith('/midias/') && metodo === 'PATCH') {
      if (!can(user, 'aprovar')) return err(403, 'Sem permissão');
      const m = db.midias.find(x => x.id === p.slice(8));
      if (!m) return err(404, 'Não encontrada');
      if (b.aprovadaPublico !== undefined) {
        if (b.aprovadaPublico && !m.consentimentoOk) return err(400, 'Mídia sem consentimento não pode ser pública.');
        m.aprovadaPublico = b.aprovadaPublico;
      }
      if (b.consentimentoOk !== undefined) m.consentimentoOk = b.consentimentoOk;
      save();
      log(user.id, `Atualizou mídia ${m.id} (${m.legenda}).`);
      return ok({ ok: true, midia: m });
    }

    /* ---------------- cadastros ---------------- */
    if (p === '/turmas' && metodo === 'POST') {
      if (!can(user, 'gerenciarTurmas')) return err(403, 'Apenas coordenação e direção podem criar turmas');
      const nome = String(b.nome || '').trim();
      const ano = +b.ano || db.escola.anoAtual;
      const nivel = String(b.nivel || '').trim() || 'Ensino Médio';
      const professores = Array.isArray(b.professores) ? b.professores : [];
      if (!nome) return err(400, 'Informe o nome da turma');
      if (nome.length > 60) return err(400, 'Nome da turma muito longo (máx. 60 caracteres)');
      if (db.turmas.some(t => t.nome.toLowerCase() === nome.toLowerCase() && t.ano === ano)) return err(400, `Já existe a turma "${nome}" em ${ano}`);
      const validos = professores.filter(pid => db.users.some(u => u.id === pid && u.papel === 'professor'));
      const t = { id: uid('t'), nome, ano, nivel, professores: validos };
      db.turmas.push(t);
      validos.forEach(pid => {
        const u = db.users.find(x => x.id === pid);
        if (u && !(u.turmas || []).includes(t.id)) (u.turmas = u.turmas || []).push(t.id);
      });
      save();
      log(user.id, `Criou a turma "${t.nome}" (${t.ano} · ${t.nivel})${validos.length ? ' com professor(es): ' + validos.map(pid => (db.users.find(u => u.id === pid) || {}).nome).join(', ') : ''}.`);
      return ok({ ok: true, turma: t });
    }

    if (p === '/disciplinas' && metodo === 'POST') {
      if (!can(user, 'gerenciarTurmas')) return err(403, 'Apenas coordenação e direção podem criar disciplinas');
      const nome = String(b.nome || '').trim();
      const cor = /^#[0-9a-fA-F]{6}$/.test(b.cor || '') ? b.cor : '#173F7A';
      if (!nome) return err(400, 'Informe o nome da disciplina');
      if (nome.length > 60) return err(400, 'Nome da disciplina muito longo (máx. 60 caracteres)');
      if (db.disciplinas.some(d => d.nome.toLowerCase() === nome.toLowerCase())) return err(400, `A disciplina "${nome}" já existe`);
      const d = { id: uid('d'), nome, cor };
      db.disciplinas.push(d); save();
      log(user.id, `Criou a disciplina "${d.nome}".`);
      return ok({ ok: true, disciplina: d });
    }

    if (p === '/alunos' && metodo === 'POST') {
      if (!can(user, 'revisar') && !can(user, 'permissoes')) return err(403, 'Apenas coordenação e direção podem cadastrar alunos');
      const nome = String(b.nome || '').trim();
      const turmaId = b.turma || null;
      const consent = ['autorizado', 'pendente', 'negado'].includes(b.consentimentoImagem) ? b.consentimentoImagem : 'pendente';
      const menorIdade = b.menorIdade !== false;
      const responsavel = String(b.responsavel || '').trim();
      if (!nome) return err(400, 'Informe o nome completo do aluno');
      if (nome.length > 80) return err(400, 'Nome muito longo (máx. 80 caracteres)');
      if (!turmaId || !db.turmas.some(t => t.id === turmaId)) return err(400, 'Selecione uma turma válida');
      if (db.alunos.some(a => a.nome.toLowerCase() === nome.toLowerCase() && a.turma === turmaId)) return err(400, `"${nome}" já está cadastrado nesta turma`);
      const a = { id: uid('a'), nome, turma: turmaId, consentimentoImagem: consent, menorIdade };
      db.alunos.push(a);
      db.consentimentos.push({
        id: uid('c'), aluno: a.id, tipo: 'uso_imagem', status: consent,
        responsavel: responsavel || '—', data: consent === 'pendente' ? '' : new Date().toISOString().slice(0, 10)
      });
      save();
      log(user.id, `[AUDITORIA-LGPD] Cadastrou o aluno "${a.nome}" (${(db.turmas.find(t => t.id === turmaId) || {}).nome}) — consentimento de imagem: ${consent}.`);
      return ok({ ok: true, aluno: a });
    }

    if (p === '/users' && metodo === 'POST') {
      if (!can(user, 'permissoes')) return err(403, 'Apenas a direção pode criar novos acessos');
      const nome = String(b.nome || '').trim();
      const email = String(b.email || '').trim().toLowerCase();
      const senha = String(b.senha || '');
      const papel = ['professor', 'coordenacao', 'marketing', 'direcao'].includes(b.papel) ? b.papel : null;
      const turmas = Array.isArray(b.turmas) ? b.turmas.filter(t => db.turmas.some(x => x.id === t)) : [];
      if (!nome || nome.length > 80) return err(400, 'Informe o nome (máx. 80 caracteres)');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, 'E-mail inválido');
      if (db.users.some(u => u.email === email)) return err(400, 'Já existe um acesso com este e-mail');
      if (senha.length < 8) return err(400, 'A senha precisa ter pelo menos 8 caracteres');
      if (!papel) return err(400, 'Selecione um papel válido');
      const avatar = nome.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
      const u = { id: uid('u'), nome, email, senha: LDB.hashSenha(senha), papel, avatar, turmas: papel === 'professor' ? turmas : [] };
      db.users.push(u); save();
      log(user.id, `[SEGURANÇA] Criou o acesso de "${nome}" (${email}) com papel ${papel}${u.turmas.length ? ' — turmas: ' + u.turmas.map(t => (db.turmas.find(x => x.id === t) || {}).nome).join(', ') : ''}.`);
      return ok({ ok: true, user: { id: u.id, nome: u.nome, papel: u.papel, avatar: u.avatar } });
    }

    if (/^\/alunos\/[^/]+\/anonimizar$/.test(p) && metodo === 'POST') {
      if (!can(user, 'permissoes')) return err(403, 'Apenas a direção pode anonimizar dados de aluno');
      const id = p.split('/')[2];
      const a = db.alunos.find(x => x.id === id);
      if (!a) return err(404, 'Aluno não encontrado');
      if (a.anonimizado) return err(400, 'Este registro já foi anonimizado');
      const original = a.nome;
      a.nome = 'Aluno removido (LGPD)';
      a.consentimentoImagem = 'negado';
      a.anonimizado = true;
      db.consentimentos.filter(c => c.aluno === a.id).forEach(c => { c.responsavel = '—'; c.status = 'negado'; });
      db.projetos.forEach(pr => { if (Array.isArray(pr.participantes)) pr.participantes = pr.participantes.filter(x => x !== a.id); });
      save();
      log(user.id, `[AUDITORIA-LGPD] Anonimizou os dados do aluno "${original}" a pedido do titular/responsável (art. 18 LGPD). Ação irreversível.`);
      return ok({ ok: true });
    }

    /* ---------------- busca ---------------- */
    if (p === '/busca' && metodo === 'POST') {
      const interp = b.q ? AI.interpretarBusca(b.q) : {};
      const f = { ...interp, ...(b.filtros || {}) };
      const N = AI.norm;
      const matchTexto = (txt) => {
        if (!f.termos || !f.termos.length) return true;
        const t = N(txt);
        return f.termos.some(w => t.includes(w));
      };
      const atividades = db.atividades.filter(a => {
        if (f.ano && +a.data.slice(0, 4) !== +f.ano) return false;
        if (f.mes && +a.data.slice(5, 7) !== +f.mes) return false;
        if (f.turma && a.turma !== f.turma) return false;
        if (f.projeto && a.projeto !== f.projeto) return false;
        if (f.disciplina && a.disciplina !== f.disciplina) return false;
        if (f.evento && a.evento !== f.evento) return false;
        if (f.categoria && N(a.categoria) !== N(f.categoria)) return false;
        if (f.professor && a.autor !== f.professor) return false;
        if (f.tag && !a.tags.some(t => N(t) === N(f.tag))) return false;
        if (f.tipoMidia) {
          const tipos = a.midias.map(m => (db.midias.find(x => x.id === m) || {}).tipo);
          if (!tipos.includes(f.tipoMidia)) return false;
        }
        if (f.tema && !(N(a.categoria).includes(f.tema) || a.tags.some(t => N(t).includes(f.tema)))) return false;
        return matchTexto([a.titulo, a.observacao, a.resumo, ...a.tags].join(' '));
      });
      const projetos = db.projetos.filter(pr => {
        if (f.ano && pr.ano !== +f.ano) return false;
        if (f.turma && pr.turma !== f.turma) return false;
        if (f.disciplina && pr.disciplina !== f.disciplina) return false;
        if (f.professor && pr.professor !== f.professor) return false;
        if (f.categoria && N(pr.categoria) !== N(f.categoria)) return false;
        if (f.tema && !(N(pr.categoria).includes(f.tema) || pr.tags.some(t => N(t).includes(f.tema)) || N(pr.nome).includes(f.tema))) return false;
        if (f.tag && !pr.tags.some(t => N(t) === N(f.tag))) return false;
        return matchTexto([pr.nome, pr.descricao, pr.categoria, ...pr.tags].join(' '));
      });
      const eventos = db.eventos.filter(e => {
        if (f.ano && e.ano !== +f.ano) return false;
        if (f.mes && e.mes !== +f.mes) return false;
        if (f.turma && e.turmas.length && !e.turmas.includes(f.turma)) return false;
        if (f.tema && !N(e.categoria + ' ' + e.nome).includes(f.tema)) return false;
        return matchTexto(e.nome + ' ' + e.descricao);
      });
      return ok({ interpretacao: f, atividades, projetos, eventos });
    }

    /* ---------------- histórias ---------------- */
    if (p === '/historias' && metodo === 'POST') {
      if (!can(user, 'historias') && !can(user, 'registrar')) return err(403, 'Sem permissão');
      const h = { id: uid('h'), ...b, autor: user.id, publica: false, criadoEm: new Date().toISOString() };
      delete h.avisos;
      db.historias.unshift(h); save();
      log(user.id, `Criou a história "${h.titulo}".`);
      return ok({ ok: true, historia: h });
    }

    if (p.startsWith('/historias/') && metodo === 'PATCH') {
      const h = db.historias.find(x => x.id === p.slice(11));
      if (!h) return err(404, 'Não encontrada');
      if (b.publica !== undefined) {
        if (!can(user, 'aprovar') && !can(user, 'historias')) return err(403, 'Sem permissão');
        h.publica = b.publica;
        log(user.id, `${h.publica ? 'Publicou' : 'Despublicou'} a história "${h.titulo}".`);
      }
      ['titulo', 'introducao', 'encerramento', 'secoes', 'destaques'].forEach(k => { if (b[k] !== undefined) h[k] = b[k]; });
      save();
      return ok({ ok: true, historia: h });
    }

    /* ---------------- retrospectiva ---------------- */
    if (p.startsWith('/retrospectiva/') && metodo === 'GET') {
      const ano = +p.slice(15);
      const ativs = db.atividades.filter(a => +a.data.slice(0, 4) === ano);
      const projs = db.projetos.filter(pr => pr.ano === ano);
      const evts = db.eventos.filter(e => e.ano === ano).sort((a, c) => a.mes - c.mes);
      const mids = db.midias.filter(m => { const a = db.atividades.find(x => x.id === m.atividade); return a && +a.data.slice(0, 4) === ano; });
      const turmas = db.turmas.filter(t => t.ano === ano);
      return ok({
        ano,
        numeros: {
          projetos: projs.length, eventos: evts.length, atividades: ativs.length,
          fotos: mids.filter(m => m.tipo === 'foto').length, videos: mids.filter(m => m.tipo === 'video').length,
          turmas: turmas.length
        },
        destaques: [
          ...projs.filter(pr => pr.resultado).map(pr => ({ tipo: 'projeto', nome: pr.nome, detalhe: pr.resultado })),
          ...evts.filter(e => ['e-mostra', 'e-feira', 'e-junina', 'e-cien'].includes(e.id)).map(e => ({ tipo: 'evento', nome: e.nome, detalhe: e.descricao }))
        ],
        timeline: evts.map(e => ({ mes: e.mes, nome: e.nome, descricao: e.descricao, id: e.id }))
      });
    }

    /* ---------------- relatórios ---------------- */
    if (p.startsWith('/relatorio/') && metodo === 'GET') {
      if (!can(user, 'revisar') && !can(user, 'relatorios')) return err(403, 'Sem permissão para gerar relatórios.');
      const formato = p.slice(11).toLowerCase();
      if (!['pdf', 'docx', 'pptx'].includes(formato)) return err(400, 'Formato inválido. Use pdf, docx ou pptx.');
      const ano = +query.get('ano') || db.escola.anoAtual;
      try {
        const r = await RELATORIO.gerar(db, ano, formato);
        log(user.id, `Gerou relatório institucional ${ano} em ${formato.toUpperCase()}`);
        return { status: 200, blob: r.blob, mime: r.mime, nome: r.nome };
      } catch (e) {
        console.error(e);
        return err(500, 'Falha ao gerar o relatório: ' + e.message);
      }
    }

    /* ---------------- newsletter ---------------- */
    if (p === '/newsletter/gerar' && metodo === 'POST') {
      if (!can(user, 'gerarTextos') && !can(user, 'aprovar')) return err(403, 'Sem permissão');
      const mes = /^\d{4}-\d{2}$/.test(b.mes || '') ? b.mes : new Date().toISOString().slice(0, 7);
      return ok(montarNewsletter(db, mes));
    }
    if (p === '/newsletter/publicar' && metodo === 'POST') {
      if (!can(user, 'gerarTextos') && !can(user, 'aprovar')) return err(403, 'Sem permissão');
      const mes = /^\d{4}-\d{2}$/.test(b.mes || '') ? b.mes : new Date().toISOString().slice(0, 7);
      const n = montarNewsletter(db, mes);
      db.newsletters = (db.newsletters || []).filter(x => x.mes !== mes);
      db.newsletters.push({ id: uid('nl'), ...n, publicada: true, publicadaPor: user.id, publicadaEm: new Date().toISOString() });
      save();
      log(user.id, `Publicou a newsletter das famílias de ${mes}.`);
      return ok({ ok: true, mes, titulo: n.titulo });
    }
    if (p === '/newsletter' && metodo === 'GET') {
      if (!can(user, 'gerarTextos') && !can(user, 'aprovar')) return err(403, 'Sem permissão');
      return ok((db.newsletters || []).sort((a, c) => (c.mes || '').localeCompare(a.mes || ''))
        .map(n => ({ id: n.id, mes: n.mes, titulo: n.titulo, publicadaEm: n.publicadaEm, totalAtividades: n.totalAtividades })));
    }

    /* ---------------- página pública ---------------- */
    if (p === '/publico' && metodo === 'PATCH') {
      if (!can(user, 'aprovar') && !can(user, 'permissoes')) return err(403, 'Sem permissão');
      ['ativa', 'titulo', 'subtitulo', 'itens'].forEach(k => { if (b[k] !== undefined) db.paginaPublica[k] = b[k]; });
      save();
      log(user.id, 'Atualizou a página pública.');
      return ok({ ok: true, paginaPublica: db.paginaPublica });
    }

    return err(404, 'Rota não encontrada: ' + p);
  }

  /* ---------------- rotas públicas (sem login) ---------------- */
  function rotaPublica(metodo, p) {
    const db = D();
    if (p === '/publico') {
      const pp = db.paginaPublica;
      if (!pp.ativa) return ok({ ativa: false });
      const eventos = pp.itens.map(id => db.eventos.find(e => e.id === id)).filter(Boolean).map(e => {
        const ativs = db.atividades.filter(a => a.evento === e.id && a.visibilidade === 'aprovado');
        const mids = ativs.flatMap(a => a.midias.map(m => db.midias.find(x => x.id === m)))
          .filter(m => m && m.consentimentoOk && m.aprovadaPublico);
        const projetos = [...new Set(ativs.map(a => a.projeto).filter(Boolean))]
          .map(pid => db.projetos.find(pr => pr.id === pid)).filter(Boolean)
          .map(pr => ({ nome: pr.nome, resultado: pr.resultado }));
        return {
          id: e.id, titulo: e.nome, descricao: e.descricao, data: e.data,
          fotos: mids.filter(m => m.tipo === 'foto').map(m => ({ url: m.url, legenda: m.legenda })),
          videos: mids.filter(m => m.tipo === 'video').map(m => ({ legenda: m.legenda })),
          projetos
        };
      });
      const historias = db.historias.filter(h => h.publica).map(h => ({ id: h.id, titulo: h.titulo, capa: h.capa, introducao: h.introducao }));
      return ok({ ativa: true, escola: db.escola.nome, titulo: pp.titulo, subtitulo: pp.subtitulo, ano: pp.ano, eventos, historias });
    }
    if (p.startsWith('/publico/historia/')) {
      const h = db.historias.find(x => x.id === p.slice(18) && x.publica);
      return h ? ok(h) : err(404, 'História não encontrada ou não publicada');
    }
    return null;
  }

  /* ---------------- portal das famílias ---------------- */
  function feedDoResponsavel(db, r) {
    const alunos = (db.alunos || []).filter(a => r.alunos.includes(a.id));
    const turmasIds = [...new Set(alunos.map(a => a.turma))];
    const ativs = db.atividades
      .filter(a => a.visibilidade === 'aprovado' && turmasIds.includes(a.turma))
      .sort((a, c) => (c.data || '').localeCompare(a.data || ''));
    return { alunos, turmasIds, ativs };
  }

  function rotaFamilia(metodo, p, b, headers) {
    const db = D();
    const s = responsavelDaSessao(headers);
    if (s.erro) return err(401, s.erro);
    const resp = s.responsavel;

    if (p === '/familia/logout' && metodo === 'POST') {
      const sessoes = LDB.lerSessoes(); delete sessoes[headers['x-token-familia']]; LDB.gravarSessoes(sessoes);
      return ok({ ok: true });
    }

    if (p === '/familia/feed' && metodo === 'GET') {
      const { alunos, ativs } = feedDoResponsavel(db, resp);
      return ok({
        responsavel: { nome: resp.nome, parentesco: resp.parentesco },
        escola: db.escola.nome,
        filhos: alunos.map(a => ({ id: a.id, nome: a.nome, turma: (db.turmas.find(t => t.id === a.turma) || {}).nome || '' })),
        registros: ativs.map(a => {
          const mids = (a.midias || []).map(m => db.midias.find(x => x.id === m))
            .filter(m => m && m.tipo === 'foto' && m.url && m.consentimentoOk);
          const reacoes = db.reacoes.filter(x => x.atividade === a.id);
          return {
            id: a.id, titulo: a.titulo, data: a.data, resumo: a.resumo || a.observacao,
            turma: (db.turmas.find(t => t.id === a.turma) || {}).nome || 'Escola',
            projeto: (db.projetos.find(pr => pr.id === a.projeto) || {}).nome || null,
            fotos: mids.map(m => ({ url: m.url, legenda: m.legenda })),
            curtidas: reacoes.filter(x => x.tipo === 'curtida').length,
            euCurti: reacoes.some(x => x.tipo === 'curtida' && x.responsavel === resp.id),
            comentarios: reacoes.filter(x => x.tipo === 'comentario')
              .sort((x, y) => (x.quando || '').localeCompare(y.quando || ''))
              .map(c => ({ id: c.id, autor: c.autorNome, texto: c.texto, quando: c.quando, meu: c.responsavel === resp.id }))
          };
        }),
        newsletters: (db.newsletters || []).filter(n => n.publicada).sort((a, c) => (c.mes || '').localeCompare(a.mes || ''))
          .map(n => ({ id: n.id, mes: n.mes, titulo: n.titulo, html: n.html }))
      });
    }

    if (p === '/familia/curtir' && metodo === 'POST') {
      const { ativs } = feedDoResponsavel(db, resp);
      if (!ativs.some(a => a.id === b.atividade)) return err(403, 'Registro fora do seu portal');
      const ja = db.reacoes.find(x => x.tipo === 'curtida' && x.atividade === b.atividade && x.responsavel === resp.id);
      if (ja) db.reacoes = db.reacoes.filter(x => x !== ja);
      else db.reacoes.push({ id: uid('rc'), tipo: 'curtida', atividade: b.atividade, responsavel: resp.id, autorNome: resp.nome, quando: new Date().toISOString() });
      save();
      return ok({ curtidas: db.reacoes.filter(x => x.tipo === 'curtida' && x.atividade === b.atividade).length, euCurti: !ja });
    }

    if (p === '/familia/comentar' && metodo === 'POST') {
      const t = String(b.texto || '').trim().slice(0, 500);
      if (!t) return err(400, 'Escreva um comentário');
      const { ativs } = feedDoResponsavel(db, resp);
      if (!ativs.some(a => a.id === b.atividade)) return err(403, 'Registro fora do seu portal');
      const c = { id: uid('rc'), tipo: 'comentario', atividade: b.atividade, responsavel: resp.id, autorNome: resp.nome, texto: t, quando: new Date().toISOString() };
      db.reacoes.push(c); save();
      log('familia:' + resp.id, `Comentou no registro "${(db.atividades.find(a => a.id === b.atividade) || {}).titulo}".`);
      return ok({ id: c.id, autor: c.autorNome, texto: c.texto, quando: c.quando, meu: true });
    }

    if (p.startsWith('/familia/comentario/') && metodo === 'DELETE') {
      const c = db.reacoes.find(x => x.id === p.slice(20) && x.tipo === 'comentario');
      if (!c || c.responsavel !== resp.id) return err(403, 'Só é possível excluir o próprio comentário');
      db.reacoes = db.reacoes.filter(x => x !== c); save();
      return ok({ ok: true });
    }

    return err(404, 'Rota não encontrada: ' + p);
  }

  /* ---------------- newsletter (mesmo modelo do servidor) ---------------- */
  function montarNewsletter(db, mes) {
    const [anoS, mesS] = mes.split('-');
    const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][+mesS - 1];
    const ativs = db.atividades.filter(a => a.visibilidade === 'aprovado' && (a.data || '').startsWith(mes))
      .sort((a, c) => (a.data || '').localeCompare(c.data || ''));
    const eventos = db.eventos.filter(e => e.ano === +anoS && e.mes === +mesS);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fotoDe = a => (a.midias || []).map(m => db.midias.find(x => x.id === m))
      .find(m => m && m.tipo === 'foto' && m.url && m.consentimentoOk && m.aprovadaPublico);
    const nFotos = ativs.flatMap(a => (a.midias || []).map(m => db.midias.find(x => x.id === m))).filter(m => m && m.tipo === 'foto').length;

    const blocos = ativs.map(a => {
      const f = fotoDe(a);
      const turmaNome = (db.turmas.find(t => t.id === a.turma) || {}).nome || 'Escola';
      const projNome = (db.projetos.find(pr => pr.id === a.projeto) || {}).nome;
      const src = f ? (window.__ASSETS__[f.url] || f.url) : '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
      ${f ? `<tr><td><img src="${esc(src)}" alt="${esc(f.legenda || a.titulo)}" width="100%" style="display:block;max-height:280px;object-fit:cover"></td></tr>` : ''}
      <tr><td style="padding:16px 18px">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3B82C4;font-weight:700">${esc(turmaNome)}${projNome ? ' · ' + esc(projNome) : ''}</p>
        <h3 style="margin:0 0 6px;font-size:17px;color:#173F7A">${esc(a.titulo)}</h3>
        <p style="margin:0;font-size:13.5px;line-height:1.55;color:#334155">${esc(a.resumo || a.observacao || '')}</p>
      </td></tr></table>`;
    }).join('');

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#ffffff">
    <div style="background:#173F7A;padding:28px 24px;border-radius:14px 14px 0 0">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7FB3E8;font-weight:700">${esc(db.escola.nome)} · Memória Escola</p>
      <h1 style="margin:0;font-size:24px;color:#ffffff">Boletim das Famílias — ${nomeMes} de ${anoS}</h1>
      <p style="margin:8px 0 0;font-size:13px;color:#BFD7EE">${ativs.length} atividade${ativs.length === 1 ? '' : 's'} · ${eventos.length} evento${eventos.length === 1 ? '' : 's'} · ${nFotos} foto${nFotos === 1 ? '' : 's'} registradas neste mês</p>
    </div>
    <div style="padding:22px 20px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 14px 14px">
      ${eventos.length ? `<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;font-weight:700;margin:0 0 10px">Aconteceu em ${nomeMes}</p>
      <ul style="margin:0 0 20px;padding-left:18px;color:#334155;font-size:13.5px;line-height:1.7">${eventos.map(e => `<li><b>${esc(e.nome)}</b> — ${esc(e.descricao || e.categoria || '')}</li>`).join('')}</ul>` : ''}
      ${blocos || '<p style="color:#64748B;font-size:14px">Nenhuma atividade aprovada neste mês ainda.</p>'}
      <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #E2E8F0;font-size:11.5px;color:#94A3B8;text-align:center">
        Este boletim é montado apenas com registros aprovados pela coordenação e fotos com consentimento de imagem válido (LGPD).<br>${esc(db.escola.nome)} · ${esc(db.escola.cidade)}</p>
    </div></div>`;

    return { mes, titulo: `Boletim das Famílias — ${nomeMes} de ${anoS}`, html, totalAtividades: ativs.length, totalEventos: eventos.length, totalFotos: nFotos };
  }

  /* ---------------- utilidades de arquivo ---------------- */
  function lerComoDataURL(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('falha na leitura'));
      fr.readAsDataURL(file);
    });
  }
  /* confere os primeiros bytes: o conteúdo precisa ser mesmo uma imagem */
  function conferirAssinatura(file) {
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => {
        const b = new Uint8Array(fr.result);
        const jpg = b[0] === 0xFF && b[1] === 0xD8;
        const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
        const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
        const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
        res(jpg || png || gif || webp);
      };
      fr.onerror = () => res(false);
      fr.readAsArrayBuffer(file.slice(0, 16));
    });
  }

  return { rota, rotaPublica, PERM };
})();

window.API = API;

export { API };
