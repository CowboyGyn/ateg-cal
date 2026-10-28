// Ponto de entrada: rotas por hash, indicador de conexão e service worker.
// Cada módulo cuida do seu formulário e resultado.
import { $ } from "./ui/comum.js";
import { iniciarLogin, precisaLogin, sessaoAtual, sair } from "./ui/login.js";
import "./ui/rebanho.js";
import "./ui/previsao.js";
import "./ui/corte.js";

const ROTAS = {
  "": { tela: "tela-inicio", titulo: "ATeG Cal" },
  login: { tela: "tela-login", titulo: "ATeG Cal" },
  "rebanho-leite": { tela: "tela-rebanho-leite", titulo: "Rebanho ideal — leite" },
  "previsao-leite": { tela: "tela-previsao-leite", titulo: "Previsão de leite" },
  "rebanho-corte": { tela: "tela-rebanho-corte", titulo: "Rebanho ideal — corte" },
};

// ---------- Rotas ----------

function navegar() {
  const rota = location.hash.replace(/^#\/?/, "");
  // Sem sessão, qualquer rota mostra o login; depois de entrar, volta para a rota pedida.
  const destino = precisaLogin() ? ROTAS.login : ((rota !== "login" && ROTAS[rota]) || ROTAS[""]);
  for (const tela of document.querySelectorAll(".tela")) {
    tela.hidden = tela.id !== destino.tela;
  }
  $("tituloTela").textContent = destino.titulo;
  document.title = destino.titulo === "ATeG Cal" ? "ATeG Cal" : `${destino.titulo} · ATeG Cal`;
  $("btnVoltar").hidden = destino.tela === "tela-inicio" || destino.tela === "tela-login";
  mostrarUsuario();
  window.scrollTo(0, 0);
}

$("btnVoltar").addEventListener("click", () => {
  location.hash = "#/";
});
window.addEventListener("hashchange", navegar);

// ---------- Usuário ----------

function mostrarUsuario() {
  const sessao = sessaoAtual();
  $("capaUsuario").hidden = !sessao;
  if (sessao) $("nomeUsuario").textContent = sessao.nome.split(" ")[0] || sessao.celular;
}

iniciarLogin(navegar);
$("btnSair").addEventListener("click", () => {
  sair();
  location.hash = "#/";
  navegar();
});

// ---------- Offline ----------

function atualizarConexao() {
  $("seloOffline").hidden = navigator.onLine;
}
window.addEventListener("online", atualizarConexao);
window.addEventListener("offline", atualizarConexao);
atualizarConexao();

// ---------- Início ----------

navegar();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker
    .register("sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      $("capaOffline").hidden = false;
    })
    .catch(() => {
      // Sem service worker o app funciona normalmente, só não fica offline.
    });
}
