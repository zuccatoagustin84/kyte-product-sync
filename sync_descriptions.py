"""
Sync product descriptions (and missing images) from Kyte API to Supabase.

Usage:
    python sync_descriptions.py --dry-run   # Preview changes
    python sync_descriptions.py             # Apply to Supabase

Requirements:
    pip install requests supabase
    Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables,
    or fill them in the constants below.
"""

import argparse
import logging
import os
import sys

import requests

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# ── Kyte API ──────────────────────────────────────────────────────────────────
API_BASE = "https://kyte-api-gateway.azure-api.net/api/kyte-web"
SUBSCRIPTION_KEY = "62dafa86be9543879a9b32d347c40ab9"
UID = "cPQI0AQmnlMpcifNbrfqzGZmTNz1"
AID = "cPQI0AQmnlMpci"

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://knxqeebtynqchhwdmxae.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # set via env var


def fetch_kyte_products() -> list[dict]:
    session = requests.Session()
    session.headers.update({
        "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
        "uid": UID,
    })
    all_products = []
    skip = 0
    page_size = 500
    total = None
    while True:
        resp = session.get(
            f"{API_BASE}/products/{AID}",
            params={"limit": page_size, "skip": skip, "sort": "PIN_FIRST", "isWeb": 1},
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("_products", [])
        if total is None:
            total = data.get("count", 0)
        all_products.extend(batch)
        logger.info(f"  Kyte: fetched {len(all_products)}/{total}")
        if len(batch) < page_size or len(all_products) >= total:
            break
        skip += page_size
    return all_products


def fetch_supabase_products(supa_url: str, supa_key: str) -> list[dict]:
    headers = {
        "apikey": supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Prefer": "count=exact",
        "Range-Unit": "items",
    }
    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = requests.get(
            f"{supa_url}/rest/v1/products",
            headers={**headers, "Range": f"{offset}-{offset + page_size - 1}"},
            params={"select": "id,code,name,description,image_url"},
        )
        resp.raise_for_status()
        batch = resp.json()
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_rows


def update_supabase_product(supa_url: str, supa_key: str, product_id: str, payload: dict):
    headers = {
        "apikey": supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = requests.patch(
        f"{supa_url}/rest/v1/products?id=eq.{product_id}",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()


def main():
    parser = argparse.ArgumentParser(description="Sync descriptions from Kyte to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    if not SUPABASE_SERVICE_KEY:
        logger.error("Set SUPABASE_SERVICE_KEY env var (service_role key from Supabase dashboard)")
        sys.exit(1)

    logger.info("Fetching products from Kyte...")
    kyte_products = fetch_kyte_products()
    logger.info(f"  {len(kyte_products)} Kyte products fetched")

    logger.info("Fetching products from Supabase...")
    supa_products = fetch_supabase_products(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info(f"  {len(supa_products)} Supabase products fetched")

    # Build lookup: code (lowercase) → kyte product
    kyte_by_code: dict[str, dict] = {}
    for p in kyte_products:
        code = (p.get("code") or "").strip().lower()
        if code:
            kyte_by_code[code] = p

    updated = 0
    skipped = 0
    no_match = 0

    for sp in supa_products:
        code = (sp.get("code") or "").strip().lower()
        kp = kyte_by_code.get(code) if code else None

        if not kp:
            no_match += 1
            continue

        payload: dict = {}

        # Description
        kyte_desc = (kp.get("description") or "").strip()
        supa_desc = (sp.get("description") or "").strip()
        if kyte_desc and kyte_desc != supa_desc:
            payload["description"] = kyte_desc

        if not payload:
            skipped += 1
            continue

        logger.info(
            f"  {'[DRY]' if args.dry_run else '[UPDATE]'} "
            f"{sp['name'][:40]:<40} | desc: {'✓' if 'description' in payload else '-'}"
        )

        if not args.dry_run:
            update_supabase_product(SUPABASE_URL, SUPABASE_SERVICE_KEY, sp["id"], payload)
        updated += 1

    logger.info("")
    logger.info(f"Results: {updated} to update, {skipped} already up-to-date, {no_match} no Kyte match")
    if args.dry_run:
        logger.info("(dry-run — no changes written)")


if __name__ == "__main__":
    main()
