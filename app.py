"""
Kyte Price Sync - Streamlit App
"""
import io
import streamlit as st
import pandas as pd
from datetime import datetime
from pathlib import Path

import base64 as _b64
import json as _json
import subprocess as _sp

import requests as _requests


@st.cache_data(ttl=300)
def _deploy_info() -> str:
    """Devuelve 'abc1234 · 2026-04-15 14:30' del último commit, o '' si falla."""
    try:
        out = _sp.check_output(
            ["git", "log", "-1", "--format=%h · %cd", "--date=format:%Y-%m-%d %H:%M"],
            cwd=Path(__file__).parent,
            stderr=_sp.DEVNULL,
            text=True,
        ).strip()
        return out
    except Exception:
        return ""

from kyte_api import KyteClient, KyteConfig, KyteAPIError, parse_kyte_token, refresh_kyte_token
from generate_catalog import build_categories, build_image_url
from jinja2 import Environment, FileSystemLoader


# ── Cuentas conocidas (AID -> (nombre, tipo)) ───────────────
KNOWN_ACCOUNTS = {
    "cPQI0AQmnlMpci": ("MP.TOOLS MAYORISTA", "prod"),
    "2Bj9r4qNoYRd5J": ("Agustin Zuccato", "test"),
}


def _account_label(aid: str) -> tuple[str, str]:
    """Devuelve (display_name, kind) donde kind ∈ {'prod','test','unknown'}."""
    if aid in KNOWN_ACCOUNTS:
        return KNOWN_ACCOUNTS[aid]
    return (f"Desconocida (AID: {aid[:12]}…)", "unknown")


def _token_seconds_left(token: str) -> int | None:
    """Segundos restantes hasta el vencimiento del kyte_token. None si no se puede parsear."""
    try:
        t = token.strip()
        pad = 4 - len(t) % 4
        if pad != 4:
            t += "=" * pad
        decoded = _b64.b64decode(t).decode("utf-8")
        parts = decoded.split(".")
        if len(parts) < 3:
            return None
        pb = parts[2] + "=" * (4 - len(parts[2]) % 4)
        exp = _json.loads(_b64.b64decode(pb)).get("exp")
        if exp:
            return int((datetime.fromtimestamp(exp) - datetime.now()).total_seconds())
    except Exception:
        pass
    return None


def _token_days_left(token: str) -> int | None:
    s = _token_seconds_left(token)
    return None if s is None else max(0, s // 86400)


def _format_remaining(seconds: int) -> str:
    if seconds <= 0:
        return "vencido"
    if seconds < 3600:
        return f"{seconds // 60} min"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m" if m else f"{h}h"
    return f"{seconds // 86400} días"
_BING_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


@st.cache_data(ttl=3600, show_spinner=False)
def _search_images_bing(query: str, num: int = 12) -> list[dict]:
    """
    Busca imágenes scrapeando Bing Images (sin API key).
    Cada resultado en HTML lleva un atributo m="<JSON>" con murl/turl/t/purl.
    """
    import html as _html
    import re as _re
    r = _requests.get(
        "https://www.bing.com/images/search",
        params={"q": query, "first": "1", "form": "HDRSC2", "mkt": "es-AR", "safesearch": "Moderate"},
        headers={"User-Agent": _BING_UA, "Accept-Language": "es-AR,es;q=0.9,en;q=0.8"},
        timeout=15,
    )
    if not r.ok:
        raise RuntimeError(f"Bing {r.status_code}: {r.text[:200]}")
    # Solo <a class="iusc" ...> con atributo m="..." (resultados clickeables, evita carruseles "related")
    raw_matches = _re.findall(r'<a\b[^>]*\bclass="iusc"[^>]*\bm="([^"]+)"', r.text)
    out: list[dict] = []
    seen: set[str] = set()
    for raw in raw_matches:
        try:
            d = _json.loads(_html.unescape(raw))
        except Exception:
            continue
        url = d.get("murl") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        out.append({
            "url": url,
            "thumb": d.get("turl") or url,
            "title": d.get("t") or "",
            "context": d.get("purl"),
            "width": None,
            "height": None,
        })
        if len(out) >= num:
            break
    return out


try:
    from streamlit_javascript import st_javascript
    HAS_JS = True
except ImportError:
    HAS_JS = False

# ── Page config ──────────────────────────────────────────────
st.set_page_config(
    page_title="Kyte Price Sync",
    page_icon="",
    layout="wide",
)

st.title("Kyte Price Sync")

_dep = _deploy_info()
if _dep:
    st.sidebar.caption(f"Deploy: {_dep}")

# ── Sidebar: Config ──────────────────────────────────────────
st.sidebar.header("Configuracion")

# ── Leer token guardado en localStorage del browser ───────────
# st_javascript retorna None en el primer render y el valor real en el siguiente.
# Solo seteamos la session_state del widget cuando tenemos un valor real,
# así no bloqueamos la lectura con un "" prematuro.
# Limpiar el state del widget si una acción previa lo pidió (debe correr ANTES
# de instanciar el widget, sino Streamlit tira "cannot be modified after instantiated")
if st.session_state.pop("_reset_token_input", False):
    st.session_state.pop("kyte_token_input", None)

if HAS_JS:
    if st.session_state.pop("_clear_saved_token", False):
        # Solo leer el token original de Kyte web (ignorar el guardado por nuestra app)
        st_javascript("localStorage.removeItem('kyte_sync_token')")
        _saved = st_javascript("localStorage.getItem('kyte_token') || ''")
    else:
        _saved = st_javascript(
            "localStorage.getItem('kyte_sync_token') || localStorage.getItem('kyte_token') || ''"
        )
    if isinstance(_saved, str) and _saved.strip() and not st.session_state.get("kyte_token_input", "").strip():
        st.session_state.kyte_token_input = _saved.strip()

# ── Leer refresh token de localStorage ───────────────────────
if HAS_JS and "kyte_refresh_token" not in st.session_state:
    _rt = st_javascript("localStorage.getItem('kyte_refresh_token') || ''")
    if isinstance(_rt, str) and _rt.strip():
        st.session_state.kyte_refresh_token = _rt.strip()

token = st.sidebar.text_area(
    "Kyte Token",
    height=68,
    help="Se guarda automáticamente en el browser. Para obtenerlo: F12 > Console > copy(localStorage.getItem('kyte_token'))",
    key="kyte_token_input",
).strip()

# Guardar en localStorage cada vez que cambia
if HAS_JS and token:
    import json as _json
    st_javascript(f"localStorage.setItem('kyte_sync_token', {_json.dumps(token)})")

# Botones de gestión del token
_col1, _col2 = st.sidebar.columns(2)
if _col1.button("↺ Leer de Kyte", help="Lee el kyte_token fresco de Kyte web (requiere tenerlo abierto en este browser)", disabled=not HAS_JS):
    st.session_state["_clear_saved_token"] = True
    st.session_state["_reset_token_input"] = True
    st.rerun()
if _col2.button("✕ Limpiar", help="Borra el token guardado", disabled=not token):
    if HAS_JS:
        st_javascript("localStorage.removeItem('kyte_sync_token')")
        st_javascript("localStorage.removeItem('kyte_token')")
    st.session_state["_reset_token_input"] = True
    st.rerun()

# ── Refresh token: configuración siempre disponible ──────────
_REFRESH_SNIPPET = '''(async () => {
  try {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open("firebaseLocalStorageDb");
      q.onsuccess = e => res(e.target.result);
      q.onerror = e => rej(new Error("IndexedDB error: " + e.target.error));
    });
    const items = await new Promise((res, rej) => {
      const q = db.transaction("firebaseLocalStorage", "readonly")
                  .objectStore("firebaseLocalStorage").getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = e => rej(e.target.error);
    });
    for (const i of items) {
      const rt = i?.value?.stsTokenManager?.refreshToken;
      if (rt) {
        await navigator.clipboard.writeText(rt);
        console.log("✅ Refresh token copiado!", rt.slice(0, 30) + "...");
        return;
      }
    }
    console.error("❌ No se encontró refreshToken en", items.length, "items");
  } catch (e) { console.error("❌", e.message); }
})();'''

_has_rt = bool(st.session_state.get("kyte_refresh_token"))
with st.sidebar.expander(
    ("✅ Refresh token configurado" if _has_rt else "🔧 Configurar renovación automática"),
    expanded=not _has_rt,
):
    st.markdown(
        "Pegá tu **refresh token** de Firebase (una sola vez). Nunca expira.\n\n"
        "Para obtenerlo, abrí [web.kyteapp.com](https://web.kyteapp.com), F12 > Console y pegá:"
    )
    st.code(_REFRESH_SNIPPET, language="javascript")
    rt_input = st.text_input("Refresh Token", type="password", key="_rt_input")
    cb1, cb2 = st.columns(2)
    if cb1.button("💾 Guardar", disabled=not rt_input.strip()):
        st.session_state.kyte_refresh_token = rt_input.strip()
        if HAS_JS:
            st_javascript(f"localStorage.setItem('kyte_refresh_token', {_json.dumps(rt_input.strip())})")
        st.rerun()
    if _has_rt and cb2.button("🗑 Borrar"):
        st.session_state.pop("kyte_refresh_token", None)
        if HAS_JS:
            st_javascript("localStorage.removeItem('kyte_refresh_token')")
        st.rerun()

# ── Renovar ahora (manual) ──────────────────────────────────
if st.sidebar.button("🔄 Renovar token ahora", disabled=not _has_rt, help="Fuerza un refresh usando el refresh token"):
    try:
        # aid se obtiene del token actual o de un parse defensivo
        try:
            _, _aid = parse_kyte_token(token) if token else (None, None)
        except Exception:
            _aid = None
        if not _aid:
            st.sidebar.error("No se puede renovar sin un token actual válido (necesito el aid).")
        else:
            new_token = refresh_kyte_token(st.session_state.kyte_refresh_token, _aid)
            if HAS_JS:
                st_javascript(f"localStorage.setItem('kyte_sync_token', {_json.dumps(new_token)})")
                st_javascript(f"localStorage.setItem('kyte_token', {_json.dumps(new_token)})")
            st.session_state["_reset_token_input"] = True
            st.rerun()
    except Exception as e:
        st.sidebar.error(f"Error renovando: {e}")

st.sidebar.divider()
page = st.sidebar.radio("Modo", ["Sincronizar Precios", "Catalogo de Productos", "Imágenes"])

if not token:
    st.info("Pega tu token de Kyte en la barra lateral para comenzar.")
    st.markdown("""
    **Como obtener el token:**
    1. Logueate en [web.kyteapp.com](https://web.kyteapp.com)
    2. Abri la consola (F12 > Console)
    3. Pega: `copy(localStorage.getItem('kyte_token'))`
    4. Pegalo aca
    """)
    st.stop()

# Parse token
try:
    uid, aid = parse_kyte_token(token)
    secs = _token_seconds_left(token)
    has_rt = bool(st.session_state.get("kyte_refresh_token"))

    # ── Auto-refresh si el token está realmente vencido o queda <5 min ───
    # Disparamos solo si está vencido o casi, y no acabamos de hacerlo.
    if secs is not None and secs < 300 and has_rt and not st.session_state.get("_just_refreshed"):
        try:
            new_token = refresh_kyte_token(st.session_state.kyte_refresh_token, aid)
            if HAS_JS:
                st_javascript(f"localStorage.setItem('kyte_sync_token', {_json.dumps(new_token)})")
                st_javascript(f"localStorage.setItem('kyte_token', {_json.dumps(new_token)})")
            st.session_state["_reset_token_input"] = True
            st.session_state["_just_refreshed"] = True
            st.rerun()
        except Exception as e:
            st.sidebar.error(f"⚠️ Error renovando token: {e}")
    elif secs is not None and secs <= 0:
        if has_rt:
            st.sidebar.warning("Token vencido — apretá '🔄 Renovar token ahora'.")
        else:
            st.sidebar.error("Token vencido — configurá el refresh token arriba.")
    elif secs is not None:
        rem = _format_remaining(secs)
        # Si dura < 1 día y hay refresh token, está OK (es un id_token corto)
        if secs < 86400 and has_rt:
            st.sidebar.success(f"Conectado · vence en {rem} (auto-renovable)")
        elif secs < 86400 * 30:
            if has_rt:
                st.sidebar.info(f"Conectado · vence en {rem}")
            else:
                st.sidebar.warning(f"⚠️ Vence en {rem} — configurá el refresh token arriba.")
        elif secs < 86400 * 90:
            st.sidebar.warning(f"Vence en {rem}")
        else:
            st.sidebar.success(f"Conectado · vence en {rem}")
    else:
        st.sidebar.success(f"Conectado ({aid[:8]}…)")
    st.session_state.pop("_just_refreshed", None)
except Exception as e:
    st.sidebar.error(f"Token invalido: {e}")
    st.stop()

config = KyteConfig(uid=uid, aid=aid)
client = KyteClient(config)

# ── Banner: cuenta a la que estás conectado (primer lectura) ─
_acc_name, _acc_kind = _account_label(aid)
if _acc_kind == "prod":
    st.success(f"🟢 Conectado a: **{_acc_name}** — PRODUCCIÓN  ·  AID `{aid}`")
elif _acc_kind == "test":
    st.warning(f"🧪 Conectado a: **{_acc_name}** — CUENTA DE TEST (no es producción)  ·  AID `{aid}`")
else:
    st.info(f"🔵 Conectado a: **{_acc_name}**  ·  AID `{aid}`  ·  UID `{uid[:12]}…`")


# ── Helper functions ─────────────────────────────────────────
def normalize(text) -> str:
    if pd.isna(text):
        return ""
    return " ".join(str(text).strip().lower().split())


def load_source(file) -> pd.DataFrame:
    raw = pd.read_excel(file, header=None)
    header_row = 0
    for i in range(min(30, len(raw))):
        row_vals = [str(v).strip().lower() for v in raw.iloc[i] if pd.notna(v)]
        if not row_vals:
            continue
        has_code = any(("codigo" in v) or ("código" in v) or ("articulo" in v) or ("artículo" in v) for v in row_vals)
        has_price = any("precio" in v for v in row_vals)
        if has_code and has_price:
            header_row = i
            break
    file.seek(0)
    df = pd.read_excel(file, header=header_row)
    return df.dropna(how="all").reset_index(drop=True)


def guess_column(df, keywords):
    """Devuelve el nombre de columna que matchea alguna keyword (case-insensitive)."""
    for c in df.columns:
        lower = str(c).lower()
        for kw in keywords:
            if kw in lower:
                return c
    return None


def run_matching(kyte_products, source_df, code_col, price_col, name_col=None, rubro_col=None):
    kyte_by_code = {}
    for product in kyte_products:
        code = normalize(product.get("code", ""))
        if code:
            kyte_by_code[code] = product

    rows = []
    updates = []

    for _, src_row in source_df.iterrows():
        new_price = src_row[price_col]
        if pd.isna(new_price):
            continue
        try:
            new_price = float(new_price)
        except (ValueError, TypeError):
            continue

        src_name = ""
        if name_col and name_col in source_df.columns and pd.notna(src_row[name_col]):
            src_name = str(src_row[name_col]).strip()

        src_rubro = ""
        if rubro_col and rubro_col in source_df.columns and pd.notna(src_row[rubro_col]):
            src_rubro = str(src_row[rubro_col]).strip()

        src_code = ""
        if pd.notna(src_row[code_col]):
            src_code = normalize(src_row[code_col])

        if not src_code:
            rows.append({"Estado": "SIN CODIGO", "Nombre": src_name, "Codigo": "", "Precio Kyte": None, "Precio Nuevo": new_price, "Diferencia": None, "Dif %": "", "Categoria": "", "Rubro": src_rubro})
            continue

        matched = kyte_by_code.get(src_code)
        if not matched:
            rows.append({"Estado": "SIN MATCH", "Nombre": src_name, "Codigo": src_code, "Precio Kyte": None, "Precio Nuevo": new_price, "Diferencia": None, "Dif %": "", "Categoria": "", "Rubro": src_rubro})
            continue

        old_price = matched.get("salePrice", 0)
        cat = matched.get("category") or {}
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""

        if new_price <= 0:
            rows.append({"Estado": "PRECIO 0", "Nombre": matched.get("name", ""), "Codigo": src_code, "Precio Kyte": old_price, "Precio Nuevo": new_price, "Diferencia": None, "Dif %": "", "Categoria": cat_name, "Rubro": src_rubro})
            continue

        diff = round(new_price - old_price, 2)
        diff_pct = round((diff / old_price) * 100, 1) if old_price else 0
        price_changed = abs(old_price - new_price) > 0.001

        estado = "ACTUALIZAR" if price_changed else "OK"
        rows.append({
            "Estado": estado,
            "Nombre": matched.get("name", ""),
            "Codigo": src_code,
            "Precio Kyte": old_price,
            "Precio Nuevo": new_price,
            "Diferencia": diff,
            "Dif %": f"{diff_pct:+.1f}%" if price_changed else "",
            "Categoria": cat_name,
            "Rubro": src_rubro,
        })

        if price_changed:
            updates.append({"product": matched, "salePrice": new_price})

    return pd.DataFrame(rows), updates


def style_report(df):
    def color_row(row):
        colors = {
            "ACTUALIZAR": "background-color: #fff3cd",
            "SIN MATCH": "background-color: #f8d7da",
            "SIN CODIGO": "background-color: #e2e3e5",
            "PRECIO 0": "background-color: #f8d7da",
            "OK": "",
        }
        color = colors.get(row["Estado"], "")
        return [color] * len(row)
    return df.style.apply(color_row, axis=1)


def to_excel_download(df, stats):
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for col in ["Codigo"]:
            if col in df.columns:
                df[col] = df[col].apply(lambda x: pd.to_numeric(x, errors="coerce") if pd.notna(x) and x != "" else x)
                df[col] = df[col].fillna(df[col].astype(str))

        sort_map = {"ACTUALIZAR": 0, "PRECIO 0": 1, "SIN MATCH": 2, "SIN CODIGO": 3, "OK": 4}
        df_sorted = df.copy()
        df_sorted["_s"] = df_sorted["Estado"].map(sort_map).fillna(5)
        df_sorted = df_sorted.sort_values("_s").drop(columns=["_s"])

        df_sorted[df_sorted["Estado"] == "ACTUALIZAR"].to_excel(writer, sheet_name="A Actualizar", index=False)
        df_nomatch = df_sorted[df_sorted["Estado"].isin(["SIN MATCH", "SIN CODIGO"])]
        if len(df_nomatch):
            df_nomatch.to_excel(writer, sheet_name="Sin Match", index=False)
        df_sorted[df_sorted["Estado"] == "PRECIO 0"].to_excel(writer, sheet_name="Precio 0", index=False) if len(df_sorted[df_sorted["Estado"] == "PRECIO 0"]) else None
        df_sorted[df_sorted["Estado"] == "OK"].to_excel(writer, sheet_name="Sin Cambio", index=False)
        df_sorted.to_excel(writer, sheet_name="Detalle Completo", index=False)

        pd.DataFrame(stats).to_excel(writer, sheet_name="Resumen", index=False)

    return output.getvalue()


# ── Main UI ──────────────────────────────────────────────────

# ════════════════════════════════════════════════════════════
# CATALOGO
# ════════════════════════════════════════════════════════════
if page == "Catalogo de Productos":
    st.subheader("Catalogo de Productos")
    st.caption("Genera un catálogo HTML imprimible agrupado por categoría")

    # ── Paso 1: Cargar productos desde Kyte ──────────────────
    if "catalog_prods" not in st.session_state:
        if st.button("Cargar categorías desde Kyte", type="primary"):
            with st.spinner("Descargando productos de Kyte..."):
                try:
                    prods = client.get_products()
                    cats = sorted(set(
                        (p.get("category") or {}).get("name", "").strip() or "Sin categoría"
                        for p in prods
                    ))
                    st.session_state.catalog_prods = prods
                    st.session_state.catalog_cats = cats
                    st.rerun()  # mostrar Paso 2 inmediatamente, sin pedir otro click
                except KyteAPIError as e:
                    st.error(f"Error de API: {e}")
        st.stop()

    # ── Exportar productos a Excel para enviar a clientes ────
    with st.expander("📥 Exportar productos a Excel (lista para clientes)"):
        kyte_prods = st.session_state.catalog_prods
        rows = []
        for p in kyte_prods:
            cat = p.get("category") or {}
            rows.append({
                "Codigo": p.get("code", ""),
                "Nombre": p.get("name", ""),
                "Precio": p.get("salePrice", 0),
                "Categoria": cat.get("name", "") if isinstance(cat, dict) else "",
            })
        df_export = pd.DataFrame(rows).sort_values(["Categoria", "Nombre"])
        st.caption(f"{len(df_export)} productos · ordenado por categoría y nombre")
        st.dataframe(df_export.head(20), use_container_width=True, hide_index=True)

        out = io.BytesIO()
        with pd.ExcelWriter(out, engine="openpyxl") as w:
            df_export.to_excel(w, sheet_name="Productos", index=False)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        st.download_button(
            "⬇ Descargar Excel",
            data=out.getvalue(),
            file_name=f"productos_mptools_{ts}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    # ── Paso 2: Selección y orden de categorías ───────────────
    try:
        from streamlit_sortables import sort_items
        HAS_SORTABLES = True
    except ImportError:
        HAS_SORTABLES = False

    all_cats = st.session_state.catalog_cats

    col_a, col_b = st.columns([3, 1])
    with col_a:
        selected_cats = st.multiselect(
            "Categorías a incluir",
            options=all_cats,
            default=all_cats,
            key="cat_multiselect",
        )
    with col_b:
        catalog_format = st.radio(
            "Formato",
            ["Catálogo (grilla)", "Lista con imágenes"],
            key="catalog_format",
        )
        show_prices = st.checkbox("Mostrar precios", value=True)
        if st.button("↺ Recargar Kyte"):
            del st.session_state.catalog_prods
            del st.session_state.catalog_cats
            st.rerun()

    if not selected_cats:
        st.warning("Seleccioná al menos una categoría.")
        st.stop()

    if HAS_SORTABLES:
        st.caption("Arrastrá para cambiar el orden en el catálogo:")
        ordered_cats = sort_items(selected_cats, key="cat_order")
    else:
        ordered_cats = selected_cats
        st.caption(f"{len(selected_cats)} categorías seleccionadas")

    # ── Paso 3: Generar catálogo ──────────────────────────────
    if st.button("Generar catálogo", type="primary"):
        kyte_prods = st.session_state.catalog_prods
        with st.spinner(f"Armando catálogo de {len(kyte_prods)} productos..."):
            categories = build_categories(
                kyte_prods,
                uid=uid,
                embed_images=False,
                show_prices=show_prices,
                category_order=ordered_cats,
            )

        total_cat = sum(len(c["products"]) for c in categories)

        tmpl_name = "catalog_list_template.html" if catalog_format == "Lista con imágenes" else "catalog_template.html"
        tmpl_path = Path(tmpl_name)
        if not tmpl_path.exists():
            st.error(f"No se encontró {tmpl_name}")
            st.stop()

        env = Environment(loader=FileSystemLoader("."), autoescape=True)
        template = env.get_template(tmpl_name)

        now = datetime.now()
        months_es = ["enero","febrero","marzo","abril","mayo","junio",
                     "julio","agosto","septiembre","octubre","noviembre","diciembre"]
        gen_date = f"{now.day} de {months_es[now.month-1]} de {now.year}"

        html_out = template.render(
            company_name="MP.TOOLS MAYORISTA",
            generated_date=gen_date,
            total_products=total_cat,
            categories=categories,
            show_prices=show_prices,
        )

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fmt_suffix = "lista" if catalog_format == "Lista con imágenes" else "catalogo"
        price_suffix = "" if show_prices else "_sin_precio"

        st.session_state.catalog_html = html_out
        st.session_state.catalog_base_name = f"{fmt_suffix}{price_suffix}_{ts}"
        st.session_state.catalog_total = total_cat
        st.session_state.catalog_n_cats = len(categories)
        # Limpiar PDF anterior si había
        st.session_state.pop("catalog_pdf", None)

    # ── Paso 4: Mostrar descargas ────────────────────────────
    if "catalog_html" in st.session_state:
        html_out = st.session_state.catalog_html
        base_name = st.session_state.catalog_base_name
        st.success(f"{st.session_state.catalog_n_cats} categorías · {st.session_state.catalog_total} productos")

        st.download_button(
            label="Descargar HTML",
            data=html_out.encode("utf-8"),
            file_name=f"{base_name}.html",
            mime="text/html",
        )

        st.divider()

        # ── Paso 5: Generar PDF (opcional) ───────────────────
        if "catalog_pdf" not in st.session_state:
            if st.button("Generar PDF"):
                try:
                    from weasyprint import HTML as WeasyHTML
                    with st.spinner("Generando PDF (puede tardar unos segundos)..."):
                        pdf_bytes = WeasyHTML(string=html_out).write_pdf()
                    st.session_state.catalog_pdf = pdf_bytes
                    st.rerun()
                except Exception as e:
                    st.error(f"No se pudo generar el PDF: {e}")
        else:
            st.download_button(
                label="Descargar PDF",
                data=st.session_state.catalog_pdf,
                file_name=f"{base_name}.pdf",
                mime="application/pdf",
            )

    st.stop()

# ════════════════════════════════════════════════════════════
# IMAGENES
# ════════════════════════════════════════════════════════════
if page == "Imágenes":
    st.subheader("Buscar imágenes para productos")
    st.caption("Busca en Bing Images a partir del código del producto.")

    # Carga de productos (lazy, persistida en session_state)
    if "imgmode_products" not in st.session_state:
        if st.button("Cargar productos de Kyte", type="primary"):
            with st.spinner("Descargando productos..."):
                try:
                    st.session_state.imgmode_products = client.get_products()
                    st.rerun()
                except KyteAPIError as e:
                    st.error(f"Error de API: {e}")
                    st.stop()
        st.stop()

    products = st.session_state.imgmode_products

    def _has_image(p):
        return bool((p.get("image") or "").strip())

    n_total = len(products)
    n_missing = sum(1 for p in products if not _has_image(p))

    fc1, fc2, fc3 = st.columns([1, 2, 1])
    with fc1:
        only_missing = st.checkbox("Solo sin imagen", value=True, key="img_only_missing")
    with fc2:
        filt = st.text_input(
            "Filtrar",
            key="img_filter",
            placeholder="código o nombre",
            label_visibility="collapsed",
        ).strip().lower()
    with fc3:
        if st.button("↺ Recargar productos", key="img_reload"):
            del st.session_state.imgmode_products
            st.session_state.pop("img_results", None)
            st.session_state.pop("img_picked", None)
            st.rerun()

    filtered = [
        p for p in products
        if (not only_missing or not _has_image(p))
        and (
            not filt
            or filt in (p.get("code") or "").lower()
            or filt in (p.get("name") or "").lower()
        )
    ]

    st.caption(f"{len(filtered)} productos visibles · {n_missing}/{n_total} sin imagen en total")

    if not filtered:
        st.info("No hay productos para mostrar con esos filtros.")
        st.stop()

    LIMIT = 500
    show = filtered[:LIMIT]
    if len(filtered) > LIMIT:
        st.caption(f"⚠️ Mostrando primeros {LIMIT}. Refiná el filtro para ver más.")

    def _label(i: int) -> str:
        p = show[i]
        c = p.get("code") or "(sin código)"
        n = p.get("name") or "(sin nombre)"
        return f"{c} — {n[:60]}"

    idx = st.selectbox(
        "Producto",
        list(range(len(show))),
        format_func=_label,
        key="img_product_select",
    )
    selected = show[idx]

    code = (selected.get("code") or "").strip()
    name = (selected.get("name") or "").strip()
    _cat = selected.get("category") or {}
    cat_name = (_cat.get("name") if isinstance(_cat, dict) else "") or ""
    cat_name = cat_name.strip()
    cur_img_raw = selected.get("image") or ""
    pid = selected.get("id") or selected.get("_id") or f"{code}__{name}"

    # Card del producto seleccionado
    with st.container(border=True):
        pc1, pc2 = st.columns([1, 5])
        with pc1:
            if cur_img_raw:
                _url = build_image_url(cur_img_raw, uid)
                if _url:
                    st.image(_url, width=110)
                else:
                    st.caption("(sin preview)")
            else:
                st.caption("Sin imagen")
        with pc2:
            st.markdown(f"**{name or '(sin nombre)'}**")
            if code:
                st.caption(f"Código: `{code}`")

    st.divider()

    # Reset estado al cambiar de producto
    if st.session_state.get("_img_last_pid") != pid:
        st.session_state._img_last_pid = pid
        st.session_state.pop("img_results", None)
        st.session_state.pop("img_picked", None)
        st.session_state.pop("img_searched_query", None)

    # Toggles: qué incluir en la búsqueda
    tc1, tc2, tc3 = st.columns(3)
    with tc1:
        use_code = st.checkbox(
            f"Código ({code})" if code else "Código",
            value=bool(code),
            disabled=not code,
            key=f"img_use_code_{pid}",
        )
    with tc2:
        use_name = st.checkbox(
            f"Nombre" + (f" ({name[:30]}…)" if len(name) > 30 else f" ({name})" if name else ""),
            value=bool(name),
            disabled=not name,
            key=f"img_use_name_{pid}",
        )
    with tc3:
        use_cat = st.checkbox(
            f"Categoría ({cat_name})" if cat_name else "Categoría",
            value=False,
            disabled=not cat_name,
            key=f"img_use_cat_{pid}",
        )

    _parts: list[str] = []
    if use_code and code:
        _parts.append(code)
    if use_name and name:
        _parts.append(name[:60])
    if use_cat and cat_name:
        _parts.append(cat_name)
    default_q = " ".join(_parts).strip()

    # Si cambian los toggles, refrescar el input con el nuevo default
    _sig = (use_code, use_name, use_cat)
    _sig_key = f"_img_qsig_{pid}"
    if st.session_state.get(_sig_key) != _sig:
        st.session_state[_sig_key] = _sig
        st.session_state[f"img_query_{pid}"] = default_q

    qc1, qc2, qc3 = st.columns([4, 1, 1])
    with qc1:
        query = st.text_input(
            "Término de búsqueda",
            value=default_q,
            key=f"img_query_{pid}",
        )
    with qc2:
        st.write("")
        do_search = st.button(
            "🔍 Buscar",
            type="primary",
            disabled=not query.strip(),
            use_container_width=True,
            key="img_search_btn",
        )
    with qc3:
        st.write("")
        if st.button("🗑 Limpiar", use_container_width=True, key="img_clear_btn"):
            st.session_state.pop("img_results", None)
            st.session_state.pop("img_picked", None)
            st.session_state.pop("img_searched_query", None)
            _search_images_bing.clear()
            st.rerun()

    if do_search:
        q_clean = query.strip()
        with st.spinner(f"Buscando '{q_clean}'..."):
            try:
                st.session_state.img_results = _search_images_bing(q_clean, 20)
                st.session_state.img_searched_query = q_clean
                st.session_state.pop("img_picked", None)
            except Exception as e:
                st.error(str(e))
                st.session_state.img_results = []

    results = st.session_state.get("img_results", [])
    searched = st.session_state.get("img_searched_query", "")

    if results:
        # Avisar si el query del input ya no coincide con lo que se buscó
        if searched and searched != query.strip():
            st.warning(
                f"⚠️ Estos son resultados de **{searched!r}**. Cambiaste el término — "
                f"apretá **Buscar** para actualizar."
            )
        st.caption(f"{len(results)} resultados de '{searched}' (clickeá una para elegir):")
        cols = st.columns(5)
        for i, r in enumerate(results):
            with cols[i % 5]:
                with st.container(border=True):
                    try:
                        st.image(r["thumb"], use_container_width=True)
                    except Exception:
                        st.caption("(sin preview)")
                    if r.get("width") and r.get("height"):
                        st.caption(f"{r['width']}×{r['height']}")
                    if st.button("Elegir", key=f"img_pick_{i}", use_container_width=True):
                        st.session_state.img_picked = r["url"]
                        st.rerun()

        picked = st.session_state.get("img_picked")
        if picked:
            st.divider()
            st.markdown("**Imagen elegida:**")
            st.image(picked, width=200)
            st.code(picked, language=None)
            cb1, cb2, _ = st.columns([1, 1, 3])
            with cb1:
                st.link_button("🔗 Abrir", picked, use_container_width=True)
            st.caption(
                "Para subirla al producto: clic derecho en la imagen → guardar imagen → "
                "subila desde Kyte web editando el producto. (Subida automática a Kyte: pendiente)"
            )

    st.stop()


# ════════════════════════════════════════════════════════════
# SINCRONIZAR PRECIOS
# ════════════════════════════════════════════════════════════

uploaded = st.file_uploader("Subi la lista de precios del distribuidor", type=["xlsx", "xls"])

if not uploaded:
    st.stop()

# Load source
with st.spinner("Leyendo Excel..."):
    source_df = load_source(uploaded)
st.success(f"Lista cargada: {len(source_df)} productos")

# ── Selectores de columnas ───────────────────────────────────
st.markdown("**Indicá qué columnas usar para sincronizar:**")
cols_list = [str(c) for c in source_df.columns]
default_code = guess_column(source_df, ["codigo_catalogo", "codigo", "código", "code"])
default_price = guess_column(source_df, ["precio_venta", "precio", "price"])
default_name = guess_column(source_df, ["descripcion", "descripción", "articulo", "artículo", "nombre", "name"])

c1, c2, c3 = st.columns(3)
with c1:
    code_col = st.selectbox(
        "Columna de Código *",
        options=cols_list,
        index=cols_list.index(default_code) if default_code in cols_list else 0,
    )
with c2:
    price_col = st.selectbox(
        "Columna de Precio *",
        options=cols_list,
        index=cols_list.index(default_price) if default_price in cols_list else 0,
    )
with c3:
    name_options = ["(ninguna)"] + cols_list
    name_default_idx = name_options.index(default_name) if default_name in cols_list else 0
    name_choice = st.selectbox("Columna de Descripción (opcional)", options=name_options, index=name_default_idx)
    name_col = None if name_choice == "(ninguna)" else name_choice

# ── Filtro Rubro Z ───────────────────────────────────────────
default_rubro = guess_column(source_df, ["rubro"])
rubro_options = ["(ninguna)"] + cols_list
rubro_default_idx = rubro_options.index(default_rubro) if default_rubro in cols_list else 0

rc1, rc2 = st.columns([2, 3])
with rc1:
    ignore_rubro_z = st.checkbox(
        "Ignorar productos con Rubro Z",
        value=True,
        help="Descarta las filas cuyo Rubro sea 'Z'",
    )
with rc2:
    rubro_choice = st.selectbox(
        "Columna de Rubro",
        options=rubro_options,
        index=rubro_default_idx,
        disabled=not ignore_rubro_z,
    )
rubro_col = None if rubro_choice == "(ninguna)" else rubro_choice

if ignore_rubro_z and rubro_col:
    mask_z = source_df[rubro_col].astype(str).str.strip().str.lower() == "z"
    n_ignored = int(mask_z.sum())
    if n_ignored:
        source_df = source_df[~mask_z].reset_index(drop=True)
        st.info(f"🚫 {n_ignored} productos con Rubro Z ignorados")
elif ignore_rubro_z and not rubro_col:
    st.caption("No se detectó columna 'Rubro' — seleccioná una para filtrar.")

with st.expander("Vista previa del Excel"):
    st.dataframe(source_df.head(10), use_container_width=True)

if code_col == price_col:
    st.error("La columna de código y la de precio deben ser distintas.")
    st.stop()

# Fetch Kyte products (cacheado 5 min por uid/aid: evita redescargar en cada click)
@st.cache_data(ttl=300, show_spinner=False)
def _fetch_kyte_products_cached(uid_: str, aid_: str, token_: str):
    cfg = KyteConfig(uid=uid_, aid=aid_)
    return KyteClient(cfg).get_products()

@st.cache_data(ttl=300, show_spinner=False)
def _fetch_kyte_categories_cached(uid_: str, aid_: str, token_: str):
    cfg = KyteConfig(uid=uid_, aid=aid_)
    return KyteClient(cfg).get_categories()

with st.spinner("Conectando con Kyte API..."):
    try:
        kyte_products = _fetch_kyte_products_cached(uid, aid, token)
    except KyteAPIError as e:
        st.error(f"Error de API: {e}")
        st.stop()

_refresh_col, _status_col = st.columns([1, 5])
if _refresh_col.button("↺ Refrescar Kyte"):
    _fetch_kyte_products_cached.clear()
    st.rerun()
_status_col.success(f"Kyte: {len(kyte_products)} productos (cache 5 min)")

# ── Productos ocultos del catálogo (showOnCatalog=False) ────
_hidden = [p for p in kyte_products if p.get("showOnCatalog") is False and p.get("active") is True]
if _hidden:
    with st.expander(f"🔧 {len(_hidden)} productos ocultos del catálogo (showOnCatalog=False) — activar"):
        st.caption(
            "Estos productos están activos pero ocultos del catálogo público. "
            "Pasa cuando se crean por API sin `showOnCatalog=True`. Activarlos los hace visibles en Kyte web."
        )
        _hidden_rows = [{
            "Codigo": p.get("code", ""),
            "Nombre": p.get("name", ""),
            "Precio": p.get("salePrice", 0),
            "Categoria": (p.get("category") or {}).get("name", "") if isinstance(p.get("category"), dict) else "",
        } for p in _hidden]
        st.dataframe(pd.DataFrame(_hidden_rows), use_container_width=True, hide_index=True)
        if st.button(f"⚡ Activar los {len(_hidden)} productos", type="primary", key="btn_activate_hidden"):
            _prog = st.progress(0, text="Activando...")
            _ok = 0
            _fail = 0
            _errs = []
            for i, p in enumerate(_hidden):
                try:
                    client.activate_product(p)
                    _ok += 1
                except KyteAPIError as e:
                    _fail += 1
                    _errs.append(f"{p.get('code', '?')}: {e}")
                _prog.progress((i + 1) / len(_hidden), text=f"Activando {i+1}/{len(_hidden)}...")
            _prog.empty()
            if _fail == 0:
                st.success(f"✅ {_ok} productos activados correctamente.")
                _fetch_kyte_products_cached.clear()
            else:
                st.warning(f"{_ok} OK, {_fail} fallaron.")
                for _e in _errs:
                    st.error(_e)

# Matching también cacheado — solo recomputa si cambia el Excel o las columnas
@st.cache_data(ttl=300, show_spinner=False)
def _run_matching_cached(source_hash: str, kyte_n: int, code_col_: str, price_col_: str, name_col_: str | None,
                          rubro_col_: str | None, _source_df, _kyte_products):
    return run_matching(_kyte_products, _source_df, code_col_, price_col_, name_col_, rubro_col_)

with st.spinner("Comparando precios..."):
    import hashlib
    src_hash = hashlib.md5(pd.util.hash_pandas_object(source_df, index=False).values.tobytes()).hexdigest()
    report_df, updates = _run_matching_cached(src_hash, len(kyte_products), code_col, price_col, name_col, rubro_col, source_df, kyte_products)

# Stats
n_update = len(report_df[report_df["Estado"] == "ACTUALIZAR"])
n_ok = len(report_df[report_df["Estado"] == "OK"])
n_nomatch = len(report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])])
n_zero = len(report_df[report_df["Estado"] == "PRECIO 0"])

col1, col2, col3, col4 = st.columns(4)
col1.metric("A actualizar", n_update)
col2.metric("Sin cambio", n_ok)
col3.metric("Sin match", n_nomatch)
col4.metric("Precio 0 (ignorados)", n_zero)

# Productos en Kyte que NO están en el Excel
matched_codes = set(
    report_df.loc[report_df["Estado"].isin(["ACTUALIZAR", "OK", "PRECIO 0"]), "Codigo"]
    .astype(str).str.lower()
)
kyte_only_rows = []
for p in kyte_products:
    code = normalize(p.get("code", ""))
    if not code or code in matched_codes:
        continue
    cat = p.get("category") or {}
    kyte_only_rows.append({
        "Codigo": code,
        "Nombre": p.get("name", ""),
        "Precio Kyte": p.get("salePrice", 0),
        "Categoria": cat.get("name", "") if isinstance(cat, dict) else "",
    })
kyte_only_df = pd.DataFrame(kyte_only_rows)

n_kyte_only = len(kyte_only_df)

# Tabs
tab_update, tab_nomatch, tab_kyte_only, tab_all = st.tabs(
    ["A Actualizar", f"En Excel, no en Kyte ({n_nomatch})", f"En Kyte, no en Excel ({n_kyte_only})", "Todo"]
)

with tab_update:
    df_upd = report_df[report_df["Estado"] == "ACTUALIZAR"].reset_index(drop=True)
    if len(df_upd):
        # Columna visual con flecha de tendencia
        def _trend(d):
            try:
                v = float(d)
                if v > 0:
                    return "🔴 🔼 SUBE"
                if v < 0:
                    return "🟢 🔽 BAJA"
            except (ValueError, TypeError):
                pass
            return "⚪"
        df_upd.insert(0, "Cambio", df_upd["Diferencia"].apply(_trend))

        fc1, fc2 = st.columns([3, 2])
        with fc1:
            filtro = st.text_input(
                "Filtrar por código o nombre",
                key="filtro_update",
                placeholder="ej: MRC050590 ó amoladora",
            ).strip().lower()
        with fc2:
            tendencia = st.radio(
                "Mostrar",
                ["Todos", "Solo suben 🔴🔼", "Solo bajan 🟢🔽"],
                horizontal=True,
                key="filtro_tendencia",
            )

        df_view = df_upd.copy()
        if filtro:
            mask = (
                df_view["Codigo"].astype(str).str.lower().str.contains(filtro, na=False)
                | df_view["Nombre"].astype(str).str.lower().str.contains(filtro, na=False)
            )
            df_view = df_view[mask].reset_index(drop=True)
        if tendencia == "Solo suben 🔴🔼":
            df_view = df_view[df_view["Cambio"].str.contains("SUBE")].reset_index(drop=True)
        elif tendencia == "Solo bajan 🟢🔽":
            df_view = df_view[df_view["Cambio"].str.contains("BAJA")].reset_index(drop=True)

        # Set PERSISTENTE de códigos seleccionados (sobrevive filtros)
        all_codes = set(df_upd["Codigo"].astype(str).str.lower())
        sel_key = f"sel_{hash(frozenset(all_codes))}"
        if st.session_state.get("_sel_key") != sel_key:
            st.session_state._sel_key = sel_key
            st.session_state._selected = set(all_codes)

        df_view.insert(0, "Sync", df_view["Codigo"].astype(str).str.lower().isin(st.session_state._selected))

        cs1, cs2, cs3, _ = st.columns([1, 1, 1, 3])
        if cs1.button("✓ Visibles"):
            st.session_state._selected |= set(df_view["Codigo"].astype(str).str.lower())
            st.session_state.pop("editor_update", None)
            st.rerun()
        if cs2.button("✗ Visibles"):
            st.session_state._selected -= set(df_view["Codigo"].astype(str).str.lower())
            st.session_state.pop("editor_update", None)
            st.rerun()
        if cs3.button("↺ Reset"):
            st.session_state._selected = set(all_codes)
            st.session_state.pop("editor_update", None)
            st.rerun()

        edited = st.data_editor(
            df_view,
            use_container_width=True,
            hide_index=True,
            disabled=[c for c in df_view.columns if c != "Sync"],
            column_config={"Sync": st.column_config.CheckboxColumn("Sync")},
            key="editor_update",
        )

        # Sincronizar cambios del editor con el set persistente
        for _, r in edited.iterrows():
            code = str(r["Codigo"]).lower()
            if r["Sync"]:
                st.session_state._selected.add(code)
            else:
                st.session_state._selected.discard(code)

        # Filtrar updates con el set PERSISTENTE (no con la vista filtrada)
        updates = [u for u in updates if normalize(u["product"].get("code", "")) in st.session_state._selected]
        n_update = len(updates)
        st.caption(f"{n_update} seleccionados · {len(df_upd)} con cambio · {len(df_view)} visibles")
    else:
        st.info("No hay precios para actualizar. Todo esta al dia.")

with tab_nomatch:
    # Info sobre productos no importables (sin código o precio 0)
    _n_sin_cod = len(report_df[report_df["Estado"] == "SIN CODIGO"])
    _n_precio0 = len(report_df[report_df["Estado"] == "PRECIO 0"])
    _captions = []
    if _n_sin_cod:
        _captions.append(f"{_n_sin_cod} sin código (no se pueden importar)")
    if _n_precio0:
        _captions.append(f"{_n_precio0} con precio $0 (ignorados)")
    if _captions:
        st.caption("⚠️ " + " · ".join(_captions))

    # Productos SIN MATCH con código y precio válido → candidatos a crear
    df_create = report_df[
        (report_df["Estado"] == "SIN MATCH")
        & (report_df["Codigo"].astype(str).str.strip() != "")
        & (report_df["Precio Nuevo"].apply(lambda x: pd.to_numeric(x, errors="coerce")).fillna(0) > 0)
    ].reset_index(drop=True)

    if len(df_create) == 0:
        st.success("Todos los productos del Excel matchearon con Kyte.")
    else:
        st.subheader("Crear productos nuevos en Kyte")

        # Categorías de Kyte (cacheadas)
        with st.spinner("Cargando categorías de Kyte..."):
            try:
                kyte_cats = _fetch_kyte_categories_cached(uid, aid, token)
            except KyteAPIError as e:
                st.error(f"Error obteniendo categorías de Kyte: {e}")
                st.stop()

        cat_names_sorted = sorted([c.get("name", "").strip() for c in kyte_cats if c.get("name")])
        cats_by_lower = {c.get("name", "").strip().lower(): c for c in kyte_cats if c.get("name")}
        cats_by_original = {c.get("name", "").strip(): c for c in kyte_cats if c.get("name")}

        # Estado persistente: set de seleccionados + overrides de categoría por código
        _csk = f"csk_{hash(frozenset(df_create['Codigo'].astype(str)))}"
        if st.session_state.get("_csk") != _csk:
            st.session_state._csk = _csk
            st.session_state._create_sel = set()
            st.session_state._cat_overrides = {}

        # Construir DF para el editor
        rows_cv = []
        for _, row in df_create.iterrows():
            code_lc = str(row["Codigo"]).strip().lower()
            rubro = str(row["Rubro"]).strip() if pd.notna(row["Rubro"]) and str(row["Rubro"]).strip() not in ("", "nan") else ""

            # Cat Kyte: override manual > auto-match por Rubro > None
            if code_lc in st.session_state._cat_overrides:
                cat_kyte = st.session_state._cat_overrides[code_lc]
            elif rubro and rubro.lower() in cats_by_lower:
                cat_kyte = cats_by_lower[rubro.lower()].get("name", "").strip()
            else:
                cat_kyte = None

            rows_cv.append({
                "Crear": code_lc in st.session_state._create_sel,
                "Codigo": str(row["Codigo"]).strip(),
                "Descripcion": str(row["Nombre"]).strip() if pd.notna(row["Nombre"]) else "",
                "Precio": float(row["Precio Nuevo"]),
                "Rubro": rubro,
                "Cat Kyte": cat_kyte,
            })

        df_cv = pd.DataFrame(rows_cv)

        # Filtro
        f_create = st.text_input(
            "Filtrar por código o descripción",
            key="filtro_crear",
            placeholder="ej: WWC1209 ó taladro",
        ).strip().lower()

        df_cv_view = df_cv.copy()
        if f_create:
            mask = (
                df_cv_view["Codigo"].str.lower().str.contains(f_create, na=False)
                | df_cv_view["Descripcion"].str.lower().str.contains(f_create, na=False)
            )
            df_cv_view = df_cv_view[mask].reset_index(drop=True)

        # Botones Todos / Ninguno
        cca, ccb, _ = st.columns([1, 1, 4])
        if cca.button("✓ Todos", key="create_sel_all"):
            st.session_state._create_sel = set(df_cv["Codigo"].str.lower())
            st.session_state.pop("editor_create", None)
            st.rerun()
        if ccb.button("✗ Ninguno", key="create_sel_none"):
            st.session_state._create_sel = set()
            st.session_state.pop("editor_create", None)
            st.rerun()

        edited_create = st.data_editor(
            df_cv_view,
            use_container_width=True,
            hide_index=True,
            disabled=["Codigo", "Descripcion", "Precio", "Rubro"],
            column_config={
                "Crear": st.column_config.CheckboxColumn("Crear"),
                "Cat Kyte": st.column_config.SelectboxColumn(
                    "Categoría Kyte",
                    options=cat_names_sorted,
                    required=False,
                    help="Pre-llenado si el Rubro coincide. Si no existe, elegí la categoría más cercana.",
                ),
                "Precio": st.column_config.NumberColumn("Precio", format="$%.2f"),
            },
            key="editor_create",
        )

        # Persistir selección y overrides de categoría
        for _, r in edited_create.iterrows():
            code_lc = str(r["Codigo"]).lower()
            if r["Crear"]:
                st.session_state._create_sel.add(code_lc)
            else:
                st.session_state._create_sel.discard(code_lc)
            cat_val = r.get("Cat Kyte")
            if pd.notna(cat_val) and str(cat_val).strip() and str(cat_val) != "nan":
                st.session_state._cat_overrides[code_lc] = str(cat_val).strip()
            else:
                st.session_state._cat_overrides.pop(code_lc, None)

        n_to_create = len(st.session_state._create_sel)
        st.caption(f"{n_to_create} seleccionados · {len(df_cv_view)} visibles · {len(df_cv)} disponibles")

        if n_to_create > 0:
            confirm_create = st.checkbox(
                f"Confirmo que quiero crear {n_to_create} productos nuevos en Kyte",
                key="confirm_create",
            )
            if confirm_create:
                if st.button(f"CREAR {n_to_create} PRODUCTOS", type="primary", key="btn_create_products"):
                    to_create = df_create[df_create["Codigo"].astype(str).str.lower().isin(st.session_state._create_sel)]
                    prog_c = st.progress(0, text="Creando productos...")
                    n_created = 0
                    n_create_failed = 0
                    create_errors = []

                    for i, (_, row) in enumerate(to_create.iterrows()):
                        code_lc = str(row["Codigo"]).strip().lower()
                        nombre = str(row["Nombre"]).strip() if pd.notna(row["Nombre"]) and str(row["Nombre"]).strip() not in ("", "nan") else str(row["Codigo"])
                        rubro = str(row["Rubro"]).strip() if pd.notna(row["Rubro"]) and str(row["Rubro"]).strip() not in ("", "nan") else ""

                        override_cat = st.session_state._cat_overrides.get(code_lc)
                        if override_cat:
                            cat_obj = cats_by_original.get(override_cat)
                        elif rubro and rubro.lower() in cats_by_lower:
                            cat_obj = cats_by_lower[rubro.lower()]
                        else:
                            cat_obj = None

                        cat_id = (cat_obj.get("id") or cat_obj.get("_id")) if cat_obj else None
                        cat_name_str = cat_obj.get("name") if cat_obj else None

                        try:
                            client.create_product(
                                name=nombre,
                                code=str(row["Codigo"]).strip(),
                                sale_price=float(row["Precio Nuevo"]),
                                category_id=cat_id,
                                category_name=cat_name_str,
                            )
                            n_created += 1
                        except KyteAPIError as e:
                            n_create_failed += 1
                            create_errors.append(f"{nombre} ({row['Codigo']}): {e}")
                        prog_c.progress((i + 1) / len(to_create), text=f"Creando {i+1}/{len(to_create)}...")

                    prog_c.empty()
                    if n_create_failed == 0:
                        st.success(f"{n_created} productos creados correctamente en Kyte.")
                        _fetch_kyte_products_cached.clear()
                        _fetch_kyte_categories_cached.clear()
                        st.session_state._create_sel = set()
                        st.session_state._cat_overrides = {}
                    else:
                        st.warning(f"{n_created} creados, {n_create_failed} fallaron.")
                        for err in create_errors:
                            st.error(err)

with tab_kyte_only:
    st.caption("Productos cargados en Kyte que no aparecen en el Excel del distribuidor.")
    if len(kyte_only_df):
        f_ko = st.text_input(
            "Filtrar por código o nombre",
            key="filtro_kyte_only",
            placeholder="ej: MRC050590 ó amoladora",
        ).strip().lower()
        df_ko = kyte_only_df.copy()
        if f_ko:
            mask = (
                df_ko["Codigo"].astype(str).str.lower().str.contains(f_ko, na=False)
                | df_ko["Nombre"].astype(str).str.lower().str.contains(f_ko, na=False)
            )
            df_ko = df_ko[mask].reset_index(drop=True)
        st.dataframe(df_ko, use_container_width=True, hide_index=True)
        st.caption(f"{len(df_ko)} filas")
    else:
        st.success("Todos los productos de Kyte tienen match en el Excel.")

with tab_all:
    f_all = st.text_input(
        "Filtrar por código o nombre",
        key="filtro_all",
        placeholder="ej: MRC050590 ó amoladora",
    ).strip().lower()
    df_all = report_df.copy()
    if f_all:
        mask = (
            df_all["Codigo"].astype(str).str.lower().str.contains(f_all, na=False)
            | df_all["Nombre"].astype(str).str.lower().str.contains(f_all, na=False)
        )
        df_all = df_all[mask].reset_index(drop=True)
    st.dataframe(df_all, use_container_width=True, hide_index=True)
    st.caption(f"{len(df_all)} filas")

# Download report
stats_data = {
    "Metrica": ["Productos Kyte", "Productos Lista", "Matcheados", "A Actualizar", "Sin Cambio", "Precio 0", "Sin Match / Sin Codigo"],
    "Valor": [len(kyte_products), len(source_df), n_ok + n_update + n_zero, n_update, n_ok, n_zero, n_nomatch],
}

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
excel_data = to_excel_download(report_df, stats_data)
st.download_button(
    label="Descargar reporte Excel",
    data=excel_data,
    file_name=f"reporte_sync_{ts}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.spreadsheetml",
)

# Apply button
st.divider()

if n_update == 0:
    st.success("No hay cambios pendientes.")
else:
    st.warning(f"Hay {n_update} productos con precio diferente.")

    confirm = st.checkbox(f"Confirmo que quiero actualizar {n_update} productos en Kyte")

    if confirm:
        if st.button(f"APLICAR {n_update} ACTUALIZACIONES", type="primary"):
            progress = st.progress(0, text="Actualizando...")
            success = 0
            failed = 0
            errors = []

            for i, update in enumerate(updates):
                p = update["product"]
                try:
                    client.update_product_price(
                        p,
                        update["salePrice"],
                        update.get("costPrice"),
                    )
                    success += 1
                except KyteAPIError as e:
                    failed += 1
                    errors.append(f"{p.get('name', '?')} ({p.get('code', '?')}): {e}")

                progress.progress((i + 1) / len(updates), text=f"Actualizando {i+1}/{len(updates)}...")

            progress.empty()

            if failed == 0:
                st.success(f"{success} productos actualizados correctamente.")
            else:
                st.warning(f"{success} OK, {failed} fallaron.")
                for err in errors:
                    st.error(err)
