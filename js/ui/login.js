// Login pelo celular: confere celular e senha no Apps Script ligado à planilha de usuários
// e guarda a sessão no aparelho, para o app seguir funcionando offline.
import { LOGIN_URL, DIAS_SESSAO, WHATSAPP_SUPORTE } from "../config.js";
import { $ } from "./comum.js";

const CHAVE_SESSAO = "ateg-cal:sessao";
const TEMPO_LIMITE_MS = 20000;

const form = $("formLogin");
const erro = $("erroLogin");
const btnEntrar = $("btnEntrar");

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

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
}

async function enviarLogin(celular, senha) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    // text/plain evita a verificação CORS prévia, que o Apps Script não atende.
    const resp = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: "login", celular, senha }),
      signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(limite);
  }
}

// aoEntrar(sessao) é chamado depois de um login bem-sucedido.
export function iniciarLogin(aoEntrar) {
  form.elements.celular.addEventListener("input", (e) => {
    e.target.value = formatarCelular(e.target.value);
  });

  $("btnVerSenha").addEventListener("click", (e) => {
    const campo = form.elements.senha;
    const mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    e.currentTarget.setAttribute("aria-pressed", String(mostrar));
    e.currentTarget.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
    campo.focus();
  });

  $("btnEsqueci").addEventListener("click", () => {
    const celular = form.elements.celular.value.trim();
    const texto = `Olá! Esqueci minha senha do ATeG Cal.${celular ? ` Meu celular cadastrado é ${celular}.` : ""}`;
    window.open(`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.hidden = true;
    const celular = form.elements.celular.value.trim();
    const senha = form.elements.senha.value;
    if (celular.replace(/\D/g, "").length < 10) return mostrarErro("Informe o celular com DDD.");
    if (!senha) return mostrarErro("Informe a senha.");
    if (!navigator.onLine) return mostrarErro("Sem internet. O primeiro acesso precisa de conexão; depois o app funciona offline.");

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando…";
    try {
      // A primeira chamada ao Apps Script às vezes falha enquanto ele "acorda": tenta de novo uma vez.
      const r = await enviarLogin(celular, senha).catch(() => enviarLogin(celular, senha));
      if (!r.ok) return mostrarErro(r.erro || "Celular ou senha incorretos.");
      form.reset();
      form.elements.senha.type = "password";
      aoEntrar(salvarSessao(r.nome || "", celular));
    } catch {
      mostrarErro("Não foi possível conectar. Verifique a internet e tente de novo.");
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  });
}
