"""
Kyte Price Sync - Streamlit App
"""
import io
import streamlit as st
import pandas as pd
from datetime import datetime
from pathlib import Path

from kyte_api import KyteClient, KyteConfig, KyteAPIError, parse_kyte_token

# ── Page config ──────────────────────────────────────────────
st.set_page_config(
    page_title="Kyte Price Sync",
    page_icon="",
    layout="wide",
)

st.title("Kyte Price Sync")
st.caption("Sincroniza precios de productos desde una lista de distribuidor")


# ── Sidebar: Config ──────────────────────────────────────────
st.sidebar.header("Configuracion")

token = st.sidebar.text_area(
    "Kyte Token",
    height=68,
    help="Pegalo desde la consola del browser (F12 > Console > copy(localStorage.getItem('kyte_token')))",
).strip()

update_cost = st.sidebar.checkbox("Actualizar costo tambien", value=True)

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
    st.sidebar.success(f"Conectado (aid: {aid[:8]}...)")
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
    header_row = None
    for i in range(min(30, len(raw))):
        row_vals = [str(v).strip().lower() for v in raw.iloc[i] if pd.notna(v)]
        if any("articulo" in v for v in row_vals) and any("precio" in v for v in row_vals):
            header_row = i
            break
    if header_row is None:
        st.error("No se encontro header con 'Articulo' y 'Precio' en el Excel")
        st.stop()
    file.seek(0)
    df = pd.read_excel(file, header=header_row)
    return df.dropna(how="all").reset_index(drop=True)


def detect_columns(df):
    cols = {}
    for c in df.columns:
        lower = c.lower()
        if "codigo" in lower or "digo" in lower:
            cols["code"] = c
        elif "articulo" in lower:
            cols["name"] = c
        elif "precio" in lower:
            cols["price"] = c
    return cols


def run_matching(kyte_products, source_df):
    src_cols = detect_columns(source_df)
    if "name" not in src_cols or "price" not in src_cols:
        st.error(f"Columnas requeridas no encontradas. Encontradas: {src_cols}")
        st.stop()

    kyte_by_code = {}
    for product in kyte_products:
        code = normalize(product.get("code", ""))
        if code:
            kyte_by_code[code] = product

    rows = []
    updates = []

    for _, src_row in source_df.iterrows():
        new_price = src_row[src_cols["price"]]
        if pd.isna(new_price):
            continue
        try:
            new_price = float(new_price)
        except (ValueError, TypeError):
            continue

        src_name = str(src_row[src_cols["name"]]).strip() if pd.notna(src_row[src_cols["name"]]) else ""
        src_code = ""
        if "code" in src_cols and pd.notna(src_row[src_cols["code"]]):
            src_code = normalize(src_row[src_cols["code"]])

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
            entry = {"product": matched, "salePrice": new_price}
            if update_cost:
                entry["costPrice"] = new_price
            updates.append(entry)

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
uploaded = st.file_uploader("Subi la lista de precios del distribuidor", type=["xlsx", "xls"])

if not uploaded:
    st.stop()

# Load source
with st.spinner("Leyendo Excel..."):
    source_df = load_source(uploaded)
st.success(f"Lista cargada: {len(source_df)} productos")

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
    report_df, updates = run_matching(kyte_products, source_df)

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

# Tabs
tab_update, tab_nomatch, tab_all = st.tabs(["A Actualizar", "Sin Match", "Todo"])

with tab_update:
    df_upd = report_df[report_df["Estado"] == "ACTUALIZAR"]
    if len(df_upd):
        st.dataframe(df_upd, use_container_width=True, hide_index=True)
    else:
        st.info("No hay precios para actualizar. Todo esta al dia.")

with tab_nomatch:
    df_nm = report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO", "PRECIO 0"])]
    if len(df_nm):
        st.dataframe(df_nm, use_container_width=True, hide_index=True)
    else:
        st.success("Todos los productos de la lista matchearon con Kyte.")

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
