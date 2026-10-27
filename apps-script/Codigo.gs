/**
 * ATeG Cal — login pelo celular usando a planilha de usuários.
 *
 * Este script roda na conta Google do dono da planilha. O app envia celular e senha;
 * o script confere na planilha e responde só { ok, nome } ou { ok: false, erro }.
 * A planilha e as senhas nunca vão para o celular do usuário.
 *
 * Colunas reconhecidas pelo cabeçalho (linha 1, qualquer ordem, maiúsculas ou não):
 *   Nome | Celular (ou Telefone, Número, WhatsApp) | Senha | Ativo (opcional: "não" bloqueia)
 *
 * Histórico de versões (aumente VERSAO a cada mudança e publique uma "Nova versão"):
 *   1.0.0 — 27/10/2026 — login por celular e senha, bloqueio após 5 tentativas.
 */

const VERSAO = "1.0.0";
const PLANILHA_ID = "1SFTDBS8Jiz3yPBbbdkgb8MkWZCbKU9Ed8wjDxNR7pAA";
const ABA = ""; // vazio = primeira aba
const MAX_TENTATIVAS = 5;
const BLOQUEIO_SEGUNDOS = 15 * 60;

function doGet() {
  return responder({ ok: true, servico: "ATeG Cal login", versao: VERSAO });
}

function doPost(e) {
  let dados;
  try {
    dados = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: "Requisição inválida." });
  }
  if (dados.acao !== "login") return responder({ ok: false, erro: "Ação desconhecida." });
  return responder(login(String(dados.celular || ""), String(dados.senha || "")));
}

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
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const aba = ABA ? planilha.getSheetByName(ABA) : planilha.getSheets()[0];
  const valores = aba.getDataRange().getDisplayValues();
  if (valores.length < 2) return null;

  const cab = valores[0].map((c) => normalizar(c));
  const col = (re) => cab.findIndex((c) => re.test(c));
  const cNome = col(/^nome/);
  const cCel = col(/celular|telefone|numero|whats|fone/);
  const cSenha = col(/senha/);
  const cAtivo = col(/ativo|status/);
  if (cCel < 0 || cSenha < 0) throw new Error("A planilha precisa das colunas Celular e Senha.");

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    if (chaveCelular(linha[cCel]) !== chave) continue;
    const ativo = cAtivo < 0 ? true : !/^(nao|n|inativo|bloqueado|false|0)$/.test(normalizar(linha[cAtivo]));
    return { nome: cNome < 0 ? "" : linha[cNome], senha: linha[cSenha], ativo: ativo };
  }
  return null;
}

// DDD + 8 últimos dígitos: "(62) 9 9117-6151", "5562991176151" e "62 9117-6151" viram "6291176151".
function chaveCelular(valor) {
  let d = String(valor).replace(/\D/g, "");
  if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
  if (d.indexOf("0") === 0) d = d.slice(1);
  if (d.length < 10) return "";
  return d.slice(0, 2) + d.slice(-8);
}

function normalizar(texto) {
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Toda resposta leva a versão do script, para conferir qual implantação está no ar.
function responder(obj) {
  obj.versao = VERSAO;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rode esta função uma vez no editor para autorizar o acesso à planilha e testar. */
function testarLeitura() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  Logger.log("ATeG Cal login v" + VERSAO + " — planilha: " + planilha.getName() + " — linhas: " + planilha.getSheets()[0].getLastRow());
}
