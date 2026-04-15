"""
Kyte Price Sync - Desktop App (tkinter)
Uso: python app_desktop.py
Build: pyinstaller --onefile --windowed app_desktop.py
"""
import io
import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from datetime import datetime
from pathlib import Path

import pandas as pd
from jinja2 import Environment, FileSystemLoader

from kyte_api import KyteClient, KyteConfig, KyteAPIError, parse_kyte_token
from generate_catalog import build_categories


# ── Path helpers ──────────────────────────────────────────────────────────────

def _exe_dir() -> Path:
    """Directorio del ejecutable (o del script en desarrollo)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def _meipass_dir() -> Path:
    """Directorio de archivos bundleados por PyInstaller (onefile)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


TOKEN_FILE = _exe_dir() / ".kyte_token"


# ── Helpers (misma logica que app.py) ────────────────────────────────────────

def normalize(text) -> str:
    if pd.isna(text):
        return ""
    return " ".join(str(text).strip().lower().split())


def load_source(path: str) -> pd.DataFrame:
    raw = pd.read_excel(path, header=None)
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
    df = pd.read_excel(path, header=header_row)
    return df.dropna(how="all").reset_index(drop=True)


def guess_column(df, keywords):
    for c in df.columns:
        lower = str(c).lower()
        for kw in keywords:
            if kw in lower:
                return c
    return None


def trend_label(diff) -> str:
    try:
        v = float(diff)
        if v > 0:
            return "🔴 SUBE"
        if v < 0:
            return "🟢 BAJA"
    except (ValueError, TypeError):
        pass
    return "—"


def run_matching(kyte_products: list, source_df: pd.DataFrame, code_col: str, price_col: str, name_col: str | None = None):
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
            rows.append({"Estado": "SIN CODIGO", "Cambio": "", "Nombre": src_name, "Codigo": "",
                         "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        matched = kyte_by_code.get(src_code)
        if not matched:
            rows.append({"Estado": "SIN MATCH", "Cambio": "", "Nombre": src_name, "Codigo": src_code,
                         "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        old_price = matched.get("salePrice", 0)
        cat = matched.get("category") or {}
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""

        if new_price <= 0:
            rows.append({"Estado": "PRECIO 0", "Cambio": "", "Nombre": matched.get("name", ""), "Codigo": src_code,
                         "Precio Kyte": old_price, "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": cat_name})
            continue

        diff = round(new_price - old_price, 2)
        diff_pct = round((diff / old_price) * 100, 1) if old_price else 0
        price_changed = abs(old_price - new_price) > 0.001

        estado = "ACTUALIZAR" if price_changed else "OK"
        rows.append({
            "Estado": estado,
            "Cambio": trend_label(diff) if price_changed else "",
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


def kyte_only_df(kyte_products: list, matched_codes: set) -> pd.DataFrame:
    rows = []
    for p in kyte_products:
        code = normalize(p.get("code", ""))
        if not code or code in matched_codes:
            continue
        cat = p.get("category") or {}
        rows.append({
            "Codigo": code,
            "Nombre": p.get("name", ""),
            "Precio Kyte": p.get("salePrice", 0),
            "Categoria": cat.get("name", "") if isinstance(cat, dict) else "",
        })
    return pd.DataFrame(rows)


def to_excel_bytes(df: pd.DataFrame, stats: dict) -> bytes:
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        sort_map = {"ACTUALIZAR": 0, "PRECIO 0": 1, "SIN MATCH": 2, "SIN CODIGO": 3, "OK": 4}
        df_sorted = df.copy()
        df_sorted["_s"] = df_sorted["Estado"].map(sort_map).fillna(5)
        df_sorted = df_sorted.sort_values("_s").drop(columns=["_s"])

        df_sorted[df_sorted["Estado"] == "ACTUALIZAR"].to_excel(writer, sheet_name="A Actualizar", index=False)
        df_nomatch = df_sorted[df_sorted["Estado"].isin(["SIN MATCH", "SIN CODIGO"])]
        if len(df_nomatch):
            df_nomatch.to_excel(writer, sheet_name="Sin Match", index=False)
        df_p0 = df_sorted[df_sorted["Estado"] == "PRECIO 0"]
        if len(df_p0):
            df_p0.to_excel(writer, sheet_name="Precio 0", index=False)
        df_sorted[df_sorted["Estado"] == "OK"].to_excel(writer, sheet_name="Sin Cambio", index=False)
        df_sorted.to_excel(writer, sheet_name="Detalle Completo", index=False)
        pd.DataFrame(stats).to_excel(writer, sheet_name="Resumen", index=False)
    return output.getvalue()


# ── Main App ─────────────────────────────────────────────────────────────────

COLS = ("Sync", "Estado", "Cambio", "Nombre", "Codigo", "Precio Kyte", "Precio Nuevo", "Diferencia", "Dif %", "Categoria")
COLS_NOMATCH = ("Estado", "Nombre", "Codigo", "Precio Kyte", "Precio Nuevo", "Categoria")
COLS_KYTEONLY = ("Codigo", "Nombre", "Precio Kyte", "Categoria")

COL_WIDTHS = {
    "Sync": 50,
    "Estado": 90,
    "Cambio": 80,
    "Nombre": 260,
    "Codigo": 90,
    "Precio Kyte": 90,
    "Precio Nuevo": 90,
    "Diferencia": 80,
    "Dif %": 60,
    "Categoria": 120,
}

ROW_TAGS = {
    "ACTUALIZAR": "warn",
    "SIN MATCH": "danger",
    "SIN CODIGO": "muted",
    "PRECIO 0": "danger",
    "OK": "ok",
}


class KyteSyncApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Kyte Price Sync")
        self.geometry("1100x720")
        self.minsize(900, 600)
        self.resizable(True, True)

        self._report_df: pd.DataFrame | None = None
        self._updates: list = []
        self._client: KyteClient | None = None
        self._cat_client: KyteClient | None = None
        self._q: queue.Queue = queue.Queue()

        self._build_ui()
        self._load_saved_token()
        self._poll_queue()

    # ── Token persistence ─────────────────────────────────────

    def _load_saved_token(self):
        if TOKEN_FILE.exists():
            try:
                token = TOKEN_FILE.read_text(encoding="utf-8").strip()
                if token:
                    self._token_txt.insert("1.0", token)
                    self._set_status("Token cargado desde archivo.")
            except Exception:
                pass

    def _save_token(self, token: str):
        try:
            TOKEN_FILE.write_text(token, encoding="utf-8")
        except Exception:
            pass

    # ── UI construction ──────────────────────────────────────

    def _build_ui(self):
        top = tk.Frame(self, bg="#1a1a2e", pady=8)
        top.pack(fill="x")
        tk.Label(top, text="Kyte Price Sync", font=("Segoe UI", 16, "bold"),
                 bg="#1a1a2e", fg="white").pack(side="left", padx=16)

        body = tk.Frame(self)
        body.pack(fill="both", expand=True, padx=10, pady=8)

        left = tk.LabelFrame(body, text="Configuracion", padx=8, pady=8, width=260)
        left.pack(side="left", fill="y", padx=(0, 8))
        left.pack_propagate(False)

        right = tk.Frame(body)
        right.pack(side="left", fill="both", expand=True)

        self._build_left(left)
        self._build_right(right)

        self._status_var = tk.StringVar(value="Listo.")
        tk.Label(self, textvariable=self._status_var, anchor="w",
                 relief="sunken", bd=1, font=("Segoe UI", 9)).pack(fill="x", side="bottom")

    def _build_left(self, parent):
        tk.Label(parent, text="Kyte Token:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(parent, text="F12 > Console > pega esto:", font=("Segoe UI", 7), fg="#555").pack(anchor="w")
        js_code = tk.Entry(parent, font=("Consolas", 7), fg="#0a5", relief="flat",
                           bg="#f0f0f0", readonlybackground="#f0f0f0", state="readonly")
        js_code.insert(0, "copy(localStorage.getItem('kyte_token'))")
        js_code.pack(fill="x", pady=(1, 4))
        self._token_txt = scrolledtext.ScrolledText(parent, height=5, wrap="word",
                                                     font=("Consolas", 8))
        self._token_txt.pack(fill="x", pady=(2, 4))

        ttk.Button(parent, text="🔄 Renovar token (refresh)", command=self._refresh_token).pack(fill="x", pady=(0, 8))

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=4)

        tk.Label(parent, text="Lista de distribuidor:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self._file_var = tk.StringVar(value="(ninguno)")
        tk.Label(parent, textvariable=self._file_var, font=("Segoe UI", 8),
                 wraplength=230, fg="#333").pack(anchor="w", pady=2)
        ttk.Button(parent, text="Elegir Excel...", command=self._pick_file).pack(fill="x", pady=2)

        # Selectores de columna (se rellenan al elegir Excel)
        cols_box = tk.LabelFrame(parent, text="Columnas", padx=4, pady=4)
        cols_box.pack(fill="x", pady=6)
        tk.Label(cols_box, text="Código:", font=("Segoe UI", 8)).pack(anchor="w")
        self._code_combo = ttk.Combobox(cols_box, state="disabled", font=("Segoe UI", 8))
        self._code_combo.pack(fill="x", pady=(0, 4))
        tk.Label(cols_box, text="Precio:", font=("Segoe UI", 8)).pack(anchor="w")
        self._price_combo = ttk.Combobox(cols_box, state="disabled", font=("Segoe UI", 8))
        self._price_combo.pack(fill="x", pady=(0, 4))
        tk.Label(cols_box, text="Nombre (opcional):", font=("Segoe UI", 8)).pack(anchor="w")
        self._name_combo = ttk.Combobox(cols_box, state="disabled", font=("Segoe UI", 8))
        self._name_combo.pack(fill="x")

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=8)

        self._run_btn = ttk.Button(parent, text="Comparar precios",
                                   command=self._run_compare, style="Accent.TButton")
        self._run_btn.pack(fill="x", pady=2)

    def _refresh_token(self):
        """Renueva el token actual usando un refresh token guardado."""
        from kyte_api import refresh_kyte_token
        token = self._get_token()
        if not token:
            messagebox.showerror("Error", "Pega un token actual primero (necesito el aid).")
            return
        rt_file = _exe_dir() / ".kyte_refresh_token"
        if not rt_file.exists():
            # Pedir el refresh token
            from tkinter.simpledialog import askstring
            rt = askstring("Refresh Token",
                "Pegá tu refresh token de Firebase (1 sola vez).\n\n"
                "Para obtenerlo, F12 > Console en web.kyteapp.com:\n\n"
                "(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('firebaseLocalStorageDb');q.onsuccess=e=>r(e.target.result);q.onerror=j});"
                "const it=await new Promise(r=>{const q=db.transaction('firebaseLocalStorage','readonly').objectStore('firebaseLocalStorage').getAll();q.onsuccess=()=>r(q.result)});"
                "for(const i of it){const rt=i?.value?.stsTokenManager?.refreshToken;if(rt){await navigator.clipboard.writeText(rt);console.log('OK',rt.slice(0,20));return}}console.error('no rt')})();")
            if not rt or not rt.strip():
                return
            try:
                rt_file.write_text(rt.strip(), encoding="utf-8")
            except Exception:
                pass
        else:
            rt = rt_file.read_text(encoding="utf-8").strip()
        try:
            _, aid = parse_kyte_token(token)
            new_token = refresh_kyte_token(rt, aid)
            self._token_txt.delete("1.0", "end")
            self._token_txt.insert("1.0", new_token)
            self._save_token(new_token)
            self._set_status("Token renovado ✓")
            messagebox.showinfo("OK", "Token renovado correctamente.")
        except Exception as e:
            messagebox.showerror("Error renovando", str(e))

    def _build_right(self, parent):
        stats_frame = tk.Frame(parent)
        stats_frame.pack(fill="x", pady=(0, 8))

        self._stat_vars = {}
        for label, key, color in [
            ("A actualizar", "update", "#856404"),
            ("Sin cambio", "ok", "#155724"),
            ("Sin match", "nomatch", "#721c24"),
            ("Precio 0", "zero", "#721c24"),
            ("En Kyte, no Excel", "kyte_only", "#0c5460"),
        ]:
            box = tk.Frame(stats_frame, bd=1, relief="solid", padx=10, pady=6)
            box.pack(side="left", expand=True, fill="x", padx=2)
            tk.Label(box, text=label, font=("Segoe UI", 8), fg="#666").pack()
            var = tk.StringVar(value="—")
            self._stat_vars[key] = var
            tk.Label(box, textvariable=var, font=("Segoe UI", 16, "bold"), fg=color).pack()

        notebook = ttk.Notebook(parent)
        notebook.pack(fill="both", expand=True)

        self._trees = {}
        self._filters = {}
        self._df_for_tab = {}  # df original sin filtrar de cada tab

        # A Actualizar: con filtro + columna Sync (☑/☐) toggleable + filtro tendencia
        upd_frame = tk.Frame(notebook); notebook.add(upd_frame, text="A Actualizar")
        ftop = tk.Frame(upd_frame); ftop.pack(fill="x", pady=4)
        tk.Label(ftop, text="Filtrar:", font=("Segoe UI", 9)).pack(side="left")
        self._filters["update"] = tk.StringVar()
        ent = tk.Entry(ftop, textvariable=self._filters["update"], width=30)
        ent.pack(side="left", padx=4)
        ent.bind("<KeyRelease>", lambda e: self._refresh_tab("update"))
        self._trend_filter = tk.StringVar(value="Todos")
        ttk.Combobox(ftop, textvariable=self._trend_filter, state="readonly", width=14,
                     values=["Todos", "Solo suben 🔴", "Solo bajan 🟢"]).pack(side="left", padx=4)
        self._trend_filter.trace_add("write", lambda *a: self._refresh_tab("update"))
        ttk.Button(ftop, text="✓ Todo", width=8, command=lambda: self._toggle_all("update", True)).pack(side="left", padx=2)
        ttk.Button(ftop, text="✗ Nada", width=8, command=lambda: self._toggle_all("update", False)).pack(side="left", padx=2)
        self._sel_count = tk.StringVar(value="")
        tk.Label(ftop, textvariable=self._sel_count, font=("Segoe UI", 8), fg="#444").pack(side="right", padx=4)
        self._trees["update"] = self._make_tree(upd_frame, COLS, allow_toggle=True)

        # Sin Match (Excel sin Kyte)
        nm_frame = tk.Frame(notebook); notebook.add(nm_frame, text="En Excel, no en Kyte")
        nmtop = tk.Frame(nm_frame); nmtop.pack(fill="x", pady=4)
        tk.Label(nmtop, text="Filtrar:", font=("Segoe UI", 9)).pack(side="left")
        self._filters["nomatch"] = tk.StringVar()
        ent2 = tk.Entry(nmtop, textvariable=self._filters["nomatch"], width=30); ent2.pack(side="left", padx=4)
        ent2.bind("<KeyRelease>", lambda e: self._refresh_tab("nomatch"))
        self._trees["nomatch"] = self._make_tree(nm_frame, COLS_NOMATCH)

        # En Kyte, no Excel
        ko_frame = tk.Frame(notebook); notebook.add(ko_frame, text="En Kyte, no en Excel")
        kotop = tk.Frame(ko_frame); kotop.pack(fill="x", pady=4)
        tk.Label(kotop, text="Filtrar:", font=("Segoe UI", 9)).pack(side="left")
        self._filters["kyte_only"] = tk.StringVar()
        ent3 = tk.Entry(kotop, textvariable=self._filters["kyte_only"], width=30); ent3.pack(side="left", padx=4)
        ent3.bind("<KeyRelease>", lambda e: self._refresh_tab("kyte_only"))
        self._trees["kyte_only"] = self._make_tree(ko_frame, COLS_KYTEONLY)

        # Todo
        all_frame = tk.Frame(notebook); notebook.add(all_frame, text="Todo")
        self._trees["all"] = self._make_tree(all_frame, COLS)

        cat_frame = tk.Frame(notebook, padx=16, pady=16)
        notebook.add(cat_frame, text="Catalogo")
        self._build_catalog_tab(cat_frame)

        # Set para tracking de selecciones (claves: codigo)
        self._selected_codes: set = set()

        action = tk.Frame(parent)
        action.pack(fill="x", pady=(8, 0))

        self._dl_btn = ttk.Button(action, text="Descargar reporte Excel",
                                  command=self._download_report, state="disabled")
        self._dl_btn.pack(side="left", padx=(0, 8))

        self._apply_btn = ttk.Button(action, text="APLICAR ACTUALIZACIONES",
                                     command=self._apply_updates, state="disabled")
        self._apply_btn.pack(side="left")

        self._progress = ttk.Progressbar(action, length=200, mode="determinate")
        self._progress.pack(side="right", padx=8)

    def _build_catalog_tab(self, parent):
        tk.Label(parent, text="Generar Catalogo HTML", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        tk.Label(parent,
                 text="Genera un catalogo imprimible por categoria. No necesita comparar precios antes.",
                 font=("Segoe UI", 9), fg="#555", wraplength=600).pack(anchor="w", pady=(2, 14))

        # Categoria: combobox + boton cargar
        row1 = tk.Frame(parent)
        row1.pack(fill="x", pady=4)
        tk.Label(row1, text="Categoria:", font=("Segoe UI", 9)).pack(side="left")
        self._cat_filter = tk.StringVar()
        self._cat_combo = ttk.Combobox(row1, textvariable=self._cat_filter, width=32, state="normal")
        self._cat_combo.pack(side="left", padx=8)
        tk.Label(row1, text="(vacio = todas)", font=("Segoe UI", 8), fg="#888").pack(side="left")
        self._load_cats_btn = ttk.Button(row1, text="Cargar categorias", command=self._load_categories)
        self._load_cats_btn.pack(side="left", padx=(16, 0))

        # Opciones
        row2 = tk.Frame(parent)
        row2.pack(fill="x", pady=4)
        self._cat_show_prices = tk.BooleanVar(value=True)
        ttk.Checkbutton(row2, text="Mostrar precios", variable=self._cat_show_prices).pack(side="left", padx=(0, 16))
        self._cat_embed = tk.BooleanVar(value=False)
        ttk.Checkbutton(row2, text="Embeber imagenes (offline, mas lento)",
                        variable=self._cat_embed).pack(side="left")

        # Boton generar + progreso
        row3 = tk.Frame(parent)
        row3.pack(fill="x", pady=(12, 4))
        self._cat_btn = ttk.Button(row3, text="Generar catalogo", command=self._run_catalog)
        self._cat_btn.pack(side="left")
        self._cat_progress = ttk.Progressbar(row3, mode="indeterminate", length=180)
        self._cat_progress.pack(side="left", padx=12)

        # Export Excel para clientes
        row4 = tk.Frame(parent)
        row4.pack(fill="x", pady=(8, 4))
        ttk.Button(row4, text="📥 Exportar productos a Excel (para clientes)",
                   command=self._export_products_excel).pack(side="left")

        tk.Label(parent, text="Log:", font=("Segoe UI", 8), fg="#666").pack(anchor="w", pady=(10, 2))
        self._cat_log = scrolledtext.ScrolledText(parent, height=8, state="disabled",
                                                   font=("Consolas", 8), fg="#333")
        self._cat_log.pack(fill="x")

    def _cat_log_append(self, msg: str):
        self._cat_log.config(state="normal")
        self._cat_log.insert("end", msg + "\n")
        self._cat_log.see("end")
        self._cat_log.config(state="disabled")

    def _make_tree(self, parent, cols=COLS, allow_toggle: bool = False) -> ttk.Treeview:
        frame = tk.Frame(parent)
        frame.pack(fill="both", expand=True)

        tree = ttk.Treeview(frame, columns=cols, show="headings", selectmode="browse")
        vsb = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        hsb = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        for col in cols:
            tree.heading(col, text=col)
            tree.column(col, width=COL_WIDTHS.get(col, 100), stretch=False, anchor="center" if col == "Sync" else "w")

        tree.tag_configure("warn", background="#fff3cd")
        tree.tag_configure("danger", background="#f8d7da")
        tree.tag_configure("muted", background="#e2e3e5")
        tree.tag_configure("ok", background="#d4edda")
        tree.tag_configure("up", background="#fde2e2")
        tree.tag_configure("down", background="#e2fde2")

        if allow_toggle:
            tree.bind("<Button-1>", self._on_tree_click)

        tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        return tree

    def _on_tree_click(self, event):
        tree: ttk.Treeview = event.widget
        col = tree.identify_column(event.x)
        item = tree.identify_row(event.y)
        if not item or col != "#1":
            return
        vals = list(tree.item(item, "values"))
        codigo = vals[4] if len(vals) > 4 else ""
        if codigo in self._selected_codes:
            self._selected_codes.discard(codigo)
            vals[0] = "☐"
        else:
            self._selected_codes.add(codigo)
            vals[0] = "☑"
        tree.item(item, values=vals)
        self._update_selection_label()

    def _toggle_all(self, tab_key: str, on: bool):
        df = self._df_for_tab.get(tab_key)
        if df is None:
            return
        codes = set(str(c) for c in df["Codigo"].tolist() if c)
        if on:
            self._selected_codes |= codes
        else:
            self._selected_codes -= codes
        self._refresh_tab(tab_key)

    def _update_selection_label(self):
        n = len(self._selected_codes)
        self._sel_count.set(f"{n} seleccionados")
        if hasattr(self, "_apply_btn") and n > 0:
            self._apply_btn.config(state="normal", text=f"APLICAR {n} ACTUALIZACIONES")
        elif hasattr(self, "_apply_btn"):
            self._apply_btn.config(state="disabled", text="APLICAR ACTUALIZACIONES")

    # ── Event handlers ───────────────────────────────────────

    def _pick_file(self):
        path = filedialog.askopenfilename(
            title="Elegir lista de precios",
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")],
        )
        if path:
            self._excel_path = path
            self._file_var.set(Path(path).name)
            try:
                df = load_source(path)
                self._source_df_preview = df
                cols = [str(c) for c in df.columns]
                code_def = guess_column(df, ["codigo_catalogo", "codigo", "código", "code"])
                price_def = guess_column(df, ["precio_venta", "precio", "price"])
                name_def = guess_column(df, ["descripcion", "descripción", "articulo", "artículo", "nombre", "name"])
                for combo, default in [(self._code_combo, code_def), (self._price_combo, price_def)]:
                    combo["values"] = cols
                    combo.config(state="readonly")
                    if default in cols:
                        combo.set(default)
                    elif cols:
                        combo.set(cols[0])
                self._name_combo["values"] = ["(ninguna)"] + cols
                self._name_combo.config(state="readonly")
                self._name_combo.set(name_def if name_def in cols else "(ninguna)")
                self._set_status(f"Excel cargado: {len(df)} filas, {len(cols)} columnas. Verificá las columnas y comparalos.")
            except Exception as e:
                messagebox.showerror("Error leyendo Excel", str(e))

    def _get_token(self) -> str:
        return self._token_txt.get("1.0", "end").strip()

    def _make_client(self) -> tuple[KyteClient, str] | None:
        """Parsea el token, guarda en archivo y devuelve (client, uid). None si error."""
        token = self._get_token()
        if not token:
            messagebox.showerror("Error", "Pega el token de Kyte primero.")
            return None
        try:
            uid, aid = parse_kyte_token(token)
        except Exception as e:
            messagebox.showerror("Token invalido", str(e))
            return None
        self._save_token(token)
        return KyteClient(KyteConfig(uid=uid, aid=aid)), uid

    # ── Sync: compare ────────────────────────────────────────

    def _run_compare(self):
        if not hasattr(self, "_excel_path") or not self._excel_path:
            messagebox.showerror("Error", "Elegi un archivo Excel primero.")
            return
        code_col = self._code_combo.get().strip()
        price_col = self._price_combo.get().strip()
        name_choice = self._name_combo.get().strip()
        name_col = None if name_choice == "(ninguna)" else name_choice
        if not code_col or not price_col:
            messagebox.showerror("Error", "Elegí las columnas de Código y Precio.")
            return
        if code_col == price_col:
            messagebox.showerror("Error", "La columna de Código y la de Precio deben ser distintas.")
            return
        result = self._make_client()
        if result is None:
            return
        self._client, _ = result
        self._run_btn.config(state="disabled")
        self._apply_btn.config(state="disabled")
        self._dl_btn.config(state="disabled")
        self._set_status("Conectando con Kyte API...")
        threading.Thread(target=self._worker_compare,
                         args=(code_col, price_col, name_col), daemon=True).start()

    def _worker_compare(self, code_col, price_col, name_col):
        try:
            self._q.put(("status", "Descargando productos de Kyte..."))
            kyte_products = self._client.get_products()
            self._q.put(("status", f"Kyte: {len(kyte_products)} productos. Leyendo Excel..."))
            source_df = load_source(self._excel_path)
            self._q.put(("status", f"Excel: {len(source_df)} filas. Comparando..."))
            report_df, updates = run_matching(kyte_products, source_df, code_col, price_col, name_col)
            matched = set(
                report_df.loc[report_df["Estado"].isin(["ACTUALIZAR", "OK", "PRECIO 0"]), "Codigo"]
                .astype(str).str.lower()
            )
            ko_df = kyte_only_df(kyte_products, matched)
            self._q.put(("done_compare", (report_df, updates, ko_df)))
        except Exception as e:
            self._q.put(("error", str(e)))

    # ── Sync: apply ──────────────────────────────────────────

    def _apply_updates(self):
        # Solo los que están seleccionados (Sync ☑)
        selected = [u for u in self._updates if str(u["product"].get("code", "")).lower() in {c.lower() for c in self._selected_codes}]
        n = len(selected)
        if n == 0:
            messagebox.showinfo("Nada seleccionado", "No hay productos tildados para actualizar.")
            return
        if not messagebox.askyesno("Confirmar", f"Se van a actualizar {n} productos en Kyte.\nContinuar?"):
            return
        self._apply_btn.config(state="disabled")
        self._run_btn.config(state="disabled")
        self._progress["value"] = 0
        self._progress["maximum"] = n
        threading.Thread(target=self._worker_apply, args=(selected,), daemon=True).start()

    def _worker_apply(self, updates: list):
        success = 0
        failed = 0
        errors = []
        for i, update in enumerate(updates):
            p = update["product"]
            try:
                self._client.update_product_price(p, update["salePrice"], update.get("costPrice"))
                success += 1
            except KyteAPIError as e:
                failed += 1
                errors.append(f"{p.get('name', '?')} ({p.get('code', '?')}): {e}")
            self._q.put(("progress", (i + 1, len(updates))))
        self._q.put(("done_apply", (success, failed, errors)))

    # ── Catalog: load categories ─────────────────────────────

    def _load_categories(self):
        result = self._make_client()
        if result is None:
            return
        client, _ = result
        self._cat_client = client
        self._load_cats_btn.config(state="disabled")
        self._set_status("Cargando categorias...")
        threading.Thread(target=self._worker_load_cats, daemon=True).start()

    def _worker_load_cats(self):
        try:
            cats = self._cat_client.get_categories()
            names = sorted(c.get("name", "") for c in cats if c.get("name"))
            self._q.put(("cats_loaded", names))
        except Exception as e:
            self._q.put(("cats_error", str(e)))

    # ── Catalog: generate ────────────────────────────────────

    def _run_catalog(self):
        result = self._make_client()
        if result is None:
            return
        self._cat_client, uid = result

        save_path = filedialog.asksaveasfilename(
            title="Guardar catalogo como",
            defaultextension=".html",
            initialfile=f"catalogo_{datetime.now().strftime('%Y%m%d')}.html",
            filetypes=[("HTML files", "*.html")],
        )
        if not save_path:
            return

        self._cat_btn.config(state="disabled")
        self._cat_progress.start(10)
        self._cat_log.config(state="normal")
        self._cat_log.delete("1.0", "end")
        self._cat_log.config(state="disabled")

        args = {
            "uid": uid,
            "filter_category": self._cat_filter.get().strip() or None,
            "embed_images": self._cat_embed.get(),
            "show_prices": self._cat_show_prices.get(),
            "save_path": save_path,
        }
        threading.Thread(target=self._worker_catalog, args=(args,), daemon=True).start()

    def _worker_catalog(self, args: dict):
        try:
            self._q.put(("cat_log", "Descargando productos de Kyte..."))
            products = self._cat_client.get_products()
            self._q.put(("cat_log", f"  {len(products)} productos obtenidos"))

            self._q.put(("cat_log", "Agrupando por categoria..."))
            session = self._cat_client.session if args["embed_images"] else None
            categories = build_categories(
                products,
                uid=args["uid"],
                embed_images=args["embed_images"],
                session=session,
                filter_category=args["filter_category"],
                show_prices=args["show_prices"],
            )
            total = sum(len(c["products"]) for c in categories)
            self._q.put(("cat_log", f"  {len(categories)} categorias, {total} productos"))

            # Template: sys._MEIPASS cuando es .exe, __file__ en desarrollo
            tmpl_path = _meipass_dir() / "catalog_template.html"
            if not tmpl_path.exists():
                raise FileNotFoundError(f"No se encontro catalog_template.html en {tmpl_path.parent}")

            self._q.put(("cat_log", "Renderizando HTML..."))
            env = Environment(loader=FileSystemLoader(str(tmpl_path.parent)), autoescape=True)
            template = env.get_template(tmpl_path.name)

            months_es = ["enero","febrero","marzo","abril","mayo","junio",
                         "julio","agosto","septiembre","octubre","noviembre","diciembre"]
            now = datetime.now()
            gen_date = f"{now.day} de {months_es[now.month-1]} de {now.year}"

            html = template.render(
                company_name="MP.TOOLS MAYORISTA",
                generated_date=gen_date,
                total_products=total,
                categories=categories,
            )

            Path(args["save_path"]).write_text(html, encoding="utf-8")
            self._q.put(("cat_done", args["save_path"]))

        except Exception as e:
            self._q.put(("cat_error", str(e)))

    # ── Download report ──────────────────────────────────────

    def _download_report(self):
        if self._report_df is None:
            return
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = filedialog.asksaveasfilename(
            title="Guardar reporte",
            defaultextension=".xlsx",
            initialfile=f"reporte_sync_{ts}.xlsx",
            filetypes=[("Excel files", "*.xlsx")],
        )
        if not path:
            return
        n_update = len(self._report_df[self._report_df["Estado"] == "ACTUALIZAR"])
        n_ok     = len(self._report_df[self._report_df["Estado"] == "OK"])
        n_nomatch = len(self._report_df[self._report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])])
        n_zero   = len(self._report_df[self._report_df["Estado"] == "PRECIO 0"])
        stats = {
            "Metrica": ["A Actualizar", "Sin Cambio", "Precio 0", "Sin Match / Sin Codigo"],
            "Valor": [n_update, n_ok, n_zero, n_nomatch],
        }
        data = to_excel_bytes(self._report_df, stats)
        with open(path, "wb") as f:
            f.write(data)
        self._set_status(f"Reporte guardado: {path}")

    # ── Queue polling ────────────────────────────────────────

    def _poll_queue(self):
        try:
            while True:
                msg, payload = self._q.get_nowait()
                if msg == "status":
                    self._set_status(payload)
                elif msg == "error":
                    self._set_status(f"Error: {payload}")
                    messagebox.showerror("Error", payload)
                    self._run_btn.config(state="normal")
                elif msg == "progress":
                    current, total = payload
                    self._progress["value"] = current
                    self._set_status(f"Actualizando {current}/{total}...")
                elif msg == "done_compare":
                    self._on_compare_done(payload)
                elif msg == "done_apply":
                    self._on_apply_done(payload)
                elif msg == "cats_loaded":
                    self._cat_combo["values"] = payload
                    self._load_cats_btn.config(state="normal")
                    self._set_status(f"{len(payload)} categorias cargadas.")
                elif msg == "cats_error":
                    self._load_cats_btn.config(state="normal")
                    messagebox.showerror("Error", f"No se pudieron cargar categorias: {payload}")
                elif msg == "cat_log":
                    self._cat_log_append(payload)
                elif msg == "cat_done":
                    self._cat_progress.stop()
                    self._cat_btn.config(state="normal")
                    self._cat_log_append(f"Listo: {payload}")
                    if messagebox.askyesno("Catalogo generado", "Catalogo guardado.\n\nAbrir en el browser?"):
                        os.startfile(payload)
                elif msg == "cat_error":
                    self._cat_progress.stop()
                    self._cat_btn.config(state="normal")
                    self._cat_log_append(f"ERROR: {payload}")
                    messagebox.showerror("Error", payload)
        except queue.Empty:
            pass
        self.after(100, self._poll_queue)

    # ── Completion handlers ──────────────────────────────────

    def _on_compare_done(self, payload):
        report_df, updates, ko_df = payload
        self._report_df = report_df
        self._updates = updates
        self._kyte_only_df = ko_df

        n_update  = len(report_df[report_df["Estado"] == "ACTUALIZAR"])
        n_ok      = len(report_df[report_df["Estado"] == "OK"])
        n_nomatch = len(report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])])
        n_zero    = len(report_df[report_df["Estado"] == "PRECIO 0"])

        self._stat_vars["update"].set(str(n_update))
        self._stat_vars["ok"].set(str(n_ok))
        self._stat_vars["nomatch"].set(str(n_nomatch))
        self._stat_vars["zero"].set(str(n_zero))
        self._stat_vars["kyte_only"].set(str(len(ko_df)))

        # Por defecto seleccionamos todos los ACTUALIZAR
        df_upd = report_df[report_df["Estado"] == "ACTUALIZAR"].reset_index(drop=True)
        self._selected_codes = set(str(c) for c in df_upd["Codigo"].tolist() if c)
        self._df_for_tab["update"] = df_upd
        self._df_for_tab["nomatch"] = report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO", "PRECIO 0"])].reset_index(drop=True)
        self._df_for_tab["kyte_only"] = ko_df
        self._df_for_tab["all"] = report_df

        self._refresh_tab("update")
        self._refresh_tab("nomatch")
        self._refresh_tab("kyte_only")
        self._fill_tree(self._trees["all"], report_df, COLS)

        self._run_btn.config(state="normal")
        self._dl_btn.config(state="normal")
        self._update_selection_label()
        self._set_status(f"Listo. {n_update} a actualizar, {n_ok} sin cambio, {n_nomatch} sin match, {len(ko_df)} solo en Kyte.")

    def _refresh_tab(self, tab_key: str):
        df = self._df_for_tab.get(tab_key)
        tree = self._trees.get(tab_key)
        if df is None or tree is None:
            return
        df = df.copy()
        f = self._filters.get(tab_key)
        if f and f.get().strip():
            q = f.get().strip().lower()
            cols_to_match = [c for c in ("Codigo", "Nombre") if c in df.columns]
            if cols_to_match:
                mask = False
                for c in cols_to_match:
                    m = df[c].astype(str).str.lower().str.contains(q, na=False, regex=False)
                    mask = m if mask is False else (mask | m)
                df = df[mask]
        if tab_key == "update":
            t = self._trend_filter.get()
            if t == "Solo suben 🔴":
                df = df[df["Cambio"].astype(str).str.contains("SUBE")]
            elif t == "Solo bajan 🟢":
                df = df[df["Cambio"].astype(str).str.contains("BAJA")]
            self._fill_tree(tree, df, COLS, with_sync=True)
        elif tab_key == "kyte_only":
            self._fill_tree(tree, df, COLS_KYTEONLY)
        elif tab_key == "nomatch":
            self._fill_tree(tree, df, COLS_NOMATCH)
        else:
            self._fill_tree(tree, df, COLS)
        self._update_selection_label()

    def _on_apply_done(self, payload):
        success, failed, errors = payload
        self._run_btn.config(state="normal")
        self._progress["value"] = 0
        if failed == 0:
            self._set_status(f"{success} productos actualizados correctamente.")
            messagebox.showinfo("Exito", f"{success} productos actualizados.")
        else:
            self._set_status(f"{success} OK, {failed} fallaron.")
            messagebox.showwarning("Parcial", f"{success} OK, {failed} fallaron.\n\n" + "\n".join(errors[:10]))

    def _fill_tree(self, tree: ttk.Treeview, df: pd.DataFrame, cols=COLS, with_sync: bool = False):
        tree.delete(*tree.get_children())
        for _, row in df.iterrows():
            vals = []
            for c in cols:
                if c == "Sync":
                    if with_sync:
                        codigo = str(row.get("Codigo", ""))
                        vals.append("☑" if codigo in self._selected_codes else "☐")
                    else:
                        vals.append("")
                else:
                    vals.append(row.get(c, ""))
            tag = ROW_TAGS.get(str(row.get("Estado", "")), "")
            cambio = str(row.get("Cambio", ""))
            if "SUBE" in cambio:
                tag = "up"
            elif "BAJA" in cambio:
                tag = "down"
            tree.insert("", "end", values=tuple(vals), tags=(tag,))

    def _set_status(self, msg: str):
        self._status_var.set(msg)

    def _export_products_excel(self):
        """Descarga un Excel con productos básicos para mandar a clientes."""
        result = self._make_client()
        if result is None:
            return
        client, _ = result
        try:
            self._set_status("Descargando productos para export...")
            self.update()
            prods = client.get_products()
            rows = []
            for p in prods:
                cat = p.get("category") or {}
                rows.append({
                    "Codigo": p.get("code", ""),
                    "Nombre": p.get("name", ""),
                    "Precio": p.get("salePrice", 0),
                    "Categoria": cat.get("name", "") if isinstance(cat, dict) else "",
                })
            df = pd.DataFrame(rows).sort_values(["Categoria", "Nombre"])
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = filedialog.asksaveasfilename(
                title="Guardar productos como",
                defaultextension=".xlsx",
                initialfile=f"productos_mptools_{ts}.xlsx",
                filetypes=[("Excel files", "*.xlsx")],
            )
            if not path:
                return
            with pd.ExcelWriter(path, engine="openpyxl") as w:
                df.to_excel(w, sheet_name="Productos", index=False)
            self._set_status(f"Productos exportados: {path}")
            messagebox.showinfo("OK", f"{len(df)} productos exportados a:\n{path}")
        except Exception as e:
            messagebox.showerror("Error", str(e))


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = KyteSyncApp()
    app.mainloop()
