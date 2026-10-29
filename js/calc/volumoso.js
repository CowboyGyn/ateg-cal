// Planejamento de volumoso para a seca: demanda do rebanho, mistura de volumosos,
// área a plantar, estoque, custo, silo e consumo mês a mês. Funções puras, sem interface.

export const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
  "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const SECA_PADRAO = { mesInicio: 4, dias: 210 }; // a partir de 1º de maio

// Categorias: peso vivo (kg), consumo de MS (% do PV) e parte do consumo que é volumoso (%).
export const CATEGORIAS = {
  "vacas-lactacao": { nome: "Vacas em lactação", grupo: "Leite", pesoKg: 500, consumoPct: 3.0, volumosoPct: 60 },
  "vacas-secas": { nome: "Vacas secas", grupo: "Leite", pesoKg: 500, consumoPct: 2.0, volumosoPct: 85 },
  "novilhas-leite": { nome: "Novilhas (leite)", grupo: "Leite", pesoKg: 330, consumoPct: 2.4, volumosoPct: 85 },
  bezerras: { nome: "Bezerras desaleitadas", grupo: "Leite", pesoKg: 120, consumoPct: 2.6, volumosoPct: 50 },
  matrizes: { nome: "Matrizes (corte)", grupo: "Corte", pesoKg: 450, consumoPct: 2.0, volumosoPct: 95 },
  touros: { nome: "Touros", grupo: "Corte", pesoKg: 700, consumoPct: 1.8, volumosoPct: 95 },
  recria: { nome: "Recria (corte)", grupo: "Corte", pesoKg: 250, consumoPct: 2.3, volumosoPct: 85 },
  engorda: { nome: "Engorda / terminação", grupo: "Corte", pesoKg: 420, consumoPct: 2.3, volumosoPct: 60 },
  "bezerros-pe": { nome: "Bezerros ao pé", grupo: "Corte", pesoKg: 120, consumoPct: 1.0, volumosoPct: 100 },
  equinos: { nome: "Equinos", grupo: "Outros", pesoKg: 400, consumoPct: 2.0, volumosoPct: 100 },
  outra: { nome: "Outra categoria", grupo: "Outros", pesoKg: 300, consumoPct: 2.2, volumosoPct: 80 },
};

// Volumosos: MS (%), produtividade (t de matéria natural/ha), perdas da colheita ao cocho (%),
// custo (R$/t de matéria natural) e densidade no silo (kg MN/m³; só silagens).
export const VOLUMOSOS = {
  "silagem-milho": { nome: "Silagem de milho", msPct: 33, produtividadeT: 45, perdasPct: 15, custoT: 250, densidade: 600 },
  "silagem-sorgo": { nome: "Silagem de sorgo", msPct: 30, produtividadeT: 40, perdasPct: 15, custoT: 200, densidade: 600 },
  "silagem-capim": { nome: "Silagem de capim", msPct: 25, produtividadeT: 40, perdasPct: 20, custoT: 160, densidade: 550 },
  cana: { nome: "Cana-de-açúcar picada", msPct: 30, produtividadeT: 90, perdasPct: 5, custoT: 110 },
  capineira: { nome: "Capineira (capim picado)", msPct: 20, produtividadeT: 50, perdasPct: 5, custoT: 80 },
  feno: { nome: "Feno", msPct: 87, produtividadeT: 12, perdasPct: 10, custoT: 900 },
  "pre-secado": { nome: "Pré-secado", msPct: 50, produtividadeT: 15, perdasPct: 12, custoT: 450 },
};

const FATIA_DIARIA_M = 0.25; // retirada mínima do painel do silo por dia, para não estragar

export const kgVolumosoPadrao = (tipo, pesoKg) => {
  const c = CATEGORIAS[tipo];
  return pesoKg * (c.consumoPct / 100) * (c.volumosoPct / 100);
};

// Meses da seca a partir do dia 1º do mês de início; o último mês entra só com os dias que faltam.
export function mesesDaSeca(mesInicio, dias) {
  const meses = [];
  let resta = Math.round(dias);
  for (let mes = mesInicio; resta > 0; mes = (mes + 1) % 12) {
    const noMes = Math.min(resta, DIAS_MES[mes]);
    meses.push({ mes, nome: NOMES_MESES[mes], dias: noMes, parcial: noMes < DIAS_MES[mes] });
    resta -= noMes;
  }
  return meses;
}

function exigirNumero(valor, nome, min, max) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new Error(`${nome}: informe um número válido.`);
  if (valor < min || valor > max) throw new Error(`${nome}: o valor deve estar entre ${min} e ${max}.`);
}

const vazio = (v) => v === null || v === undefined || Number.isNaN(v);

// Participação de cada volumoso na MS do cocho: campos vazios dividem o que falta para 100%.
function distribuirParticipacao(volumosos) {
  const informada = volumosos.filter((v) => !vazio(v.participacaoPct)).reduce((s, v) => s + v.participacaoPct, 0);
  const vazios = volumosos.filter((v) => vazio(v.participacaoPct)).length;
  if (vazios === 0 && Math.abs(informada - 100) > 0.5) {
    throw new Error(`As participações dos volumosos somam ${String(Math.round(informada * 10) / 10).replace(".", ",")}%; devem somar 100%.`);
  }
  if (vazios > 0 && informada > 100) throw new Error("As participações informadas passam de 100%.");
  const resto = vazios ? (100 - informada) / vazios : 0;
  return volumosos.map((v) => (vazio(v.participacaoPct) ? resto : v.participacaoPct));
}

export function calcularVolumosoSeca({ mesInicio = SECA_PADRAO.mesInicio, diasSeca = SECA_PADRAO.dias,
  lotes = [], pastoPct = 0, volumosos = [] }) {
  exigirNumero(mesInicio, "Início da seca", 0, 11);
  exigirNumero(diasSeca, "Dias de seca", 30, 365);
  exigirNumero(pastoPct, "Volumoso que vem do pasto (%)", 0, 100);
  if (pastoPct >= 100) throw new Error("Se o pasto fornece 100% do volumoso, não há o que planejar para o cocho.");

  const meses = mesesDaSeca(mesInicio, diasSeca);
  const dias = meses.reduce((s, m) => s + m.dias, 0);

  // ---------- Demanda do rebanho ----------
  const categorias = [];
  for (const l of lotes) {
    if (!CATEGORIAS[l.tipo]) throw new Error("Categoria do rebanho inválida.");
    const nome = CATEGORIAS[l.tipo].nome;
    if (vazio(l.animais) || l.animais === 0) continue;
    exigirNumero(l.animais, `${nome}: animais`, 0, 100000);
    const pesoKg = vazio(l.pesoKg) ? CATEGORIAS[l.tipo].pesoKg : l.pesoKg;
    exigirNumero(pesoKg, `${nome}: peso`, 20, 1500);
    const kgMSDia = vazio(l.kgMSDia) ? kgVolumosoPadrao(l.tipo, pesoKg) : l.kgMSDia;
    exigirNumero(kgMSDia, `${nome}: volumoso por animal`, 0, 40);
    categorias.push({
      tipo: l.tipo,
      nome,
      animais: l.animais,
      pesoKg,
      kgMSDia,
      tMSSeca: (l.animais * kgMSDia * dias) / 1000,
    });
  }
  if (!categorias.length) throw new Error("Informe pelo menos uma categoria com animais.");
  const animais = categorias.reduce((s, c) => s + c.animais, 0);
  const tMSVolumoso = categorias.reduce((s, c) => s + c.tMSSeca, 0);
  const tMSPasto = tMSVolumoso * (pastoPct / 100);
  const tMSCocho = tMSVolumoso - tMSPasto;

  // ---------- Volumosos ----------
  if (!volumosos.length) throw new Error("Escolha pelo menos um volumoso.");
  const tipos = new Set();
  for (const v of volumosos) {
    if (!VOLUMOSOS[v.tipo]) throw new Error("Volumoso inválido.");
    if (tipos.has(v.tipo)) throw new Error(`${VOLUMOSOS[v.tipo].nome} aparece mais de uma vez.`);
    tipos.add(v.tipo);
  }
  const participacoes = distribuirParticipacao(volumosos);

  const itens = volumosos.map((v, i) => {
    const ref = VOLUMOSOS[v.tipo];
    const p = {
      msPct: vazio(v.msPct) ? ref.msPct : v.msPct,
      produtividadeT: vazio(v.produtividadeT) ? ref.produtividadeT : v.produtividadeT,
      perdasPct: vazio(v.perdasPct) ? ref.perdasPct : v.perdasPct,
      custoT: vazio(v.custoT) ? ref.custoT : v.custoT,
      estoqueT: vazio(v.estoqueT) ? 0 : v.estoqueT,
    };
    exigirNumero(participacoes[i], `${ref.nome}: participação`, 0, 100);
    exigirNumero(p.msPct, `${ref.nome}: matéria seca (%)`, 5, 95);
    exigirNumero(p.produtividadeT, `${ref.nome}: produtividade`, 0.5, 300);
    exigirNumero(p.perdasPct, `${ref.nome}: perdas (%)`, 0, 60);
    exigirNumero(p.custoT, `${ref.nome}: custo`, 0, 10000);
    exigirNumero(p.estoqueT, `${ref.nome}: estoque`, 0, 1000000);

    const fatorPerdas = 1 - p.perdasPct / 100;
    const tMS = tMSCocho * (participacoes[i] / 100);
    const tMNFornecida = tMS / (p.msPct / 100);
    // O que precisa estar colhido/armazenado para, descontadas as perdas, chegar ao cocho.
    const tMNNecessaria = tMNFornecida / fatorPerdas;
    const faltaT = Math.max(0, tMNNecessaria - p.estoqueT);
    const sobraT = Math.max(0, p.estoqueT - tMNNecessaria);
    const diarioMN = tMNFornecida / dias;
    const diasEstoque = diarioMN > 0 ? (p.estoqueT * fatorPerdas) / diarioMN : Infinity;

    let silo = null;
    if (ref.densidade && tMNNecessaria > 0) {
      const volumeM3 = (tMNNecessaria * 1000) / ref.densidade;
      const painelM2 = volumeM3 / (dias * FATIA_DIARIA_M);
      const alturaM = Math.min(3, Math.max(1, Math.sqrt(painelM2 / 2)));
      silo = {
        volumeM3,
        densidade: ref.densidade,
        alturaM,
        larguraM: painelM2 / alturaM,
        comprimentoM: volumeM3 / painelM2,
      };
    }

    return {
      tipo: v.tipo,
      nome: ref.nome,
      participacaoPct: participacoes[i],
      ...p,
      tMS,
      tMNFornecida,
      tMNNecessaria,
      faltaT,
      sobraT,
      areaHa: faltaT / p.produtividadeT,
      areaTotalHa: tMNNecessaria / p.produtividadeT,
      custoTotal: tMNNecessaria * p.custoT,
      custoFalta: faltaT * p.custoT,
      diarioMN,
      diasEstoque,
      silo,
    };
  });

  // ---------- Mês a mês ----------
  let diasPassados = 0;
  const mensal = meses.map((m) => {
    diasPassados += m.dias;
    const consumoT = itens.reduce((s, v) => s + v.diarioMN * m.dias, 0);
    const estoqueFimT = itens.reduce(
      (s, v) => s + Math.max(0, v.estoqueT * (1 - v.perdasPct / 100) - v.diarioMN * diasPassados),
      0,
    );
    return { ...m, consumoT, estoqueFimT };
  });

  // Mês em que o estoque de cada volumoso acaba (null = dura a seca toda ou não há estoque).
  for (const v of itens) {
    v.acabaEm = null;
    if (v.estoqueT > 0 && v.diasEstoque < dias) {
      let acumulado = 0;
      for (const m of meses) {
        acumulado += m.dias;
        if (v.diasEstoque < acumulado) {
          v.acabaEm = m.nome;
          break;
        }
      }
    }
  }

  const custoTotal = itens.reduce((s, v) => s + v.custoTotal, 0);
  return {
    meses: mensal,
    dias,
    pastoPct,
    categorias,
    animais,
    tMSVolumoso,
    tMSPasto,
    tMSCocho,
    volumosos: itens,
    tMNNecessaria: itens.reduce((s, v) => s + v.tMNNecessaria, 0),
    tMNFornecida: itens.reduce((s, v) => s + v.tMNFornecida, 0),
    faltaT: itens.reduce((s, v) => s + v.faltaT, 0),
    estoqueT: itens.reduce((s, v) => s + v.estoqueT, 0),
    areaHa: itens.reduce((s, v) => s + v.areaHa, 0),
    custoTotal,
    custoFalta: itens.reduce((s, v) => s + v.custoFalta, 0),
    custoAnimalDia: custoTotal / (animais * dias),
  };
}

// ---------- Importar do Rebanho ideal ----------

// Agrupa as categorias de um resultado do Rebanho ideal (leite ou corte) nas categorias deste
// módulo: soma os animais e faz a média de peso ponderada.
export function lotesDoRebanho(origem, categoriasRebanho, fase) {
  const destino = (c) => {
    if (origem === "leite") {
      if (c.id === "lactacao") return "vacas-lactacao";
      if (c.id === "secas") return "vacas-secas";
      if (c.id === "bezerras") return "bezerras";
      return "novilhas-leite";
    }
    if (c.grupo === "matrizes") return "matrizes";
    if (c.grupo === "touros") return "touros";
    if (c.grupo === "bezerros") return "bezerros-pe";
    if (c.grupo === "machos" && fase === "completo" && /-(24|36)$/.test(c.id)) return "engorda";
    return "recria";
  };
  const soma = new Map();
  for (const c of categoriasRebanho) {
    if (!(c.quantidade > 0)) continue;
    const tipo = destino(c);
    const atual = soma.get(tipo) ?? { quantidade: 0, kg: 0 };
    atual.quantidade += c.quantidade;
    atual.kg += c.quantidade * c.pesoKg;
    soma.set(tipo, atual);
  }
  return [...soma].map(([tipo, s]) => ({
    tipo,
    animais: Math.round(s.quantidade),
    pesoKg: Math.round(s.kg / s.quantidade),
  }));
}
