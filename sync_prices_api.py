"""
Kyte Product Price Sync (API Version)
--------------------------------------
Reads a source price list Excel and updates product prices directly
via the Kyte Web API. No manual Excel import/export needed.

Matches products by code first, then falls back to product name.

Usage:
    python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx"
    python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --dry-run
    python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --update-cost
"""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

from kyte_api import KyteClient, KyteConfig

# ── Default Kyte credentials (from your account) ────────────
DEFAULT_UID = "cPQI0AQmnlMpcifNbrfqzGZmTNz1"
DEFAULT_AID = "cPQI0AQmnlMpci"


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )


def normalize(text) -> str:
    """Normalize text for comparison: lowercase, strip, collapse whitespace."""
    if pd.isna(text):
        return ""
    return " ".join(str(text).strip().lower().split())


def load_source(path: Path) -> pd.DataFrame:
    """Load the distributor price list Excel (auto-detect header row)."""
    print(f"\n[*] Loading source price list: {path.name}")

    raw = pd.read_excel(path, header=None)
    header_row = None
    for i in range(min(30, len(raw))):
        row_vals = [str(v).strip().lower() for v in raw.iloc[i] if pd.notna(v)]
        has_articulo = any("articulo" in v for v in row_vals)
        has_precio = any("precio" in v for v in row_vals)
        if has_articulo and has_precio:
            header_row = i
            break

    if header_row is None:
        print("  ERROR: Could not find header row (needs 'Articulo' and 'Precio' columns)")
        sys.exit(1)

    df = pd.read_excel(path, header=header_row)
    df = df.dropna(how="all").reset_index(drop=True)

    print(f"  Header found at row {header_row}")
    print(f"  {len(df)} products loaded")
    print(f"  Columns: {list(df.columns)}")
    return df


def detect_source_columns(df: pd.DataFrame) -> dict:
    """Auto-detect column names in the source price list."""
    cols = {}
    for c in df.columns:
        lower = c.lower()
        if "codigo" in lower or "digo" in lower:
            cols["code"] = c
        elif "articulo" in lower:
            cols["name"] = c
        elif "precio" in lower:
            cols["price"] = c

    if "name" not in cols or "price" not in cols:
        print(f"  ERROR: Cannot detect required columns. Found: {cols}")
        sys.exit(1)

    return cols


def match_and_prepare_updates(
    kyte_products: list[dict],
    source_df: pd.DataFrame,
    update_cost: bool = False,
) -> tuple[list[dict], dict]:
    """
    Match source products to Kyte products and prepare update list.

    Returns:
        (updates, stats) where updates is a list for bulk_update_prices()
    """
    src_cols = detect_source_columns(source_df)
    print(f"\n  Source columns -> name: '{src_cols.get('name')}', "
          f"code: '{src_cols.get('code', 'N/A')}', price: '{src_cols['price']}'")

    stats = {
        "matched_by_code": 0,
        "price_updated": 0,
        "price_unchanged": 0,
        "price_zero_skipped": 0,
        "no_code_in_source": 0,
        "not_found": [],
        "source_total": len(source_df),
        "kyte_total": len(kyte_products),
    }

    report_rows = []

    # Build Kyte lookup index by code
    kyte_by_code = {}
    for product in kyte_products:
        code = normalize(product.get("code", ""))
        if code:
            kyte_by_code[code] = product

    print(f"  Kyte index: {len(kyte_by_code)} products by code")

    updates = []

    for _, src_row in source_df.iterrows():
        new_price = src_row[src_cols["price"]]
        if pd.isna(new_price):
            continue
        try:
            new_price = float(new_price)
        except (ValueError, TypeError):
            continue

        src_name_val = str(src_row[src_cols["name"]]).strip() if pd.notna(src_row[src_cols["name"]]) else ""
        src_code_val = ""
        if "code" in src_cols and pd.notna(src_row[src_cols["code"]]):
            src_code_val = normalize(src_row[src_cols["code"]])

        # Skip source rows without code
        if not src_code_val:
            stats["no_code_in_source"] += 1
            report_rows.append({
                "Estado": "SIN CODIGO",
                "Nombre Fuente": src_name_val,
                "Codigo Fuente": "",
                "Nombre Kyte": "",
                "Codigo Kyte": "",
                "Precio Kyte": "",
                "Costo Kyte": "",
                "Precio Nuevo": new_price,
                "Diferencia": "",
                "Diferencia %": "",
                "Categoria": "",
            })
            continue

        # Match by code only
        matched_product = kyte_by_code.get(src_code_val)

        if matched_product is None:
            stats["not_found"].append(f"{src_name_val} (code: {src_code_val})")
            report_rows.append({
                "Estado": "SIN MATCH",
                "Nombre Fuente": src_name_val,
                "Codigo Fuente": src_code_val,
                "Nombre Kyte": "",
                "Codigo Kyte": "",
                "Precio Kyte": "",
                "Costo Kyte": "",
                "Precio Nuevo": new_price,
                "Diferencia": "",
                "Diferencia %": "",
                "Categoria": "",
            })
            continue

        stats["matched_by_code"] += 1
        old_price = matched_product.get("salePrice", 0)
        old_cost = matched_product.get("saleCostPrice", 0)
        cat_name = ""
        cat = matched_product.get("category")
        if isinstance(cat, dict):
            cat_name = cat.get("name", "")

        # Skip if new price is 0 or negative
        if new_price <= 0:
            stats["price_zero_skipped"] += 1
            report_rows.append({
                "Estado": "PRECIO 0 (IGNORADO)",
                "Nombre Fuente": src_name_val,
                "Codigo Fuente": src_code_val,
                "Nombre Kyte": matched_product.get("name", ""),
                "Codigo Kyte": matched_product.get("code", ""),
                "Precio Kyte": old_price,
                "Costo Kyte": old_cost,
                "Precio Nuevo": new_price,
                "Diferencia": "",
                "Diferencia %": "",
                "Categoria": cat_name,
            })
            continue

        price_changed = abs(old_price - new_price) > 0.001
        cost_changed = update_cost and abs((old_cost or 0) - new_price) > 0.001
        diff = round(new_price - old_price, 2)
        diff_pct = round((diff / old_price) * 100, 1) if old_price else 0

        row = {
            "Nombre Fuente": src_name_val,
            "Codigo Fuente": src_code_val,
            "Nombre Kyte": matched_product.get("name", ""),
            "Codigo Kyte": matched_product.get("code", ""),
            "Precio Kyte": old_price,
            "Costo Kyte": old_cost,
            "Precio Nuevo": new_price,
            "Diferencia": diff,
            "Diferencia %": f"{diff_pct:+.1f}%",
            "Categoria": cat_name,
        }

        if price_changed or cost_changed:
            update_entry = {
                "product": matched_product,
                "salePrice": new_price,
            }
            if update_cost:
                update_entry["costPrice"] = new_price
            updates.append(update_entry)
            stats["price_updated"] += 1
            row["Estado"] = "ACTUALIZAR"
        else:
            stats["price_unchanged"] += 1
            row["Estado"] = "SIN CAMBIO"

        report_rows.append(row)

    return updates, stats, report_rows


def generate_report_excel(report_rows: list[dict], stats: dict, output_path: str = "reporte_sync.xlsx"):
    """Generate an Excel report with multiple sheets."""
    df = pd.DataFrame(report_rows)

    col_order = ["Estado", "Codigo Fuente", "Codigo Kyte", "Nombre Fuente", "Nombre Kyte",
                 "Categoria", "Precio Kyte", "Costo Kyte", "Precio Nuevo", "Diferencia", "Diferencia %"]
    df = df[[c for c in col_order if c in df.columns]]

    sort_map = {"ACTUALIZAR": 0, "PRECIO 0 (IGNORADO)": 1, "SIN MATCH": 2, "SIN CODIGO": 3, "SIN CAMBIO": 4}
    df["_sort"] = df["Estado"].map(sort_map).fillna(5)
    df = df.sort_values(["_sort", "Codigo Fuente"]).drop(columns=["_sort"])

    # Force code columns: try numeric, otherwise keep as string without Excel's ' prefix
    def clean_code(val):
        if pd.isna(val) or val == "":
            return val
        try:
            num = float(val)
            return int(num) if num == int(num) else num
        except (ValueError, TypeError):
            return str(val)

    for col in ["Codigo Fuente", "Codigo Kyte"]:
        if col in df.columns:
            df[col] = df[col].apply(clean_code)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        # Hoja 1: Solo los que cambian
        df_update = df[df["Estado"] == "ACTUALIZAR"]
        df_update.to_excel(writer, sheet_name="A Actualizar", index=False)

        # Hoja 2: Precios 0 ignorados
        df_zero = df[df["Estado"] == "PRECIO 0 (IGNORADO)"]
        if len(df_zero) > 0:
            df_zero.to_excel(writer, sheet_name="Precio 0 Ignorados", index=False)

        # Hoja 3: Sin match (codigo no encontrado en Kyte)
        df_nomatch = df[df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])]
        if len(df_nomatch) > 0:
            df_nomatch.to_excel(writer, sheet_name="Sin Match", index=False)

        # Hoja 4: Sin cambio
        df_ok = df[df["Estado"] == "SIN CAMBIO"]
        df_ok.to_excel(writer, sheet_name="Sin Cambio", index=False)

        # Hoja 5: Todo junto
        df.to_excel(writer, sheet_name="Detalle Completo", index=False)

        # Hoja 6: Resumen
        summary_data = {
            "Metrica": [
                "Productos en Kyte",
                "Productos en lista fuente",
                "",
                "Matcheados por codigo",
                "Precios a actualizar",
                "Precios sin cambio",
                "Precio 0 en fuente (ignorados)",
                "",
                "Sin match (codigo no en Kyte)",
                "Sin codigo en fuente",
            ],
            "Valor": [
                stats["kyte_total"],
                stats["source_total"],
                "",
                stats["matched_by_code"],
                stats["price_updated"],
                stats["price_unchanged"],
                stats["price_zero_skipped"],
                "",
                len(stats["not_found"]),
                stats["no_code_in_source"],
            ],
        }
        pd.DataFrame(summary_data).to_excel(writer, sheet_name="Resumen", index=False)

    print(f"\n  Reporte guardado: {output_path}")
    print(f"    - 'A Actualizar':       {len(df_update)} productos con precio diferente")
    print(f"    - 'Precio 0 Ignorados': {len(df_zero)} productos con precio 0 en fuente")
    print(f"    - 'Sin Match':          {len(df_nomatch)} productos sin match")
    print(f"    - 'Sin Cambio':         {len(df_ok)} productos OK")
    print(f"    - 'Detalle Completo':   {len(df)} filas totales")
    print(f"    - 'Resumen':            metricas")
    return output_path


def print_report(stats: dict, update_stats: dict | None = None):
    """Print sync summary report."""
    total_matched = stats["matched_by_code"]

    print("\n" + "=" * 60)
    print("  SYNC REPORT")
    print("=" * 60)
    print(f"  Kyte products:          {stats['kyte_total']}")
    print(f"  Source products:        {stats['source_total']}")
    print(f"  Matched by code:        {stats['matched_by_code']}")
    print(f"  Prices to update:       {stats['price_updated']}")
    print(f"  Prices unchanged:       {stats['price_unchanged']}")
    print(f"  Precio 0 (ignorados):   {stats['price_zero_skipped']}")
    print(f"  Sin codigo en fuente:   {stats['no_code_in_source']}")
    print(f"  NOT found in Kyte:      {len(stats['not_found'])}")

    if update_stats:
        print(f"\n  --- API Results ---")
        print(f"  Successfully updated:   {update_stats['success']}")
        print(f"  Failed:                 {update_stats['failed']}")
        print(f"  Skipped (unchanged):    {update_stats['skipped']}")
        if update_stats["errors"]:
            print(f"\n  Errors:")
            for err in update_stats["errors"]:
                print(f"    - {err['product']} ({err['code']}): {err['error']}")

    print("=" * 60)

    if stats["not_found"]:
        print(f"\n  Products NOT found in Kyte ({len(stats['not_found'])}):")
        for name in stats["not_found"][:30]:
            print(f"    - {name}")
        if len(stats["not_found"]) > 30:
            print(f"    ... and {len(stats['not_found']) - 30} more")


def main():
    parser = argparse.ArgumentParser(
        description="Sync prices from a distributor price list directly to Kyte via API"
    )
    parser.add_argument(
        "--source", required=True,
        help="Path to the distributor price list Excel"
    )
    parser.add_argument(
        "--token",
        help="Kyte token (from browser localStorage 'kyte_token'). Extracts uid/aid automaticamente."
    )
    parser.add_argument(
        "--uid", default=DEFAULT_UID,
        help=f"Kyte user ID (default: {DEFAULT_UID}). Ignorado si se usa --token."
    )
    parser.add_argument(
        "--aid", default=DEFAULT_AID,
        help=f"Kyte account/store ID (default: {DEFAULT_AID}). Ignorado si se usa --token."
    )
    parser.add_argument(
        "--update-cost", action="store_true",
        help="Also update the cost price (saleCostPrice) to match the new sale price"
    )
    parser.add_argument(
        "--delay", type=float, default=0.3,
        help="Delay in seconds between API calls (default: 0.3)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would change without actually updating"
    )
    parser.add_argument(
        "--report", default=None, nargs="?", const="auto",
        help="Generar reporte Excel en reportes/ con timestamp (o pasar ruta custom)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable verbose/debug logging"
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    source_path = Path(args.source)
    if not source_path.exists():
        print(f"Error: Source file not found: {source_path}")
        sys.exit(1)

    # Initialize Kyte API client
    if args.token:
        print("[*] Parsing kyte_token...")
        try:
            config = KyteConfig.from_token(args.token)
        except Exception as e:
            print(f"  ERROR parsing token: {e}")
            sys.exit(1)
    else:
        config = KyteConfig(uid=args.uid, aid=args.aid)
    client = KyteClient(config)

    # Step 1: Load source price list
    source_df = load_source(source_path)

    # Step 2: Fetch current products from Kyte API
    print(f"\n[*] Fetching products from Kyte API...")
    try:
        kyte_products = client.get_products()
        print(f"  {len(kyte_products)} products fetched from Kyte")
    except Exception as e:
        print(f"  ERROR connecting to Kyte API: {e}")
        sys.exit(1)

    # Step 3: Match and prepare updates
    print(f"\n[*] Matching products...")
    updates, stats, report_rows = match_and_prepare_updates(
        kyte_products, source_df, update_cost=args.update_cost
    )

    # Step 4: Generate report if requested
    if args.report:
        if args.report == "auto":
            from datetime import datetime
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_path = f"reportes/reporte_sync_{ts}.xlsx"
        else:
            report_path = args.report
        Path(report_path).parent.mkdir(parents=True, exist_ok=True)
        generate_report_excel(report_rows, stats, report_path)

    if not updates:
        print("\n  No price updates needed!")
        print_report(stats)
        return

    # Step 5: Apply updates
    if args.dry_run:
        print(f"\n[DRY RUN] Would update {len(updates)} products:")
        for u in updates:
            p = u["product"]
            print(f"  - {p['name']} ({p.get('code', 'N/A')}): "
                  f"${p.get('salePrice', 0):,.2f} -> ${u['salePrice']:,.2f}")
        print_report(stats)
    else:
        print(f"\n[*] Updating {len(updates)} products via Kyte API...")
        update_stats = client.bulk_update_prices(
            updates, delay=args.delay, dry_run=False
        )
        print_report(stats, update_stats)

    print("\nDone!")


if __name__ == "__main__":
    main()
