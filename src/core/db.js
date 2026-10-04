/* Local database (localStorage) — replaces a real backend */
import { SEED } from '../data/seed.js';

const CHAVE = 'memoria_escola_db_v1';
const CHAVE_SESSAO = 'memoria_escola_sessoes_v1';
let db = null;
let avisouEspaco = false;
let ultimaGravacao = null;

function clonarSemente() { return JSON.parse(JSON.stringify(SEED)); }

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) db = JSON.parse(bruto);
  } catch (e) { console.warn('[banco] estado local ilegível, recomeçando do zero.', e); }
  if (!db || !db.escola) { db = clonarSemente(); gravar(); }
  garantirEstruturas();
  return db;
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
    ultimaGravacao = new Date().toISOString();
    return true;
  } catch (e) {
    if (!avisouEspaco) {
      avisouEspaco = true;
      alert('O armazenamento do navegador ficou cheio (limite de ~5 MB).\n\nOs dados já salvos continuam intactos, mas novas fotos podem não ser gravadas. Use "Exportar backup" e, se precisar, remova fotos antigas.');
    }
    console.warn('[banco] falha ao gravar:', e);
    return false;
  }
}

function garantirEstruturas() {
  const padroes = {
    turmas: [], disciplinas: [], projetos: [], eventos: [], atividades: [], midias: [],
    alunos: [], historias: [], users: [], tagsGlobais: [], consentimentos: [], logs: [],
    responsaveis: [], reacoes: [], newsletters: []
  };
  let mudou = false;
  for (const k in padroes) if (!Array.isArray(db[k])) { db[k] = padroes[k]; mudou = true; }
  if (!db.paginaPublica) { db.paginaPublica = { ano: db.escola.anoAtual, ativa: false, itens: [], titulo: '', subtitulo: '' }; mudou = true; }
  if (mudou) gravar();
}

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

function hashSenha(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'lh1$' + h.toString(16) + '$' + s.length;
}

function conferirSenha(informada, guardada) {
  if (!guardada) return false;
  if (guardada.startsWith('lh1$')) return hashSenha(String(informada)) === guardada;
  return String(informada) === guardada;
}

function lerSessoes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || '{}'); } catch (e) { return {}; }
}

function gravarSessoes(s) {
  try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) { /* ignora */ }
}

function novoToken() {
  const a = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function log(quem, acao) {
  db.logs.unshift({ id: uid('log'), quando: new Date().toISOString(), quem, acao });
  db.logs = db.logs.slice(0, 300);
  gravar();
}

function exportar() {
  return JSON.stringify({ _sistema: 'Memória Escola', _versao: 1, _exportadoEm: new Date().toISOString(), dados: db }, null, 2);
}

function importar(texto) {
  const j = JSON.parse(texto);
  const novo = j && j.dados ? j.dados : j;
  if (!novo || !novo.escola || !Array.isArray(novo.atividades)) throw new Error('Arquivo de backup inválido.');
  db = novo; garantirEstruturas(); gravar();
}

function zerar() {
  db = clonarSemente(); gravar(); gravarSessoes({});
}

export const LDB = {
  get: () => db,
  carregar, gravar, uid, log,
  hashSenha, conferirSenha,
  lerSessoes, gravarSessoes, novoToken,
  exportar, importar, zerar,
  quando: () => ultimaGravacao
};
