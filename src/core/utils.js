/* Shared utilities used across the app */
export const $ = s => document.querySelector(s);
export const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtData = d => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';
export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export const PAPEIS = { professor: 'Professor', coordenacao: 'Coordenação', marketing: 'Marketing', direcao: 'Direção', visualizador: 'Visualizador' };
export const VIS = { privado: ['Privado', 'b-gray'], aguardando: ['Em análise', 'b-warn'], aprovado: ['Aprovado para publicação', 'b-ok'] };
