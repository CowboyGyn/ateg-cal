// Login e cadastro (primeiro acesso) pelo celular: conversa com o Apps Script ligado à
// planilha de usuários e guarda a sessão no aparelho, para o app seguir funcionando offline.
import { LOGIN_URL, DIAS_SESSAO, WHATSAPP_SUPORTE } from "../config.js";
import { $ } from "./comum.js";

const CHAVE_SESSAO = "ateg-cal:sessao";
const TEMPO_LIMITE_MS = 20000;

const formLogin = $("formLogin");
const formCadastro = $("formCadastro");

export const loginAtivo = () => LOGIN_URL !== "";

export function sessaoAtual() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO));
    if (s && typeof s.validoAte === "number" && s.validoAte > Date.now()) return s;
  } catch {
    // sem armazenamento ou dado inválido: trata como deslogado
  }
  return null;
}

export const precisaLogin = () => loginAtivo() && !sessaoAtual();

function salvarSessao(nome, celular) {
  const sessao = { nome, celular, validoAte: Date.now() + DIAS_SESSAO * 86400000 };
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // Sem armazenamento a sessão vale só enquanto a página estiver aberta.
  }
  return sessao;
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // ignora
  }
}

// (62) 9 9117-6151 enquanto digita.
function formatarCelular(valor) {
  let d = valor.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (d.length === 11) return `(${ddd}) ${resto[0]} ${resto.slice(1, 5)}-${resto.slice(5)}`;
  return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

async function chamarScript(dados) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    // text/plain evita a verificação CORS prévia, que o Apps Script não atende.
    const resp = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(dados),
      signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(limite);
  }
}

// Envia ao script com o botão em "carregando"; trata erros de conexão e de resposta.
async function enviar(form, dados, textoCarregando, aoConfirmar) {
  const erro = form.querySelector(".erro");
  const botao = form.querySelector("button[type=submit]");
  const textoBotao = botao.textContent;
  if (!navigator.onLine) {
    return mostrarErro(erro, "Sem internet. O primeiro acesso precisa de conexão; depois o app funciona offline.");
  }
  botao.disabled = true;
  botao.textContent = textoCarregando;
  try {
    // A primeira chamada ao Apps Script às vezes falha enquanto ele "acorda": tenta de novo uma vez.
    // O cadastro não repete, para não duplicar a linha caso a primeira tenha sido gravada.
    const r = dados.acao === "login"
      ? await chamarScript(dados).catch(() => chamarScript(dados))
      : await chamarScript(dados);
    if (!r.ok) return mostrarErro(erro, r.erro || "Não foi possível concluir.");
    aoConfirmar(r);
  } catch {
    mostrarErro(erro, "Não foi possível conectar. Verifique a internet e tente de novo.");
  } finally {
    botao.disabled = false;
    botao.textContent = textoBotao;
  }
}

function mostrarErro(erro, msg) {
  erro.textContent = msg;
  erro.hidden = false;
}

function mostrarBloco(qual) {
  $("blocoEntrar").hidden = qual !== "entrar";
  $("blocoCadastro").hidden = qual !== "cadastro";
  for (const erro of document.querySelectorAll("#tela-login .erro")) erro.hidden = true;
  window.scrollTo(0, 0);
}

function limparFormularios() {
  for (const form of [formLogin, formCadastro]) {
    form.reset();
    for (const campo of form.querySelectorAll(".senha input")) campo.type = "password";
    for (const botao of form.querySelectorAll(".ver-senha")) botao.setAttribute("aria-pressed", "false");
  }
}

// aoEntrar(sessao) é chamado depois de um login ou cadastro bem-sucedido.
export function iniciarLogin(aoEntrar) {
  for (const campo of document.querySelectorAll('#tela-login input[type="tel"]')) {
    campo.addEventListener("input", (e) => {
      e.target.value = formatarCelular(e.target.value);
    });
  }

  // Botão de olho: mostra ou esconde a senha do campo ao lado.
  for (const botao of document.querySelectorAll("#tela-login .ver-senha")) {
    botao.addEventListener("click", (e) => {
      e.preventDefault();
      const campo = botao.parentElement.querySelector("input");
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
      campo.focus();
    });
  }

  $("btnPrimeiroAcesso").addEventListener("click", () => {
    // Aproveita o celular já digitado no login.
    if (!formCadastro.elements.celular.value) formCadastro.elements.celular.value = formLogin.elements.celular.value;
    mostrarBloco("cadastro");
    formCadastro.elements.nome.focus();
  });
  $("btnJaTenho").addEventListener("click", () => mostrarBloco("entrar"));

  $("btnEsqueci").addEventListener("click", () => {
    const celular = formLogin.elements.celular.value.trim();
    const texto = `Olá! Esqueci minha senha do ATeG Cal.${celular ? ` Meu celular cadastrado é ${celular}.` : ""}`;
    window.open(`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  });

  const concluir = (nome, celular) => {
    limparFormularios();
    mostrarBloco("entrar");
    aoEntrar(salvarSessao(nome, celular));
  };

  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroLogin");
    erro.hidden = true;
    const celular = formLogin.elements.celular.value.trim();
    const senha = formLogin.elements.senha.value;
    if (celular.replace(/\D/g, "").length < 10) return mostrarErro(erro, "Informe o celular com DDD.");
    if (!senha) return mostrarErro(erro, "Informe a senha.");
    enviar(formLogin, { acao: "login", celular, senha }, "Entrando…", (r) => concluir(r.nome || "", celular));
  });

  formCadastro.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroCadastro");
    erro.hidden = true;
    const f = formCadastro.elements;
    const dados = {
      acao: "cadastro",
      nome: f.nome.value.trim(),
      celular: f.celular.value.trim(),
      email: f.email.value.trim(),
      municipio: f.municipio.value.trim(),
      uf: f.uf.value,
      funcao: f.funcao.value,
      senha: f.senha.value,
    };
    const falha = (msg, campo) => {
      mostrarErro(erro, msg);
      f[campo].focus();
    };
    if (dados.nome.split(" ").filter(Boolean).length < 2) return falha("Informe o nome completo.", "nome");
    if (dados.celular.replace(/\D/g, "").length < 10) return falha("Informe o celular com DDD.", "celular");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return falha("Informe um e-mail válido.", "email");
    if (!dados.municipio) return falha("Informe o município.", "municipio");
    if (!dados.funcao) return falha("Selecione a função.", "funcao");
    if (dados.senha.length < 4) return falha("A senha deve ter pelo menos 4 caracteres.", "senha");
    if (dados.senha !== f.confirmacao.value) return falha("As senhas não conferem.", "confirmacao");
    enviar(formCadastro, dados, "Cadastrando…", (r) => concluir(r.nome || dados.nome, dados.celular));
  });
}
