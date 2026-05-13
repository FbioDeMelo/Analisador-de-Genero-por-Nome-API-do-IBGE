// ============================================================
// CONSTANTES
// ============================================================
const LIMITE_AMBIGUO  = 35;
const LINHAS_POR_PAG  = 50;
const MAX_PREVIEW     = 60;
const CACHE_KEY       = 'ibge_genero_cache_v2';

// ============================================================
// CACHE PERSISTENTE (localStorage)
// ============================================================
function carregarCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function salvarCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch { /* localStorage cheio — ignora */ }
}
function atualizarStatusCache() {
  const cache = carregarCache();
  const total = Object.keys(cache).length;
  el('cacheTxt').textContent = `Cache: ${total.toLocaleString('pt-BR')} nome(s)`;
}
function verCache() {
  const cache = carregarCache();
  const total = Object.keys(cache).length;
  if (total === 0) { alert('Cache vazio — nenhum nome consultado ainda.'); return; }
  alert(`Cache local: ${total.toLocaleString('pt-BR')} nome(s) armazenado(s).\n\nEsses nomes não precisarão de requisição à API nas próximas consultas.`);
}
function limparCache() {
  if (!confirm('Limpar todo o cache local? Os próximos processamentos vão à API novamente.')) return;
  localStorage.removeItem(CACHE_KEY);
  atualizarStatusCache();
  alert('Cache limpo!');
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
let nomesBrutos      = [];
let resultadosUnicos = {};   // chave → resultado (sessão atual)
let resultadosLote   = [];
let filtroAtivo      = 'todos';
let ordemColuna      = null;
let ordemAsc         = true;
let paginaAtual      = 1;
let cancelado        = false;
let erros429         = 0;
let intervaloAtual   = 100;

// ============================================================
// UTILITÁRIOS
// ============================================================
const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
const sleep       = ms => new Promise(r => setTimeout(r, ms));
const el          = id => document.getElementById(id);

function fmt(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString('pt-BR');
}

function fmtTempo(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function mostrar(id) { el(id).classList.remove('hidden'); }
function esconder(id) { el(id).classList.add('hidden'); }

function classificar(freqM, freqF) {
  const total = freqM + freqF;
  if (!total) return null;
  const pctM = (freqM / total) * 100;
  const pctF = (freqF / total) * 100;
  if (pctM >= 100 - LIMITE_AMBIGUO) return { genero:'M', label:'Masculino',  confianca:pctM, pctM, pctF };
  if (pctF >= 100 - LIMITE_AMBIGUO) return { genero:'F', label:'Feminino',   confianca:pctF, pctM, pctF };
  return                                    { genero:'I', label:'Indefinido', confianca:Math.max(pctM,pctF), pctM, pctF };
}

function corPorGenero(g) {
  return ({
    M: { fundo:'#EBF5FF', texto:'#0C447C', icone:'♂' },
    F: { fundo:'#FDF0F5', texto:'#72243E', icone:'♀' },
    I: { fundo:'#F5F5F2', texto:'#444441', icone:'⚥' },
    N: { fundo:'#FFF2F2', texto:'#791F1F', icone:'✗' },
  })[g] || { fundo:'#FFF2F2', texto:'#791F1F', icone:'✗' };
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  atualizarStatusCache();
  el('nomeInput').addEventListener('keydown', e => { if (e.key === 'Enter') analisar(); });
  el('cfgConcorrencia').addEventListener('input', atualizarAvisoConfig);
  el('cfgIntervalo').addEventListener('input', atualizarAvisoConfig);
});

// ============================================================
// TROCA DE ABAS
// ============================================================
function trocarAba(aba, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.aba').forEach(a => a.classList.add('hidden'));
  el('aba' + aba.charAt(0).toUpperCase() + aba.slice(1)).classList.remove('hidden');
}

// ============================================================
// ABA INDIVIDUAL
// ============================================================
function analisarExemplo(nome) { el('nomeInput').value = nome; analisar(); }

async function analisar() {
  const nome = el('nomeInput').value.trim();
  if (!nome) { mostrarErroInd('Por favor, digite um nome.'); return; }
  const chave = nome.split(' ')[0].toUpperCase();

  esconder('resultadoInd'); esconder('erroInd'); mostrar('loadingInd');

  const cache = carregarCache();
  let r, doCache = false;

  if (cache[chave]) {
    r = cache[chave]; doCache = true;
    await sleep(80); // simula latência mínima para não piscar
  } else {
    r = await consultarAPI(chave, 3);
    if (r.genero !== 'N') { cache[chave] = r; salvarCache(cache); atualizarStatusCache(); }
  }

  esconder('loadingInd');
  if (r.genero === 'N') { mostrarErroInd(`"${capitalizar(chave)}" não encontrado na base do IBGE.`); return; }

  const cor = corPorGenero(r.genero);
  el('nomeExibido').textContent   = capitalizar(chave);
  el('confianca').textContent     = r.confianca.toFixed(1) + '%';
  el('freqMasc').textContent      = fmt(r.freqM);
  el('freqFem').textContent       = fmt(r.freqF);
  el('pctMasc').textContent       = r.pctM.toFixed(1) + '%';
  el('pctFem').textContent        = r.pctF.toFixed(1) + '%';
  el('barraMasc').style.width     = r.pctM.toFixed(2) + '%';
  el('barraFem').style.width      = r.pctF.toFixed(2) + '%';
  el('iconInd').style.background  = cor.fundo;
  el('iconInd').textContent       = cor.icone;
  el('badgeInd').textContent      = r.label;
  el('badgeInd').style.background = cor.fundo;
  el('badgeInd').style.color      = cor.texto;
  el('cardInd').style.borderColor = cor.fundo;
  doCache ? mostrar('cacheHit') : esconder('cacheHit');
  mostrar('resultadoInd');
}

function mostrarErroInd(msg) {
  el('erroInd').textContent = msg;
  mostrar('erroInd'); esconder('resultadoInd'); esconder('loadingInd');
}

// ============================================================
// CONSULTA API COM RETRY + BACKOFF EXPONENCIAL
// ============================================================
async function consultarAPI(chave, maxTentativas = 3) {
  for (let t = 1; t <= maxTentativas; t++) {
    try {
      const [rM, rF] = await Promise.all([
        fetch(`https://servicodados.ibge.gov.br/api/v2/censos/nomes/${encodeURIComponent(chave)}?sexo=M`)
          .then(r => { if (r.status === 429) throw Object.assign(new Error('429'), {status:429}); if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch(`https://servicodados.ibge.gov.br/api/v2/censos/nomes/${encodeURIComponent(chave)}?sexo=F`)
          .then(r => { if (r.status === 429) throw Object.assign(new Error('429'), {status:429}); if (!r.ok) throw new Error(r.status); return r.json(); }),
      ]);
      const freqM = rM.length ? (rM[0].res||[]).reduce((s,d)=>s+d.frequencia,0) : 0;
      const freqF = rF.length ? (rF[0].res||[]).reduce((s,d)=>s+d.frequencia,0) : 0;
      const cls   = classificar(freqM, freqF);
      if (!cls) return { genero:'N', label:'Não encontrado', confianca:0, freqM:0, freqF:0, pctM:0, pctF:0 };
      return { ...cls, freqM, freqF };
    } catch(err) {
      if (err.status === 429) { erros429++; await sleep(1000 * Math.pow(2, t)); }
      else if (t < maxTentativas) await sleep(400 * Math.pow(2, t-1));
      else return { genero:'N', label:'Não encontrado', confianca:0, freqM:0, freqF:0, pctM:0, pctF:0 };
    }
  }
  return { genero:'N', label:'Não encontrado', confianca:0, freqM:0, freqF:0, pctM:0, pctF:0 };
}

// ============================================================
// UPLOAD CSV
// ============================================================
function dragOver(e)  { e.preventDefault(); el('zonaUpload').classList.add('dragover'); }
function dragLeave()  { el('zonaUpload').classList.remove('dragover'); }
function dropFile(e)  { e.preventDefault(); dragLeave(); if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]); }
function carregarArquivo(e) { if (e.target.files[0]) processarArquivo(e.target.files[0]); }

function processarArquivo(arquivo) {
  const reader = new FileReader();
  reader.onload = ev => {
    const linhas = ev.target.result.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const cabecalhos = ['nome','name','nomes','names'];
    const inicio = cabecalhos.includes(linhas[0]?.toLowerCase()) ? 1 : 0;
    nomesBrutos = linhas.slice(inicio).map(l=>l.split(/[,;|\t]/)[0].trim()).filter(Boolean);
    if (!nomesBrutos.length) { alert('Nenhum nome encontrado. Verifique o formato.'); return; }

    // Calcula únicos e quais já estão no cache
    const cache = carregarCache();
    const vistos = new Set();
    let totalUnicos = 0, doCache = 0;
    nomesBrutos.forEach(n => {
      const chave = n.split(' ')[0].toUpperCase();
      if (!vistos.has(chave)) {
        vistos.add(chave); totalUnicos++;
        if (cache[chave]) doCache++;
      }
    });

    exibirPreview(arquivo.name, nomesBrutos, totalUnicos, doCache);
    atualizarAvisoConfig(totalUnicos, doCache);
  };
  reader.readAsText(arquivo, 'UTF-8');
}

function unicosDosBrutos() {
  const vistos = new Set(), lista = [];
  nomesBrutos.forEach(n => {
    const c = n.split(' ')[0].toUpperCase();
    if (!vistos.has(c)) { vistos.add(c); lista.push(c); }
  });
  return lista;
}

function exibirPreview(nomeArquivo, nomes, totalUnicos, doCache) {
  esconder('zonaUpload');
  el('nomeArquivo').textContent = nomeArquivo;
  el('countNomes').textContent  = `· ${nomes.length.toLocaleString('pt-BR')} linha(s) · ${totalUnicos.toLocaleString('pt-BR')} únicos`;

  // Painel de economia
  const painel  = el('painelEconomia');
  const precisaAPI = totalUnicos - doCache;
  const economia = nomes.length - totalUnicos;
  let linhas = [];
  if (doCache > 0)    linhas.push(`⚡ <strong>${doCache.toLocaleString('pt-BR')}</strong> nome(s) já no cache — resposta instantânea, sem requisição à API.`);
  if (economia > 0)  linhas.push(`🔁 <strong>${economia.toLocaleString('pt-BR')}</strong> linha(s) eliminadas por deduplicação.`);
  linhas.push(`📡 <strong>${precisaAPI.toLocaleString('pt-BR')}</strong> nome(s) único(s) precisam ser consultados na API.`);

  painel.innerHTML = linhas.join('<br>');
  painel.className = `painel-economia ${doCache > 0 ? 'verde' : 'azul'}`;
  mostrar('painelEconomia');

  // Preview chips (verde = cache, cinza = API)
  const cache = carregarCache();
  const lista = el('previewLista');
  lista.innerHTML = '';
  nomes.slice(0, MAX_PREVIEW).forEach(n => {
    const chave = n.split(' ')[0].toUpperCase();
    const chip = document.createElement('span');
    chip.className = 'preview-chip' + (cache[chave] ? ' do-cache' : '');
    chip.textContent = capitalizar(chave);
    lista.appendChild(chip);
  });
  if (nomes.length > MAX_PREVIEW) {
    const m = document.createElement('span');
    m.className = 'preview-chip'; m.style.color = '#aaa';
    m.textContent = `+${nomes.length - MAX_PREVIEW} mais...`;
    lista.appendChild(m);
  }
  mostrar('previewArea');
}

// ============================================================
// AVISO DINÂMICO
// ============================================================
function atualizarAvisoConfig(totalUnicosParam, doCacheParam) {
  const conc      = parseInt(el('cfgConcorrencia').value) || 10;
  const intervalo = parseInt(el('cfgIntervalo').value)    || 100;

  const unicos = unicosDosBrutos();
  const cache  = carregarCache();
  const doCache   = typeof doCacheParam !== 'undefined' ? doCacheParam : unicos.filter(c=>cache[c]).length;
  const totalUnicos = typeof totalUnicosParam !== 'undefined' ? totalUnicosParam : unicos.length;
  const precisaAPI = totalUnicos - doCache;

  if (!totalUnicos) return;

  const totalLotes  = Math.ceil(precisaAPI / conc);
  const tempoEstMs  = totalLotes * (intervalo + 200); // ~200ms por lote de rede
  const aviso       = el('avisoConfig');

  if (intervalo === 0 && precisaAPI > 100) {
    aviso.className   = 'aviso-config aviso';
    aviso.textContent = `⚠️ Intervalo 0ms com ${precisaAPI.toLocaleString('pt-BR')} nomes únicos via API pode causar bloqueio 429. Recomendado: 100ms.`;
  } else if (precisaAPI === 0) {
    aviso.className   = 'aviso-config ok';
    aviso.textContent = `✓ Todos os ${totalUnicos.toLocaleString('pt-BR')} nomes estão no cache — processamento instantâneo!`;
  } else {
    aviso.className   = 'aviso-config ok';
    aviso.textContent = `✓ ${precisaAPI.toLocaleString('pt-BR')} nomes via API · ${totalLotes} lote(s) de ${conc} · tempo estimado: ~${fmtTempo(tempoEstMs)}`;
  }
}

// ============================================================
// PROCESSAMENTO EM LOTE — MOTOR PRINCIPAL
// ============================================================
async function processarLote() {
  if (!nomesBrutos.length) return;

  const conc      = Math.max(1,  Math.min(20, parseInt(el('cfgConcorrencia').value) || 10));
  const intervalo = Math.max(0,  Math.min(5000, parseInt(el('cfgIntervalo').value)  || 100));
  const maxRetry  = Math.max(1,  Math.min(5,   parseInt(el('cfgRetry').value)       || 3));

  cancelado      = false;
  erros429       = 0;
  intervaloAtual = intervalo;
  resultadosUnicos = {};
  resultadosLote   = [];

  esconder('previewArea');
  esconder('resultadosLote');
  mostrar('progressoArea');
  esconder('taxaAdaptativa');

  const cache    = carregarCache();
  const unicos   = unicosDosBrutos();
  const precisamAPI = unicos.filter(c => !cache[c]);
  const jaNoCache   = unicos.filter(c =>  cache[c]);

  // Resolve os do cache instantaneamente
  jaNoCache.forEach(c => { resultadosUnicos[c] = cache[c]; });

  const totalAPI = precisamAPI.length;
  let processados = 0;
  let cntM = 0, cntF = 0, cntI = 0, cntN = 0;
  const inicio = performance.now();
  let erros429Anterior = 0;

  // Fase 1 — Cache (instantâneo)
  if (jaNoCache.length > 0) {
    el('faseBadge').textContent = `Fase 1 de 2 — Resolvendo ${jaNoCache.length.toLocaleString('pt-BR')} nome(s) do cache`;
    el('progressoBar').style.width = '100%';
    el('progressoPct').textContent = '100%';
    el('progressoTexto').textContent = `${jaNoCache.length.toLocaleString('pt-BR')} nomes resolvidos instantaneamente do cache`;
    el('progressoEta').textContent = '';
    el('cntCache').textContent = jaNoCache.length.toLocaleString('pt-BR');
    jaNoCache.forEach(c => {
      const r = cache[c];
      if      (r.genero === 'M') cntM++;
      else if (r.genero === 'F') cntF++;
      else if (r.genero === 'I') cntI++;
      else                       cntN++;
    });
    el('cntMasc').textContent  = cntM;
    el('cntFem').textContent   = cntF;
    el('cntIndef').textContent  = cntI;
    el('cntNao').textContent    = cntN;
    await sleep(300);
  }

  // Fase 2 — API
  if (totalAPI > 0) {
    el('faseBadge').textContent = `Fase 2 — Consultando API: ${totalAPI.toLocaleString('pt-BR')} nome(s) únicos`;
    el('progressoBar').style.width = '0%';
    el('progressoPct').textContent = '0%';

    for (let i = 0; i < totalAPI; i += conc) {
      if (cancelado) break;

      const lote     = precisamAPI.slice(i, i + conc);
      const loteN    = Math.floor(i / conc) + 1;
      const totalLotes = Math.ceil(totalAPI / conc);

      el('progressoTexto').textContent = `Lote ${loteN}/${totalLotes} — ${lote.length} nome(s) em paralelo...`;

      // Detecta 429 e aumenta intervalo adaptativamente
      if (erros429 > erros429Anterior) {
        intervaloAtual = Math.min(2000, intervaloAtual * 2);
        el('taxaAdaptativa').textContent =
          `⚠️ Detectados ${erros429} erro(s) 429 — intervalo aumentado automaticamente para ${intervaloAtual}ms`;
        mostrar('taxaAdaptativa');
        erros429Anterior = erros429;
      }

      const resultados = await Promise.all(lote.map(c => consultarAPI(c, maxRetry)));

      resultados.forEach((r, idx) => {
        const chave = lote[idx];
        resultadosUnicos[chave] = r;
        if      (r.genero === 'M') cntM++;
        else if (r.genero === 'F') cntF++;
        else if (r.genero === 'I') cntI++;
        else                       cntN++;
        // Salva no cache persistente
        if (r.genero !== 'N') { cache[chave] = r; }
      });

      processados += lote.length;
      const pct      = Math.round((processados / totalAPI) * 100);
      const elapsed  = performance.now() - inicio;
      const taxa     = processados / (elapsed / 1000); // nomes/s
      const restantes = totalAPI - processados;
      const etaMs    = taxa > 0 ? (restantes / taxa) * 1000 : 0;

      el('progressoBar').style.width = pct + '%';
      el('progressoPct').textContent = pct + '%';
      el('progressoEta').textContent =
        etaMs > 500
          ? `ETA: ~${fmtTempo(etaMs)} · ${taxa.toFixed(1)} nomes/s`
          : processados < totalAPI ? 'Quase lá...' : '';
      el('progressoDetalhe').textContent =
        intervaloAtual > 0 && i + conc < totalAPI
          ? `Aguardando ${intervaloAtual}ms antes do próximo lote...`
          : '';
      el('cntMasc').textContent  = cntM;
      el('cntFem').textContent   = cntF;
      el('cntIndef').textContent  = cntI;
      el('cntNao').textContent    = cntN;

      if (i + conc < totalAPI && intervaloAtual > 0) await sleep(intervaloAtual);
    }

    // Persiste cache após processamento completo
    salvarCache(cache);
    atualizarStatusCache();
  }

  if (cancelado) return;

  // Fase 3 — Expansão para todas as linhas do CSV
  el('faseBadge').textContent = `Fase 3 — Expandindo ${nomesBrutos.length.toLocaleString('pt-BR')} linhas...`;
  el('progressoBar').style.width = '0%';
  el('progressoEta').textContent = '';
  el('progressoDetalhe').textContent = '';

  nomesBrutos.forEach((n, idx) => {
    const chave = n.split(' ')[0].toUpperCase();
    const r = resultadosUnicos[chave] || { genero:'N', label:'Não encontrado', confianca:0, freqM:0, freqF:0, pctM:0, pctF:0 };
    const doCache = !!cache[chave] && !precisamAPI.includes(chave);
    resultadosLote.push({ nome:capitalizar(chave), nomeOriginal:n, doCache, ...r });
    if (idx % 1000 === 0) {
      const pct = Math.round(((idx+1) / nomesBrutos.length) * 100);
      el('progressoBar').style.width = pct + '%';
      el('progressoPct').textContent = pct + '%';
    }
  });

  esconder('progressoArea');
  exibirResultados(jaNoCache.length, precisamAPI.length);
}

function cancelarProcessamento() {
  cancelado = true;
  esconder('progressoArea');
  mostrar('previewArea');
}

// ============================================================
// EXIBIR RESULTADOS
// ============================================================
function exibirResultados(doCache, daAPI) {
  const cM = resultadosLote.filter(r=>r.genero==='M').length;
  const cF = resultadosLote.filter(r=>r.genero==='F').length;
  const cI = resultadosLote.filter(r=>r.genero==='I').length;
  const cN = resultadosLote.filter(r=>r.genero==='N').length;

  el('resumoMasc').textContent  = cM.toLocaleString('pt-BR');
  el('resumoFem').textContent   = cF.toLocaleString('pt-BR');
  el('resumoIndef').textContent  = cI.toLocaleString('pt-BR');
  el('resumoNao').textContent    = cN.toLocaleString('pt-BR');

  const economia = nomesBrutos.length - Object.keys(resultadosUnicos).length;
  const linhasEco = [];
  if (doCache > 0) linhasEco.push(`⚡ ${doCache.toLocaleString('pt-BR')} nome(s) do cache local — zero requisições.`);
  if (daAPI  > 0) linhasEco.push(`📡 ${daAPI.toLocaleString('pt-BR')} nome(s) consultados na API e salvos no cache.`);
  if (economia > 0) linhasEco.push(`🔁 ${economia.toLocaleString('pt-BR')} requisição(ões) economizadas pela deduplicação.`);
  el('resumoEconomia').innerHTML = linhasEco.join(' &nbsp;·&nbsp; ');

  filtroAtivo = 'todos'; ordemColuna = null; paginaAtual = 1;
  el('buscaTabela').value = '';
  document.querySelectorAll('.filtro').forEach(b => b.classList.remove('active'));
  document.querySelector('.filtro').classList.add('active');

  renderizarTabela();
  mostrar('resultadosLote');
}

// ============================================================
// TABELA + PAGINAÇÃO
// ============================================================
function dadosFiltrados() {
  const busca = (el('buscaTabela')?.value || '').toLowerCase().trim();
  let dados = [...resultadosLote];
  if (filtroAtivo !== 'todos') dados = dados.filter(r=>r.genero===filtroAtivo);
  if (busca) dados = dados.filter(r=>r.nome.toLowerCase().includes(busca));
  if (ordemColuna) {
    dados.sort((a,b) => {
      let va,vb;
      if (ordemColuna==='nome')      { va=a.nome;      vb=b.nome; }
      if (ordemColuna==='genero')    { va=a.genero;    vb=b.genero; }
      if (ordemColuna==='confianca') { va=a.confianca; vb=b.confianca; }
      if (typeof va==='string') return ordemAsc ? va.localeCompare(vb,'pt') : vb.localeCompare(va,'pt');
      return ordemAsc ? va-vb : vb-va;
    });
  }
  return dados;
}

function renderizarTabela() {
  const dados     = dadosFiltrados();
  const totalPags = Math.max(1, Math.ceil(dados.length / LINHAS_POR_PAG));
  if (paginaAtual > totalPags) paginaAtual = totalPags;
  const inicio = (paginaAtual-1)*LINHAS_POR_PAG;
  const pagina = dados.slice(inicio, inicio+LINHAS_POR_PAG);

  const tbody = el('tabelaBody');
  tbody.innerHTML = '';

  if (!pagina.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#bbb;">Nenhum resultado.</td></tr>`;
  } else {
    const frag = document.createDocumentFragment();
    pagina.forEach((r, i) => {
      const pillClass = {M:'pill-m',F:'pill-f',I:'pill-i',N:'pill-n'}[r.genero];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-num">${inicio+i+1}</td>
        <td class="td-nome">${r.nome}</td>
        <td><span class="pill ${pillClass}">${r.label}</span></td>
        <td class="td-conf">${r.genero==='N' ? '—' : r.confianca.toFixed(1)+'%'}</td>
        <td class="td-freq">${fmt(r.freqM)}</td>
        <td class="td-freq">${fmt(r.freqF)}</td>
        <td class="td-src"><span class="${r.doCache ? 'src-cache' : 'src-api'}">${r.doCache ? '⚡cache' : 'API'}</span></td>`;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  renderizarPaginacao(totalPags, dados.length);
}

function renderizarPaginacao(totalPags, totalItens) {
  const pg = el('paginacao');
  pg.innerHTML = '';
  if (totalPags <= 1) return;

  const mkBtn = (label, pag, disabled, active) => {
    const b = document.createElement('button');
    b.className = 'pg-btn' + (active?' active':'');
    b.textContent = label; b.disabled = disabled;
    b.onclick = () => { paginaAtual = pag; renderizarTabela(); };
    return b;
  };

  const info = document.createElement('span');
  info.className = 'pg-info';
  info.textContent = totalItens.toLocaleString('pt-BR') + ' resultado(s)';
  pg.appendChild(info);
  pg.appendChild(mkBtn('‹', paginaAtual-1, paginaAtual===1, false));

  const janela=2, inic=Math.max(1,paginaAtual-janela), fim=Math.min(totalPags,paginaAtual+janela);
  if (inic>1) { pg.appendChild(mkBtn('1',1,false,false)); if(inic>2){const e=document.createElement('span');e.className='pg-info';e.textContent='…';pg.appendChild(e);} }
  for (let p=inic;p<=fim;p++) pg.appendChild(mkBtn(p,p,false,p===paginaAtual));
  if (fim<totalPags) { if(fim<totalPags-1){const e=document.createElement('span');e.className='pg-info';e.textContent='…';pg.appendChild(e);} pg.appendChild(mkBtn(totalPags,totalPags,false,false)); }
  pg.appendChild(mkBtn('›', paginaAtual+1, paginaAtual===totalPags, false));
}

function filtrar(tipo, btn) {
  filtroAtivo=tipo; paginaAtual=1;
  document.querySelectorAll('.filtro').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderizarTabela();
}
function ordenarPor(col) {
  ordemAsc = ordemColuna===col ? !ordemAsc : true;
  ordemColuna=col; paginaAtual=1;
  renderizarTabela();
}

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportarCSV() {
  const linhas = [['Nome','Nome_Original','Genero','Confianca_%','Freq_Masculino','Freq_Feminino','Fonte']];
  resultadosLote.forEach(r => linhas.push([
    r.nome, r.nomeOriginal, r.label,
    r.genero==='N' ? 'N/A' : r.confianca.toFixed(2),
    r.freqM, r.freqF, r.doCache?'cache':'api'
  ]));
  const csv  = linhas.map(l=>l.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download='resultado_genero_ibge.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// RESET + EXEMPLO
// ============================================================
function resetarLote() {
  cancelado=true; nomesBrutos=[]; resultadosUnicos={}; resultadosLote=[];
  esconder('previewArea'); esconder('progressoArea'); esconder('resultadosLote');
  mostrar('zonaUpload'); el('fileInput').value='';
}
function baixarExemplo() {
  const nomes=['nome','João','Maria','Carlos','Ana','Ariel','Gabriel','Fernanda','Lucas','Pedro','Beatriz','Rafael','Camila','Diego','Vanessa'];
  const blob=new Blob([nomes.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='exemplo_nomes.csv'; a.click();
  URL.revokeObjectURL(url);
}
