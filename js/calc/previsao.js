// Previsão de vacas em lactação e de produção de leite para os próximos 12 meses,
// a partir dos partos previstos no controle reprodutivo.
//
// Balanço mensal das vacas em lactação:
//   lactação(m) = lactação(m−1) + partos(m) − secagens(m) − descartes(m)
// - Secagens: a vaca multípara seca "período seco" dias antes do próximo parto, então
//   as secagens de um mês são os partos de multíparas previstos para PS dias depois.
// - Descartes: taxa anual sobre as vacas de hoje, distribuída igualmente nos meses,
//   saindo do lote em lactação (fim de lactação).
// - Primíparas: as novilhas que parem repõem os descartes, logo a fração de partos de
//   primíparas = descartes do ano / partos do ano.
//
// Produção por vaca:
// - Sem DEL: a produção média informada vale para todos os meses.
// - Com DEL médio: as vacas em lactação são acompanhadas por mês de lactação (hoje
//   distribuídas por igual de 0 a 2 × DEL). Partos entram com DEL zero; secagens e
//   descartes saem das lactações mais antigas. Cada lote produz pela curva de Wood,
//   em escala ajustada para que a média de hoje seja a produção informada.
// Funções puras, sem dependência de interface.

const DIAS_MES = 365 / 12;
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Curva de Wood: y = a·t^b·e^(−c·t). Só a forma importa, a escala vem da produção média.
// Pico em b/c = 50 dias; aos 300 dias a vaca produz cerca de metade do pico.
const WOOD_B = 0.2;
const WOOD_C = 0.004;
export const curvaLactacao = (del) => Math.max(del, 1) ** WOOD_B * Math.exp(-WOOD_C * del);

const idadeLote = (i) => (i + 0.5) * DIAS_MES; // DEL no meio do mês do lote i

// Produção relativa média de um conjunto de lotes (lote i = i meses desde o parto).
function producaoRelativa(lotes) {
  const total = lotes.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return lotes.reduce((s, v, i) => s + v * curvaLactacao(idadeLote(i)), 0) / total;
}

const delMedioLotes = (lotes) => {
  const total = lotes.reduce((s, v) => s + v, 0);
  return total > 0 ? lotes.reduce((s, v, i) => s + v * idadeLote(i), 0) / total : 0;
};

// Retira "quantidade" vacas dos lotes mais antigos (fim de lactação).
function retirarMaisAntigas(lotes, quantidade) {
  let resta = quantidade;
  for (let i = lotes.length - 1; i >= 0 && resta > 0; i--) {
    const sai = Math.min(lotes[i], resta);
    lotes[i] -= sai;
    resta -= sai;
  }
  while (lotes.length > 1 && lotes[lotes.length - 1] <= 1e-9) lotes.pop();
}

export const PREVISAO_PADRAO = {
  periodoSecoDias: 60,
  descarteAnualPct: 20,
  iepMeses: 13,
};

function exigirNumero(valor, nome, min, max) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`${nome}: informe um número válido.`);
  }
  if (valor < min || valor > max) {
    throw new Error(`${nome}: o valor deve estar entre ${min} e ${max}.`);
  }
}

// Os 12 meses seguintes ao mês de "hoje".
export function mesesSeguintes(hoje = new Date(), n = 12) {
  const meses = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth();
    meses.push({
      ano,
      mes,
      dias: new Date(ano, mes + 1, 0).getDate(),
      rotulo: `${NOMES_MES[mes]}/${String(ano).slice(2)}`,
    });
  }
  return meses;
}

// Partos por mês de um rebanho em equilíbrio: cada vaca pare uma vez a cada IEP.
export function partosMediosMes(vacasTotais, iepMeses = PREVISAO_PADRAO.iepMeses) {
  return vacasTotais / iepMeses;
}

export function calcularPrevisao({
  vacasLactacao,
  vacasSecas,
  producaoLitros,
  partos,
  periodoSecoDias = PREVISAO_PADRAO.periodoSecoDias,
  descarteAnualPct = PREVISAO_PADRAO.descarteAnualPct,
  delMedio = null,
  hoje = new Date(),
}) {
  exigirNumero(vacasLactacao, "Vacas em lactação hoje", 0, 100000);
  exigirNumero(vacasSecas, "Vacas secas hoje", 0, 100000);
  if (vacasLactacao + vacasSecas < 1) throw new Error("Informe as vacas em lactação e as secas.");
  exigirNumero(producaoLitros, "Produção média (L/vaca/dia)", 0.1, 100);
  exigirNumero(periodoSecoDias, "Período seco (dias)", 0, 150);
  exigirNumero(descarteAnualPct, "Descarte anual de vacas (%)", 0, 60);
  if (!Array.isArray(partos) || partos.length !== 12) throw new Error("Informe os partos dos 12 meses.");
  partos.forEach((p, i) => exigirNumero(p, `Partos previstos (mês ${i + 1})`, 0, 100000));
  const usaCurva = delMedio !== null && delMedio !== undefined;
  if (usaCurva) exigirNumero(delMedio, "DEL médio (dias)", 5, 400);

  const meses = mesesSeguintes(hoje);
  const vacasHoje = vacasLactacao + vacasSecas;
  const descartesMes = (vacasHoje * descarteAnualPct) / 100 / 12;
  const somaPartos = partos.reduce((s, p) => s + p, 0);
  const partosMedio = somaPartos / 12;
  const fracPrimiparas = somaPartos > 0 ? Math.min(1, (descartesMes * 12) / somaPartos) : 0;
  const defasagem = periodoSecoDias / DIAS_MES; // em meses

  // Partos no mês x (1 = próximo mês). Depois do 12º mês, assume a média informada.
  const partosNoMes = (x) => (x >= 1 && x <= 12 ? partos[x - 1] : x > 12 ? partosMedio : 0);
  // Partos numa posição fracionária, interpolando entre meses vizinhos.
  const partosEm = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    return (1 - f) * partosNoMes(i) + f * partosNoMes(i + 1);
  };

  // Lotes por mês de lactação e escala da curva (só com DEL).
  let lotes = [];
  let escala = 0;
  if (usaCurva) {
    const n = Math.max(1, Math.round((2 * delMedio) / DIAS_MES));
    lotes = Array(n).fill(vacasLactacao / n);
    const relHoje = producaoRelativa(Array(n).fill(1));
    escala = producaoLitros / relHoje;
  }

  let lactacao = vacasLactacao;
  let vacas = vacasHoje;
  let zerou = false;
  const resultado = meses.map((m, i) => {
    const n = i + 1;
    const entradas = partos[i];
    const secagens = (1 - fracPrimiparas) * partosEm(n + defasagem);
    const inicio = lactacao;
    let fim = inicio + entradas - secagens - descartesMes;
    if (fim < 0) {
      fim = 0;
      zerou = true;
    }
    lactacao = fim;
    const vacasInicio = vacas;
    vacas = Math.max(fim, vacas + fracPrimiparas * entradas - descartesMes);
    const media = (inicio + fim) / 2;
    let litrosVaca = producaoLitros;
    let del = null;
    if (usaCurva) {
      lotes.unshift(entradas); // todos envelhecem um mês; partos entram no lote 0
      retirarMaisAntigas(lotes, secagens + descartesMes);
      litrosVaca = fim > 0 ? escala * producaoRelativa(lotes) : 0;
      del = delMedioLotes(lotes);
    }
    return {
      ...m,
      partos: entradas,
      secagens,
      descartes: descartesMes,
      lactacaoInicio: inicio,
      lactacaoFim: fim,
      lactacaoMedia: media,
      vacasTotais: vacas,
      pctLactacao: vacas > 0 ? (media / ((vacasInicio + vacas) / 2)) * 100 : 0,
      litrosVaca,
      delMedio: del,
      leiteDia: media * litrosVaca,
      leiteMes: media * litrosVaca * m.dias,
    };
  });

  // Multíparas que parem antes de completar o período seco já precisam estar secas hoje.
  let multiparasSecasNecessarias = 0;
  for (let n = 1; n < defasagem + 1; n++) {
    multiparasSecasNecessarias += (1 - fracPrimiparas) * partosNoMes(n) * Math.min(1, defasagem - (n - 1));
  }

  const leiteAno = resultado.reduce((s, m) => s + m.leiteMes, 0);
  const diasAno = resultado.reduce((s, m) => s + m.dias, 0);
  return {
    meses: resultado,
    premissas: {
      vacasLactacao, vacasSecas, producaoLitros, periodoSecoDias, descarteAnualPct, delMedio: usaCurva ? delMedio : null,
      partos: [...partos],
    },
    usaCurva,
    fracPrimiparas,
    somaPartos,
    leiteAno,
    leiteDiaMedio: leiteAno / diasAno,
    lactacaoMedia: resultado.reduce((s, m) => s + m.lactacaoMedia * m.dias, 0) / diasAno,
    alertas: {
      lactacaoZerou: zerou,
      // Positivo: há mais partos de multíparas no início do que vacas secas hoje.
      excessoPartosInicio: multiparasSecasNecessarias - vacasSecas,
    },
  };
}
