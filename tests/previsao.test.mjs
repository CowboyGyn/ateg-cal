import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPrevisao, curvaLactacao, mesesSeguintes, partosMediosMes } from "../js/calc/previsao.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const HOJE = new Date(2026, 9, 27); // 27/out/2026

const base = (extra = {}) => {
  const vacas = 35;
  return {
    vacasLactacao: 30,
    vacasSecas: 5,
    producaoLitros: 18,
    partos: Array(12).fill(partosMediosMes(vacas, 13)),
    hoje: HOJE,
    ...extra,
  };
};

test("meses seguintes começam no próximo mês e sabem os dias", () => {
  const m = mesesSeguintes(HOJE);
  assert.equal(m.length, 12);
  assert.equal(m[0].rotulo, "nov/26");
  assert.equal(m[0].dias, 30);
  assert.equal(m[3].rotulo, "fev/27");
  assert.equal(m[3].dias, 28);
  assert.equal(m[11].rotulo, "out/27");
});

test("rebanho em equilíbrio mantém as vacas em lactação estáveis", () => {
  const r = calcularPrevisao(base());
  for (const m of r.meses) perto(m.lactacaoFim, 30, 0.1);
  // Primíparas = descartes / partos = (35 × 20%) / (35 / 13 × 12)
  perto(r.fracPrimiparas, (35 * 0.2) / ((35 / 13) * 12));
});

test("leite do mês = média de vacas × litros × dias", () => {
  const r = calcularPrevisao(base());
  for (const m of r.meses) perto(m.leiteMes, m.lactacaoMedia * 18 * m.dias);
  perto(r.leiteAno, r.meses.reduce((s, m) => s + m.leiteMes, 0));
  perto(r.leiteDiaMedio, r.leiteAno / 365, 0.5);
});

test("concentração de partos aumenta a lactação nos meses seguintes", () => {
  const partos = Array(12).fill(1);
  partos[2] = 10; // pico de partos em jan/27
  const r = calcularPrevisao(base({ partos }));
  assert.ok(r.meses[2].lactacaoFim > r.meses[1].lactacaoFim + 5);
});

test("secagens seguem os partos com a defasagem do período seco", () => {
  const partos = Array(12).fill(0);
  partos[5] = 6; // abr/27; com PS de 60 dias, essas vacas secam por volta de fev/27
  const r = calcularPrevisao(base({ partos, descarteAnualPct: 0 }));
  const secagens = r.meses.map((m) => m.secagens);
  // Nos dois últimos meses entram partos de depois do 12º mês (média informada).
  perto(secagens.slice(0, 10).reduce((s, v) => s + v, 0), 6);
  assert.ok(secagens[3] > 5, `${secagens}`);
});

test("lactação não fica negativa e avisa", () => {
  const r = calcularPrevisao(base({ vacasLactacao: 2, partos: Array(12).fill(0), descarteAnualPct: 60 }));
  assert.ok(r.meses.every((m) => m.lactacaoFim >= 0));
  assert.equal(r.alertas.lactacaoZerou, true);
});

test("avisa quando os partos próximos superam as vacas secas", () => {
  const partos = Array(12).fill(2);
  partos[0] = 12;
  const r = calcularPrevisao(base({ partos, vacasSecas: 3 }));
  assert.ok(r.alertas.excessoPartosInicio > 0);
  assert.ok(calcularPrevisao(base()).alertas.excessoPartosInicio <= 0);
});

test("sem DEL a produção por vaca é a média informada", () => {
  const r = calcularPrevisao(base());
  assert.equal(r.usaCurva, false);
  for (const m of r.meses) {
    assert.equal(m.litrosVaca, 18);
    assert.equal(m.delMedio, null);
  }
});

test("curva de lactação tem pico perto de 50 dias", () => {
  assert.ok(curvaLactacao(50) > curvaLactacao(20));
  assert.ok(curvaLactacao(50) > curvaLactacao(100));
  const persistencia = curvaLactacao(300) / curvaLactacao(50);
  assert.ok(persistencia > 0.4 && persistencia < 0.65, `${persistencia}`);
});

test("com DEL, o primeiro mês parte da produção informada", () => {
  const r = calcularPrevisao(base({ delMedio: 160 }));
  assert.equal(r.usaCurva, true);
  // Um mês depois as vacas estão 30 dias mais adiantadas: produção um pouco diferente, mas próxima.
  perto(r.meses[0].litrosVaca, 18, 1.5);
  perto(r.meses[0].delMedio, 160, 25);
  // Mesmo número de vacas em lactação com ou sem curva.
  const sem = calcularPrevisao(base());
  r.meses.forEach((m, i) => perto(m.lactacaoFim, sem.meses[i].lactacaoFim, 1e-9));
});

test("com DEL, rebanho em equilíbrio fica estável e com DEL plausível", () => {
  const r = calcularPrevisao(base({ delMedio: 165 }));
  for (const m of r.meses.slice(6)) {
    perto(m.litrosVaca, 18, 2);
    assert.ok(m.delMedio > 120 && m.delMedio < 200, `${m.delMedio}`);
  }
});

test("com DEL, pico de partos aumenta a produção por vaca e reduz o DEL", () => {
  const partos = Array(12).fill(1);
  partos[3] = 12;
  const r = calcularPrevisao(base({ partos, delMedio: 200 }));
  assert.ok(r.meses[4].litrosVaca > r.meses[2].litrosVaca + 1, `${r.meses[4].litrosVaca} vs ${r.meses[2].litrosVaca}`);
  assert.ok(r.meses[3].delMedio < r.meses[2].delMedio);
});

test("validações", () => {
  assert.throws(() => calcularPrevisao(base({ delMedio: 1000 })));
  assert.throws(() => calcularPrevisao(base({ producaoLitros: 0 })));
  assert.throws(() => calcularPrevisao(base({ partos: [1, 2, 3] })));
  assert.throws(() => calcularPrevisao(base({ vacasLactacao: 0, vacasSecas: 0 })));
  assert.throws(() => calcularPrevisao(base({ partos: Array(12).fill(Number.NaN) })));
});
