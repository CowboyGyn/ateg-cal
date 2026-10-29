// Módulo "Rebanho ideal — corte": formulário, cálculo e resultado.
import {
  calcularRebanhoCorte,
  FASES,
  INDICES_CORTE_PADRAO,
  PESOS_CORTE_PADRAO,
  SAIDA_PADRAO,
} from "../calc/corte.js";
import {
  $,
  fmt,
  fmtAnimais,
  escapar,
  lerNumero as lerCampo,
  salvarFormulario,
  restaurarFormulario,
  esquecerFormulario,
  cabecalhoRelatorio,
  premissasRelatorio,
  rodapeRelatorio,
  botaoPdf,
  ativarPdf,
  ativarDicas,
  avisarUso,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:rebanho-corte";

const form = $("formCorte");
const erro = $("erroCorte");
const resultado = $("resultadoCorte");

const CAMPOS_PESO = {
  pesoMatriz: "matriz",
  pesoTouro: "touro",
  pesoDesmama: "desmama",
  pesoNovilhaPrimeiroParto: "novilhaPrimeiroParto",
};

const DESCRICAO_FASE = {
  cria: "Vende os bezerros na desmama e recria só as novilhas de reposição.",
  recria: "Recria os machos e as fêmeas que sobram da reposição e vende como garrotes e novilhas.",
  completo: "Recria e engorda os machos até o abate; as fêmeas que sobram da reposição também são terminadas.",
};

// Cores dos grupos na mesma ordem validada do rebanho de leite (adultos → jovens).
const GRUPOS = {
  matrizes: { nome: "Matrizes", cor: "var(--cat-lactacao)" },
  touros: { nome: "Touros", cor: "var(--cat-secas)" },
  machos: { nome: "Machos em recria", cor: "var(--cat-novilhas2)" },
  femeas: { nome: "Fêmeas em recria", cor: "var(--cat-novilhas1)" },
  bezerros: { nome: "Bezerros ao pé", cor: "var(--cat-bezerras)" },
};

const lerNumero = (nome, padrao) => lerCampo(form, nome, padrao);
const faseAtual = () => form.elements.fase.value;

function preencherPlaceholders() {
  for (const [nome, valor] of Object.entries(INDICES_CORTE_PADRAO)) {
    form.elements[nome].placeholder = fmt(valor);
  }
  for (const [nome, chave] of Object.entries(CAMPOS_PESO)) {
    form.elements[nome].placeholder = PESOS_CORTE_PADRAO[chave];
  }
}

function atualizarFase() {
  const fase = faseAtual();
  $("descFase").textContent = DESCRICAO_FASE[fase];
  $("blocoSaida").hidden = fase === "cria";
  if (fase === "cria") return;
  const abate = fase === "completo";
  $("rotuloIdadeSaida").textContent = abate ? "Idade ao abate (meses)" : "Idade de venda dos machos (meses)";
  $("rotuloPesoSaida").textContent = abate ? "Peso vivo ao abate (kg)" : "Peso de venda dos machos (kg)";
  form.elements.idadeSaidaMeses.placeholder = SAIDA_PADRAO[fase].idadeMeses;
  form.elements.pesoSaidaKg.placeholder = SAIDA_PADRAO[fase].pesoKg;
}

function lerEntrada() {
  const fase = faseAtual();
  const indices = {};
  for (const [nome, valor] of Object.entries(INDICES_CORTE_PADRAO)) indices[nome] = lerNumero(nome, valor);
  const pesos = {};
  for (const [nome, chave] of Object.entries(CAMPOS_PESO)) pesos[chave] = lerNumero(nome, PESOS_CORTE_PADRAO[chave]);
  const saida = fase === "cria" ? {} : {
    idadeMeses: lerNumero("idadeSaidaMeses", SAIDA_PADRAO[fase].idadeMeses),
    pesoKg: lerNumero("pesoSaidaKg", SAIDA_PADRAO[fase].pesoKg),
  };
  return {
    fazenda: form.elements.fazenda.value.trim(),
    matrizes: lerNumero("matrizes", Number.NaN),
    fase,
    indices,
    pesos,
    saida,
  };
}

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
}

form.addEventListener("change", (e) => {
  if (e.target.name === "fase") atualizarFase();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const entrada = lerEntrada();
  if (!Number.isFinite(entrada.matrizes)) {
    mostrarErro("Informe o número de matrizes.");
    form.elements.matrizes.focus();
    return;
  }
  let r;
  try {
    r = calcularRebanhoCorte(entrada);
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvarFormulario(form, CHAVE_STORAGE);
  avisarUso("rebanho-corte", "calcular");
  resultado.innerHTML =
    cabecalhoRelatorio(`Rebanho ideal (corte) — ${FASES[r.fase].toLowerCase()}`, entrada.fazenda) +
    renderizarResultado(r, entrada.fazenda) +
    renderizarPremissas(r) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparCorte").addEventListener("click", () => {
  form.reset();
  atualizarFase();
  erro.hidden = true;
  resultado.hidden = true;
  resultado.innerHTML = "";
  esquecerFormulario(CHAVE_STORAGE);
});

function renderizarPremissas(r) {
  const ix = r.premissas;
  const p = r.pesos;
  const linhas = [
    ["Sistema de produção", FASES[r.fase]],
    ["Taxa de natalidade", `${fmt(ix.natalidadePct, 1)}%`],
    ["Mortalidade até a desmama", `${fmt(ix.mortDesmamaPct, 1)}%`],
    ["Desmama", `${fmt(ix.idadeDesmamaMeses, 1)} meses · ${fmt(p.desmama)} kg`],
    ["Mortalidade pós-desmama", `${fmt(ix.mortPosDesmamaPct, 1)}%/ano`],
    ["Idade ao 1º parto", `${fmt(ix.idadePrimeiroPartoMeses)} meses`],
    ["Descarte anual de matrizes", `${fmt(ix.descarteMatrizesPct, 1)}%`],
    ["Vacas por touro", fmt(ix.vacasPorTouro)],
    ["Fêmeas nos nascimentos", `${fmt(ix.femeasNascimentosPct)}%`],
  ];
  if (r.saida) {
    linhas.push([r.fase === "completo" ? "Abate dos machos" : "Venda dos machos",
      `${fmt(r.saida.idadeMeses)} meses · ${fmt(r.saida.pesoKg)} kg`]);
  }
  linhas.push(["Pesos (matriz / touro / novilha ao 1º parto)",
    `${fmt(p.matriz)} / ${fmt(p.touro)} / ${fmt(p.novilhaPrimeiroParto)} kg`]);
  return premissasRelatorio(linhas);
}

function nomeGrupo(grupo, fase) {
  if (grupo === "machos" && fase === "completo") return "Machos em recria e engorda";
  return GRUPOS[grupo].nome;
}

function renderizarComposicao(r) {
  const grupos = Object.keys(GRUPOS)
    .map((g) => {
      const itens = r.categorias.filter((c) => c.grupo === g);
      return {
        g,
        nome: nomeGrupo(g, r.fase),
        quantidade: itens.reduce((s, c) => s + c.quantidade, 0),
        inteiro: itens.reduce((s, c) => s + c.inteiro, 0),
      };
    })
    .filter((x) => x.quantidade > 0);
  const pct = (x) => (x.quantidade / r.total) * 100;
  const segmentos = grupos
    .map(
      (x) =>
        `<span style="flex:${x.quantidade};background:${GRUPOS[x.g].cor}"
          data-dica="${escapar(x.nome)}: ${fmt(x.inteiro)} cab. (${fmt(pct(x), 0)}%)"></span>`,
    )
    .join("");
  const legenda = grupos
    .map((x) => `<li><i style="background:${GRUPOS[x.g].cor}"></i>${escapar(x.nome)}<b>${fmt(pct(x), 0)}%</b></li>`)
    .join("");
  return `
    <div class="composicao" role="img" aria-label="Composição do rebanho por grupo">${segmentos}</div>
    <ul class="legenda">${legenda}</ul>`;
}

function renderizarResultado(r, fazenda) {
  const linhas = r.categorias
    .map(
      (c) => `
        <tr>
          <td><span class="ponto" style="background:${GRUPOS[c.grupo].cor}"></span>${escapar(c.nome)}</td>
          <td>${fmt(c.inteiro)}<span class="decimal">${fmt(c.quantidade, 1)}</span></td>
          <td>${fmt(c.ua, 1)}</td>
        </tr>`,
    )
    .join("");

  const subtitulo = [fazenda ? escapar(fazenda) : null, FASES[r.fase]].filter(Boolean).join(" · ");

  return `
    <h2>Rebanho ideal</h2>
    <p class="sub">${subtitulo}</p>
    <p class="destaque"><b>${fmt(r.totalInteiro)}</b><span>cabeças no total · ${fmt(r.uaTotal, 1)} UA</span></p>
    ${renderizarComposicao(r)}
    <h3>Por categoria</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Cabeças</th><th>UA</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${fmt(r.totalInteiro)}<span class="decimal">${fmt(r.total, 1)}</span></td>
          <td>${fmt(r.uaTotal, 1)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="indicadores">
      <div class="indicador"><b>${fmt(r.taxaDesmamaPct, 1)}%</b><span>taxa de desmama (desmamados / matrizes)</span></div>
      <div class="indicador"><b>${fmt(r.kgDesmamadoPorMatriz, 0)} kg</b><span>de bezerro desmamado por matriz</span></div>
      <div class="indicador"><b>${fmt(r.desfrutePct, 1)}%</b><span>taxa de desfrute (vendas − compras / rebanho)</span></div>
      <div class="indicador"><b>${fmt(r.pctMatrizes, 1)}%</b><span>matrizes no rebanho</span></div>
      <div class="indicador"><b>${fmt(r.kgVendidoPorMatriz, 0)} kg</b><span>de peso vivo vendido por matriz/ano</span></div>
      <div class="indicador"><b>${fmt(r.uaTotal / r.total, 2)}</b><span>UA por cabeça (450 kg = 1 UA)</span></div>
    </div>
    ${renderizarVendas(r)}
    ${renderizarReposicao(r)}
    <p class="nota">Rebanho estabilizado: o mesmo tamanho ano após ano. Cabeças arredondadas mantendo o total;
      o número menor mostra o valor calculado.</p>`;
}

function renderizarVendas(r) {
  const linhas = r.vendas
    .map((v) => `<tr><td>${escapar(v.nome)}</td><td>${fmt(v.cabecas)}</td><td>${fmt(v.kgTotal, 0)}</td></tr>`)
    .join("");
  return `
    <h3>Vendas por ano</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Cabeças</th><th>kg vivo</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(r.totalVendidos)}</td><td>${fmt(r.kgVendidos, 0)}</td></tr></tfoot>
    </table>`;
}

function renderizarReposicao(r) {
  const rep = r.reposicao;
  const linhas = [
    ["Bezerros nascidos por ano", rep.nascimentos],
    ["Bezerros desmamados por ano", rep.desmamados],
    ["Novilhas necessárias por ano (descarte)", rep.necessariaAno],
    ["Novilhas possíveis por ano (recriando todas)", rep.possivelAno],
  ]
    .map(([nome, v]) => `<tr><td>${nome}</td><td>${fmt(v)}</td></tr>`)
    .join("");

  let aviso;
  if (rep.compraAno > 0.05) {
    aviso = `<p class="aviso atencao">Déficit de reposição: faltam cerca de ${fmtAnimais(rep.compraAno)} por ano
      para repor o descarte. Reveja natalidade, mortalidade e descarte ou planeje a compra de novilhas.</p>`;
  } else if (rep.femeasExcedentes > 0.05) {
    aviso = `<p class="aviso ok">A reposição está garantida e sobram cerca de ${fmtAnimais(rep.femeasExcedentes, "bezerra")}
      por ano para venda.</p>`;
  } else {
    aviso = `<p class="aviso ok">A recria cobre a reposição do rebanho.</p>`;
  }

  return `
    <h3>Reposição</h3>
    <table><tbody>${linhas}</tbody></table>
    ${aviso}`;
}

ativarDicas(resultado);
ativarPdf(resultado, () => ["Rebanho corte", form.elements.fazenda.value.trim()], "rebanho-corte");

preencherPlaceholders();
restaurarFormulario(form, CHAVE_STORAGE);
atualizarFase();
