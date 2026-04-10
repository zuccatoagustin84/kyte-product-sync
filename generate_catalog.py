"""
Kyte Catalog Generator
-----------------------
Genera un catálogo HTML imprimible de productos agrupados por categoría.

Uso:
    python generate_catalog.py --token <kyte_token>
    python generate_catalog.py --token <kyte_token> --output mi_catalogo.html
    python generate_catalog.py --token <kyte_token> --category "Herramientas"
    python generate_catalog.py --token <kyte_token> --embed-images   # base64 offline
    python generate_catalog.py --token <kyte_token> --no-prices      # ocultar precios
"""

import argparse
import base64
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests
from jinja2 import Environment, FileSystemLoader

from kyte_api import KyteClient, KyteConfig, KyteAPIError, parse_kyte_token

# ── Firebase Storage base URL (Kyte app) ─────────────────────────────────────
# Las imágenes en la API vienen como rutas relativas: "{uid}/{path}?alt=media"
# Esta es la URL base del bucket Firebase de Kyte.
FIREBASE_STORAGE_BASE = "https://firebasestorage.googleapis.com/v0/b/kyte-7c484.appspot.com/o"


def build_image_url(raw: str, uid: str) -> str | None:
    """
    Construye la URL completa de Firebase Storage a partir del campo image del producto.
    El campo viene como: "/{uid}%2F{encoded_filename}?alt=media"
    Solo hay que quitar el / inicial y pegar la base de Firebase.
    """
    if not raw:
        return None
    raw = raw.strip()
    if raw.startswith("http"):
        return raw
    # El path ya viene URL-encoded, solo sacamos el / inicial
    path = raw.lstrip("/")
    return f"{FIREBASE_STORAGE_BASE}/{path}"


def fetch_image_as_base64(url: str, session: requests.Session, timeout: int = 8) -> str | None:
    """Descarga una imagen y la devuelve como data URI base64."""
    try:
        r = session.get(url, timeout=timeout)
        if r.status_code == 200:
            ct = r.headers.get("Content-Type", "image/jpeg")
            b64 = base64.b64encode(r.content).decode()
            return f"data:{ct};base64,{b64}"
    except Exception:
        pass
    return None


def normalize_category(product: dict) -> str:
    cat = product.get("category")
    if isinstance(cat, dict):
        name = cat.get("name", "").strip()
        return name if name else "Sin categoría"
    return "Sin categoría"


def build_categories(
    products: list,
    uid: str,
    embed_images: bool = False,
    session: requests.Session | None = None,
    filter_category: str | None = None,
    show_prices: bool = True,
    category_order: list[str] | None = None,
) -> list[dict]:
    """Agrupa productos por categoría y construye las URLs de imagen.

    Args:
        category_order: si se provee, usa ese orden y solo incluye esas categorías.
                        Si es None, ordena alfabéticamente (o filtra por filter_category).
    """

    buckets: dict[str, list] = defaultdict(list)

    total = len(products)
    for i, p in enumerate(products):
        cat_name = normalize_category(p)

        # Filtrar por categoría (CLI) o por lista de categorías seleccionadas
        if category_order is not None:
            if cat_name not in category_order:
                continue
        elif filter_category:
            if cat_name.lower() != filter_category.lower():
                continue

        raw_image = p.get("image") or p.get("imageThumb") or ""
        image_url = build_image_url(raw_image, uid) if raw_image else None

        if embed_images and image_url and session:
            if (i % 50) == 0:
                print(f"  Descargando imágenes... {i}/{total}", end="\r")
            embedded = fetch_image_as_base64(image_url, session)
            if embedded:
                image_url = embedded
            else:
                image_url = None  # fallback a placeholder

        buckets[cat_name].append({
            "name": p.get("name", ""),
            "code": p.get("code", "") or "",
            "salePrice": float(p.get("salePrice", 0) or 0),
            "image_url": image_url,
            "has_image": bool(image_url),
            "show_price": show_prices,
        })

    if embed_images:
        print()

    # Ordenar: usar category_order si se provee, sino alfabéticamente
    if category_order is not None:
        ordered_names = [n for n in category_order if n in buckets]
    else:
        ordered_names = sorted(buckets.keys())

    result = []
    for cat_name in ordered_names:
        prods = sorted(buckets[cat_name], key=lambda x: x["name"].lower())
        result.append({"name": cat_name, "products": prods})

    return result


def generate_catalog(
    token: str,
    output: str = "catalogo.html",
    filter_category: str | None = None,
    embed_images: bool = False,
    show_prices: bool = True,
    company_name: str = "MP.TOOLS MAYORISTA",
) -> Path:
    # Auth
    print("Parseando token...")
    uid, aid = parse_kyte_token(token)
    config = KyteConfig(uid=uid, aid=aid)
    client = KyteClient(config)

    # Fetch products
    print("Descargando productos de Kyte...")
    products = client.get_products()
    print(f"  {len(products)} productos obtenidos")

    # Build categories
    print("Agrupando por categoría...")
    session = client.session if embed_images else None
    categories = build_categories(
        products,
        uid=uid,
        embed_images=embed_images,
        session=session,
        filter_category=filter_category,
        show_prices=show_prices,
    )

    total_in_catalog = sum(len(c["products"]) for c in categories)
    print(f"  {len(categories)} categorías, {total_in_catalog} productos en catálogo")

    # Render template
    template_path = Path(__file__).parent / "catalog_template.html"
    if not template_path.exists():
        raise FileNotFoundError(f"Template no encontrado: {template_path}")

    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        autoescape=True,
    )
    template = env.get_template(template_path.name)

    now = datetime.now()
    generated_date = now.strftime("%d de %B de %Y").replace(
        "January", "enero").replace("February", "febrero").replace(
        "March", "marzo").replace("April", "abril").replace(
        "May", "mayo").replace("June", "junio").replace(
        "July", "julio").replace("August", "agosto").replace(
        "September", "septiembre").replace("October", "octubre").replace(
        "November", "noviembre").replace("December", "diciembre")

    html = template.render(
        company_name=company_name,
        generated_date=generated_date,
        total_products=total_in_catalog,
        categories=categories,
    )

    # Write output
    out_path = Path(output)
    out_path.write_text(html, encoding="utf-8")
    print(f"\nCatalogo generado: {out_path.resolve()}")
    print(f"  Para imprimir/PDF: abri en Chrome > Archivo > Imprimir > Guardar como PDF")
    return out_path


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Genera catálogo HTML de productos Kyte por categoría"
    )
    parser.add_argument(
        "--token", "-t",
        help="Kyte token (o usá --token-file)",
    )
    parser.add_argument(
        "--token-file",
        default=".kyte_token",
        help="Archivo con el token (default: .kyte_token)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Archivo de salida HTML (default: catalogo_YYYYMMDD.html)",
    )
    parser.add_argument(
        "--category", "-c",
        default=None,
        help="Filtrar por categoría (exacta, case-insensitive)",
    )
    parser.add_argument(
        "--embed-images",
        action="store_true",
        help="Descargar imágenes y embeber como base64 (catálogo offline, más lento)",
    )
    parser.add_argument(
        "--no-prices",
        action="store_true",
        help="Ocultar precios en el catálogo",
    )
    parser.add_argument(
        "--company",
        default="MP.TOOLS MAYORISTA",
        help="Nombre de empresa para el catálogo",
    )
    args = parser.parse_args()

    # Token
    token = args.token
    if not token:
        token_file = Path(args.token_file)
        if token_file.exists():
            token = token_file.read_text().strip()
    if not token:
        print("ERROR: Falta el token. Usá --token <token> o guardá el token en .kyte_token")
        sys.exit(1)

    # Output filename
    output = args.output
    if not output:
        ts = datetime.now().strftime("%Y%m%d")
        suffix = f"_{args.category.replace(' ', '_')}" if args.category else ""
        output = f"catalogo{suffix}_{ts}.html"

    try:
        generate_catalog(
            token=token,
            output=output,
            filter_category=args.category,
            embed_images=args.embed_images,
            show_prices=not args.no_prices,
            company_name=args.company,
        )
    except KyteAPIError as e:
        print(f"ERROR de API: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
