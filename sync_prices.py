"""
Kyte Product Price Sync
-----------------------
Reads a source price list Excel and updates the Kyte product template.
Matches by Codigo first, then falls back to product name fuzzy matching.

Usage:
    python sync_prices.py --source "LISTA DISTRIBUCION.xlsx" --kyte Productos.xlsx
"""

import argparse
import os
import shutil
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd


def fix_kyte_xlsx(path: Path) -> Path:
    """Fix invalid XML data validations in Kyte-exported xlsx files."""
    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(path, "r") as z:
            z.extractall(tmp)

        sheets_dir = os.path.join(tmp, "xl", "worksheets")
        fixed = False
        for fname in os.listdir(sheets_dir):
            if fname.endswith(".xml"):
                fpath = os.path.join(sheets_dir, fname)
                tree = ET.parse(fpath)
                root = tree.getroot()
                ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                for dv_parent in root.findall(f"{{{ns}}}dataValidations"):
                    root.remove(dv_parent)
                    fixed = True
                if fixed:
                    tree.write(fpath, xml_declaration=True, encoding="UTF-8")

        fixed_path = path.parent / f"{path.stem}_fixed{path.suffix}"
        with zipfile.ZipFile(fixed_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for dirpath, _, files in os.walk(tmp):
                for f in files:
                    full = os.path.join(dirpath, f)
                    arcname = os.path.relpath(full, tmp)
                    zout.write(full, arcname)

        if fixed:
            print(f"  Fixed invalid data validations in Kyte file")
        return fixed_path
    finally:
        shutil.rmtree(tmp)


def load_kyte(path: Path) -> pd.DataFrame:
    """Load the Kyte product template, fixing XML issues if needed."""
    print(f"\nLoading Kyte template: {path.name}")
    try:
        df = pd.read_excel(path)
    except ValueError:
        print("  Kyte file has invalid XML, fixing...")
        fixed_path = fix_kyte_xlsx(path)
        df = pd.read_excel(fixed_path)
        fixed_path.unlink()  # cleanup temp file

    # Normalize column names (fix encoding issues)
    col_map = {}
    for col in df.columns:
        lower = col.lower()
        if "nombre" in lower:
            col_map[col] = "nombre"
        elif "digo" in lower or "codigo" in lower:
            col_map[col] = "codigo"
        elif col.lower().strip() == "precio*" or col.lower().strip() == "precio":
            col_map[col] = "precio"
        elif "costo" in lower:
            col_map[col] = "costo"

    print(f"  {len(df)} products loaded")
    print(f"  Columns: {list(df.columns)}")
    return df


def load_source(path: Path) -> pd.DataFrame:
    """Load the source price list (with header detection)."""
    print(f"\nLoading source price list: {path.name}")

    # First pass: find the header row by looking for a row that has BOTH 'Articulo' and 'Precio'
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
        print("  ERROR: Could not find header row in source file")
        sys.exit(1)

    df = pd.read_excel(path, header=header_row)
    # Drop fully empty rows
    df = df.dropna(how="all").reset_index(drop=True)

    print(f"  Header found at row {header_row}")
    print(f"  {len(df)} products loaded")
    print(f"  Columns: {list(df.columns)}")
    return df


def normalize(text: str) -> str:
    """Normalize text for comparison: lowercase, strip, collapse whitespace."""
    if pd.isna(text):
        return ""
    return " ".join(str(text).strip().lower().split())


def sync_prices(kyte_df: pd.DataFrame, source_df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Match source products to Kyte products and update prices.
    Strategy:
      1. Match by Codigo (exact, case-insensitive)
      2. Fallback: match by product name (normalized)
    """
    # Detect column names
    kyte_code_col = [c for c in kyte_df.columns if "digo" in c.lower() or "codigo" in c.lower()]
    kyte_name_col = [c for c in kyte_df.columns if "nombre" in c.lower()]
    kyte_price_col = [c for c in kyte_df.columns if c.strip().lower() in ("precio*", "precio")]
    kyte_cost_col = [c for c in kyte_df.columns if "costo" in c.lower()]

    src_code_col = [c for c in source_df.columns if "codigo" in c.lower() or "digo" in c.lower()]
    src_name_col = [c for c in source_df.columns if "articulo" in c.lower()]
    src_price_col = [c for c in source_df.columns if "precio" in c.lower()]

    if not kyte_name_col or not kyte_price_col:
        print("ERROR: Cannot find required columns in Kyte file")
        sys.exit(1)
    if not src_name_col or not src_price_col:
        print("ERROR: Cannot find required columns in source file")
        sys.exit(1)

    kyte_code = kyte_code_col[0] if kyte_code_col else None
    kyte_name = kyte_name_col[0]
    kyte_price = kyte_price_col[0]
    kyte_cost = kyte_cost_col[0] if kyte_cost_col else None
    src_code = src_code_col[0] if src_code_col else None
    src_name = src_name_col[0]
    src_price = src_price_col[0]

    print(f"\n  Kyte columns -> name: '{kyte_name}', code: '{kyte_code}', price: '{kyte_price}', cost: '{kyte_cost}'")
    print(f"  Source columns -> name: '{src_name}', code: '{src_code}', price: '{src_price}'")

    stats = {
        "matched_by_code": 0,
        "matched_by_name": 0,
        "price_updated": 0,
        "price_unchanged": 0,
        "not_found": [],
        "source_total": len(source_df),
    }

    # Build Kyte lookup indexes
    kyte_by_code = {}
    kyte_by_name = {}

    for idx, row in kyte_df.iterrows():
        if kyte_code and pd.notna(row[kyte_code]):
            code_norm = normalize(row[kyte_code])
            if code_norm:
                kyte_by_code[code_norm] = idx
        name_norm = normalize(row[kyte_name])
        if name_norm:
            kyte_by_name[name_norm] = idx

    # Process each source product
    for _, src_row in source_df.iterrows():
        new_price = src_row[src_price]
        if pd.isna(new_price):
            continue

        src_name_val = str(src_row[src_name]).strip() if pd.notna(src_row[src_name]) else ""
        src_code_val = normalize(src_row[src_code]) if src_code and pd.notna(src_row[src_code]) else ""

        # Strategy 1: match by code
        kyte_idx = None
        match_type = None

        if src_code_val and src_code_val in kyte_by_code:
            kyte_idx = kyte_by_code[src_code_val]
            match_type = "code"

        # Strategy 2: match by name
        if kyte_idx is None:
            src_name_norm = normalize(src_name_val)
            if src_name_norm in kyte_by_name:
                kyte_idx = kyte_by_name[src_name_norm]
                match_type = "name"

        if kyte_idx is None:
            stats["not_found"].append(f"{src_name_val} (code: {src_code_val or 'N/A'})")
            continue

        if match_type == "code":
            stats["matched_by_code"] += 1
        else:
            stats["matched_by_name"] += 1

        # Update price
        old_price = kyte_df.at[kyte_idx, kyte_price]
        if old_price != new_price:
            kyte_df.at[kyte_idx, kyte_price] = new_price
            # Also update cost if column exists
            if kyte_cost:
                kyte_df.at[kyte_idx, kyte_cost] = new_price
            stats["price_updated"] += 1
        else:
            stats["price_unchanged"] += 1

    return kyte_df, stats


def print_report(stats: dict):
    """Print sync summary report."""
    total_matched = stats["matched_by_code"] + stats["matched_by_name"]

    print("\n" + "=" * 60)
    print("  SYNC REPORT")
    print("=" * 60)
    print(f"  Source products:        {stats['source_total']}")
    print(f"  Matched by code:        {stats['matched_by_code']}")
    print(f"  Matched by name:        {stats['matched_by_name']}")
    print(f"  Total matched:          {total_matched}")
    print(f"  Prices updated:         {stats['price_updated']}")
    print(f"  Prices unchanged:       {stats['price_unchanged']}")
    print(f"  NOT found in Kyte:      {len(stats['not_found'])}")
    print("=" * 60)

    if stats["not_found"]:
        print(f"\n  Products NOT found in Kyte ({len(stats['not_found'])}):")
        for name in stats["not_found"][:50]:
            print(f"    - {name}")
        if len(stats["not_found"]) > 50:
            print(f"    ... and {len(stats['not_found']) - 50} more")


def main():
    parser = argparse.ArgumentParser(
        description="Sync prices from a distributor price list to Kyte product template"
    )
    parser.add_argument(
        "--source", required=True,
        help="Path to the distributor price list Excel"
    )
    parser.add_argument(
        "--kyte", required=True,
        help="Path to Productos.xlsx downloaded from Kyte Web"
    )
    parser.add_argument(
        "--output", default="kyte_updated.xlsx",
        help="Output file path (default: kyte_updated.xlsx)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would change without saving"
    )

    args = parser.parse_args()

    source_path = Path(args.source)
    kyte_path = Path(args.kyte)

    if not source_path.exists():
        print(f"Error: Source file not found: {source_path}")
        sys.exit(1)
    if not kyte_path.exists():
        print(f"Error: Kyte template not found: {kyte_path}")
        sys.exit(1)

    # Load files
    source_df = load_source(source_path)
    kyte_df = load_kyte(kyte_path)

    # Sync prices
    updated_df, stats = sync_prices(kyte_df, source_df)

    print_report(stats)

    if args.dry_run:
        print("\n  [DRY RUN] No file saved.")
    else:
        output_path = Path(args.output)
        updated_df.to_excel(output_path, index=False)
        print(f"\n  Output saved to: {output_path}")
        print(f"  Upload this file to Kyte Web -> Products -> Import -> Update existing")


if __name__ == "__main__":
    main()
