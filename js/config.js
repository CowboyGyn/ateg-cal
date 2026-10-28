// Configuração do app.

// Endereço do Apps Script de login (termina em /exec). Veja apps-script/LEIAME.md.
// Vazio = login desligado: o app abre direto, sem pedir celular e senha.
export const LOGIN_URL = "https://script.google.com/macros/s/AKfycbxlU0zdfpjTHpkIFxbK0FcIv58nPRKNrI6tUYRr70qT7UsBN146OytiR4WjdzKkM-ru/exec";

// Por quantos dias o login vale no aparelho (funciona offline nesse período).
// Ao mudar o texto dos Termos de uso, aumente a versão: o app pede um novo aceite a todos.
export const TERMOS_VERSAO = "1.0";

export const DIAS_SESSAO = 30;

// WhatsApp que recebe os pedidos de "Esqueci a senha".
export const WHATSAPP_SUPORTE = "5562991176151";
