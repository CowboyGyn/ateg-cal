/**
 * ATeG Cal — login e cadastro pelo celular usando a planilha de usuários.
 *
 * Este script roda na conta Google do dono da planilha. O app envia os dados;
 * o script confere/grava na planilha e responde só { ok, nome } ou { ok: false, erro }.
 * A planilha e as senhas nunca vão para o celular do usuário.
 *
 * Colunas reconhecidas pelo cabeçalho (linha 1, qualquer ordem, maiúsculas ou não):
 *   Nome | Celular (ou Telefone, Número, WhatsApp) | Senha | Ativo ("não" bloqueia)
 *   Município | UF (ou uma só "Município/UF") | E-mail | Função | Cadastro em
 * As colunas que faltarem são criadas no primeiro cadastro feito pelo app.
 *
 * Histórico de versões (aumente VERSAO a cada mudança e publique uma "Nova versão"):
 *   1.0.0 — 27/10/2026 — login por celular e senha, bloqueio após 5 tentativas.
 *   1.1.0 — 27/10/2026 — "Primeiro acesso": cadastro pelo app, liberado na hora,
 *                        com aviso por e-mail ao dono da planilha.
 *   1.2.0 — 28/10/2026 — contagem de uso dos módulos nas abas "Uso" e "Resumo de uso".
 *   1.3.0 — 28/10/2026 — aceite dos Termos de uso: colunas "Termos aceitos em" e
 *                        "Versão dos termos", gravadas no cadastro e pela ação "aceite".
 *   1.4.0 — 29/10/2026 — contagem de uso do módulo "Volumoso para a seca".
 *   1.5.0 — 31/10/2026 — contagem dos convites enviados pelo WhatsApp; fórmulas do
 *                        "Resumo de uso" corrigidas para planilha em português.
 */

const VERSAO = "1.5.0";
const PLANILHA_ID = "1SFTDBS8Jiz3yPBbbdkgb8MkWZCbKU9Ed8wjDxNR7pAA";
const ABA = ""; // vazio = primeira aba
const MAX_TENTATIVAS = 5;
const BLOQUEIO_SEGUNDOS = 15 * 60;
const MAX_CADASTROS_HORA = 30; // proteção contra cadastros em massa
const AVISAR_CADASTRO_POR_EMAIL = true;

// Colunas da planilha: nome do cabeçalho criado e padrão para reconhecer um existente.
const COLUNAS = {
  nome: { titulo: "Nome", re: /^nome/ },
  celular: { titulo: "Celular", re: /celular|telefone|numero|whats|fone/ },
  senha: { titulo: "Senha", re: /senha/ },
  ativo: { titulo: "Ativo", re: /ativo|status/ },
  municipio: { titulo: "Município", re: /munic|cidade/ },
  uf: { titulo: "UF", re: /^uf$|^estado/ },
  email: { titulo: "E-mail", re: /^e-?mail/ },
  funcao: { titulo: "Função", re: /^funcao|^cargo/ },
  cadastroEm: { titulo: "Cadastro em", re: /^cadastr|^data/ },
  termosEm: { titulo: "Termos aceitos em", re: /^termos/ },
  termosVersao: { titulo: "Versão dos termos", re: /^versao.*termos/ },
};
const MAX_ACEITES_HORA = 10; // por celular

// Contagem de uso: só aceita módulos e ações conhecidos, gravados com nome legível.
const ABA_USO = "Uso";
const ABA_RESUMO = "Resumo de uso";
const MODULOS_USO = {
  app: "App",
  "rebanho-leite": "Rebanho ideal — leite",
  "previsao-leite": "Previsão de leite",
  "rebanho-corte": "Rebanho ideal — corte",
  "volumoso-seca": "Volumoso para a seca",
  convite: "Convite",
};
const ACOES_USO = { abrir: "Abriu", calcular: "Calculou", pdf: "Exportou PDF", enviar: "Enviou" };
const MAX_EVENTOS_ENVIO = 100;
const MAX_ENVIOS_HORA = 60; // por celular

function doGet() {
  return responder({ ok: true, servico: "ATeG Cal login" });
}

function doPost(e) {
  let dados;
  try {
    dados = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: "Requisição inválida." });
  }
  if (dados.acao === "login") return responder(login(String(dados.celular || ""), String(dados.senha || "")));
  if (dados.acao === "cadastro") return responder(cadastrar(dados));
  if (dados.acao === "uso") return responder(registrarUso(dados));
  if (dados.acao === "aceite") return responder(registrarAceite(dados));
  return responder({ ok: false, erro: "Ação desconhecida." });
}

// ---------- Login ----------

function login(celular, senha) {
  const chave = chaveCelular(celular);
  if (!chave || !senha) return { ok: false, erro: "Informe o celular e a senha." };

  const cache = CacheService.getScriptCache();
  const chaveCache = "tentativas_" + chave;
  const tentativas = Number(cache.get(chaveCache) || 0);
  if (tentativas >= MAX_TENTATIVAS) {
    return { ok: false, erro: "Muitas tentativas. Aguarde 15 minutos ou use “Esqueci a senha”." };
  }

  const usuario = buscarUsuario(chave);
  if (!usuario || String(usuario.senha).trim() !== senha.trim()) {
    cache.put(chaveCache, String(tentativas + 1), BLOQUEIO_SEGUNDOS);
    return { ok: false, erro: "Celular ou senha incorretos." };
  }
  if (usuario.ativo === false) {
    return { ok: false, erro: "Acesso desativado. Fale com a Zootécnica ATeG." };
  }
  cache.remove(chaveCache);
  // termos: versão já aceita (vazio = o app pede o aceite).
  return { ok: true, nome: String(usuario.nome || "").trim(), termos: String(usuario.termos || "").trim() };
}

function buscarUsuario(chave) {
  const aba = abrirAba();
  const valores = aba.getDataRange().getDisplayValues();
  if (valores.length < 2) return null;

  const col = localizarColunas(valores[0]);
  if (col.celular < 0 || col.senha < 0) throw new Error("A planilha precisa das colunas Celular e Senha.");

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    if (chaveCelular(linha[col.celular]) !== chave) continue;
    const ativo = col.ativo < 0 ? true : !/^(nao|n|inativo|bloqueado|false|0)$/.test(normalizar(linha[col.ativo]));
    return {
      nome: col.nome < 0 ? "" : linha[col.nome],
      senha: linha[col.senha],
      ativo: ativo,
      termos: col.termosVersao < 0 ? "" : linha[col.termosVersao],
      linha: i + 1,
    };
  }
  return null;
}

// ---------- Cadastro (primeiro acesso) ----------

function cadastrar(d) {
  const novo = {
    nome: limpar(d.nome, 80),
    celular: limpar(d.celular, 30),
    senha: String(d.senha || ""),
    municipio: limpar(d.municipio, 60),
    uf: limpar(d.uf, 2).toUpperCase(),
    email: limpar(d.email, 100).toLowerCase(),
    funcao: limpar(d.funcao, 40),
  };
  const chave = chaveCelular(novo.celular);

  if (novo.nome.length < 3) return { ok: false, erro: "Informe o nome completo." };
  if (!chave) return { ok: false, erro: "Informe o celular com DDD." };
  if (novo.senha.length < 4 || novo.senha.length > 40) return { ok: false, erro: "A senha deve ter de 4 a 40 caracteres." };
  if (!novo.municipio || !/^[A-Z]{2}$/.test(novo.uf)) return { ok: false, erro: "Informe o município e a UF." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo.email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!novo.funcao) return { ok: false, erro: "Informe a função." };

  const cache = CacheService.getScriptCache();
  const cadastrosHora = Number(cache.get("cadastros_hora") || 0);
  if (cadastrosHora >= MAX_CADASTROS_HORA) {
    return { ok: false, erro: "Muitos cadastros agora. Tente de novo em uma hora." };
  }

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado. Tente de novo." };
  try {
    if (buscarUsuario(chave)) {
      return { ok: false, erro: "Este celular já está cadastrado. Use “Entrar” ou “Esqueci a senha”." };
    }
    const aba = abrirAba();
    const col = garantirColunas(aba);
    const largura = aba.getLastColumn();
    const linha = new Array(largura).fill("");
    linha[col.nome] = novo.nome;
    linha[col.celular] = formatarCelular(chave, novo.celular);
    linha[col.senha] = novo.senha;
    linha[col.ativo] = "sim";
    if (col.uf >= 0) {
      linha[col.municipio] = novo.municipio;
      linha[col.uf] = novo.uf;
    } else {
      linha[col.municipio] = novo.municipio + "/" + novo.uf;
    }
    linha[col.email] = novo.email;
    linha[col.funcao] = novo.funcao;
    linha[col.cadastroEm] = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
    const termos = limpar(d.termos, 10);
    if (termos) {
      linha[col.termosEm] = linha[col.cadastroEm];
      linha[col.termosVersao] = termos;
    }

    const numLinha = aba.getLastRow() + 1;
    const intervalo = aba.getRange(numLinha, 1, 1, largura);
    intervalo.setNumberFormat("@"); // texto simples: senha "0123" continua "0123"
    intervalo.setValues([linha]);
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }
  cache.put("cadastros_hora", String(cadastrosHora + 1), 3600);

  if (AVISAR_CADASTRO_POR_EMAIL) avisarCadastro(novo);
  return { ok: true, nome: novo.nome };
}

function avisarCadastro(novo) {
  try {
    const dono = Session.getEffectiveUser().getEmail();
    if (!dono) return;
    MailApp.sendEmail(
      dono,
      "ATeG Cal — novo cadastro: " + novo.nome,
      "Novo cadastro pelo Primeiro acesso do ATeG Cal:\n\n" +
        "Nome: " + novo.nome + "\n" +
        "Celular: " + novo.celular + "\n" +
        "E-mail: " + novo.email + "\n" +
        "Município/UF: " + novo.municipio + "/" + novo.uf + "\n" +
        "Função: " + novo.funcao + "\n\n" +
        "O acesso já está liberado. Para bloquear, troque a coluna Ativo para \"não\" na planilha.",
    );
  } catch (err) {
    // O cadastro vale mesmo se o e-mail falhar (ex.: cota diária do Gmail).
    console.warn("Falha ao enviar aviso de cadastro: " + err);
  }
}

// ---------- Aceite dos Termos de uso ----------

// O app aceita na hora (mesmo offline) e envia depois: grava a data do aceite no aparelho.
function registrarAceite(d) {
  const chave = chaveCelular(d.celular);
  const versao = limpar(d.versao, 10);
  if (!chave || !versao) return { ok: false, erro: "Dados do aceite inválidos." };

  const cache = CacheService.getScriptCache();
  const chaveCache = "aceite_" + chave;
  const envios = Number(cache.get(chaveCache) || 0);
  if (envios >= MAX_ACEITES_HORA) return { ok: false, erro: "Muitos envios. Tente mais tarde." };
  cache.put(chaveCache, String(envios + 1), 3600);

  const agora = Date.now();
  let quando = new Date(d.quando);
  if (isNaN(quando) || quando.getTime() > agora + 3600000 || quando.getTime() < agora - 90 * 86400000) {
    quando = new Date(agora);
  }

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado." };
  try {
    const usuario = buscarUsuario(chave);
    // Celular fora da planilha: descarta sem erro, para o app não reenviar para sempre.
    if (!usuario) return { ok: true };
    const aba = abrirAba();
    const col = garantirColunas(aba);
    aba.getRange(usuario.linha, col.termosEm + 1).setNumberFormat("@")
      .setValue(Utilities.formatDate(quando, "America/Sao_Paulo", "dd/MM/yyyy HH:mm"));
    aba.getRange(usuario.linha, col.termosVersao + 1).setNumberFormat("@").setValue(versao);
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }
  return { ok: true };
}

// ---------- Contagem de uso ----------

function registrarUso(d) {
  const chave = chaveCelular(d.celular);
  if (!chave) return { ok: false, erro: "Celular inválido." };

  const cache = CacheService.getScriptCache();
  const chaveCache = "uso_" + chave;
  const envios = Number(cache.get(chaveCache) || 0);
  if (envios >= MAX_ENVIOS_HORA) return { ok: false, erro: "Muitos envios. Tente mais tarde." };
  cache.put(chaveCache, String(envios + 1), 3600);

  // Celular fora da planilha: descarta sem erro, para o app não reenviar para sempre.
  const usuario = buscarUsuario(chave);
  if (!usuario) return { ok: true, gravados: 0 };

  const agora = Date.now();
  const versaoApp = limpar(d.versaoApp, 20);
  const eventos = Array.isArray(d.eventos) ? d.eventos.slice(0, MAX_EVENTOS_ENVIO) : [];
  const linhas = [];
  for (const ev of eventos) {
    if (!ev || !MODULOS_USO.hasOwnProperty(ev.modulo) || !ACOES_USO.hasOwnProperty(ev.acao)) continue;
    const quando = new Date(ev.quando);
    // Aceita até 90 dias atrás (uso offline) e descarta datas no futuro.
    if (isNaN(quando) || quando.getTime() > agora + 3600000 || quando.getTime() < agora - 90 * 86400000) continue;
    linhas.push([
      quando,
      String(usuario.nome || "").trim(),
      formatarCelular(chave, d.celular),
      MODULOS_USO[ev.modulo],
      ACOES_USO[ev.acao],
      versaoApp,
    ]);
  }
  if (!linhas.length) return { ok: true, gravados: 0 };

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado." };
  try {
    const aba = abaUso();
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
  } finally {
    trava.releaseLock();
  }
  return { ok: true, gravados: linhas.length };
}

// Abas de uso ficam no fim da planilha: a primeira aba continua sendo a de usuários.
function abaUso() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  let aba = planilha.getSheetByName(ABA_USO);
  if (aba) return aba;

  aba = planilha.insertSheet(ABA_USO, planilha.getNumSheets());
  aba.getRange(1, 1, 1, 6).setValues([["Data/hora", "Nome", "Celular", "Módulo", "Ação", "Versão do app"]])
    .setFontWeight("bold");
  aba.getRange("A2:A").setNumberFormat("dd/MM/yyyy HH:mm");
  aba.getRange("C2:C").setNumberFormat("@");
  aba.setFrozenRows(1);

  criarResumo(planilha);
  return aba;
}

// Aba de resumo com fórmulas: atualiza sozinha a cada novo registro.
// Se a aba já existe, regrava as fórmulas (testarLeitura usa isso para corrigir).
function criarResumo(planilha) {
  const r = planilha.getSheetByName(ABA_RESUMO) || planilha.insertSheet(ABA_RESUMO, planilha.getNumSheets());
  // Em planilha em português, os argumentos das fórmulas são separados por ponto e vírgula.
  const s = String(planilha.getSpreadsheetLocale()).startsWith("pt") ? ";" : ",";
  r.getRange("A1").setValue("Resumo de uso do ATeG Cal").setFontWeight("bold").setFontSize(14);

  r.getRange("A3:A5").setValues([
    ["Usuários diferentes nos últimos 7 dias"],
    ["Usuários diferentes nos últimos 30 dias"],
    ["Usuários diferentes desde o início"],
  ]);
  r.getRange("B3").setFormula("=IFERROR(COUNTUNIQUE(FILTER(Uso!C2:C" + s + " Uso!A2:A >= TODAY() - 7))" + s + " 0)");
  r.getRange("B4").setFormula("=IFERROR(COUNTUNIQUE(FILTER(Uso!C2:C" + s + " Uso!A2:A >= TODAY() - 30))" + s + " 0)");
  r.getRange("B5").setFormula("=COUNTUNIQUE(Uso!C2:C)");

  const consulta = (texto) => "=IFERROR(QUERY(Uso!A:F" + s + " \"" + texto + "\"" + s + " 1)" + s + " \"Sem dados ainda\")";

  r.getRange("A7").setValue("Por módulo (quantas vezes)").setFontWeight("bold");
  r.getRange("A8").setFormula(
    consulta("select D, count(A) where D is not null group by D pivot E label D 'Módulo'"),
  );

  r.getRange("G7").setValue("Por mês").setFontWeight("bold");
  r.getRange("G8").setFormula(
    consulta(
      "select year(A), month(A) + 1, count(A) where A is not null " +
        "group by year(A), month(A) + 1 order by year(A), month(A) + 1 " +
        "label year(A) 'Ano', month(A) + 1 'Mês', count(A) 'Ações'",
    ),
  );

  r.getRange("K7").setValue("Por usuário (mais ativos primeiro)").setFontWeight("bold");
  r.getRange("K8").setFormula(
    consulta(
      "select B, C, count(A), max(A) where C is not null group by B, C " +
        "order by count(A) desc label B 'Nome', C 'Celular', count(A) 'Ações', max(A) 'Último uso' " +
        "format max(A) 'dd/mm/yyyy'",
    ),
  );
  r.setColumnWidth(1, 280);
}

// ---------- Planilha ----------

function abrirAba() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  return ABA ? planilha.getSheetByName(ABA) : planilha.getSheets()[0];
}

function localizarColunas(cabecalho) {
  const cab = cabecalho.map((c) => normalizar(c));
  const col = {};
  for (const nome in COLUNAS) col[nome] = cab.findIndex((c) => COLUNAS[nome].re.test(c));
  return col;
}

// Cria no fim da linha 1 as colunas que ainda não existem e devolve a posição de todas.
// Se houver uma coluna única "Município/UF", a UF vai junto nela (col.uf fica -1).
function garantirColunas(aba) {
  const largura = Math.max(aba.getLastColumn(), 1);
  const cabecalho = aba.getRange(1, 1, 1, largura).getDisplayValues()[0];
  const col = localizarColunas(cabecalho);
  const municipioComUf = col.municipio >= 0 && /(^|[^a-z])uf([^a-z]|$)/.test(normalizar(cabecalho[col.municipio]));
  let proxima = cabecalho.every((c) => c === "") ? 0 : largura;
  for (const nome in COLUNAS) {
    if (col[nome] >= 0) continue;
    if (nome === "uf" && municipioComUf) continue;
    aba.getRange(1, proxima + 1).setValue(COLUNAS[nome].titulo);
    col[nome] = proxima;
    proxima++;
  }
  return col;
}

// ---------- Utilidades ----------

// DDD + 8 últimos dígitos: "(62) 9 9117-6151", "5562991176151" e "62 9117-6151" viram "6291176151".
function chaveCelular(valor) {
  let d = String(valor).replace(/\D/g, "");
  if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
  if (d.indexOf("0") === 0) d = d.slice(1);
  if (d.length < 10) return "";
  return d.slice(0, 2) + d.slice(-8);
}

// Grava o celular sempre no formato (62) 9 9117-6151.
function formatarCelular(chave, original) {
  const tem9 = String(original).replace(/\D/g, "").replace(/^55(?=\d{11})/, "").length === 11;
  const fim = chave.slice(2);
  return "(" + chave.slice(0, 2) + ") " + (tem9 ? "9 " : "") + fim.slice(0, 4) + "-" + fim.slice(4);
}

function limpar(valor, max) {
  return String(valor || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizar(texto) {
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Toda resposta leva a versão do script, para conferir qual implantação está no ar.
function responder(obj) {
  obj.versao = VERSAO;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Rode esta função no editor depois de colar uma versão nova: autoriza o acesso
 * à planilha e o envio de e-mail, e mostra a versão no registro de execução.
 */
function testarLeitura() {
  const aba = abrirAba();
  Logger.log("ATeG Cal login v" + VERSAO + " — planilha: " + aba.getParent().getName() + " — linhas: " + aba.getLastRow());
  Logger.log("Cota de e-mails restante hoje: " + MailApp.getRemainingDailyQuota());
  Logger.log("Aba de uso pronta: " + abaUso().getName());
  criarResumo(aba.getParent());
  Logger.log("Resumo de uso atualizado — idioma da planilha: " + aba.getParent().getSpreadsheetLocale());
}
