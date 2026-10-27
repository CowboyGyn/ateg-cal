// Módulo "Previsão de leite": vacas em lactação e produção nos próximos 12 meses.
import { calcularPrevisao, mesesSeguintes, partosMediosMes, PREVISAO_PADRAO } from "../calc/previsao.js";
import {
  $,
  fmt,
  escapar,
  lerNumero,
  salvarFormulario,
  restaurarFormulario,
  esquecerFormulario,
  cabecalhoRelatorio,
  premissasRelatorio,
  rodapeRelatorio,
  botaoPdf,
  ativarPdf,
  ativarDicas,
  graficoBarras,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:previsao-leite";

const form = $("formPrevisao");
const gradePartos = $("gradePartos");
const erro = $("erroPrevisao");
const resultado = $("resultadoPrevisao");

const ler = (nome, padrao) => lerNumero(form, nome, padrao);

// Campos dos partos, um por mês, a partir do próximo mês.
function montarGradePartos() {
  gradePartos.innerHTML = mesesSeguintes()
    .map(
      (m, i) => `
        <label class="campo campo-mes"><span>${m.rotulo}</span>
          <input name="parto${i}" type="number" inputmode="decimal" min="0" step="1"></label>`,
    )
    .join("");
}

// Sugestão de partos (rebanho em equilíbrio) aparece como placeholder dos meses vazios.
function sugestaoPartos() {
  const vacas = ler("vacasLactacao", 0) + ler("vacasSecas", 0);
  const iep = ler("iepMeses", PREVISAO_PADRAO.iepMeses);
  if (!Number.isFinite(vacas) || !Number.isFinite(iep) || vacas <= 0 || iep <= 0) return null;
  return partosMediosMes(vacas, iep);
}

function atualizarSugestao() {
  const s = sugestaoPartos();
  for (let i = 0; i < 12; i++) form.elements[`parto${i}`].placeholder = s === null ? "" : fmt(s, 1);
  $("dicaPartos").textContent =
    s === null
      ? "Informe as vacas para ver a sugestão de partos."
      : `Mês vazio usa a média do rebanho: ${fmt(s, 1)} partos/mês (vacas ÷ IEP).`;
}

function preencherPlaceholders() {
  form.elements.periodoSecoDias.placeholder = PREVISAO_PADRAO.periodoSecoDias;
  form.elements.descarteAnualPct.placeholder = PREVISAO_PADRAO.descarteAnualPct;
  form.elements.iepMeses.placeholder = PREVISAO_PADRAO.iepMeses;
}

function lerEntrada() {
  const sugestao = sugestaoPartos() ?? 0;
  return {
    fazenda: form.elements.fazenda.value.trim(),
    vacasLactacao: ler("vacasLactacao", Number.NaN),
    vacasSecas: ler("vacasSecas", 0),
    producaoLitros: ler("producaoLitros", Number.NaN),
    periodoSecoDias: ler("periodoSecoDias", PREVISAO_PADRAO.periodoSecoDias),
    descarteAnualPct: ler("descarteAnualPct", PREVISAO_PADRAO.descarteAnualPct),
    iepMeses: ler("iepMeses", PREVISAO_PADRAO.iepMeses),
    delMedio: ler("delMedio", null),
    partos: Array.from({ length: 12 }, (_, i) => ler(`parto${i}`, sugestao)),
  };
}

function mostrarErro(msg, campo) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
  if (campo) form.elements[campo].focus();
}

form.addEventListener("input", (e) => {
  if (["vacasLactacao", "vacasSecas", "iepMeses"].includes(e.target.name)) atualizarSugestao();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const entrada = lerEntrada();
  if (!Number.isFinite(entrada.vacasLactacao)) return mostrarErro("Informe as vacas em lactação hoje.", "vacasLactacao");
  if (!Number.isFinite(entrada.producaoLitros)) return mostrarErro("Informe a produção média por vaca.", "producaoLitros");
  let r;
  try {
    r = calcularPrevisao(entrada);
  } catch (err) {
    return mostrarErro(err.message);
  }
  salvarFormulario(form, CHAVE_STORAGE);
  resultado.innerHTML =
    cabecalhoRelatorio("Previsão de lactação e leite — 12 meses", entrada.fazenda) +
    renderizarResultado(r, entrada) +
    renderizarPremissas(r, entrada) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparPrevisao").addEventListener("click", () => {
  form.reset();
  atualizarSugestao();
  erro.hidden = true;
  resultado.hidden = true;
  resultado.innerHTML = "";
  esquecerFormulario(CHAVE_STORAGE);
});

// ---------- Resultado ----------

const litros = (v) => `${fmt(v)} L`;
const litrosEixo = (v) => (v >= 1000 ? `${fmt(v / 1000, v % 1000 ? 1 : 0)} mil` : fmt(v));

function renderizarResultado(r, entrada) {
  const meses = r.meses;
  const curto = meses.map((m) => m.rotulo.slice(0, 3));
  const maior = meses.reduce((a, b) => (b.leiteMes > a.leiteMes ? b : a));
  const menor = meses.reduce((a, b) => (b.leiteMes < a.leiteMes ? b : a));

  const graficoVacas = graficoBarras({
    valores: meses.map((m) => m.lactacaoMedia),
    rotulos: curto,
    cor: "var(--cat-lactacao)",
    formatar: (v, eixo) => fmt(v, eixo ? 0 : 1),
    dicas: meses.map(
      (m) => `${m.rotulo}: ${fmt(m.lactacaoMedia, 1)} vacas em lactação (${fmt(m.partos, 1)} partos, ${fmt(m.secagens, 1)} secagens)`,
    ),
    descricao: "Vacas em lactação previstas por mês",
  });
  const graficoLeite = graficoBarras({
    valores: meses.map((m) => m.leiteMes),
    rotulos: curto,
    cor: "var(--verde)",
    formatar: (v, eixo) => fmt(v / 1000, eixo && v % 1000 === 0 ? 0 : 1),
    dicas: meses.map((m) => `${m.rotulo}: ${litros(m.leiteMes)} no mês · ${fmt(m.leiteDia)} L/dia`),
    descricao: "Produção de leite prevista por mês",
  });
  const graficoPorVaca = r.usaCurva
    ? `<h3>Produção por vaca (L/dia) pela curva de lactação</h3>` +
      graficoBarras({
        valores: meses.map((m) => m.litrosVaca),
        rotulos: curto,
        cor: "var(--cat-secas)",
        formatar: (v, eixo) => fmt(v, eixo ? 0 : 1),
        dicas: meses.map((m) => `${m.rotulo}: ${fmt(m.litrosVaca, 1)} L/vaca/dia · DEL médio ${fmt(m.delMedio)} dias`),
        descricao: "Produção média por vaca em lactação por mês",
      })
    : "";

  const linhas = meses
    .map(
      (m) => `
        <tr>
          <td>${m.rotulo}</td>
          <td>${fmt(m.partos, 1)}</td>
          <td>${fmt(m.lactacaoMedia, 1)}</td>
          <td>${fmt(m.pctLactacao, 0)}%</td>
          <td>${fmt(m.leiteMes)}</td>
        </tr>`,
    )
    .join("");

  const avisos = [];
  if (r.alertas.excessoPartosInicio > 0.5) {
    avisos.push(`Os partos de vacas adultas previstos para os próximos ${fmt(entrada.periodoSecoDias)} dias
      superam as vacas secas hoje em cerca de ${fmt(r.alertas.excessoPartosInicio, 1)}. Confira o controle reprodutivo
      ou o número de vacas secas.`);
  }
  if (r.alertas.lactacaoZerou) {
    avisos.push("Com esses partos, as vacas em lactação chegam a zero em algum mês. Confira os partos previstos.");
  }

  const subtitulo = [
    entrada.fazenda ? escapar(entrada.fazenda) : null,
    `${fmt(entrada.producaoLitros, 1)} L/vaca/dia`,
    r.usaCurva ? `DEL ${fmt(entrada.delMedio)} dias (curva de lactação)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <h2>Previsão para 12 meses</h2>
    <p class="sub">${subtitulo}</p>
    <p class="destaque"><b>${fmt(r.leiteAno)}</b><span>litros em 12 meses · ${fmt(r.leiteDiaMedio)} L/dia em média</span></p>

    <h3>Vacas em lactação (média do mês)</h3>
    ${graficoVacas}
    <h3>Produção de leite (mil litros/mês)</h3>
    ${graficoLeite}
    ${graficoPorVaca}

    <div class="indicadores">
      <div class="indicador"><b>${fmt(r.lactacaoMedia, 1)}</b><span>vacas em lactação em média</span></div>
      <div class="indicador"><b>${maior.rotulo}</b><span>maior produção: ${litrosEixo(Math.round(maior.leiteMes / 100) * 100)} L</span></div>
      <div class="indicador"><b>${menor.rotulo}</b><span>menor produção: ${litrosEixo(Math.round(menor.leiteMes / 100) * 100)} L</span></div>
    </div>
    ${avisos.map((a) => `<p class="aviso atencao">${a}</p>`).join("")}

    <h3>Mês a mês</h3>
    <table class="tabela-meses">
      <thead><tr><th>Mês</th><th>Partos</th><th>Em lactação</th><th>% lact.</th><th>Leite (L)</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${fmt(r.somaPartos, 1)}</td>
          <td>${fmt(r.lactacaoMedia, 1)}</td>
          <td></td>
          <td>${fmt(r.leiteAno)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="nota nota-modelo">${
      r.usaCurva
        ? `Produção pela curva de lactação (Wood, pico perto de 50 dias), ajustada para ${fmt(entrada.producaoLitros, 1)}
          L/vaca/dia com DEL médio de ${fmt(entrada.delMedio)} dias hoje.`
        : "Produção pela média informada (sem curva de lactação)."
    } Secagens estimadas
      ${fmt(entrada.periodoSecoDias)} dias antes de cada parto de vaca adulta; descartes de
      ${fmt(entrada.descarteAnualPct, 0)}% ao ano saindo da lactação, repostos por novilhas
      (${fmt(r.fracPrimiparas * 100, 0)}% dos partos).</p>`;
}

function renderizarPremissas(r, entrada) {
  return premissasRelatorio([
    ["Vacas em lactação hoje", fmt(entrada.vacasLactacao)],
    ["Vacas secas hoje", fmt(entrada.vacasSecas)],
    ["Produção média", `${fmt(entrada.producaoLitros, 1)} L/vaca/dia`],
    ["DEL médio hoje", r.usaCurva ? `${fmt(entrada.delMedio)} dias (curva de lactação)` : "Não informado (produção constante)"],
    ["Período seco", `${fmt(entrada.periodoSecoDias)} dias`],
    ["Descarte anual de vacas", `${fmt(entrada.descarteAnualPct, 1)}%`],
    ["Partos de novilhas (estimado)", `${fmt(r.fracPrimiparas * 100, 0)}% dos partos`],
  ]);
}

ativarDicas(resultado);
ativarPdf(resultado, () => ["Previsão de leite", form.elements.fazenda.value.trim()]);

// Os partos são salvos por posição (mês 1 a 12). Se o mês virou desde o último uso,
// desloca os valores para cada parto continuar no seu mês do calendário.
function alinharPartosAoMesAtual() {
  const [primeiro] = mesesSeguintes();
  const atual = `${primeiro.ano}-${primeiro.mes}`;
  const salvo = form.elements.inicioPrevisao.value;
  form.elements.inicioPrevisao.value = atual;
  if (!salvo || salvo === atual) return;
  const [ano, mes] = salvo.split("-").map(Number);
  const desloc = (primeiro.ano - ano) * 12 + (primeiro.mes - mes);
  const valores = Array.from({ length: 12 }, (_, i) => form.elements[`parto${i}`].value);
  for (let i = 0; i < 12; i++) form.elements[`parto${i}`].value = valores[i + desloc] ?? "";
}

montarGradePartos();
preencherPlaceholders();
restaurarFormulario(form, CHAVE_STORAGE);
alinharPartosAoMesAtual();
atualizarSugestao();
