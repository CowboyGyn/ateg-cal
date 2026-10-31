// Ágio de animais de reposição sobre a arroba do boi gordo, preço-limite e conta de trás para
// frente (até quanto pagar). Funções puras, sem interface.

// Arroba de reposição pelo peso vivo: 240 kg = 8@ (referência de 50% de rendimento).
export const KG_POR_ARROBA_VIVA = 30;
const KG_POR_ARROBA_CARCACA = 15;

export const AGIO_LIMITE_PADRAO = 33; // média de 2014 a 2024 citada pela Scot Consultoria

export const CATEGORIAS = {
  "bezerro-desmama": { nome: "Bezerro desmamado", grupo: "Machos", pesoKg: 180 },
  bezerro: { nome: "Bezerro de 12 meses", grupo: "Machos", pesoKg: 240 },
  garrote: { nome: "Garrote", grupo: "Machos", pesoKg: 300 },
  "boi-magro": { nome: "Boi magro", grupo: "Machos", pesoKg: 375 },
  bezerra: { nome: "Bezerra desmamada", grupo: "Fêmeas", pesoKg: 180 },
  novilha: { nome: "Novilha", grupo: "Fêmeas", pesoKg: 270 },
  "vaca-magra": { nome: "Vaca magra", grupo: "Fêmeas", pesoKg: 360 },
  outra: { nome: "Outra categoria", grupo: "Outros", pesoKg: 300 },
};

export const FORMAS_PRECO = {
  animal: "R$ por animal",
  kg: "R$ por kg",
  arroba: "R$ por @",
};

export const CUSTOS_PADRAO = {
  pesoVendaKg: 520,
  rendimentoPct: 52,
  gmdKg: 0.6,
  mortalidadePct: 1,
  freteAnimal: 0,
  margemAnimal: 0,
  jurosMesPct: 0,
};

const positivo = (v) => Number.isFinite(v) && v > 0;
const naoNegativo = (v) => Number.isFinite(v) && v >= 0;

function calcularLote(l, arrobaBoi, limitePct) {
  const categoria = CATEGORIAS[l.tipo];
  if (!categoria) throw new Error("Escolha a categoria dos animais.");
  const pesoKg = l.pesoKg ?? categoria.pesoKg;
  const animais = l.animais ?? 1;
  const forma = l.forma ?? "animal";
  if (!positivo(pesoKg)) throw new Error(`Informe o peso de ${categoria.nome.toLowerCase()}.`);
  if (!positivo(animais)) throw new Error(`Informe o número de animais de ${categoria.nome.toLowerCase()}.`);
  if (!positivo(l.preco)) throw new Error(`Informe o preço de ${categoria.nome.toLowerCase()}.`);

  const arrobas = pesoKg / KG_POR_ARROBA_VIVA;
  const valorAnimal = forma === "kg" ? l.preco * pesoKg : forma === "arroba" ? l.preco * arrobas : l.preco;
  const precoArroba = valorAnimal / arrobas;
  const agioArroba = precoArroba - arrobaBoi;
  const agioAnimal = agioArroba * arrobas;
  const limiteAnimal = arrobaBoi * (1 + limitePct / 100) * arrobas;

  return {
    tipo: l.tipo,
    nome: categoria.nome,
    animais,
    pesoKg,
    arrobas,
    valorAnimal,
    valorLote: valorAnimal * animais,
    precoArroba,
    agioPct: (agioArroba / arrobaBoi) * 100,
    agioArroba,
    agioAnimal,
    agioLote: agioAnimal * animais,
    agioEmArrobas: agioAnimal / arrobaBoi,
    relacaoTroca: valorAnimal / arrobaBoi, // @ de boi gordo para comprar um animal
    limiteAnimal,
    diferencaLimite: valorAnimal - limiteAnimal, // positivo = acima do limite
  };
}

// Conta de trás para frente: receita da venda, menos custos e margem, trazida para a data da compra.
function ateQuantoPagar(lote, c, arrobaBoi) {
  if (c.pesoVendaKg <= lote.pesoKg) return { semGanho: true };
  const dias = (c.pesoVendaKg - lote.pesoKg) / c.gmdKg;
  const arrobasVenda = (c.pesoVendaKg * (c.rendimentoPct / 100)) / KG_POR_ARROBA_CARCACA;
  const receita = arrobasVenda * c.arrobaVenda * (1 - c.mortalidadePct / 100);
  const custos = dias * c.custoDia + c.freteAnimal;
  const fatorJuros = (1 + c.jurosMesPct / 100) ** (dias / 30);
  const precoMaximo = (receita - custos - c.margemAnimal) / fatorJuros;
  const precoMaxArroba = precoMaximo / lote.arrobas;
  return {
    semGanho: false,
    dias,
    arrobasVenda,
    receita,
    custos,
    precoMaximo,
    precoMaxArroba,
    agioMaxPct: (precoMaxArroba / arrobaBoi - 1) * 100,
    margemNoPreco: receita - custos - lote.valorAnimal * fatorJuros,
    folga: precoMaximo - lote.valorAnimal, // negativo = o preço pedido passa do máximo
  };
}

function validarCustos(custos, arrobaBoi) {
  const c = { ...CUSTOS_PADRAO, arrobaVenda: arrobaBoi };
  for (const [nome, valor] of Object.entries(custos)) if (valor !== null && valor !== undefined) c[nome] = valor;
  if (!naoNegativo(c.custoDia)) throw new Error("Informe o custo por animal por dia.");
  if (!positivo(c.pesoVendaKg)) throw new Error("Informe o peso de venda.");
  if (!(c.rendimentoPct > 0 && c.rendimentoPct <= 70)) throw new Error("Informe um rendimento de carcaça até 70%.");
  if (!positivo(c.gmdKg)) throw new Error("Informe o ganho de peso por dia.");
  if (!positivo(c.arrobaVenda)) throw new Error("Informe a arroba de venda.");
  if (!(c.mortalidadePct >= 0 && c.mortalidadePct < 100)) throw new Error("Informe a mortalidade de 0 a 99%.");
  if (!naoNegativo(c.freteAnimal) || !naoNegativo(c.margemAnimal) || !naoNegativo(c.jurosMesPct)) {
    throw new Error("Frete, margem e juros não podem ser negativos.");
  }
  return c;
}

// lotes: [{ tipo, animais, pesoKg, forma: "animal"|"kg"|"arroba", preco }]
// custos: null para não fazer a conta de trás para frente.
export function calcularAgio({ arrobaBoi, agioLimitePct, lotes, custos = null }) {
  if (!positivo(arrobaBoi)) throw new Error("Informe a arroba do boi gordo.");
  const limitePct = agioLimitePct ?? AGIO_LIMITE_PADRAO;
  if (!Number.isFinite(limitePct) || limitePct <= -100) throw new Error("Informe um ágio máximo válido.");
  if (!lotes?.length) throw new Error("Adicione ao menos uma categoria de animais.");

  const calculados = lotes.map((l) => calcularLote(l, arrobaBoi, limitePct));
  const c = custos ? validarCustos(custos, arrobaBoi) : null;
  if (c) for (const lote of calculados) lote.conta = ateQuantoPagar(lote, c, arrobaBoi);

  return {
    arrobaBoi,
    limitePct,
    lotes: calculados,
    menorAgio: calculados.reduce((menor, l) => (l.agioPct < menor.agioPct ? l : menor)),
    custos: c,
  };
}
