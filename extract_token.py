"""
Kyte Token Extractor
--------------------
Abre Kyte Web con Playwright, hace login con Google (manual la primera vez),
y extrae el kyte_token de localStorage.

Guarda el token en .kyte_token para uso automatizado.

Requisitos:
    pip install playwright
    playwright install chromium

Uso:
    python extract_token.py
    python extract_token.py --profile ./kyte-profile
    python extract_token.py --output .kyte_token
"""

import argparse
import json
import sys
import base64
from pathlib import Path


def extract_token(profile_dir: str = "./kyte-profile", output: str = ".kyte_token", headless: bool = False):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: Playwright no esta instalado.")
        print("  pip install playwright")
        print("  playwright install chromium")
        sys.exit(1)

    profile_path = str(Path(profile_dir).resolve())
    print(f"[*] Usando perfil: {profile_path}")
    print(f"[*] headless={headless}")

    with sync_playwright() as p:
        # Persistent context mantiene la sesion de Google entre ejecuciones
        context = p.chromium.launch_persistent_context(
            profile_path,
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )

        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://web.kyteapp.com/products")

        # Esperar a que cargue - si no esta logueado redirige a /login
        page.wait_for_timeout(3000)

        if "/login" in page.url:
            if headless:
                print("ERROR: No hay sesion activa y estamos en headless.")
                print("  Correr una vez sin --headless para loguearse manualmente.")
                context.close()
                sys.exit(1)

            print("\n" + "="*50)
            print("  LOGUEATE EN LA VENTANA DEL NAVEGADOR")
            print("  (Google, Facebook, Email, etc.)")
            print("  Esperando hasta 5 minutos...")
            print("="*50 + "\n")

            try:
                # Esperar hasta que la URL ya no sea /login (max 5 min)
                page.wait_for_url("**kyteapp.com/**", timeout=300_000)
                page.wait_for_timeout(5000)
                # Puede redirigir a /checkout u otra pagina post-login
                if "/login" not in page.url:
                    print("[OK] Login detectado!")
            except Exception as e:
                print(f"ERROR: Timeout esperando login. {e}")
                context.close()
                sys.exit(1)

        # Extraer token
        token = page.evaluate("localStorage.getItem('kyte_token')")

        if not token:
            print("ERROR: No se encontro kyte_token en localStorage.")
            print("  Puede que la sesion haya expirado. Intenta de nuevo.")
            context.close()
            sys.exit(1)

        # Decodificar para mostrar info
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            parts = decoded.split(".")
            aid = parts[0].replace("kyte_", "")
            payload_b64 = parts[2] + "=" * (4 - len(parts[2]) % 4)
            payload = json.loads(base64.b64decode(payload_b64))
            uid = payload["uid"]
            import datetime
            exp_date = datetime.datetime.fromtimestamp(payload["exp"])
        except Exception:
            uid = "?"
            aid = "?"
            exp_date = "?"

        # Guardar
        output_path = Path(output)
        output_path.write_text(token)

        print(f"\n{'='*50}")
        print(f"  Token extraido OK!")
        print(f"  UID:     {uid}")
        print(f"  AID:     {aid}")
        print(f"  Expira:  {exp_date}")
        print(f"  Archivo: {output_path.resolve()}")
        print(f"{'='*50}")
        print(f"\n  Uso:")
        print(f'  python sync_prices_api.py --source "LISTA.xlsx" --token "$(cat {output})"')

        context.close()
        return token


def main():
    parser = argparse.ArgumentParser(description="Extraer kyte_token del navegador")
    parser.add_argument(
        "--profile", default="./kyte-profile",
        help="Directorio del perfil de Chromium (mantiene la sesion de Google)"
    )
    parser.add_argument(
        "--output", "-o", default=".kyte_token",
        help="Archivo donde guardar el token (default: .kyte_token)"
    )
    parser.add_argument(
        "--headless", action="store_true",
        help="Correr sin abrir ventana (solo funciona si ya hay sesion activa en el perfil)"
    )
    args = parser.parse_args()
    extract_token(profile_dir=args.profile, output=args.output, headless=args.headless)


if __name__ == "__main__":
    main()
