# Gera as imagens dos cards de instalação a partir de arte/cartoes-instalar.html.
# Uso: python arte/gerar_cartoes.py (precisa de playwright e do Microsoft Edge).
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "convite"

with sync_playwright() as p:
    navegador = p.chromium.launch(channel="msedge")
    pagina = navegador.new_page(viewport={"width": 1080, "height": 1350})
    pagina.goto((RAIZ / "arte" / "cartoes-instalar.html").as_uri())
    DESTINO.mkdir(exist_ok=True)
    for nome in ("android", "iphone"):
        pagina.locator(f"#{nome}").screenshot(path=DESTINO / f"instalar-{nome}.png")
    navegador.close()
