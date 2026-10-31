// Módulo "Ágio de animais": animais a comparar, preço-limite e até quanto pagar.
import {
  calcularAgio,
  CATEGORIAS,
  FORMAS_PRECO,
  CUSTOS_PADRAO,
  AGIO_LIMITE_PADRAO,
  KG_POR_ARROBA_VIVA,
} from "../calc/agio.js";
import {
  $,
  fmt,
  numero,
  escapar,
  cabecalhoRelatorio,
  premissasRelatorio,
  rodapeRelatorio,
  botaoPdf,
  ativarPdf,
  avisarUso,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:agio";
const CAMPOS_LOTE = ["tipo", "animais", "pesoKg", "forma", "preco"];
const CAMPOS_GERAIS = ["fazenda", "arrobaBoi", "agioLimitePct"];
const CAMPOS_CUSTO = ["custoDia", "pesoVendaKg", "rendimentoPct", "gmdKg", "arrobaVenda", "mortalidadePct", "freteAnimal", "margemAnimal", "jurosMesPct"];

const form = $("formAgio");
const erro = $("erroAgio");
const resultado = $("resultadoAgio");
const lista = $("listaAgio");

const reais = (v, casas = 0) => `R$ ${fmt(v, casas)}`;
const porcento = (v) => `${fmt(v, 1)}%`;
const descreverAgio = (v) => (v < 0 ? `deságio de ${porcento(-v)}` : `ágio de ${porcento(v)}`);

// ---------- Formulário ----------

function opcoesCategorias() {
  const grupos = new Map();
  for (const [tipo, c] of Object.entries(CATEGORIAS)) {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, document.createElement("optgroup"));
    grupos.get(c.grupo).label = c.grupo;
    grupos.get(c.grupo).append(new Option(c.nome, tipo));
  }
  return [...grupos.values()];
}

const atualizarLote = (item) => {
  const tipo = item.querySelector('[data-campo="tipo"]').value;
  item.querySelector('[data-campo="pesoKg"]').placeholder = CATEGORIAS[tipo].pesoKg;
};

function novoLote(dados = {}) {
  const item = $("modeloAgio").content.firstElementChild.cloneNode(true);
  item.querySelector('[data-campo="tipo"]').replaceChildren(...opcoesCategorias());
  item.querySelector('[data-campo="forma"]').replaceChildren(...Object.entries(FORMAS_PRECO).map(([f, nome]) => new Option(nome, f)));
  for (const n of CAMPOS_LOTE) {
    const v = dados[n];
    if (v !== undefined && v !== null) item.querySelector(`[data-campo="${n}"]`).value = v;
  }
  item.addEventListener("change", () => atualizarLote(item));
  item.querySelector(".remover").addEventListener("click", () => item.remove());
  lista.append(item);
  atualizarLote(item);
  return item;
}

function lerLotes() {
  return [...lista.children].map((item) => {
    const dados = {};
    for (const n of CAMPOS_LOTE) dados[n] = item.querySelector(`[data-campo="${n}"]`).value.trim();
    return dados;
  });
}

$("btnAddAgio").addEventListener("click", () => {
  novoLote().querySelector('[data-campo="preco"]').focus();
});

// ---------- Salvar e restaurar ----------

function estadoAtual() {
  const estado = { lotes: lerLotes() };
  for (const n of [...CAMPOS_GERAIS, ...CAMPOS_CUSTO]) estado[n] = form.elements[n].value;
  return estado;
}

function salvar() {
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estadoAtual()));
  } catch {
    // Sem armazenamento: segue sem lembrar os dados.
  }
}

function iniciarLista(estado) {
  lista.replaceChildren();
  const lotes = estado?.lotes?.length ? estado.lotes : [{ tipo: "bezerro" }];
  for (const l of lotes) if (CATEGORIAS[l.tipo]) novoLote(l);
}

function restaurar() {
  let estado = null;
  try {
    estado = JSON.parse(localStorage.getItem(CHAVE_STORAGE));
  } catch {
    estado = null;
  }
  if (estado && typeof estado === "object") {
    for (const n of [...CAMPOS_GERAIS, ...CAMPOS_CUSTO]) {
      if (typeof estado[n] === "string" && estado[n] !== "") form.elements[n].value = estado[n];
    }
    if (CAMPOS_CUSTO.some((n) => estado[n])) $("blocoCustosAgio").open = true;
  }
  iniciarLista(estado);
}

// ---------- Cálculo ----------

function lerCustos(estado) {
  const custos = {};
  for (const n of CAMPOS_CUSTO) custos[n] = numero(estado[n]);
  return Object.values(custos).some((v) => v !== null) ? custos : null;
}

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const estado = estadoAtual();
  let r;
  try {
    r = calcularAgio({
      arrobaBoi: numero(estado.arrobaBoi),
      agioLimitePct: numero(estado.agioLimitePct),
      lotes: estado.lotes.map((l) => ({
        tipo: l.tipo,
        animais: numero(l.animais),
        pesoKg: numero(l.pesoKg),
        forma: l.forma,
        preco: numero(l.preco),
      })),
      custos: lerCustos(estado),
    });
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvar();
  avisarUso("agio", "calcular");
  const fazenda = estado.fazenda.trim();
  resultado.innerHTML =
    cabecalhoRelatorio("Ágio de animais", fazenda) +
    renderizarResultado(r, fazenda) +
    renderizarPremissas(r) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparAgio").addEventListener("click", () => {
  form.reset();
  iniciarLista(null);
  $("blocoCustosAgio").open = false;
  erro.hidden = true;
  resultado.hidden = true;
  resultado.innerHTML = "";
  try {
    localStorage.removeItem(CHAVE_STORAGE);
  } catch {
    // ignora
  }
});

// ---------- Resultado ----------

const nomeLote = (l) => `${escapar(l.nome)}<span class="decimal">${fmt(l.pesoKg)} kg · ${fmt(l.arrobas, 1)}@</span>`;

function renderizarResultado(r, fazenda) {
  const unico = r.lotes.length === 1;
  const m = r.menorAgio;
  return `
    <h2>Ágio de animais</h2>
    <p class="sub">${[fazenda ? escapar(fazenda) : null, `Boi gordo a ${reais(r.arrobaBoi, 2)}/@`].filter(Boolean).join(" · ")}</p>
    <p class="destaque"><b>${porcento(Math.abs(m.agioPct))}</b>
      <span>de ${m.agioPct < 0 ? "deságio" : "ágio"}${unico ? "" : ` · menor entre as categorias: ${escapar(m.nome.toLowerCase())}`}</span></p>
    <div class="indicadores">
      <div class="indicador"><b>${reais(m.precoArroba, 2)}</b><span>pagos por @ do animal</span></div>
      <div class="indicador"><b>${reais(m.agioAnimal)}</b><span>${m.agioAnimal < 0 ? "de deságio" : "de ágio"} por animal</span></div>
      <div class="indicador"><b>${fmt(m.relacaoTroca, 1)}@</b><span>de boi gordo para comprar um animal</span></div>
      <div class="indicador"><b>${reais(r.arrobaBoi * (1 + r.limitePct / 100) * m.arrobas)}</b><span>limite por animal com ${porcento(r.limitePct)} de ágio</span></div>
    </div>
    ${renderizarComparacao(r)}
    ${renderizarLimite(r)}
    ${r.custos ? renderizarAteQuantoPagar(r) : ""}
    ${r.lotes.some((l) => l.animais > 1) ? renderizarLotes(r) : ""}
    <p class="nota">Peso vivo convertido a ${KG_POR_ARROBA_VIVA} kg por arroba. Bezerros costumam ter ágio maior que
      garrotes e bois magros; compare também quanto cada categoria ainda vai ganhar de peso até a venda.</p>`;
}

function renderizarComparacao(r) {
  const linhas = r.lotes
    .map(
      (l) => `<tr>
        <td>${nomeLote(l)}</td>
        <td>${fmt(l.precoArroba, 2)}</td>
        <td>${porcento(l.agioPct)}</td>
        <td>${fmt(l.agioAnimal)}</td>
        <td>${fmt(l.relacaoTroca, 1)}</td>
      </tr>`,
    )
    .join("");
  return `
    <h3>${r.lotes.length > 1 ? "Comparação entre categorias" : "Ágio do animal"}</h3>
    <table>
      <thead><tr><th>Categoria</th><th>R$/@</th><th>Ágio</th><th>Ágio (R$/animal)</th><th>@ de boi por animal</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function renderizarLimite(r) {
  const linhas = r.lotes
    .map((l) => {
      const acima = l.diferencaLimite > 0;
      return `<tr>
        <td>${nomeLote(l)}</td>
        <td>${fmt(l.limiteAnimal)}</td>
        <td>${fmt(l.valorAnimal)}</td>
        <td>${acima ? `<b>Acima</b> em ${fmt(l.diferencaLimite)}` : `Dentro, sobra ${fmt(-l.diferencaLimite)}`}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3>Preço-limite com ${porcento(r.limitePct)} de ágio</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Limite (R$/animal)</th><th>Preço (R$/animal)</th><th>Situação (R$)</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function renderizarAteQuantoPagar(r) {
  const validos = r.lotes.filter((l) => !l.conta.semGanho);
  const ignorados = r.lotes.filter((l) => l.conta.semGanho);
  const avisos = ignorados.map(
    (l) => `<p class="aviso atencao">${escapar(l.nome)}: o peso de compra já alcança o peso de venda
      (${fmt(r.custos.pesoVendaKg)} kg), então não entra nesta conta.</p>`,
  );
  const blocos = validos.map((l) => {
    const c = l.conta;
    const cobre = c.precoMaximo > 0;
    const linhas = [
      ["Tempo até a venda", `${fmt(c.dias)} dias`],
      ["Arrobas vendidas por animal", `${fmt(c.arrobasVenda, 1)}@`],
      ["Receita esperada", reais(c.receita)],
      ["Custos até a venda (com frete e comissão)", reais(c.custos)],
      ["Preço máximo por animal", cobre ? `<b>${reais(c.precoMaximo)}</b>` : "<b>Não fecha</b>"],
    ];
    if (cobre) linhas.push(["Preço máximo por @", reais(c.precoMaxArroba, 2)], ["Ágio máximo", porcento(c.agioMaxPct)]);
    linhas.push(["Margem por animal no preço informado", reais(c.margemNoPreco)]);
    if (!cobre) {
      avisos.push(`<p class="aviso atencao">${escapar(l.nome)}: com estas premissas, a receita não cobre custos e margem
        nem com a compra de graça.</p>`);
    } else {
      avisos.push(
        c.folga >= 0
          ? `<p class="aviso ok">${escapar(l.nome)}: o preço informado está ${reais(c.folga)} abaixo do máximo por animal.</p>`
          : `<p class="aviso atencao">${escapar(l.nome)}: o preço informado passa ${reais(-c.folga)} do máximo por animal.</p>`,
      );
    }
    return `<h4>${escapar(l.nome)} <small>· ${fmt(l.pesoKg)} kg</small></h4>
      <table><tbody>${linhas.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
  });
  return `<h3>Até quanto pagar</h3>${avisos.join("")}${blocos.join("")}`;
}

function renderizarLotes(r) {
  const linhas = r.lotes
    .map((l) => `<tr><td>${escapar(l.nome)}</td><td>${fmt(l.animais)}</td><td>${fmt(l.valorLote)}</td><td>${fmt(l.agioLote)}</td></tr>`)
    .join("");
  const soma = (campo) => r.lotes.reduce((s, l) => s + l[campo], 0);
  return `
    <h3>Total da compra</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Animais</th><th>Valor (R$)</th><th>Ágio (R$)</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(soma("animais"))}</td><td>${fmt(soma("valorLote"))}</td><td>${fmt(soma("agioLote"))}</td></tr></tfoot>
    </table>`;
}

function renderizarPremissas(r) {
  const linhas = [
    ["Arroba do boi gordo (informada pelo usuário)", `${reais(r.arrobaBoi, 2)}/@`],
    ["Ágio máximo aceito", porcento(r.limitePct)],
    ...r.lotes.map((l) => [
      l.nome,
      `${fmt(l.animais)} ${l.animais === 1 ? "animal" : "animais"} · ${fmt(l.pesoKg)} kg · ${reais(l.valorAnimal)} por animal · ${descreverAgio(l.agioPct)}`,
    ]),
    ["Conversão do peso", `${KG_POR_ARROBA_VIVA} kg de peso vivo por arroba`],
  ];
  if (r.custos) {
    const c = r.custos;
    linhas.push(
      ["Venda", `${fmt(c.pesoVendaKg)} kg · rendimento de ${fmt(c.rendimentoPct, 1)}% · ${reais(c.arrobaVenda, 2)}/@`],
      ["Desempenho e custo", `${fmt(c.gmdKg, 2)} kg/dia · ${reais(c.custoDia, 2)} por animal/dia · mortalidade de ${fmt(c.mortalidadePct, 1)}%`],
      ["Frete, margem e juros", `${reais(c.freteAnimal)} por animal · ${reais(c.margemAnimal)} por animal · ${fmt(c.jurosMesPct, 2)}% ao mês`],
    );
  }
  return premissasRelatorio(linhas);
}

ativarPdf(resultado, () => ["Agio", form.elements.fazenda.value.trim()], "agio");

form.elements.agioLimitePct.placeholder = AGIO_LIMITE_PADRAO;
for (const n of ["pesoVendaKg", "rendimentoPct", "gmdKg", "mortalidadePct", "freteAnimal", "margemAnimal", "jurosMesPct"]) {
  form.elements[n].placeholder = fmt(CUSTOS_PADRAO[n], n === "gmdKg" ? 1 : 0);
}
restaurar();
