# ATeG Cal

Calculadora zootécnica para a Assistência Técnica e Gerencial (ATeG): estrutura ideal do
rebanho leiteiro e previsão de vacas em lactação e de produção de leite para 12 meses.

App web instalável (PWA) que funciona offline, sem dependências externas.

## Estrutura

- `index.html`, `css/`, `icons/`, `manifest.webmanifest`, `sw.js` — o app.
- `js/calc/` — cálculos (funções puras, testadas em `tests/`).
- `js/ui/` — telas de cada módulo; `js/config.js` — configuração (login).
- `apps-script/` — script do Google para o login pela planilha (veja `apps-script/LEIAME.md`).

## Rodar localmente

```sh
python -m http.server 8765
```

Abra http://localhost:8765/.

## Testes

```sh
node --test tests/*.test.mjs
```

## Publicar uma atualização

1. Aumente `VERSAO` em `sw.js` (`ateg-cal-vN`), senão os celulares continuam com a versão antiga.
2. Faça commit e `git push`. O GitHub Pages publica em cerca de 1 minuto.
