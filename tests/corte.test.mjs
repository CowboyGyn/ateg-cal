import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularRebanhoCorte } from "../js/calc/corte.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const soma = (r, grupo) => r.categorias.filter((c) => c.grupo === grupo).reduce((s, c) => s + c.quantidade, 0);

test("só cria com 100 matrizes e índices de referência", () => {
  const r = calcularRebanhoCorte({ matrizes: 100 });
  perto(r.reposicao.nascimentos, 70);
  perto(r.reposicao.desmamados, 66.5);
  perto(r.taxaDesmamaPct, 66.5);
  perto(r.kgDesmamadoPorMatriz, 66.5 * 180 / 100);
  // Touros para 100 matrizes + 20 novilhas, 25 por touro, arredondado para cima.
  assert.equal(r.categorias.find((c) => c.id === "touros").quantidade, 5);
  perto(soma(r, "bezerros"), 70 * (7 / 12) * 0.975);
  assert.equal(soma(r, "machos"), 0);
  // Fêmeas de reposição: 20 novilhas por ano chegando ao parto aos 36 meses.
  const sobrev36 = 1 - 0.02 * 29 / 12;
  perto(soma(r, "femeas"), (20 / sobrev36) * (29 / 12) * (1 - 0.02 * 14.5 / 12));
  assert.deepEqual(r.categorias.filter((c) => c.grupo === "femeas").map((c) => c.nome),
    ["Fêmeas 7–12 meses", "Fêmeas 12–24 meses", "Fêmeas 24–36 meses"]);
  perto(r.vendas.find((v) => v.nome === "Bezerros desmamados").cabecas, 33.25);
  perto(r.reposicao.compraAno, 0);
});

test("total arredondado bate com a soma das categorias", () => {
  for (const fase of ["cria", "recria", "completo"]) {
    const r = calcularRebanhoCorte({ matrizes: 37, fase });
    assert.equal(r.categorias.reduce((s, c) => s + c.inteiro, 0), r.totalInteiro);
    perto(r.totalInteiro, r.total, 0.5);
  }
});

test("cria + recria: machos até 18 meses e venda de garrotes", () => {
  const r = calcularRebanhoCorte({ matrizes: 100, fase: "recria" });
  perto(soma(r, "machos"), 33.25 * (11 / 12) * (1 - 0.02 * 5.5 / 12));
  const garrotes = r.vendas.find((v) => v.nome.startsWith("Garrotes"));
  perto(garrotes.cabecas, 33.25 * (1 - 0.02 * 11 / 12));
  assert.equal(garrotes.pesoKg, 330);
});

test("ciclo completo: faixas dos machos somam o mesmo que a faixa inteira", () => {
  const r = calcularRebanhoCorte({ matrizes: 100, fase: "completo" });
  assert.deepEqual(r.categorias.filter((c) => c.grupo === "machos").map((c) => c.nome),
    ["Machos 7–12 meses", "Machos 12–24 meses", "Machos 24–30 meses"]);
  perto(soma(r, "machos"), 33.25 * (23 / 12) * (1 - 0.02 * 11.5 / 12));
  assert.ok(r.vendas.some((v) => v.nome.startsWith("Bois gordos")));
  // Peso médio da faixa 24–30 meses fica entre a desmama e o abate.
  const ultima = r.categorias.find((c) => c.id === "machos-24");
  perto(ultima.pesoKg, 180 + (520 - 180) * (27 - 7) / 23);
});

test("natalidade baixa gera déficit de reposição e compra", () => {
  const r = calcularRebanhoCorte({ matrizes: 100, indices: { natalidadePct: 40 } });
  assert.ok(r.reposicao.saldoAno < 0);
  perto(r.reposicao.compraAno, 20 - 19 * (1 - 0.02 * 29 / 12));
  assert.ok(!r.vendas.some((v) => v.nome.startsWith("Bezerras")));
});

test("UA usa 450 kg", () => {
  const r = calcularRebanhoCorte({ matrizes: 90 });
  perto(r.categorias.find((c) => c.id === "matrizes").ua, 90);
});

test("validações", () => {
  assert.throws(() => calcularRebanhoCorte({ matrizes: 10.5 }), /inteiro/);
  assert.throws(() => calcularRebanhoCorte({ matrizes: 10, fase: "x" }), /inválida/);
  assert.throws(() => calcularRebanhoCorte({ matrizes: 10, fase: "recria", saida: { pesoKg: 150 } }), /peso de saída/);
  assert.throws(() => calcularRebanhoCorte({ matrizes: 10, fase: "completo", saida: { idadeMeses: 6 } }), /Idade de saída/);
});
