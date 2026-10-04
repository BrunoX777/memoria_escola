import { LDB } from '../core/db.js';

const RELATORIO = (function () {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const AZUL = '#173F7A', AZUL2 = '#245A91', AZUL3 = '#3B82C4';

  /* ---------------- coleta (igual a relatorio.js) ---------------- */
  function coletar(db, ano) {
    const mesAtual = new Date().toISOString().slice(0, 7);
    const ativsAno = db.atividades.filter(a => +a.data.slice(0, 4) === ano);
    const porMes = {};
    ativsAno.forEach(a => { const m = +a.data.slice(5, 7); porMes[m] = (porMes[m] || 0) + 1; });
    return {
      ano, escola: db.escola,
      geradoEm: new Date().toLocaleString('pt-BR'),
      stats: [
        ['Registros este mês', db.atividades.filter(a => (a.criadoEm || '').startsWith(mesAtual)).length],
        ['Projetos', db.projetos.length],
        ['Eventos', db.eventos.length],
        ['Fotos', db.midias.filter(m => m.tipo === 'foto').length],
        ['Vídeos', db.midias.filter(m => m.tipo === 'video').length],
        ['Turmas', db.turmas.length],
        ['Professores', db.users.filter(u => u.papel === 'professor').length],
        ['Histórias', db.historias.length]
      ],
      porMes,
      pendencias: [
        ['Projetos sem descrição', db.projetos.filter(p => !p.descricao).length],
        ['Eventos sem fotos', db.eventos.filter(e => !db.atividades.some(a => a.evento === e.id && a.midias.length)).length],
        ['Registros aguardando classificação', db.atividades.filter(a => a.status === 'pendente').length],
        ['Conteúdos aguardando aprovação', db.atividades.filter(a => a.visibilidade === 'aguardando').length],
        ['Registros com problemas de consentimento', db.midias.filter(m => !m.consentimentoOk).length]
      ],
      projetos: db.projetos.map(p => ({
        nome: p.nome, ano: p.ano,
        turma: (db.turmas.find(t => t.id === p.turma) || {}).nome || '—',
        categoria: p.categoria || '—',
        status: p.status === 'concluido' ? 'Concluído' : 'Em andamento',
        registros: db.atividades.filter(a => a.projeto === p.id).length
      })),
      eventos: db.eventos.filter(e => e.ano === ano).sort((a, b) => a.mes - b.mes).map(e => ({
        nome: e.nome, mes: MESES[e.mes - 1], categoria: e.categoria || '—',
        registros: db.atividades.filter(a => a.evento === e.id).length
      })),
      registrosAno: ativsAno.length
    };
  }

  /* ============================================================
     PDF — escritor mínimo (Helvetica, sem dependências)
     ============================================================ */
  function novoPDF() {
    const paginas = [];
    let atual = null;
    const A = { larg: 595.28, alt: 841.89 };

    function novaPagina() { atual = []; paginas.push(atual); return atual; }
    novaPagina();

    const latin = s => String(s === null || s === undefined ? '' : s)
      .normalize('NFC')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
      .split('').map(ch => ch.charCodeAt(0) < 256 ? ch : '?').join('');
    const escPdf = s => latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const hex2rgb = h => {
      const n = parseInt(h.replace('#', ''), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    /* largura aproximada de Helvetica, suficiente para centralizar rótulos */
    const larguraTexto = (txt, tam, bold) => latin(txt).length * tam * (bold ? 0.56 : 0.5);

    const api = {
      larg: A.larg, alt: A.alt,
      addPage() { novaPagina(); return api; },
      rect(x, y, w, h, cor) {
        const [r, g, b] = hex2rgb(cor);
        atual.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(2)} ${(A.alt - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
        return api;
      },
      text(txt, x, y, o = {}) {
        const tam = o.size || 10, cor = o.cor || '#000000', bold = !!o.bold;
        const [r, g, b] = hex2rgb(cor);
        let px = x;
        if (o.width && o.align === 'center') px = x + (o.width - larguraTexto(txt, tam, bold)) / 2;
        let t = latin(txt);
        if (o.width && o.ellipsis) {
          while (larguraTexto(t, tam, bold) > o.width && t.length > 3) t = t.slice(0, -2) + '…'.replace('…', '.');
        }
        atual.push(`BT /${bold ? 'F2' : 'F1'} ${tam} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${px.toFixed(2)} ${(A.alt - y - tam).toFixed(2)} Td (${escPdf(t)}) Tj ET`);
        return api;
      },
      /* texto com quebra automática; devolve a altura usada */
      paragrafo(txt, x, y, larg, o = {}) {
        const tam = o.size || 10, lh = o.lh || tam * 1.45;
        const palavras = latin(txt).split(/\s+/);
        let linha = '', usado = 0;
        for (const w of palavras) {
          const tent = linha ? linha + ' ' + w : w;
          if (larguraTexto(tent, tam, o.bold) > larg && linha) {
            api.text(linha, x, y + usado, o); usado += lh; linha = w;
          } else linha = tent;
        }
        if (linha) { api.text(linha, x, y + usado, o); usado += lh; }
        return usado;
      },
      blob() {
        const objetos = [];
        const add = (s) => { objetos.push(s); return objetos.length; };
        const nPaginas = paginas.length;
        const idsConteudo = [], idsPagina = [];
        // reserva: 1 catálogo, 2 pages, 3 e 4 fontes
        const catalogo = 1, pages = 2, fonte1 = 3, fonte2 = 4;
        let proximo = 5;
        paginas.forEach(() => { idsPagina.push(proximo++); idsConteudo.push(proximo++); });

        const corpo = {};
        corpo[catalogo] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
        corpo[pages] = `<< /Type /Pages /Kids [${idsPagina.map(i => i + ' 0 R').join(' ')}] /Count ${nPaginas} >>`;
        corpo[fonte1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        corpo[fonte2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        paginas.forEach((cmds, i) => {
          const fluxo = cmds.join('\n');
          corpo[idsPagina[i]] = `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${A.larg} ${A.alt}] ` +
            `/Resources << /Font << /F1 ${fonte1} 0 R /F2 ${fonte2} 0 R >> >> /Contents ${idsConteudo[i]} 0 R >>`;
          corpo[idsConteudo[i]] = { fluxo };
        });

        let saida = '%PDF-1.4\n';
        const offsets = {};
        const total = proximo - 1;
        for (let i = 1; i <= total; i++) {
          offsets[i] = saida.length;
          const o = corpo[i];
          if (typeof o === 'object' && o.fluxo !== undefined) {
            saida += `${i} 0 obj\n<< /Length ${o.fluxo.length} >>\nstream\n${o.fluxo}\nendstream\nendobj\n`;
          } else {
            saida += `${i} 0 obj\n${o}\nendobj\n`;
          }
        }
        const inicioXref = saida.length;
        saida += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
        for (let i = 1; i <= total; i++) saida += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        saida += `trailer\n<< /Size ${total + 1} /Root ${catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

        const bytes = new Uint8Array(saida.length);
        for (let i = 0; i < saida.length; i++) bytes[i] = saida.charCodeAt(i) & 0xFF;
        return new Blob([bytes], { type: 'application/pdf' });
      }
    };
    return api;
  }

  function gerarPDF(d) {
    const doc = novoPDF();
    const L = 56, CW = doc.larg - L * 2;

    /* capa */
    doc.rect(0, 0, doc.larg, 250, AZUL);
    doc.text('Relatório institucional', L, 110, { size: 28, bold: true, cor: '#FFFFFF' });
    doc.text(`Memória Escola — ${d.escola.nome} · ${d.ano}`, L, 158, { size: 15, cor: '#FFFFFF' });
    doc.text(`${d.escola.cidade} · gerado em ${d.geradoEm}`, L, 188, { size: 9.5, cor: '#BFD7EE' });

    let y = 292;
    doc.text('Memória institucional em números', L, y, { size: 15, bold: true, cor: AZUL }); y += 30;
    const bw = (CW - 3 * 12) / 4, bh = 64;
    d.stats.forEach(([rot, n], i) => {
      const col = i % 4, lin = Math.floor(i / 4);
      const x = L + col * (bw + 12), yy = y + lin * (bh + 12);
      doc.rect(x, yy, bw, bh, '#EAF2F8');
      doc.text(String(n), x + 12, yy + 12, { size: 20, bold: true, cor: AZUL });
      doc.paragrafo(rot, x + 12, yy + 40, bw - 20, { size: 8, cor: '#475569', lh: 10 });
    });
    y += 2 * (bh + 12) + 14;

    /* gráfico por mês */
    doc.text(`Evolução do acervo — registros por mês (${d.ano})`, L, y, { size: 15, bold: true, cor: AZUL }); y += 28;
    const gh = 110, colW = CW / 12, maxV = Math.max(1, ...Object.values(d.porMes));
    doc.rect(L, y + gh, CW, 0.8, '#CBD5E1');
    for (let m = 1; m <= 12; m++) {
      const v = d.porMes[m] || 0;
      const h = Math.round((v / maxV) * (gh - 22));
      const x = L + (m - 1) * colW + colW * 0.22;
      const w = colW * 0.56;
      if (v) {
        doc.rect(x, y + gh - h, w, h, AZUL3);
        doc.text(String(v), L + (m - 1) * colW, y + gh - h - 12, { size: 8, bold: true, cor: AZUL, width: colW, align: 'center' });
      }
      doc.text(MESES[m - 1].slice(0, 3), L + (m - 1) * colW, y + gh + 6, { size: 7.5, cor: '#64748B', width: colW, align: 'center' });
    }
    y += gh + 38;

    /* pendências */
    doc.text('Pendências', L, y, { size: 15, bold: true, cor: AZUL }); y += 24;
    d.pendencias.forEach(([rot, n]) => {
      doc.rect(L, y, CW, 22, '#F1F5F9');
      doc.text(String(n), L + 12, y + 6, { size: 10, bold: true, cor: AZUL });
      doc.text(rot, L + 40, y + 6.5, { size: 9.5, cor: '#334155' });
      y += 27;
    });

    /* projetos */
    doc.addPage();
    doc.text('Projetos', L, 56, { size: 16, bold: true, cor: AZUL });
    y = 92;
    const cols = [190, 60, 90, 95, 78];
    doc.rect(L, y, CW, 22, AZUL2);
    let x = L + 8;
    ['Projeto', 'Ano', 'Turma', 'Categoria', 'Registros'].forEach((h, i) => { doc.text(h, x, y + 6, { size: 9, bold: true, cor: '#FFFFFF' }); x += cols[i]; });
    y += 22;
    d.projetos.forEach((p, i) => {
      if (y > 760) { doc.addPage(); y = 56; }
      if (i % 2) doc.rect(L, y, CW, 20, '#F8FAFC');
      x = L + 8;
      [p.nome, p.ano, p.turma, p.categoria, p.registros].forEach((v, j) => {
        doc.text(String(v), x, y + 6, { size: 8.5, cor: '#334155', width: cols[j] - 12, ellipsis: true });
        x += cols[j];
      });
      y += 20;
    });

    /* eventos */
    y += 26;
    if (y > 680) { doc.addPage(); y = 56; }
    doc.text(`Eventos de ${d.ano}`, L, y, { size: 16, bold: true, cor: AZUL }); y += 30;
    const cols2 = [230, 90, 110, 83];
    doc.rect(L, y, CW, 22, AZUL2);
    x = L + 8;
    ['Evento', 'Mês', 'Categoria', 'Regs.'].forEach((h, i) => { doc.text(h, x, y + 6, { size: 9, bold: true, cor: '#FFFFFF' }); x += cols2[i]; });
    y += 22;
    d.eventos.forEach((e, i) => {
      if (y > 760) { doc.addPage(); y = 56; }
      if (i % 2) doc.rect(L, y, CW, 20, '#F8FAFC');
      x = L + 8;
      [e.nome, e.mes, e.categoria, e.registros].forEach((v, j) => {
        doc.text(String(v), x, y + 6, { size: 8.5, cor: '#334155', width: cols2[j] - 12, ellipsis: true });
        x += cols2[j];
      });
      y += 20;
    });

    doc.text(`Memória Escola · ${d.escola.nome} · relatório gerado em ${d.geradoEm}`, L, 800, { size: 8, cor: '#94A3B8', width: CW, align: 'center' });
    return doc.blob();
  }

  /* ============================================================
     ZIP mínimo (método "armazenado") para .docx e .pptx
     ============================================================ */
  const TAB_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TAB_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(arquivos) {
    const cod = new TextEncoder();
    const partes = [], central = [];
    let deslocamento = 0;
    for (const { nome, texto } of arquivos) {
      const dados = cod.encode(texto);
      const nomeB = cod.encode(nome);
      const crc = crc32(dados);
      const loc = new Uint8Array(30 + nomeB.length);
      const dv = new DataView(loc.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, dados.length, true); dv.setUint32(22, dados.length, true);
      dv.setUint16(26, nomeB.length, true); dv.setUint16(28, 0, true);
      loc.set(nomeB, 30);
      partes.push(loc, dados);
      const cen = new Uint8Array(46 + nomeB.length);
      const dc = new DataView(cen.buffer);
      dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true);
      dc.setUint16(8, 0, true); dc.setUint16(10, 0, true); dc.setUint16(12, 0, true); dc.setUint16(14, 0, true);
      dc.setUint32(16, crc, true); dc.setUint32(20, dados.length, true); dc.setUint32(24, dados.length, true);
      dc.setUint16(28, nomeB.length, true);
      dc.setUint32(42, deslocamento, true);
      cen.set(nomeB, 46);
      central.push(cen);
      deslocamento += loc.length + dados.length;
    }
    const tamCentral = central.reduce((s, c) => s + c.length, 0);
    const fim = new Uint8Array(22);
    const df = new DataView(fim.buffer);
    df.setUint32(0, 0x06054b50, true);
    df.setUint16(8, arquivos.length, true); df.setUint16(10, arquivos.length, true);
    df.setUint32(12, tamCentral, true); df.setUint32(16, deslocamento, true);
    return new Blob([...partes, ...central, fim]);
  }
  const x = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  /* ============================================================ WORD */
  function gerarDOCX(d) {
    const par = (txt, o = {}) =>
      `<w:p><w:pPr>${o.estilo ? `<w:pStyle w:val="${o.estilo}"/>` : ''}<w:spacing w:before="${o.antes || 60}" w:after="${o.depois || 60}"/></w:pPr>` +
      `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}<w:sz w:val="${(o.size || 11) * 2}"/><w:color w:val="${(o.cor || '333333').replace('#', '')}"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>` +
      `<w:t xml:space="preserve">${x(txt)}</w:t></w:r></w:p>`;

    const celula = (txt, o = {}) =>
      `<w:tc><w:tcPr><w:tcW w:w="${o.w || 2000}" w:type="dxa"/>${o.fundo ? `<w:shd w:val="clear" w:fill="${o.fundo}"/>` : ''}</w:tcPr>` +
      par(txt, { size: o.size || 9.5, bold: o.bold, cor: o.cor || '334155', antes: 20, depois: 20 }) + '</w:tc>';

    const tabela = (cabecalho, linhas, larguras) =>
      '<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`).join('') +
      '</w:tblBorders></w:tblPr>' +
      `<w:tr>${cabecalho.map((h, i) => celula(h, { w: larguras[i], bold: true, cor: 'FFFFFF', fundo: '245A91' })).join('')}</w:tr>` +
      linhas.map(l => `<w:tr>${l.map((c, i) => celula(String(c), { w: larguras[i] })).join('')}</w:tr>`).join('') +
      '</w:tbl>';

    const corpo =
      par('Relatório institucional', { size: 24, bold: true, cor: '173F7A', depois: 40 }) +
      par(`Memória Escola — ${d.escola.nome} · ${d.ano}`, { size: 13, cor: '245A91' }) +
      par(`${d.escola.cidade} · gerado em ${d.geradoEm}`, { size: 9, cor: '64748B', depois: 240 }) +
      par('Memória institucional em números', { size: 15, bold: true, cor: '173F7A', antes: 240 }) +
      tabela(['Indicador', 'Total'], d.stats.map(([r, n]) => [r, n]), [6500, 2800]) +
      par(`Registros de ${d.ano} por mês`, { size: 15, bold: true, cor: '173F7A', antes: 320 }) +
      tabela(['Mês', 'Registros'], MESES.map((m, i) => [m, d.porMes[i + 1] || 0]), [6500, 2800]) +
      par('Pendências', { size: 15, bold: true, cor: '173F7A', antes: 320 }) +
      tabela(['Pendência', 'Total'], d.pendencias.map(([r, n]) => [r, n]), [6500, 2800]) +
      par('Projetos', { size: 15, bold: true, cor: '173F7A', antes: 320 }) +
      tabela(['Projeto', 'Ano', 'Turma', 'Categoria', 'Registros'],
        d.projetos.map(p => [p.nome, p.ano, p.turma, p.categoria, p.registros]), [3400, 900, 1700, 1900, 1400]) +
      par(`Eventos de ${d.ano}`, { size: 15, bold: true, cor: '173F7A', antes: 320 }) +
      tabela(['Evento', 'Mês', 'Categoria', 'Registros'],
        d.eventos.map(e => [e.nome, e.mes, e.categoria, e.registros]), [4200, 1700, 2000, 1400]) +
      par(`Memória Escola · ${d.escola.nome} · relatório gerado em ${d.geradoEm}`, { size: 8, cor: '94A3B8', antes: 320 });

    const arquivos = [
      { nome: '[Content_Types].xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { nome: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { nome: 'word/_rels/document.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
      { nome: 'word/document.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + corpo + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>' }
    ];
    return zip(arquivos);
  }

  /* ============================================================ POWERPOINT */
  function gerarPPTX(d) {
    const EMU = 9525; // 1 px = 9525 EMU
    const LARG = 9144000, ALT = 6858000; // 10 x 7,5 polegadas (4:3 padrão)

    function caixa(id, txt, { xp, yp, wp, hp, size, bold, cor, align }) {
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="t${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
        `<p:spPr><a:xfrm><a:off x="${Math.round(xp * EMU)}" y="${Math.round(yp * EMU)}"/><a:ext cx="${Math.round(wp * EMU)}" cy="${Math.round(hp * EMU)}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
        `<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
        String(txt).split('\n').map(linha =>
          `<a:p><a:pPr algn="${align || 'l'}"/><a:r><a:rPr lang="pt-BR" sz="${Math.round((size || 18) * 100)}" b="${bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${(cor || '334155').replace('#', '')}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${x(linha)}</a:t></a:r></a:p>`
        ).join('') + '</p:txBody></p:sp>';
    }
    function fundo(id, cor, { xp, yp, wp, hp }) {
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="r${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
        `<p:spPr><a:xfrm><a:off x="${Math.round(xp * EMU)}" y="${Math.round(yp * EMU)}"/><a:ext cx="${Math.round(wp * EMU)}" cy="${Math.round(hp * EMU)}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${cor.replace('#', '')}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
        `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
    }
    const slide = (formas) =>
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      formas + '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>';

    const slides = [];
    /* 1 — capa */
    slides.push(slide(
      fundo(2, AZUL, { xp: 0, yp: 0, wp: 960, hp: 720 }) +
      caixa(3, 'Relatório institucional', { xp: 60, yp: 230, wp: 840, hp: 80, size: 40, bold: true, cor: '#FFFFFF' }) +
      caixa(4, `Memória Escola — ${d.escola.nome} · ${d.ano}`, { xp: 60, yp: 320, wp: 840, hp: 40, size: 20, cor: '#BFD7EE' }) +
      caixa(5, `${d.escola.cidade} · gerado em ${d.geradoEm}`, { xp: 60, yp: 370, wp: 840, hp: 30, size: 12, cor: '#7FB3E8' })
    ));
    /* 2 — números */
    let formas = fundo(2, '#FFFFFF', { xp: 0, yp: 0, wp: 960, hp: 720 }) +
      caixa(3, 'Memória institucional em números', { xp: 60, yp: 50, wp: 840, hp: 50, size: 28, bold: true, cor: AZUL });
    let id = 10;
    d.stats.forEach(([rot, n], i) => {
      const col = i % 4, lin = Math.floor(i / 4);
      const xp = 60 + col * 215, yp = 150 + lin * 160;
      formas += fundo(id++, '#EAF2F8', { xp, yp, wp: 195, hp: 130 });
      formas += caixa(id++, String(n), { xp: xp + 16, yp: yp + 20, wp: 165, hp: 50, size: 32, bold: true, cor: AZUL });
      formas += caixa(id++, rot, { xp: xp + 16, yp: yp + 74, wp: 165, hp: 45, size: 11, cor: '#475569' });
    });
    slides.push(slide(formas));
    /* 3 — pendências */
    slides.push(slide(
      caixa(2, 'Pendências', { xp: 60, yp: 50, wp: 840, hp: 50, size: 28, bold: true, cor: AZUL }) +
      caixa(3, d.pendencias.map(([r, n]) => `${n} — ${r}`).join('\n'), { xp: 60, yp: 140, wp: 840, hp: 400, size: 17, cor: '#334155' })
    ));
    /* 4 — projetos */
    slides.push(slide(
      caixa(2, 'Projetos', { xp: 60, yp: 50, wp: 840, hp: 50, size: 28, bold: true, cor: AZUL }) +
      caixa(3, (d.projetos.length ? d.projetos.slice(0, 14).map(p => `${p.nome} · ${p.turma} · ${p.status} · ${p.registros} registro(s)`).join('\n') : 'Nenhum projeto cadastrado.'),
        { xp: 60, yp: 130, wp: 840, hp: 480, size: 14, cor: '#334155' })
    ));
    /* 5 — eventos */
    slides.push(slide(
      caixa(2, `Eventos de ${d.ano}`, { xp: 60, yp: 50, wp: 840, hp: 50, size: 28, bold: true, cor: AZUL }) +
      caixa(3, (d.eventos.length ? d.eventos.slice(0, 14).map(e => `${e.mes} · ${e.nome} · ${e.registros} registro(s)`).join('\n') : 'Nenhum evento cadastrado para o ano.'),
        { xp: 60, yp: 130, wp: 840, hp: 480, size: 14, cor: '#334155' })
    ));
    /* 6 — encerramento */
    slides.push(slide(
      fundo(2, AZUL2, { xp: 0, yp: 0, wp: 960, hp: 720 }) +
      caixa(3, `${d.registrosAno} registros preservados em ${d.ano}`, { xp: 60, yp: 280, wp: 840, hp: 70, size: 30, bold: true, cor: '#FFFFFF' }) +
      caixa(4, `${d.escola.nome} · Memória Escola`, { xp: 60, yp: 370, wp: 840, hp: 40, size: 16, cor: '#BFD7EE' })
    ));

    const n = slides.length;
    const idsSlide = slides.map((_, i) => 255 + i + 1);
    const arquivos = [
      { nome: '[Content_Types].xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
        '</Types>' },
      { nome: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
      { nome: 'ppt/presentation.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${idsSlide[i]}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst>` +
        `<p:sldSz cx="${LARG}" cy="${ALT}"/><p:notesSz cx="${ALT}" cy="${LARG}"/></p:presentation>` },
      { nome: 'ppt/_rels/presentation.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
        slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
        '</Relationships>' },
      { nome: 'ppt/slideMasters/slideMaster1.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>' },
      { nome: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>' },
      { nome: 'ppt/slideLayouts/slideLayout1.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
        '<p:cSld name="Em branco"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>' },
      { nome: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' },
      { nome: 'ppt/theme/theme1.xml', texto: temaPadrao() }
    ];
    slides.forEach((s, i) => {
      arquivos.push({ nome: `ppt/slides/slide${i + 1}.xml`, texto: s });
      arquivos.push({ nome: `ppt/slides/_rels/slide${i + 1}.xml.rels`, texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>' });
    });
    return zip(arquivos);
  }

  function temaPadrao() {
    const cores = ['173F7A', '245A91', '3B82C4', '6366F1', '64748B', '94A3B8'];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Memória Escola">' +
      '<a:themeElements><a:clrScheme name="Memória Escola">' +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="173F7A"/></a:dk2><a:lt2><a:srgbClr val="EAF2F8"/></a:lt2>' +
      cores.map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join('') +
      '<a:hlink><a:srgbClr val="245A91"/></a:hlink><a:folHlink><a:srgbClr val="6366F1"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="Calibri"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="Padrão"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>' +
      '</a:themeElements></a:theme>';
  }

  /* ============================================================ API */
  async function gerar(db, ano, formato) {
    const d = coletar(db, ano);
    const base = `relatorio-memoria-escola-${ano}`;
    if (formato === 'pdf') return { blob: gerarPDF(d), mime: 'application/pdf', nome: base + '.pdf' };
    if (formato === 'docx') return { blob: gerarDOCX(d), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nome: base + '.docx' };
    if (formato === 'pptx') return { blob: gerarPPTX(d), mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', nome: base + '.pptx' };
    throw new Error('Formato inválido');
  }

  return { gerar, coletar };
})();

window.RELATORIO = RELATORIO;

export { RELATORIO };
