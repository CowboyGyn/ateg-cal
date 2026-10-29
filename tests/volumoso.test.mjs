import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularVolumosoSeca, mesesDaSeca, lotesDoRebanho, kgVolumosoPadrao } from "../js/calc/volumoso.js";
import { calcularPadraoAteg } from "../js/calc/rebanho.js";
import { calcularRebanhoCorte } from "../js/calc/corte.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("meses da seca: maio a outubro e virada do ano", () => {
  const seca = mesesDaSeca(4, 9);
  assert.equal(seca.length, 6);
  assert.equal(seca.reduce((s, m) => s + m.dias, 0), 184);
  assert.deepEqual(mesesDaSeca(10, 1).map((m) => m.nome), ["Novembro", "Dezembro", "Janeiro", "Fevereiro"]);
});

test("silagem de milho para 20 vacas em lactação", () => {
  const r = calcularVolumosoSeca({
    lotes: [{ tipo: "vacas-lactacao", animais: 20 }],
    volumosos: [{ tipo: "silagem-milho" }],
  });
  // 500 kg × 3% × 60% = 9 kg MS/dia; 20 vacas × 184 dias = 33,12 t MS
  perto(r.tMSCocho, 33.12);
  const v = r.volumosos[0];
  perto(v.participacaoPct, 100);
  perto(v.tMNFornecida, 33.12 / 0.33);
  perto(v.tMNNecessaria, 33.12 / 0.33 / 0.85);
  perto(v.areaHa, v.tMNNecessaria / 45);
  perto(r.custoTotal, v.tMNNecessaria * 250);
  perto(r.custoAnimalDia, r.custoTotal / (20 * 184));
  // Silo: comprimento = dias × fatia de 25 cm
  perto(v.silo.comprimentoM, 184 * 0.25);
  perto(v.silo.volumeM3, (v.tMNNecessaria * 1000) / 600);
  perto(v.silo.larguraM * v.silo.alturaM * v.silo.comprimentoM, v.silo.volumeM3);
});

test("pasto reduz o cocho e participações vazias dividem o resto", () => {
  const r = calcularVolumosoSeca({
    lotes: [{ tipo: "matrizes", animais: 100 }],
    pastoPct: 40,
    volumosos: [{ tipo: "silagem-milho", participacaoPct: 50 }, { tipo: "cana" }, { tipo: "feno" }],
  });
  perto(r.tMSPasto / r.tMSVolumoso, 0.4);
  assert.deepEqual(r.volumosos.map((v) => v.participacaoPct), [50, 25, 25]);
  perto(r.volumosos.reduce((s, v) => s + v.tMS, 0), r.tMSCocho);
  assert.equal(r.volumosos.find((v) => v.tipo === "cana").silo, null);
});

test("estoque: falta, sobra e mês em que acaba", () => {
  const base = { lotes: [{ tipo: "vacas-secas", animais: 10, kgMSDia: 10 }], volumosos: [] };
  // 10 × 10 kg × 184 d = 18,4 t MS; silagem 33% MS e 15% de perdas
  const necessario = 18.4 / 0.33 / 0.85;
  let r = calcularVolumosoSeca({ ...base, volumosos: [{ tipo: "silagem-milho", estoqueT: 30 }] });
  const v = r.volumosos[0];
  perto(v.faltaT, necessario - 30);
  // 30 t × 0,85 = 25,5 t no cocho; 0,303 t/dia → 84 dias → acaba em julho (maio 31 + junho 30 = 61; julho 92)
  perto(v.diasEstoque, (30 * 0.85) / (18.4 / 0.33 / 184));
  assert.equal(v.acabaEm, "Julho");
  assert.equal(r.meses.at(-1).estoqueFimT, 0);
  perto(r.meses[0].estoqueFimT, 25.5 - v.diarioMN * 31);

  r = calcularVolumosoSeca({ ...base, volumosos: [{ tipo: "silagem-milho", estoqueT: 100 }] });
  perto(r.volumosos[0].sobraT, 100 - necessario);
  assert.equal(r.volumosos[0].faltaT, 0);
  assert.equal(r.volumosos[0].acabaEm, null);
  assert.equal(r.areaHa, 0);
});

test("consumo mês a mês soma o total fornecido", () => {
  const r = calcularVolumosoSeca({
    lotes: [{ tipo: "vacas-lactacao", animais: 30 }, { tipo: "novilhas-leite", animais: 12, pesoKg: 300 }],
    volumosos: [{ tipo: "silagem-sorgo", participacaoPct: 70 }, { tipo: "capineira", participacaoPct: 30 }],
  });
  perto(r.meses.reduce((s, m) => s + m.consumoT, 0), r.tMNFornecida);
  perto(r.categorias[1].kgMSDia, kgVolumosoPadrao("novilhas-leite", 300));
});

test("importa o Rebanho ideal agrupando categorias", () => {
  const leite = calcularPadraoAteg(55);
  const lotes = lotesDoRebanho("leite", leite.categorias);
  assert.deepEqual(lotes.map((l) => l.tipo), ["vacas-lactacao", "vacas-secas", "novilhas-leite", "bezerras"]);
  assert.equal(lotes[0].animais, 55);

  const corte = calcularRebanhoCorte({ matrizes: 100, fase: "completo" });
  const lc = lotesDoRebanho("corte", corte.categorias, "completo");
  assert.deepEqual(lc.map((l) => l.tipo).sort(), ["bezerros-pe", "engorda", "matrizes", "recria", "touros"].sort());
  const soma = lc.reduce((s, l) => s + l.animais, 0);
  assert.ok(Math.abs(soma - corte.total) <= 2);
});

test("validações", () => {
  const lotes = [{ tipo: "matrizes", animais: 10 }];
  assert.throws(() => calcularVolumosoSeca({ lotes: [], volumosos: [{ tipo: "feno" }] }), /pelo menos uma categoria/);
  assert.throws(() => calcularVolumosoSeca({ lotes, volumosos: [] }), /pelo menos um volumoso/);
  assert.throws(() => calcularVolumosoSeca({ lotes, volumosos: [{ tipo: "feno", participacaoPct: 60 }, { tipo: "cana", participacaoPct: 30 }] }), /somam 90%/);
  assert.throws(() => calcularVolumosoSeca({ lotes, volumosos: [{ tipo: "feno" }, { tipo: "feno" }] }), /mais de uma vez/);
  assert.throws(() => calcularVolumosoSeca({ lotes, pastoPct: 100, volumosos: [{ tipo: "feno" }] }), /pasto fornece 100%/);
});
