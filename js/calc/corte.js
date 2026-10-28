// Estrutura ideal do rebanho de corte a partir do número de matrizes, em três sistemas:
// só cria, cria + recria e ciclo completo. Funções puras, sem dependência de interface.
import { KG_POR_UA, arredondarMantendoTotal } from "./rebanho.js";

export const FASES = {
  cria: "Só cria",
  recria: "Cria + recria",
  completo: "Ciclo completo",
};

export const INDICES_CORTE_PADRAO = {
  natalidadePct: 70,
  mortDesmamaPct: 5,
  idadeDesmamaMeses: 7,
  mortPosDesmamaPct: 2,
  idadePrimeiroPartoMeses: 36,
  descarteMatrizesPct: 20,
  vacasPorTouro: 25,
  femeasNascimentosPct: 50,
};

// Pesos vivos médios (kg). A desmama também entra nas vendas e no kg desmamado por matriz.
export const PESOS_CORTE_PADRAO = {
  matriz: 450,
  touro: 700,
  desmama: 180,
  novilhaPrimeiroParto: 380,
};

// Saída dos machos (e das fêmeas que sobram da reposição) em cada sistema.
export const SAIDA_PADRAO = {
  recria: { idadeMeses: 18, pesoKg: 330 },
  completo: { idadeMeses: 30, pesoKg: 520 },
};

const PESO_NASCER = 30;

function exigirNumero(valor, nome, min, max) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`${nome}: informe um número válido.`);
  }
  if (valor < min || valor > max) {
    throw new Error(`${nome}: o valor deve estar entre ${min} e ${max}.`);
  }
}

// Faixas de idade da desmama até a saída, cortadas aos 12, 24 e 36 meses.
function faixas(de, ate) {
  const cortes = [de, ...[12, 24, 36].filter((c) => c > de && c < ate), ate];
  return cortes.slice(1).map((c, i) => [cortes[i], c]);
}

const meses = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

export function calcularRebanhoCorte({ matrizes, fase = "cria", indices = {}, pesos = {}, saida = {} }) {
  exigirNumero(matrizes, "Matrizes", 1, 100000);
  if (!Number.isInteger(matrizes)) throw new Error("Matrizes: informe um número inteiro.");
  if (!FASES[fase]) throw new Error("Sistema de produção: opção inválida.");

  const ix = { ...INDICES_CORTE_PADRAO, ...indices };
  exigirNumero(ix.natalidadePct, "Taxa de natalidade (%)", 10, 100);
  exigirNumero(ix.mortDesmamaPct, "Mortalidade até a desmama (%)", 0, 50);
  exigirNumero(ix.idadeDesmamaMeses, "Idade à desmama (meses)", 3, 11);
  exigirNumero(ix.mortPosDesmamaPct, "Mortalidade pós-desmama (%/ano)", 0, 30);
  exigirNumero(ix.idadePrimeiroPartoMeses, "Idade ao 1º parto (meses)", 18, 54);
  exigirNumero(ix.descarteMatrizesPct, "Descarte anual de matrizes (%)", 0, 60);
  exigirNumero(ix.vacasPorTouro, "Vacas por touro", 5, 200);
  exigirNumero(ix.femeasNascimentosPct, "Fêmeas nos nascimentos (%)", 1, 100);

  const p = { ...PESOS_CORTE_PADRAO, ...pesos };
  exigirNumero(p.matriz, "Peso da matriz", 200, 900);
  exigirNumero(p.touro, "Peso do touro", 300, 1300);
  exigirNumero(p.desmama, "Peso à desmama", 60, 350);
  exigirNumero(p.novilhaPrimeiroParto, "Peso da novilha ao 1º parto", 200, 700);
  if (p.novilhaPrimeiroParto <= p.desmama) {
    throw new Error("O peso da novilha ao 1º parto deve ser maior que o peso à desmama.");
  }

  const desm = ix.idadeDesmamaMeses;
  const ipp = ix.idadePrimeiroPartoMeses;
  const comSaida = fase !== "cria";
  const sd = comSaida ? { ...SAIDA_PADRAO[fase], ...saida } : null;
  if (comSaida) {
    exigirNumero(sd.idadeMeses, "Idade de saída dos machos (meses)", desm + 1, 54);
    exigirNumero(sd.pesoKg, "Peso de saída dos machos", 100, 900);
    if (sd.pesoKg <= p.desmama) throw new Error("O peso de saída deve ser maior que o peso à desmama.");
  }

  const mp = ix.mortPosDesmamaPct / 100;
  const md = ix.mortDesmamaPct / 100;
  // Mortalidade anual distribuída de forma linear depois da desmama.
  const sobrevive = (idade) => Math.max(0, 1 - (mp * (idade - desm)) / 12);
  // Animais presentes numa faixa de idade, para um fluxo anual que entra na desmama.
  const estoque = (fluxo, de, ate) => (ate > de ? fluxo * ((ate - de) / 12) * sobrevive((de + ate) / 2) : 0);
  // Crescimento linear da desmama até o peso-alvo de cada sexo.
  const pesoFemea = (idade) => p.desmama + ((p.novilhaPrimeiroParto - p.desmama) * (idade - desm)) / (ipp - desm);
  const pesoMacho = (idade) => p.desmama + ((sd.pesoKg - p.desmama) * (idade - desm)) / (sd.idadeMeses - desm);

  const nascimentos = matrizes * (ix.natalidadePct / 100);
  const desmamados = nascimentos * (1 - md);
  const femeasDesmamadas = desmamados * (ix.femeasNascimentosPct / 100);
  const machosDesmamados = desmamados - femeasDesmamadas;
  const reposicaoNecessaria = matrizes * (ix.descarteMatrizesPct / 100);
  const sobrevPrimeiroParto = sobrevive(ipp);
  // Recria só as bezerras necessárias para repor o descarte; o resto segue o destino dos machos.
  const femeasReposicao = Math.min(femeasDesmamadas, reposicaoNecessaria / sobrevPrimeiroParto);
  const femeasExcedentes = femeasDesmamadas - femeasReposicao;
  const novilhasPossiveis = femeasDesmamadas * sobrevPrimeiroParto;
  const saldo = novilhasPossiveis - reposicaoNecessaria;
  const compraAno = Math.max(0, -saldo);
  // Touros para as matrizes e as novilhas que entram em reprodução.
  const touros = Math.ceil((matrizes + reposicaoNecessaria) / ix.vacasPorTouro);

  const categorias = [
    { id: "matrizes", grupo: "matrizes", nome: "Matrizes", quantidade: matrizes, pesoKg: p.matriz },
    { id: "touros", grupo: "touros", nome: "Touros", quantidade: touros, pesoKg: p.touro },
  ];

  if (comSaida) {
    for (const [de, ate] of faixas(desm, sd.idadeMeses)) {
      categorias.push({
        id: `machos-${de}`,
        grupo: "machos",
        nome: `Machos ${meses(de)}–${meses(ate)} meses`,
        quantidade: estoque(machosDesmamados, de, ate),
        pesoKg: pesoMacho((de + ate) / 2),
      });
    }
  }

  // Fêmeas: reposição até o 1º parto e, fora da só cria, excedentes até a idade de saída.
  const fimExcedentes = comSaida ? sd.idadeMeses : desm;
  for (const [de, ate] of faixas(desm, Math.max(ipp, fimExcedentes))) {
    const partes = [
      [femeasReposicao, Math.min(ate, ipp)],
      [femeasExcedentes, Math.min(ate, fimExcedentes)],
    ].map(([fluxo, fim]) => ({ q: estoque(fluxo, de, fim), peso: pesoFemea((de + Math.max(de, fim)) / 2) }));
    const quantidade = partes.reduce((s, x) => s + x.q, 0);
    if (quantidade <= 0) continue;
    categorias.push({
      id: `femeas-${de}`,
      grupo: "femeas",
      nome: `Fêmeas ${meses(de)}–${meses(ate)} meses`,
      quantidade,
      pesoKg: partes.reduce((s, x) => s + x.q * x.peso, 0) / quantidade,
    });
  }

  categorias.push({
    id: "bezerros",
    grupo: "bezerros",
    nome: `Bezerros(as) ao pé 0–${meses(desm)} meses`,
    quantidade: nascimentos * (desm / 12) * (1 - md / 2),
    pesoKg: (PESO_NASCER + p.desmama) / 2,
  });

  // Vendas por ano.
  const vendas = [{ nome: "Vacas de descarte", cabecas: reposicaoNecessaria, pesoKg: p.matriz }];
  if (fase === "cria") {
    vendas.push(
      { nome: "Bezerros desmamados", cabecas: machosDesmamados, pesoKg: p.desmama },
      { nome: "Bezerras desmamadas (fora da reposição)", cabecas: femeasExcedentes, pesoKg: p.desmama },
    );
  } else {
    const s = sobrevive(sd.idadeMeses);
    const idade = meses(sd.idadeMeses);
    vendas.push(
      {
        nome: fase === "completo" ? `Bois gordos (${idade} meses)` : `Garrotes (${idade} meses)`,
        cabecas: machosDesmamados * s,
        pesoKg: sd.pesoKg,
      },
      {
        nome: `Novilhas fora da reposição (${idade} meses)`,
        cabecas: femeasExcedentes * s,
        pesoKg: pesoFemea(sd.idadeMeses),
      },
    );
  }
  const vendasValidas = vendas.filter((v) => v.cabecas > 0.005).map((v) => ({ ...v, kgTotal: v.cabecas * v.pesoKg }));
  const totalVendidos = vendasValidas.reduce((s, v) => s + v.cabecas, 0);
  const kgVendidos = vendasValidas.reduce((s, v) => s + v.kgTotal, 0);

  const inteiros = arredondarMantendoTotal(categorias.map((c) => c.quantidade));
  const itens = categorias.map((c, i) => ({ ...c, inteiro: inteiros[i], ua: (c.quantidade * c.pesoKg) / KG_POR_UA }));
  const total = itens.reduce((s, c) => s + c.quantidade, 0);

  return {
    fase,
    premissas: ix,
    pesos: p,
    saida: sd,
    categorias: itens,
    total,
    totalInteiro: inteiros.reduce((s, v) => s + v, 0),
    uaTotal: itens.reduce((s, c) => s + c.ua, 0),
    pctMatrizes: (matrizes / total) * 100,
    taxaDesmamaPct: (desmamados / matrizes) * 100,
    kgDesmamadoPorMatriz: (desmamados * p.desmama) / matrizes,
    kgVendidoPorMatriz: kgVendidos / matrizes,
    // Desfrute: vendas menos compras de reposição, sobre o rebanho.
    desfrutePct: ((totalVendidos - compraAno) / total) * 100,
    vendas: vendasValidas,
    totalVendidos,
    kgVendidos,
    reposicao: {
      nascimentos,
      desmamados,
      femeasDesmamadas,
      necessariaAno: reposicaoNecessaria,
      possivelAno: novilhasPossiveis,
      saldoAno: saldo,
      compraAno,
      femeasExcedentes,
    },
  };
}
