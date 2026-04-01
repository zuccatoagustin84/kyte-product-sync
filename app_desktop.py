"""
Kyte Price Sync - Desktop App (tkinter)
Uso: python app_desktop.py
Build: pyinstaller --onefile --windowed app_desktop.py
"""
import io
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from datetime import datetime
from pathlib import Path

import pandas as pd

from kyte_api import KyteClient, KyteConfig, KyteAPIError, parse_kyte_token


# ── Helpers (misma logica que app.py) ────────────────────────────────────────

def normalize(text) -> str:
    if pd.isna(text):
        return ""
    return " ".join(str(text).strip().lower().split())


def load_source(path: str) -> pd.DataFrame:
    raw = pd.read_excel(path, header=None)
    header_row = None
    for i in range(min(30, len(raw))):
        row_vals = [str(v).strip().lower() for v in raw.iloc[i] if pd.notna(v)]
        if any("articulo" in v for v in row_vals) and any("precio" in v for v in row_vals):
            header_row = i
            break
    if header_row is None:
        raise ValueError("No se encontro header con 'Articulo' y 'Precio' en el Excel")
    df = pd.read_excel(path, header=header_row)
    return df.dropna(how="all").reset_index(drop=True)


def detect_columns(df) -> dict:
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


def run_matching(kyte_products: list, source_df: pd.DataFrame, update_cost: bool):
    src_cols = detect_columns(source_df)
    if "name" not in src_cols or "price" not in src_cols:
        raise ValueError(f"Columnas requeridas no encontradas. Encontradas: {src_cols}")

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
            rows.append({"Estado": "SIN CODIGO", "Nombre": src_name, "Codigo": "",
                         "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        matched = kyte_by_code.get(src_code)
        if not matched:
            rows.append({"Estado": "SIN MATCH", "Nombre": src_name, "Codigo": src_code,
                         "Precio Kyte": "", "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": ""})
            continue

        old_price = matched.get("salePrice", 0)
        cat = matched.get("category") or {}
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""

        if new_price <= 0:
            rows.append({"Estado": "PRECIO 0", "Nombre": matched.get("name", ""), "Codigo": src_code,
                         "Precio Kyte": old_price, "Precio Nuevo": new_price, "Diferencia": "", "Dif %": "", "Categoria": cat_name})
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

COLS = ("Estado", "Nombre", "Codigo", "Precio Kyte", "Precio Nuevo", "Diferencia", "Dif %", "Categoria")

COL_WIDTHS = {
    "Estado": 90,
    "Nombre": 260,
    "Codigo": 80,
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
        self._q: queue.Queue = queue.Queue()

        self._build_ui()
        self._poll_queue()

    # ── UI construction ──────────────────────────────────────

    def _build_ui(self):
        # Top bar
        top = tk.Frame(self, bg="#1a1a2e", pady=8)
        top.pack(fill="x")
        tk.Label(top, text="Kyte Price Sync", font=("Segoe UI", 16, "bold"),
                 bg="#1a1a2e", fg="white").pack(side="left", padx=16)

        # Main layout: left panel + right content
        body = tk.Frame(self)
        body.pack(fill="both", expand=True, padx=10, pady=8)

        left = tk.LabelFrame(body, text="Configuracion", padx=8, pady=8, width=260)
        left.pack(side="left", fill="y", padx=(0, 8))
        left.pack_propagate(False)

        right = tk.Frame(body)
        right.pack(side="left", fill="both", expand=True)

        self._build_left(left)
        self._build_right(right)

        # Status bar
        self._status_var = tk.StringVar(value="Listo.")
        status = tk.Label(self, textvariable=self._status_var, anchor="w",
                          relief="sunken", bd=1, font=("Segoe UI", 9))
        status.pack(fill="x", side="bottom")

    def _build_left(self, parent):
        # Token
        tk.Label(parent, text="Kyte Token:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(parent, text="(F12 > Console > copy(localStorage.getItem('kyte_token')))",
                 font=("Segoe UI", 7), wraplength=230, fg="#555").pack(anchor="w")
        self._token_txt = scrolledtext.ScrolledText(parent, height=5, wrap="word",
                                                     font=("Consolas", 8))
        self._token_txt.pack(fill="x", pady=(2, 8))

        # Update cost
        self._update_cost = tk.BooleanVar(value=True)
        ttk.Checkbutton(parent, text="Actualizar costo tambien",
                        variable=self._update_cost).pack(anchor="w", pady=(0, 8))

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=4)

        # Excel picker
        tk.Label(parent, text="Lista de distribuidor:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self._file_var = tk.StringVar(value="(ninguno)")
        tk.Label(parent, textvariable=self._file_var, font=("Segoe UI", 8),
                 wraplength=230, fg="#333").pack(anchor="w", pady=2)
        ttk.Button(parent, text="Elegir Excel...", command=self._pick_file).pack(fill="x", pady=2)

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=8)

        # Run button
        self._run_btn = ttk.Button(parent, text="Comparar precios",
                                   command=self._run_compare, style="Accent.TButton")
        self._run_btn.pack(fill="x", pady=2)

    def _build_right(self, parent):
        # Stats row
        stats_frame = tk.Frame(parent)
        stats_frame.pack(fill="x", pady=(0, 8))

        self._stat_vars = {}
        for label, key, color in [
            ("A actualizar", "update", "#856404"),
            ("Sin cambio", "ok", "#155724"),
            ("Sin match", "nomatch", "#721c24"),
            ("Precio 0", "zero", "#721c24"),
        ]:
            box = tk.Frame(stats_frame, bd=1, relief="solid", padx=12, pady=8)
            box.pack(side="left", expand=True, fill="x", padx=4)
            tk.Label(box, text=label, font=("Segoe UI", 8), fg="#666").pack()
            var = tk.StringVar(value="—")
            self._stat_vars[key] = var
            tk.Label(box, textvariable=var, font=("Segoe UI", 18, "bold"), fg=color).pack()

        # Tabs + treeviews
        notebook = ttk.Notebook(parent)
        notebook.pack(fill="both", expand=True)

        self._trees = {}
        for tab_label, tab_key in [
            ("A Actualizar", "update"),
            ("Sin Match", "nomatch"),
            ("Todo", "all"),
        ]:
            frame = tk.Frame(notebook)
            notebook.add(frame, text=tab_label)
            tree = self._make_tree(frame)
            self._trees[tab_key] = tree

        # Action bar
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

    def _make_tree(self, parent) -> ttk.Treeview:
        frame = tk.Frame(parent)
        frame.pack(fill="both", expand=True)

        tree = ttk.Treeview(frame, columns=COLS, show="headings", selectmode="browse")
        vsb = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        hsb = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        for col in COLS:
            tree.heading(col, text=col)
            tree.column(col, width=COL_WIDTHS.get(col, 100), stretch=False)

        tree.tag_configure("warn", background="#fff3cd")
        tree.tag_configure("danger", background="#f8d7da")
        tree.tag_configure("muted", background="#e2e3e5")
        tree.tag_configure("ok", background="#d4edda")

        tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        return tree

    # ── Event handlers ───────────────────────────────────────

    def _pick_file(self):
        path = filedialog.askopenfilename(
            title="Elegir lista de precios",
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")],
        )
        if path:
            self._excel_path = path
            self._file_var.set(Path(path).name)

    def _get_token(self) -> str:
        return self._token_txt.get("1.0", "end").strip()

    def _run_compare(self):
        token = self._get_token()
        if not token:
            messagebox.showerror("Error", "Pega el token de Kyte primero.")
            return
        if not hasattr(self, "_excel_path") or not self._excel_path:
            messagebox.showerror("Error", "Elegí un archivo Excel primero.")
            return

        try:
            uid, aid = parse_kyte_token(token)
        except Exception as e:
            messagebox.showerror("Token invalido", str(e))
            return

        self._client = KyteClient(KyteConfig(uid=uid, aid=aid))
        self._run_btn.config(state="disabled")
        self._apply_btn.config(state="disabled")
        self._dl_btn.config(state="disabled")
        self._set_status("Conectando con Kyte API...")

        threading.Thread(target=self._worker_compare, daemon=True).start()

    def _worker_compare(self):
        try:
            self._q.put(("status", "Descargando productos de Kyte..."))
            kyte_products = self._client.get_products()
            self._q.put(("status", f"Kyte: {len(kyte_products)} productos. Leyendo Excel..."))

            source_df = load_source(self._excel_path)
            self._q.put(("status", f"Excel: {len(source_df)} filas. Comparando..."))

            report_df, updates = run_matching(kyte_products, source_df, self._update_cost.get())
            self._q.put(("done_compare", (report_df, updates)))
        except Exception as e:
            self._q.put(("error", str(e)))

    def _apply_updates(self):
        n = len(self._updates)
        if n == 0:
            messagebox.showinfo("Sin cambios", "No hay precios para actualizar.")
            return

        ok = messagebox.askyesno(
            "Confirmar",
            f"Se van a actualizar {n} productos en Kyte.\n¿Continuar?",
        )
        if not ok:
            return

        self._apply_btn.config(state="disabled")
        self._run_btn.config(state="disabled")
        self._progress["value"] = 0
        self._progress["maximum"] = n
        self._set_status(f"Actualizando 0/{n}...")

        threading.Thread(target=self._worker_apply, args=(list(self._updates),), daemon=True).start()

    def _worker_apply(self, updates: list):
        success = 0
        failed = 0
        errors = []
        n = len(updates)

        for i, update in enumerate(updates):
            p = update["product"]
            try:
                self._client.update_product_price(
                    p, update["salePrice"], update.get("costPrice")
                )
                success += 1
            except KyteAPIError as e:
                failed += 1
                errors.append(f"{p.get('name', '?')} ({p.get('code', '?')}): {e}")

            self._q.put(("progress", (i + 1, n)))

        self._q.put(("done_apply", (success, failed, errors)))

    def _download_report(self):
        if self._report_df is None:
            return
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        default_name = f"reporte_sync_{ts}.xlsx"
        path = filedialog.asksaveasfilename(
            title="Guardar reporte",
            defaultextension=".xlsx",
            initialfile=default_name,
            filetypes=[("Excel files", "*.xlsx")],
        )
        if not path:
            return

        n_update = len(self._report_df[self._report_df["Estado"] == "ACTUALIZAR"])
        n_ok = len(self._report_df[self._report_df["Estado"] == "OK"])
        n_nomatch = len(self._report_df[self._report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])])
        n_zero = len(self._report_df[self._report_df["Estado"] == "PRECIO 0"])
        stats = {
            "Metrica": ["A Actualizar", "Sin Cambio", "Precio 0", "Sin Match / Sin Codigo"],
            "Valor": [n_update, n_ok, n_zero, n_nomatch],
        }

        data = to_excel_bytes(self._report_df, stats)
        with open(path, "wb") as f:
            f.write(data)
        self._set_status(f"Reporte guardado: {path}")

    # ── Queue polling (UI updates from threads) ──────────────

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
        except queue.Empty:
            pass
        self.after(100, self._poll_queue)

    # ── Completion handlers ──────────────────────────────────

    def _on_compare_done(self, payload):
        report_df, updates = payload
        self._report_df = report_df
        self._updates = updates

        n_update = len(report_df[report_df["Estado"] == "ACTUALIZAR"])
        n_ok = len(report_df[report_df["Estado"] == "OK"])
        n_nomatch = len(report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO"])])
        n_zero = len(report_df[report_df["Estado"] == "PRECIO 0"])

        self._stat_vars["update"].set(str(n_update))
        self._stat_vars["ok"].set(str(n_ok))
        self._stat_vars["nomatch"].set(str(n_nomatch))
        self._stat_vars["zero"].set(str(n_zero))

        # Populate trees
        self._fill_tree(self._trees["update"],
                        report_df[report_df["Estado"] == "ACTUALIZAR"])
        self._fill_tree(self._trees["nomatch"],
                        report_df[report_df["Estado"].isin(["SIN MATCH", "SIN CODIGO", "PRECIO 0"])])
        self._fill_tree(self._trees["all"], report_df)

        self._run_btn.config(state="normal")
        self._dl_btn.config(state="normal")
        if n_update > 0:
            self._apply_btn.config(state="normal",
                                   text=f"APLICAR {n_update} ACTUALIZACIONES")
        self._set_status(f"Listo. {n_update} a actualizar, {n_ok} sin cambio, {n_nomatch} sin match.")

    def _on_apply_done(self, payload):
        success, failed, errors = payload
        self._run_btn.config(state="normal")
        self._progress["value"] = 0
        if failed == 0:
            self._set_status(f"{success} productos actualizados correctamente.")
            messagebox.showinfo("Exito", f"{success} productos actualizados.")
        else:
            msg = f"{success} OK, {failed} fallaron.\n\n" + "\n".join(errors[:10])
            self._set_status(f"{success} OK, {failed} fallaron.")
            messagebox.showwarning("Parcial", msg)

    def _fill_tree(self, tree: ttk.Treeview, df: pd.DataFrame):
        tree.delete(*tree.get_children())
        for _, row in df.iterrows():
            values = tuple(row.get(c, "") for c in COLS)
            tag = ROW_TAGS.get(str(row.get("Estado", "")), "")
            tree.insert("", "end", values=values, tags=(tag,))

    def _set_status(self, msg: str):
        self._status_var.set(msg)


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = KyteSyncApp()
    app.mainloop()
