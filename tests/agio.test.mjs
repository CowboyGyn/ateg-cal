import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAgio, CUSTOS_PADRAO, AGIO_LIMITE_PADRAO } from "../js/calc/agio.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("exemplo publicado: R$ 2.200 por 6,5@ com o boi a R$ 250/@", () => {
  const r = calcularAgio({ arrobaBoi: 250, lotes: [{ tipo: "bezerro", pesoKg: 195, preco: 2200 }] });
  const l = r.lotes[0];
  perto(l.arrobas, 6.5);
  perto(l.precoArroba, 338.46);
  perto(l.agioPct, 35.38);
  perto(l.agioArroba, 88.46);
  perto(l.agioAnimal, 575);
  perto(l.agioEmArrobas, 2.3);
  perto(l.relacaoTroca, 8.8);
});

test("240 kg equivalem a 8@ e as três formas de preço dão o mesmo ágio", () => {
  const base = { tipo: "bezerro", pesoKg: 240 };
  const r = calcularAgio({
    arrobaBoi: 300,
    lotes: [
      { ...base, forma: "animal", preco: 3200 },
      { ...base, forma: "kg", preco: 3200 / 240 },
      { ...base, forma: "arroba", preco: 400 },
    ],
  });
  assert.equal(r.lotes[0].arrobas, 8);
  for (const l of r.lotes) {
    perto(l.valorAnimal, 3200);
    perto(l.agioPct, 33.33);
  }
});

test("peso vazio usa a referência da categoria e deságio fica negativo", () => {
  const r = calcularAgio({ arrobaBoi: 300, lotes: [{ tipo: "boi-magro", forma: "arroba", preco: 270 }] });
  assert.equal(r.lotes[0].pesoKg, 375);
  perto(r.lotes[0].agioPct, -10);
  assert.ok(r.lotes[0].agioAnimal < 0);
});

test("compara categorias e soma o lote", () => {
  const r = calcularAgio({
    arrobaBoi: 300,
    lotes: [
      { tipo: "bezerro", animais: 10, forma: "arroba", preco: 450 },
      { tipo: "garrote", animais: 5, forma: "arroba", preco: 390 },
      { tipo: "boi-magro", forma: "arroba", preco: 360 },
    ],
  });
  assert.equal(r.menorAgio.tipo, "boi-magro");
  perto(r.lotes[0].valorLote, 36000);
  perto(r.lotes[0].agioLote, 12000);
});

test("preço-limite pelo ágio: padrão e valor informado", () => {
  const padrao = calcularAgio({ arrobaBoi: 300, lotes: [{ tipo: "bezerro", preco: 3000 }] });
  assert.equal(padrao.limitePct, AGIO_LIMITE_PADRAO);
  perto(padrao.lotes[0].limiteAnimal, 300 * 1.33 * 8);
  const r = calcularAgio({ arrobaBoi: 300, agioLimitePct: 20, lotes: [{ tipo: "bezerro", preco: 3000 }] });
  perto(r.lotes[0].limiteAnimal, 2880);
  perto(r.lotes[0].diferencaLimite, 120);
});

test("até quanto pagar: conta de trás para frente sem juros", () => {
  const r = calcularAgio({
    arrobaBoi: 300,
    lotes: [{ tipo: "bezerro", pesoKg: 240, preco: 3000 }],
    custos: { custoDia: 5, pesoVendaKg: 540, rendimentoPct: 50, gmdKg: 0.6, mortalidadePct: 0, freteAnimal: 100, margemAnimal: 400 },
  });
  const c = r.lotes[0].conta;
  perto(c.dias, 500); // 300 kg ÷ 0,6 kg/dia
  perto(c.arrobasVenda, 18); // 540 × 50% ÷ 15
  perto(c.receita, 5400);
  perto(c.custos, 2600);
  perto(c.precoMaximo, 2400);
  perto(c.precoMaxArroba, 300);
  perto(c.agioMaxPct, 0);
  perto(c.margemNoPreco, -200);
  perto(c.folga, -600);
});

test("até quanto pagar: mortalidade e juros reduzem o preço máximo", () => {
  const custos = { custoDia: 5, pesoVendaKg: 540, gmdKg: 0.6, rendimentoPct: 50, mortalidadePct: 0 };
  const lotes = [{ tipo: "bezerro", pesoKg: 240, preco: 3000 }];
  const base = calcularAgio({ arrobaBoi: 300, lotes, custos }).lotes[0].conta;
  const comPerda = calcularAgio({ arrobaBoi: 300, lotes, custos: { ...custos, mortalidadePct: 2 } }).lotes[0].conta;
  perto(comPerda.receita, 5400 * 0.98);
  const comJuros = calcularAgio({ arrobaBoi: 300, lotes, custos: { ...custos, jurosMesPct: 1 } }).lotes[0].conta;
  perto(comJuros.precoMaximo, base.precoMaximo / 1.01 ** (500 / 30));
});

test("até quanto pagar: usa a referência e a arroba do dia quando vazios", () => {
  const r = calcularAgio({
    arrobaBoi: 300,
    lotes: [{ tipo: "bezerro", preco: 3000 }],
    custos: { custoDia: 5, pesoVendaKg: null },
  });
  assert.equal(r.custos.pesoVendaKg, CUSTOS_PADRAO.pesoVendaKg);
  assert.equal(r.custos.arrobaVenda, 300);
});

test("animal mais pesado que o peso de venda não entra na conta", () => {
  const r = calcularAgio({
    arrobaBoi: 300,
    lotes: [{ tipo: "boi-magro", pesoKg: 550, preco: 5000 }],
    custos: { custoDia: 5 },
  });
  assert.equal(r.lotes[0].conta.semGanho, true);
});

test("validações", () => {
  const lotes = [{ tipo: "bezerro", preco: 3000 }];
  assert.throws(() => calcularAgio({ arrobaBoi: null, lotes }), /arroba do boi/);
  assert.throws(() => calcularAgio({ arrobaBoi: 300, lotes: [] }), /Adicione/);
  assert.throws(() => calcularAgio({ arrobaBoi: 300, lotes: [{ tipo: "bezerro", preco: null }] }), /preço/);
  assert.throws(() => calcularAgio({ arrobaBoi: 300, lotes, custos: { pesoVendaKg: 500 } }), /custo por animal/);
  assert.throws(() => calcularAgio({ arrobaBoi: 300, lotes, custos: { custoDia: 5, gmdKg: 0 } }), /ganho de peso/);
});
