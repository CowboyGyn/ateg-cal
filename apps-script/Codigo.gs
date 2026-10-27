/**
 * ATeG Cal — login e cadastro pelo celular usando a planilha de usuários.
 *
 * Este script roda na conta Google do dono da planilha. O app envia os dados;
 * o script confere/grava na planilha e responde só { ok, nome } ou { ok: false, erro }.
 * A planilha e as senhas nunca vão para o celular do usuário.
 *
 * Colunas reconhecidas pelo cabeçalho (linha 1, qualquer ordem, maiúsculas ou não):
 *   Nome | Celular (ou Telefone, Número, WhatsApp) | Senha | Ativo ("não" bloqueia)
 *   Município | UF | E-mail | Função | Cadastro em
 * As colunas que faltarem são criadas no primeiro cadastro feito pelo app.
 *
 * Histórico de versões (aumente VERSAO a cada mudança e publique uma "Nova versão"):
 *   1.0.0 — 27/10/2026 — login por celular e senha, bloqueio após 5 tentativas.
 *   1.1.0 — 27/10/2026 — "Primeiro acesso": cadastro pelo app, liberado na hora,
 *                        com aviso por e-mail ao dono da planilha.
 */

const VERSAO = "1.1.0";
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
};

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
  return { ok: true, nome: String(usuario.nome || "").trim() };
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
    return { nome: col.nome < 0 ? "" : linha[col.nome], senha: linha[col.senha], ativo: ativo };
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
    linha[col.municipio] = novo.municipio;
    linha[col.uf] = novo.uf;
    linha[col.email] = novo.email;
    linha[col.funcao] = novo.funcao;
    linha[col.cadastroEm] = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");

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
function garantirColunas(aba) {
  const largura = Math.max(aba.getLastColumn(), 1);
  const cabecalho = aba.getRange(1, 1, 1, largura).getDisplayValues()[0];
  const col = localizarColunas(cabecalho);
  let proxima = cabecalho.every((c) => c === "") ? 0 : largura;
  for (const nome in COLUNAS) {
    if (col[nome] >= 0) continue;
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
}
