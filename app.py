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


@st.cache_data
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


def _token_days_left(token: str) -> int | None:
    """Días restantes hasta el vencimiento del kyte_token. None si no se puede parsear."""
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
            return (datetime.fromtimestamp(exp) - datetime.now()).days
    except Exception:
        pass
    return None
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
    st.session_state.pop("kyte_token_input", None)
    st.rerun()
if _col2.button("✕ Limpiar", help="Borra el token guardado", disabled=not token):
    if HAS_JS:
        st_javascript("localStorage.removeItem('kyte_sync_token')")
    st.session_state.pop("kyte_token_input", None)
    st.rerun()

st.sidebar.divider()
page = st.sidebar.radio("Modo", ["Sincronizar Precios", "Catalogo de Productos"])

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
    days = _token_days_left(token)

    # ── Auto-refresh si el token está por vencer ─────────────
    if days is not None and days < 30 and st.session_state.get("kyte_refresh_token"):
        try:
            new_token = refresh_kyte_token(st.session_state.kyte_refresh_token, aid)
            # Guardar el nuevo token
            st.session_state.kyte_token_input = new_token
            if HAS_JS:
                st_javascript(f"localStorage.setItem('kyte_sync_token', {_json.dumps(new_token)})")
            token = new_token
            uid, aid = parse_kyte_token(token)
            days = _token_days_left(token)
            st.sidebar.success(f"Token renovado · {days}d restantes")
        except Exception as e:
            st.sidebar.error(f"⚠️ Token vence en {days} días · Error renovando: {e}")
    elif days is not None and days < 30:
        st.sidebar.error(f"⚠️ Token vence en {days} días")
        with st.sidebar.expander("Configurar renovación automática"):
            st.markdown(
                "Pegá tu **refresh token** de Firebase (una sola vez).\n\n"
                "Para obtenerlo, abrí [web.kyteapp.com](https://web.kyteapp.com) "
                "y pegá este script en la consola (F12 > Console):"
            )
            st.code(
                '(async()=>{let d=await new Promise((r,j)=>{let q=indexedDB.open("firebaseLocalStorageDb");q.onsuccess=e=>r(e.target.result);q.onerror=j});let t=d.transaction("firebaseLocalStorage","readonly");let s=t.objectStore("firebaseLocalStorage");let a=await new Promise(r=>{let q=s.getAll();q.onsuccess=()=>r(q.result)});for(let i of a){if(i.value?.stsTokenManager?.refreshToken){let rt=i.value.stsTokenManager.refreshToken;copy(rt);console.log("Refresh token copiado al portapapeles!",rt.slice(0,20)+"...");return}}console.error("No se encontró refresh token")})()',
                language="javascript",
            )
            rt_input = st.text_input("Refresh Token", type="password", key="_rt_input")
            if st.button("Guardar refresh token") and rt_input.strip():
                st.session_state.kyte_refresh_token = rt_input.strip()
                if HAS_JS:
                    st_javascript(f"localStorage.setItem('kyte_refresh_token', {_json.dumps(rt_input.strip())})")
                st.rerun()
    elif days is not None and days < 90:
        st.sidebar.warning(f"Token vence en {days} días")
    else:
        label = f"Conectado · {days}d restantes" if days else f"Conectado ({aid[:8]}…)"
        st.sidebar.success(label)
except Exception as e:
    st.sidebar.error(f"Token invalido: {e}")
    st.stop()

config = KyteConfig(uid=uid, aid=aid)
client = KyteClient(config)


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


def run_matching(kyte_products, source_df, code_col, price_col, name_col=None):
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

        src_code = ""
        if pd.notna(src_row[code_col]):
            src_code = normalize(src_row[code_col])

        if not src_code:
            rows.append({"Estado": "SIN CODIGO", "Nombre": src_name, "Codigo": "", "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        matched = kyte_by_code.get(src_code)
        if not matched:
            rows.append({"Estado": "SIN MATCH", "Nombre": src_name, "Codigo": src_code, "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        old_price = matched.get("salePrice", 0)
        cat = matched.get("category") or {}
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""

        if new_price <= 0:
            rows.append({"Estado": "PRECIO 0", "Nombre": matched.get("name", ""), "Codigo": src_code, "Precio Kyte": old_price, "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": cat_name})
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
                    # Extraer categorías únicas
                    cats = sorted(set(
                        (p.get("category") or {}).get("name", "").strip() or "Sin categoría"
                        for p in prods
                    ))
                    st.session_state.catalog_prods = prods
                    st.session_state.catalog_cats = cats
                except KyteAPIError as e:
                    st.error(f"Error de API: {e}")
        st.stop()

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

with st.expander("Vista previa del Excel"):
    st.dataframe(source_df.head(10), use_container_width=True)

if code_col == price_col:
    st.error("La columna de código y la de precio deben ser distintas.")
    st.stop()

# Fetch Kyte products
with st.spinner("Conectando con Kyte API..."):
    try:
        kyte_products = client.get_products()
    except KyteAPIError as e:
        st.error(f"Error de API: {e}")
        st.stop()
st.success(f"Kyte: {len(kyte_products)} productos")

# Run matching
with st.spinner("Comparando precios..."):
    report_df, updates = run_matching(kyte_products, source_df, code_col, price_col, name_col)

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
        filtro = st.text_input(
            "Filtrar por código o nombre",
            key="filtro_update",
            placeholder="ej: MRC050590 ó amoladora",
        ).strip().lower()

        df_view = df_upd.copy()
        if filtro:
            mask = (
                df_view["Codigo"].astype(str).str.lower().str.contains(filtro, na=False)
                | df_view["Nombre"].astype(str).str.lower().str.contains(filtro, na=False)
            )
            df_view = df_view[mask].reset_index(drop=True)

        df_view.insert(0, "Sync", True)

        cs1, cs2, _ = st.columns([1, 1, 4])
        if cs1.button("Seleccionar todos"):
            st.session_state.pop("editor_update", None)
            df_view["Sync"] = True
        if cs2.button("Deseleccionar todos"):
            st.session_state.pop("editor_update", None)
            df_view["Sync"] = False

        edited = st.data_editor(
            df_view,
            use_container_width=True,
            hide_index=True,
            disabled=[c for c in df_view.columns if c != "Sync"],
            column_config={"Sync": st.column_config.CheckboxColumn("Sync", default=True)},
            key="editor_update",
        )

        selected_codes = set(
            edited.loc[edited["Sync"] == True, "Codigo"].astype(str).str.lower()
        )
        updates = [u for u in updates if normalize(u["product"].get("code", "")) in selected_codes]
        n_update = len(updates)
        st.caption(f"{n_update} productos seleccionados para actualizar (de {len(df_upd)} con cambio)")
    else:
        st.info("No hay precios para actualizar. Todo esta al dia.")

with tab_nomatch:
    st.caption("Productos del Excel que no están en Kyte (o sin código).")
    df_nm = report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO", "PRECIO 0"])].reset_index(drop=True)
    if len(df_nm):
        f_nm = st.text_input(
            "Filtrar por código o nombre",
            key="filtro_nomatch",
            placeholder="ej: MRC050590 ó amoladora",
        ).strip().lower()
        if f_nm:
            mask = (
                df_nm["Codigo"].astype(str).str.lower().str.contains(f_nm, na=False)
                | df_nm["Nombre"].astype(str).str.lower().str.contains(f_nm, na=False)
            )
            df_nm = df_nm[mask].reset_index(drop=True)
        st.dataframe(df_nm, use_container_width=True, hide_index=True)
        st.caption(f"{len(df_nm)} filas")
    else:
        st.success("Todos los productos de la lista matchearon con Kyte.")

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
    st.dataframe(report_df, use_container_width=True, hide_index=True)

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
