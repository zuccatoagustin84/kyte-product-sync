"""
Kyte API Client
----------------
Provides direct access to the Kyte Web API for managing products.

API Base: https://kyte-api-gateway.azure-api.net/api/kyte-web
Auth: Ocp-Apim-Subscription-Key header + uid header
"""

import base64
import json
import logging
import time
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://kyte-api-gateway.azure-api.net/api/kyte-web"
SUBSCRIPTION_KEY = "62dafa86be9543879a9b32d347c40ab9"


def parse_kyte_token(token: str) -> tuple[str, str]:
    """
    Extract aid and uid from a kyte_token (from localStorage).

    Token format: base64("kyte_{aid}.{jwt_header}.{jwt_payload}.{jwt_sig}")
    JWT payload contains: {"uid": "...", "exp": ...}

    Returns:
        (uid, aid)
    """
    decoded = base64.b64decode(token).decode("utf-8")
    parts = decoded.split(".")
    if len(parts) < 3:
        raise ValueError("Invalid kyte_token format")

    # Part 0: "kyte_{aid}"
    prefix = parts[0]
    if not prefix.startswith("kyte_"):
        raise ValueError(f"Token prefix should start with 'kyte_', got: {prefix[:20]}")
    aid = prefix[len("kyte_"):]

    # Part 2: JWT payload (base64)
    # Add padding if needed
    payload_b64 = parts[2]
    payload_b64 += "=" * (4 - len(payload_b64) % 4)
    payload = json.loads(base64.b64decode(payload_b64))
    uid = payload["uid"]

    exp = payload.get("exp")
    if exp:
        import datetime
        exp_date = datetime.datetime.fromtimestamp(exp)
        logger.info(f"  Token expires: {exp_date.isoformat()}")

    return uid, aid


@dataclass
class KyteConfig:
    """Configuration for Kyte API access."""
    uid: str  # User ID (e.g. "2Bj9r4qNoYRd5JdTXX0rHMI9hjg2")
    aid: str  # Account/Store ID (e.g. "2Bj9r4qNoYRd5J")
    subscription_key: str = SUBSCRIPTION_KEY

    @classmethod
    def from_token(cls, token: str) -> "KyteConfig":
        """Create config from a kyte_token (extracted from browser localStorage)."""
        uid, aid = parse_kyte_token(token)
        logger.info(f"  Parsed token -> uid: {uid[:10]}..., aid: {aid}")
        return cls(uid=uid, aid=aid)


class KyteAPIError(Exception):
    """Raised when a Kyte API call fails."""
    def __init__(self, status_code: int, message: str, url: str = ""):
        self.status_code = status_code
        self.url = url
        super().__init__(f"Kyte API error {status_code} on {url}: {message}")


class KyteClient:
    """Client for the Kyte Web API."""

    def __init__(self, config: KyteConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": config.subscription_key,
            "Ocp-Apim-Trace": "true",
            "Origin": "https://web.kyteapp.com",
            "Referer": "https://web.kyteapp.com/",
            "uid": config.uid,
        })

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        """Make an API request with error handling."""
        url = f"{API_BASE}{path}"
        resp = self.session.request(method, url, **kwargs)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:500]
            raise KyteAPIError(resp.status_code, str(detail), url)
        return resp

    # ── Products ─────────────────────────────────────────────

    def get_products(self, page_size: int = 500) -> list[dict]:
        """
        Fetch all products using skip/limit pagination.
        API: GET /products/{aid}?limit=N&skip=N&sort=PIN_FIRST&isWeb=1
        """
        all_products = []
        skip = 0
        total = None

        while True:
            resp = self._request(
                "GET",
                f"/products/{self.config.aid}",
                params={
                    "limit": page_size,
                    "skip": skip,
                    "sort": "PIN_FIRST",
                    "isWeb": 1,
                    "stockStatus": "",
                    "categoryId": "",
                    "search": "",
                },
            )
            data = resp.json()
            if isinstance(data, dict) and "_products" in data:
                batch = data["_products"]
                if total is None:
                    total = data.get("count", 0)
            else:
                break

            all_products.extend(batch)
            logger.info(f"  Fetched skip={skip}: {len(batch)} products ({len(all_products)}/{total})")

            if len(batch) < page_size or len(all_products) >= total:
                break
            skip += page_size

        logger.info(f"Fetched {len(all_products)} products from Kyte")
        return all_products

    def get_product_count(self) -> int:
        """Get total product count."""
        resp = self._request("GET", f"/products/{self.config.aid}/total")
        return resp.json()

    @staticmethod
    def _strip_image_field(val: str, uid: str) -> str:
        """
        Strip uid/ prefix and ?alt=media suffix from image paths.
        Kyte re-adds these on PUT, so sending them causes duplication.
        """
        if not val:
            return val
        from urllib.parse import unquote
        decoded = unquote(val).lstrip("/")
        while decoded.startswith(uid + "/"):
            decoded = decoded[len(uid) + 1:]
        decoded = decoded.split("?")[0]
        return decoded

    def _clean_images_for_put(self, product: dict) -> dict:
        """Strip image prefixes so Kyte doesn't double them on PUT."""
        import copy
        p = copy.deepcopy(product)
        uid = self.config.uid
        for field in ("image", "imageLarge", "imageMedium", "imageThumb"):
            if p.get(field):
                p[field] = self._strip_image_field(p[field], uid)
        for g in p.get("gallery", []):
            for field in ("image", "imageLarge", "imageMedium", "imageThumb"):
                if g.get(field):
                    g[field] = self._strip_image_field(g[field], uid)
        return p

    def update_product(self, product: dict) -> dict:
        """
        Update a product via PUT.
        Requires the FULL product object (Kyte replaces the entire document).
        Automatically cleans image paths to prevent duplication.
        """
        cleaned = self._clean_images_for_put(product)
        resp = self._request("PUT", "/product", json=cleaned)
        try:
            return resp.json()
        except Exception:
            return {"status": "ok", "status_code": resp.status_code}

    def update_product_price(
        self,
        product: dict,
        new_sale_price: float,
        new_cost_price: float | None = None,
    ) -> dict:
        """
        Convenience: update only price fields on a product.
        Returns the updated product dict (local copy, not re-fetched).
        """
        product["salePrice"] = new_sale_price
        if new_cost_price is not None:
            product["saleCostPrice"] = new_cost_price
        self.update_product(product)
        return product

    # ── Categories ───────────────────────────────────────────

    def get_categories(self) -> list[dict]:
        """Fetch all product categories."""
        resp = self._request("GET", f"/products/categories/{self.config.aid}")
        data = resp.json()
        if isinstance(data, dict) and "_productsCategory" in data:
            return data["_productsCategory"]
        elif isinstance(data, list):
            return data
        return []

    # ── Bulk operations ──────────────────────────────────────

    def bulk_update_prices(
        self,
        updates: list[dict],
        delay: float = 0.3,
        dry_run: bool = False,
    ) -> dict:
        """
        Bulk update product prices.

        Args:
            updates: list of dicts with keys:
                - product: full product object from get_products()
                - salePrice: new sale price
                - costPrice: (optional) new cost price
            delay: seconds between API calls to avoid rate limiting
            dry_run: if True, don't actually call the API

        Returns:
            dict with stats: success, failed, skipped
        """
        stats = {"success": 0, "failed": 0, "skipped": 0, "errors": []}

        for i, update in enumerate(updates, 1):
            product = update["product"]
            new_price = update["salePrice"]
            new_cost = update.get("costPrice")
            name = product.get("name", "Unknown")
            code = product.get("code", "N/A")
            old_price = product.get("salePrice", 0)

            if old_price == new_price and (new_cost is None or product.get("saleCostPrice") == new_cost):
                logger.debug(f"  [{i}/{len(updates)}] SKIP {name} (code: {code}) - price unchanged")
                stats["skipped"] += 1
                continue

            logger.info(
                f"  [{i}/{len(updates)}] {name} (code: {code}): "
                f"${old_price:,.2f} -> ${new_price:,.2f}"
            )

            if dry_run:
                stats["success"] += 1
                continue

            try:
                self.update_product_price(product, new_price, new_cost)
                stats["success"] += 1
            except KyteAPIError as e:
                logger.error(f"  FAILED: {e}")
                stats["failed"] += 1
                stats["errors"].append({"product": name, "code": code, "error": str(e)})

            if delay > 0 and i < len(updates):
                time.sleep(delay)

        return stats
