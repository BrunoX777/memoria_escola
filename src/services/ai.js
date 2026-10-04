import { LDB } from '../core/db.js';

const get = () => LDB.get();

const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ---------- Curadoria de um registro de atividade ---------- */
function curarRegistro({ observacao = '', turmaId = null, projetoId = null, data = null, qtdFotos = 0, qtdVideos = 0 }) {
  const db = get();
  const texto = norm(observacao);
  const sug = { confianca: 'média', avisos: [] };

  // ----- Projeto -----
  let projeto = projetoId ? db.projetos.find(p => p.id === projetoId) : null;
  if (!projeto) {
    const genericas = ['projeto', 'sistema', 'escola', 'escolar', 'atividade', 'trabalho', 'aluno', 'alunos'];
    projeto = db.projetos.find(p => {
      const n = norm(p.nome);
      return texto.includes(n) || n.split(' ').filter(w => w.length > 4 && !genericas.includes(w)).some(w => texto.includes(w));
    }) || null;
    if (!projeto && turmaId) {
      const daTurma = db.projetos.filter(p => p.turma === turmaId);
      if (daTurma.length === 1) { projeto = daTurma[0]; sug.avisos.push('Projeto sugerido por ser o único da turma — confirme.'); }
      else if (daTurma.length > 1) {
        // sugere o projeto da turma com mais atividades registradas (contexto mais provável)
        const contagem = daTurma.map(p => ({ p, n: db.atividades.filter(a => a.projeto === p.id).length }));
        contagem.sort((a, b) => b.n - a.n);
        if (contagem[0].n > 0) { projeto = contagem[0].p; sug.avisos.push('Projeto sugerido com base no histórico recente da turma — confirme ou altere.'); }
      }
    }
  }

  // ----- Turma -----
  let turma = turmaId ? db.turmas.find(t => t.id === turmaId) : null;
  if (!turma) {
    turma = db.turmas.find(t => texto.includes(norm(t.nome))) || (projeto ? db.turmas.find(t => t.id === projeto.turma) : null);
  }

  // ----- Disciplina -----
  let disciplina = projeto ? db.disciplinas.find(d => d.id === projeto.disciplina) : null;
  if (!disciplina) {
    const mapa = { 'd-ds': ['sistema', 'programa', 'codigo', 'software', 'app', 'site', 'banco de dados', 'prototip', 'ds'], 'd-cie': ['ciencia', 'horta', 'planta', 'experimento', 'biologia'], 'd-mat': ['matematica', 'olimpiada', 'calculo'], 'd-hist': ['historia', 'museu'], 'd-art': ['arte', 'pintura', 'teatro', 'musica'], 'd-edf': ['esporte', 'jogo', 'futebol', 'atletismo'] };
    for (const [id, kws] of Object.entries(mapa)) if (kws.some(k => texto.includes(k))) { disciplina = db.disciplinas.find(d => d.id === id); break; }
  }

  // ----- Evento -----
  let evento = null;
  const mesData = data ? parseInt(data.slice(5, 7), 10) : null;
  evento = db.eventos.find(e => texto.includes(norm(e.nome))) || null;
  if (!evento) {
    const gatilhos = [
      [/apresentacao final|apresentaram os projetos|mostra/, 'e-mostra'],
      [/feira de tecnologia/, 'e-feira'], [/festa junina|quadrilha/, 'e-junina'],
      [/feira de ciencias/, 'e-cien'], [/maratona|semana da tecnologia/, 'e-semtec'],
      [/visita tecnica|visita a empresa/, 'e-visita']
    ];
    for (const [re, id] of gatilhos) if (re.test(texto)) { evento = db.eventos.find(e => e.id === id); break; }
  }
  if (!evento && mesData) {
    const doMes = db.eventos.filter(e => e.mes === mesData && e.ano === (data ? +data.slice(0, 4) : db.escola.anoAtual));
    if (doMes.length === 1) { evento = doMes[0]; sug.avisos.push('Evento sugerido pela proximidade de data — confirme.'); }
  }

  // ----- Categoria -----
  let categoria = 'Pedagógico';
  if (/tecnolog|sistema|program|robot|app|software|codigo|arduino|ia\b/.test(texto)) categoria = 'Tecnologia';
  else if (/sustent|horta|recicl|meio ambiente|planta/.test(texto)) categoria = 'Sustentabilidade';
  else if (/festa|quadrilha|danca|teatro|musica|cultural/.test(texto)) categoria = 'Cultural';
  else if (/olimpiada|competic|campeonato|torneio|maratona/.test(texto)) categoria = 'Competição';
  else if (projeto && projeto.categoria) categoria = projeto.categoria;

  // ----- Título -----
  let titulo = '';
  if (/apresentacao final|apresentaram/.test(texto)) titulo = 'Apresentação' + (projeto ? ` — ${projeto.nome}` : ' de projeto');
  else if (/prototip/.test(texto)) titulo = 'Apresentação de protótipos' + (projeto ? ` — ${projeto.nome}` : '');
  else if (/plantio|plantamos/.test(texto)) titulo = 'Plantio' + (projeto ? ` — ${projeto.nome}` : '');
  else if (/colheita/.test(texto)) titulo = 'Colheita' + (projeto ? ` — ${projeto.nome}` : '');
  else if (/visita/.test(texto)) titulo = 'Visita técnica' + (turma ? ` — ${turma.nome}` : '');
  else if (/maratona/.test(texto)) titulo = 'Maratona de programação';
  else titulo = (projeto ? `Atividade — ${projeto.nome}` : evento ? `Registro — ${evento.nome}` : 'Atividade pedagógica') ;

  // ----- Tags -----
  const tags = new Set();
  if (turma) tags.add(turma.nome);
  tags.add(String(data ? data.slice(0, 4) : db.escola.anoAtual));
  tags.add(categoria);
  if (disciplina) tags.add(disciplina.nome);
  if (evento) tags.add(evento.nome);
  if (/program|codigo|software/.test(texto)) tags.add('Programação');
  if (/prototip/.test(texto)) tags.add('Prototipação');
  if (/sustent|recicl|horta/.test(texto)) tags.add('Sustentabilidade');
  if (/apresenta/.test(texto)) tags.add('Apresentação');

  // ----- Resumo institucional (com base apenas no que foi informado) -----
  const quem = turma ? `os estudantes da turma ${turma.nome}` : 'os estudantes';
  let resumo;
  if (/apresentacao final|apresentaram/.test(texto)) resumo = `${cap(quem)} apresentaram ${projeto ? `o projeto "${projeto.nome}"` : 'os projetos desenvolvidos'}, demonstrando os resultados do trabalho realizado${evento ? ` durante o evento ${evento.nome}` : ''}.`;
  else if (/prototip/.test(texto)) resumo = `${cap(quem)} apresentaram os protótipos desenvolvidos${projeto ? ` no projeto "${projeto.nome}"` : ''}, demonstrando as funcionalidades planejadas.`;
  else resumo = `${cap(quem)} realizaram uma atividade${projeto ? ` do projeto "${projeto.nome}"` : ''}${evento ? ` vinculada ao evento ${evento.nome}` : ''}${disciplina ? `, na disciplina de ${disciplina.nome}` : ''}. ${observacao ? 'Registro do professor: "' + observacao + '"' : ''}`.trim();

  // ----- Participantes (nunca identifica em foto — apenas sugere pela turma) -----
  let participantes = [];
  if (turma) {
    participantes = db.alunos.filter(a => a.turma === turma.id).map(a => ({ id: a.id, nome: a.nome, consentimento: a.consentimentoImagem }));
    sug.avisos.push('Participantes sugeridos apenas com base na turma. A IA não identifica alunos em fotos — confirme manualmente.');
  }
  const semConsent = participantes.filter(p => p.consentimento !== 'autorizado');
  if ((qtdFotos > 0 || qtdVideos > 0) && semConsent.length) {
    sug.avisos.push(`Atenção: ${semConsent.length} aluno(s) da turma sem consentimento de imagem autorizado (${semConsent.map(p => p.nome).join(', ')}). O conteúdo permanecerá privado até revisão.`);
  }

  sug.confianca = (projeto && turma) ? 'alta' : (projeto || turma || evento) ? 'média' : 'baixa';

  return {
    ...sug,
    titulo,
    projeto: projeto ? { id: projeto.id, nome: projeto.nome } : null,
    turma: turma ? { id: turma.id, nome: turma.nome } : null,
    disciplina: disciplina ? { id: disciplina.id, nome: disciplina.nome } : null,
    evento: evento ? { id: evento.id, nome: evento.nome } : null,
    categoria,
    tags: [...tags],
    resumo,
    descricaoInstitucional: resumo + ' A atividade integra o acervo de memória institucional da escola.',
    palavrasChave: [...tags].map(norm),
    participantes
  };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- Busca inteligente (linguagem natural) ---------- */
function interpretarBusca(q) {
  const db = get();
  const texto = norm(q);
  const f = {};
  const anoM = texto.match(/\b(20\d{2})\b/); if (anoM) f.ano = +anoM[1];
  const meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  meses.forEach((m, i) => { if (texto.includes(m)) f.mes = i + 1; });
  db.turmas.forEach(t => { if (texto.includes(norm(t.nome))) f.turma = t.id; });
  db.disciplinas.forEach(d => { if (texto.includes(norm(d.nome))) f.disciplina = d.id; });
  if (!f.disciplina && /matematica/.test(texto)) f.disciplina = 'd-mat';
  if (!f.disciplina && /ciencia/.test(texto)) f.disciplina = 'd-cie';
  db.eventos.forEach(e => { if (texto.includes(norm(e.nome))) f.evento = e.id; });
  if (/foto/.test(texto)) f.tipoMidia = 'foto';
  if (/video/.test(texto)) f.tipoMidia = 'video';
  ['robotica','sustentabilidade','tecnologia','cultural','competicao','programacao'].forEach(c => { if (texto.includes(c)) f.tema = c; });
  db.users.forEach(u => { if (texto.includes(norm(u.nome))) f.professor = u.id; });
  // termos residuais
  f.termos = texto.replace(/projetos?|fotos?|videos?|eventos?|tudo|que|fizemos|envolvendo|da|de|do|em|na|no|escola|turma|o|a/g, ' ').split(/\s+/).filter(w => w.length > 3);
  return f;
}

/* ---------- Criar história a partir de registros ---------- */
function gerarHistoria({ registroIds, tituloBase }) {
  const db = get();
  const regs = db.atividades.filter(a => registroIds.includes(a.id)).sort((a, b) => a.data.localeCompare(b.data));
  if (!regs.length) return null;
  const turmas = [...new Set(regs.map(r => r.turma).filter(Boolean))].map(id => db.turmas.find(t => t.id === id));
  const anos = [...new Set(regs.map(r => r.data.slice(0, 4)))];
  const turmaNome = turmas.length === 1 ? turmas[0].nome : 'Nossa escola';
  const ano = anos[anos.length - 1];
  const titulo = tituloBase || `${turmaNome} — Um ano construindo memórias (${ano})`;
  const midias = regs.flatMap(r => r.midias.map(mid => db.midias.find(m => m.id === mid)).filter(Boolean));
  const capa = (midias.find(m => m.tipo === 'foto' && m.url) || {}).url || '/assets/foto-mostra.jpg';
  const projetos = [...new Set(regs.map(r => r.projeto).filter(Boolean))].map(id => db.projetos.find(p => p.id === id));

  const secoes = regs.map(r => {
    const m = r.midias.map(mid => db.midias.find(x => x.id === mid)).find(x => x && x.tipo === 'foto' && x.url);
    const dataFmt = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { titulo: r.titulo, texto: `${cap(dataFmt)} — ${r.resumo || r.observacao}`, midia: m ? m.url : null };
  });

  const destaques = [];
  projetos.forEach(p => { if (p.resultado) destaques.push(`${p.nome}: ${p.resultado}`); });
  const nFotos = midias.filter(m => m.tipo === 'foto').length;
  const nVideos = midias.filter(m => m.tipo === 'video').length;
  if (nFotos) destaques.push(`${nFotos} fotos registradas ao longo do período`);
  if (!destaques.length) destaques.push(`${regs.length} atividades registradas ao longo do período`);

  return {
    titulo, ano: +ano, turma: turmas.length === 1 ? turmas[0].id : null, capa,
    introducao: `Em ${ano}, ${turmaNome === 'Nossa escola' ? 'nossa escola' : `a turma ${turmaNome}`} viveu um período de aprendizado e conquistas. Esta história reúne ${regs.length} registros reais${projetos.length ? `, ${projetos.length} projeto(s)` : ''}${nFotos ? `, ${nFotos} fotos` : ''}${nVideos ? ` e ${nVideos} vídeos` : ''}, preservados na memória institucional da escola.`,
    registros: regs.map(r => r.id), secoes, destaques,
    encerramento: `Cada atividade registrada aqui deixou de ser apenas uma lembrança e passou a fazer parte da história viva da nossa escola. ${ano} ficará guardado — em imagens, palavras e conquistas.`,
    avisos: ['História gerada apenas com base nos registros selecionados. Revise antes de publicar.', 'Apenas mídias com consentimento e aprovação serão exibidas na versão pública.']
  };
}

/* ---------- Conteúdo de marketing ---------- */
function gerarConteudo({ tipo, origem }) {
  // origem: { titulo, resumo, turma, data, evento, projeto, escola }
  const o = origem;
  const base = o.resumo || o.descricao || '';
  const t = {
    instagram: {
      titulo: 'Legenda para Instagram',
      texto: `✨ ${o.titulo} ✨\n\n${base}\n\n${o.turma ? `Parabéns, ${o.turma}! 👏 ` : ''}Cada projeto é uma nova página na história da nossa escola. 📚💙\n\n#${(o.escola || 'NossaEscola').replace(/\s/g, '')} #EducaçãoQueTransforma ${o.tags ? o.tags.slice(0, 4).map(x => '#' + x.replace(/[\sº°]/g, '')).join(' ') : ''}`
    },
    site: {
      titulo: 'Notícia para o site',
      texto: `${o.titulo}\n\n${base}\n\n${o.turma ? `A atividade envolveu a turma ${o.turma}` : 'A atividade envolveu estudantes da escola'}${o.data ? `, em ${new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}. Iniciativas como esta reforçam o compromisso da escola com uma educação prática, significativa e conectada com o mundo real.\n\nMais registros desta e de outras atividades estão disponíveis no acervo de memória institucional da escola.`
    },
    newsletter: {
      titulo: 'Versão para newsletter',
      texto: `Prezadas famílias,\n\nÉ com alegria que compartilhamos mais um momento marcante do nosso ano letivo: ${o.titulo.toLowerCase().startsWith('a') ? '' : 'a atividade '}"${o.titulo}".\n\n${base}\n\nAgradecemos às famílias pelo apoio contínuo e convidamos todos a acompanharem os próximos eventos da escola.\n\nAtenciosamente,\nEquipe ${o.escola || 'da Escola'}`
    },
    apresentacao: {
      titulo: 'Resumo para slides',
      texto: `SLIDE 1 — ${o.titulo}\n${o.turma ? '• Turma: ' + o.turma : ''}${o.data ? '\n• Data: ' + new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''}${o.projeto ? '\n• Projeto: ' + o.projeto : ''}\n\nSLIDE 2 — O que foi feito\n• ${base}\n\nSLIDE 3 — Evidências\n• Fotos e vídeos disponíveis no acervo\n\nSLIDE 4 — Próximos passos\n• (completar com informações da equipe)`
    },
    matricula: {
      titulo: 'Conteúdo para campanha de matrícula',
      texto: `Na nossa escola, aprender é fazer.\n\n${base}\n\nEssa é apenas uma entre as muitas experiências reais que nossos estudantes vivem todos os anos: projetos, feiras, competições e atividades que preparam para a vida.\n\n📅 Matrículas abertas. Venha conhecer a escola onde cada aluno constrói a própria história.\n\n(Conteúdo baseado em registros reais do acervo — revise antes de publicar.)`
    }
  };
  const r = t[tipo];
  if (!r) return null;
  return { ...r, aviso: 'Texto gerado a partir dos registros reais. Nenhuma informação foi inventada. Edite antes de publicar.' };
}

const AI = { curarRegistro, interpretarBusca, gerarHistoria, gerarConteudo, norm };

export { AI };
