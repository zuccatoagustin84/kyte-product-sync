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
FIREBASE_API_KEY = "AIzaSyCCxxnrPYhtA-RG-9BsdF9lMMLcEIMJOTk"


def parse_kyte_token(token: str) -> tuple[str, str]:
    """
    Extract aid and uid from a kyte_token (from localStorage).

    Token format: base64("kyte_{aid}.{jwt_header}.{jwt_payload}.{jwt_sig}")
    JWT payload contains: {"uid": "...", "exp": ...}

    Returns:
        (uid, aid)
    """
    # Fix padding if needed
    token = token.strip()
    padding = 4 - len(token) % 4
    if padding != 4:
        token += "=" * padding
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
    # Kyte's original token uses "uid"; Firebase-refreshed id_tokens use
    # "user_id" / "sub". Accept any of them.
    uid = payload.get("uid") or payload.get("user_id") or payload.get("sub")
    if not uid:
        raise ValueError(f"Token sin uid (claims disponibles: {list(payload.keys())})")

    exp = payload.get("exp")
    if exp:
        import datetime
        exp_date = datetime.datetime.fromtimestamp(exp)
        logger.info(f"  Token expires: {exp_date.isoformat()}")

    return uid, aid


def refresh_firebase_id_token(refresh_token: str) -> str:
    """Cambia un refresh_token por un id_token Firebase fresco (sin envolverlo en kyte_token)."""
    resp = requests.post(
        f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}",
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )
    if resp.status_code != 200:
        raise KyteAPIError(resp.status_code, f"Firebase refresh failed: {resp.text}", "securetoken.googleapis.com")
    return resp.json()["id_token"]


def refresh_kyte_token(refresh_token: str, aid: str) -> str:
    """
    Use a Firebase refresh token to obtain a fresh kyte_token.

    The refresh token never expires (unless revoked) and can be used
    indefinitely to get new short-lived ID tokens.

    Returns:
        New kyte_token string (base64, ready to use).
    """
    new_id_token = refresh_firebase_id_token(refresh_token)
    raw = f"kyte_{aid}.{new_id_token}"
    return base64.b64encode(raw.encode()).decode().rstrip("=")


def extract_id_token_from_kyte_token(kyte_token: str) -> str:
    """Saca el JWT crudo (id_token Firebase) de adentro del kyte_token base64.

    Devuelve el id_token completo (header.payload.sig) listo para usarlo como
    Authorization Firebase {token} contra Firebase Storage / Firestore.
    """
    token = kyte_token.strip()
    pad = 4 - len(token) % 4
    if pad != 4:
        token += "=" * pad
    decoded = base64.b64decode(token).decode("utf-8")
    parts = decoded.split(".")
    if len(parts) < 4:
        raise ValueError("kyte_token sin id_token embebido")
    # decoded == "kyte_{aid}.{header}.{payload}.{sig}"
    return ".".join(parts[1:4])


FIREBASE_STORAGE_BUCKET = "kyte-7c484.appspot.com"
FIREBASE_STORAGE_BASE = f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_STORAGE_BUCKET}/o"


def upload_image_to_kyte_storage(
    image_bytes: bytes,
    *,
    uid: str,
    product_id: str,
    id_token: str,
    mime: str = "image/jpeg",
) -> tuple[str, dict]:
    """Sube bytes de imagen al Firebase Storage de Kyte.

    Devuelve (path_sin_uid, info_dict) donde info_dict incluye la respuesta
    completa de Firebase y la URL pública para verificar.
    """
    import uuid
    from urllib.parse import quote

    ext = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
           "image/webp": "webp", "image/gif": "gif"}.get(mime.lower(), "jpg")
    fname = f"{uuid.uuid4().hex}.{ext}"
    path = f"{uid}/products/{product_id}/{fname}"
    encoded = quote(path, safe="")
    upload_url = f"{FIREBASE_STORAGE_BASE}?name={encoded}&uploadType=media"

    def _do_upload(scheme: str) -> requests.Response:
        return requests.post(
            upload_url,
            data=image_bytes,
            headers={
                "Authorization": f"{scheme} {id_token}",
                "Content-Type": mime,
                "Origin": "https://web.kyteapp.com",
                "Referer": "https://web.kyteapp.com/",
                "x-goog-upload-protocol": "raw",
            },
            timeout=30,
        )

    resp = _do_upload("Firebase")
    if resp.status_code >= 400:
        resp2 = _do_upload("Bearer")
        if resp2.status_code >= 400:
            raise KyteAPIError(
                resp.status_code,
                f"Firebase Storage upload falló: Firebase={resp.status_code} Bearer={resp2.status_code} body={resp.text[:300]}",
                FIREBASE_STORAGE_BASE,
            )
        resp = resp2

    try:
        meta = resp.json()
    except Exception:
        meta = {"raw": resp.text[:400]}

    download_token = (meta.get("downloadTokens") or "").split(",")[0]
    public_url = f"{FIREBASE_STORAGE_BASE}/{encoded}?alt=media"
    if download_token:
        public_url += f"&token={download_token}"

    info = {
        "upload_status": resp.status_code,
        "firebase_meta": meta,
        "public_url": public_url,
        "stored_path": path,
        "bytes": len(image_bytes),
        "mime": mime,
    }

    # Kyte guarda los paths URL-encoded (slashes como %2F) y agrega `uid%2F` al servir.
    # Por eso devolvemos `products%2F{pid}%2F{fname}` — sino Firebase Storage da 404
    # (las / literales rompen el endpoint /o/{name}).
    stored_value = f"products%2F{product_id}%2F{fname}"
    return stored_value, info


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
        Works on the raw string WITHOUT decoding to preserve %2B, %3D etc.
        """
        if not val:
            return val
        s = val.lstrip("/")
        uid_encoded = uid + "%2F"
        uid_slash = uid + "/"
        while s.startswith(uid_encoded) or s.startswith(uid_slash):
            if s.startswith(uid_encoded):
                s = s[len(uid_encoded):]
            elif s.startswith(uid_slash):
                s = s[len(uid_slash):]
        if "?alt=media" in s:
            s = s[:s.index("?alt=media")]
        return s

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

    def update_product(self, product: dict, *, clean_images: bool = True) -> dict:
        """
        Update a product via PUT.
        Requires the FULL product object (Kyte replaces the entire document).

        clean_images=True (default): strip uid prefix + ?alt=media (legacy Kyte behavior).
        clean_images=False: PUT exactly what was given (use cuando ya armaste los image fields
        con token de Firebase Storage, sino el catálogo público no puede leerlos).
        """
        payload = self._clean_images_for_put(product) if clean_images else product
        resp = self._request("PUT", "/product", json=payload)
        try:
            return resp.json()
        except Exception:
            return {"status": "ok", "status_code": resp.status_code}

    def create_product(
        self,
        name: str,
        code: str,
        sale_price: float,
        category_id: str | None = None,
        category_name: str | None = None,
    ) -> dict:
        """Create a new product via POST /product.

        Importante: showOnCatalog=True y uid=self.uid o el producto queda
        oculto del catálogo (Kyte lo muestra como "desactivado" en el listado).
        """
        payload = {
            "name": name,
            "code": code,
            "salePrice": sale_price,
            "aid": self.config.aid,
            "uid": self.config.uid,
            "active": True,
            "showOnCatalog": True,
            "trackStock": False,
            "isFractioned": False,
            "stockActive": False,
            "stockStatus": "NOT_CONTROLLED",
        }
        if category_id:
            payload["categoryId"] = category_id
            payload["category"] = {"id": category_id, "name": category_name or ""}
        resp = self._request("POST", "/product", json=payload)
        try:
            return resp.json()
        except Exception:
            return {"status": "ok", "status_code": resp.status_code}

    def activate_product(self, product: dict) -> dict:
        """Marca un producto como visible en catálogo y activo.

        Útil para arreglar productos creados con showOnCatalog=False.
        Recibe el dict completo (de get_products) y hace PUT.
        """
        p = dict(product)
        p["active"] = True
        p["showOnCatalog"] = True
        if not p.get("uid"):
            p["uid"] = self.config.uid
        return self.update_product(p)

    def create_category(self, name: str) -> dict:
        """Create a new product category via POST /products/category."""
        payload = {"name": name, "aid": self.config.aid}
        resp = self._request("POST", "/products/category", json=payload)
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
