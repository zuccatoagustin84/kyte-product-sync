# Kyte Product Price Sync

Sincroniza precios de productos en [Kyte Web](https://web.kyteapp.com/products) a partir de una lista de precios de distribuidor (Excel).

Conecta directo con la API de Kyte — no necesita exportar/importar archivos manualmente.

---

## Uso con GitHub (para el cliente)

El cliente no necesita instalar nada. Todo se maneja desde GitHub.

### Generar reporte (sin modificar precios)

1. Subir el Excel de precios a la carpeta `input/` del repo
2. Hacer push (o subir desde la web de GitHub)
3. Se genera automaticamente un reporte en la pestana **Actions**
4. Descargar el `reporte_sync.xlsx` desde los artifacts del workflow

### Aplicar la actualizacion de precios

1. Ir a la pestana **Actions** del repo
2. Elegir el workflow **"Aplicar actualizacion de precios"**
3. Click en **"Run workflow"**
4. Poner el nombre del archivo (ej: `LISTA DISTRIBUCION.xlsx`)
5. Escribir `CONFIRMAR` en el campo de confirmacion
6. Click en **"Run workflow"**

### Setup inicial (una sola vez)

1. Crear el repo en GitHub (privado)
2. Ir a **Settings > Secrets and variables > Actions**
3. Crear un secret llamado `KYTE_TOKEN` con el valor del token
4. Push del codigo

Para obtener el token:
- Loguearse en https://web.kyteapp.com
- Abrir consola (F12) y pegar: `copy(localStorage.getItem('kyte_token'))`
- Pegarlo como secret en GitHub

> El token expira en ~1 anio. Cuando expire, renovar el secret.

---

## Uso local (alternativo)

### Requisitos

```bash
pip install -r requirements.txt
```

Dependencias: `pandas`, `openpyxl`, `requests`

---

## Autenticacion

El script necesita conectarse a tu cuenta de Kyte. Hay dos formas:

### Opcion A: Con token (recomendado)

El token se saca del navegador y contiene todo lo necesario (uid + aid). Expira en ~1 anio.

**Como obtener el token:**

1. Abri https://web.kyteapp.com y logueate con tu cuenta (Google, Email, etc.)
2. Abri la consola del navegador (F12 > Console)
3. Pega el contenido de `get_token.js` y presiona Enter

```javascript
// O simplemente pega esto en la consola:
token = localStorage.getItem('kyte_token'); navigator.clipboard.writeText(token); console.log('Token copiado! Longitud:', token.length);
```

4. El token queda copiado en el portapapeles

Uso:

```bash
python sync_prices_api.py --source "LISTA.xlsx" --token "a3l0ZV8yQmo5c..."
```

**Tip:** Guarda el token en un archivo para no pegarlo cada vez:

```bash
# Guardar token (una sola vez)
echo "a3l0ZV8yQmo5c..." > .kyte_token

# Usar desde archivo (Linux/Mac)
python sync_prices_api.py --source "LISTA.xlsx" --token "$(cat .kyte_token)"

# Usar desde archivo (Windows PowerShell)
python sync_prices_api.py --source "LISTA.xlsx" --token (Get-Content .kyte_token)
```

> El token expira en aproximadamente **1 anio**. Cuando expire, repetir el paso 1-4.
> El script `get_token.js` tambien muestra la fecha de expiracion.

### Opcion B: Con uid y aid manuales

Si preferis no usar el token, podes pasar uid y aid directamente:

```bash
python sync_prices_api.py --source "LISTA.xlsx" --uid "2Bj9r..." --aid "2Bj9r..."
```

**Como obtener uid y aid:**

1. Abri https://web.kyteapp.com/products
2. Abri DevTools (F12) > pestana **Network**
3. Recarga la pagina
4. Filtra por `kyte-api-gateway`
5. Hace click en cualquier request

```
Request URL: https://kyte-api-gateway.azure-api.net/api/kyte-web/products/XXXXXX
                                                                          ^^^^^^
                                                                          Esto es el AID
Request Headers:
  uid: YYYYYYYYYYYYYYYYYY
       ^^^^^^^^^^^^^^^^^^
       Esto es el UID
```

**Alternativa rapida:** El uid y aid tambien estan dentro del `kyte_token`.
Si ya tenes el token, el script los extrae automaticamente con `--token`.

### Opcion C: Hardcoded (para tu propia maquina)

Si siempre usas la misma cuenta, edita las constantes al inicio de `sync_prices_api.py`:

```python
DEFAULT_UID = "tu-uid-aqui"
DEFAULT_AID = "tu-aid-aqui"
```

Asi podes correr sin `--token` ni `--uid`/`--aid`:

```bash
python sync_prices_api.py --source "LISTA.xlsx"
```

---

## Uso rapido

### 1. Dry run (ver que cambiaria, sin tocar nada)

```bash
python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --dry-run
```

### 2. Actualizar precios de venta

```bash
python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx"
```

### 3. Actualizar precio de venta + costo

```bash
python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --update-cost
```

### 4. Con log detallado

```bash
python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --update-cost -v
```

---

## Opciones completas

| Opcion           | Descripcion                                              | Default                          |
|------------------|----------------------------------------------------------|----------------------------------|
| `--source`       | **Requerido.** Ruta al Excel de precios del distribuidor | -                                |
| `--token`        | Token de Kyte (de localStorage). Extrae uid/aid solo     | -                                |
| `--dry-run`      | Muestra cambios sin aplicarlos                           | No                               |
| `--update-cost`  | Tambien actualiza el costo (`saleCostPrice`)             | No (solo actualiza `salePrice`)  |
| `--delay`        | Segundos entre cada llamada API                          | `0.3`                            |
| `--uid`          | Kyte User ID (ignorado si se usa --token)                | Configurado en el script         |
| `--aid`          | Kyte Account/Store ID (ignorado si se usa --token)       | Configurado en el script         |
| `-v, --verbose`  | Log detallado (debug)                                    | No                               |

---

## Como funciona

```
Lista Distribucion (.xlsx)          Kyte API
         |                             |
         v                             v
   Lee Articulo/Codigo/Precio    GET /products (paginado skip/limit)
         |                             |
         +-------- MATCHING -----------+
         |   1. Por codigo (exacto, case-insensitive)
         |   2. Por nombre (normalizado)
         |
         v
   Productos con precio diferente
         |
         v
   PUT /product (uno por uno, con delay)
         |
         v
   Reporte final
```

### Matching

1. **Por codigo** (prioridad): compara el campo `Codigo` del Excel con el `code` del producto en Kyte, ignorando mayusculas/minusculas.
2. **Por nombre** (fallback): si no matchea por codigo, compara el `Articulo` del Excel con el `name` del producto en Kyte (normalizado: minusculas, sin espacios extra).

---

## Formato del Excel fuente

El script auto-detecta el header buscando una fila que tenga las columnas `Articulo` y `Precio`.

Columnas esperadas:

| Columna      | Uso                                    |
|--------------|----------------------------------------|
| `Articulo`   | Nombre del producto (para matching)    |
| `Codigo`     | Codigo del producto (para matching)    |
| `Precio`     | Nuevo precio de venta                  |
| `Proveedores`| (ignorado)                             |

---

## Archivos del proyecto

| Archivo                | Descripcion                                          |
|------------------------|------------------------------------------------------|
| `sync_prices_api.py`   | Script principal — sync via API directa              |
| `kyte_api.py`          | Cliente Python para la API de Kyte Web               |
| `get_token.js`         | Script para extraer token desde el browser (F12)     |
| `sync_prices.py`       | (legacy) Sync via Excel export/import                |
| `config.example.json`  | Ejemplo de configuracion con uid/aid                 |
| `requirements.txt`     | Dependencias Python                                  |

---

## API de Kyte (referencia)

Base: `https://kyte-api-gateway.azure-api.net/api/kyte-web`

### Autenticacion API

La API usa dos headers:

| Header                          | Requerido | Descripcion                                      |
|---------------------------------|-----------|--------------------------------------------------|
| `Ocp-Apim-Subscription-Key`    | Si        | Key de Azure API Management (fija, en el script) |
| `uid`                           | Si (PUT)  | Firebase User ID de tu cuenta                    |

La `Ocp-Apim-Subscription-Key` es la misma para todos los usuarios de Kyte Web
(esta embebida en el frontend). El script ya la tiene configurada.

El `uid` identifica tu cuenta y es necesario para operaciones de escritura (PUT).

> **No se requiere Bearer token ni cookie de sesion** para las llamadas API.
> La autenticacion se basa en el subscription key + uid.

### Endpoints

| Metodo | Endpoint                          | Descripcion                 | Paginacion              |
|--------|-----------------------------------|-----------------------------|-------------------------|
| GET    | `/products/{aid}`                 | Listar productos            | `?limit=500&skip=0`    |
| GET    | `/products/{aid}/total`           | Conteo y stats de stock     | -                       |
| GET    | `/products/categories/{aid}`      | Listar categorias           | -                       |
| PUT    | `/product`                        | Actualizar producto (full)  | -                       |

### Paginacion

```
?limit=500&skip=0&sort=PIN_FIRST&isWeb=1
?limit=500&skip=500&sort=PIN_FIRST&isWeb=1
?limit=500&skip=1000&sort=PIN_FIRST&isWeb=1
```

### PUT /product

Envia el objeto completo del producto. Campos de precio:

```json
{
  "id": "17750428166628-2Bj9",
  "name": "Producto ejemplo",
  "code": "ABC123",
  "salePrice": 15000.50,
  "saleCostPrice": 12000.00,
  "salePromotionalPrice": null,
  "...resto de campos del producto"
}
```

---

## Ejemplo de ejecucion

```
$ python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --update-cost

  Fetched skip=0: 500 products (500/1227)
  Fetched skip=500: 500 products (1000/1227)
  Fetched skip=1000: 227 products (1227/1227)

[*] Loading source price list: LISTA DISTRIBUCION.xlsx
  Header found at row 16
  1200 products loaded

[*] Fetching products from Kyte API...
  1227 products fetched from Kyte

[*] Matching products...
  Kyte index: 1159 by code, 1179 by name

[*] Updating 79 products via Kyte API...
  [1/79] Producto X (code: ABC): $10,000.00 -> $12,500.00
  [2/79] Producto Y (code: DEF): $5,000.00 -> $4,800.00
  ...

============================================================
  SYNC REPORT
============================================================
  Kyte products:          1227
  Source products:        1200
  Matched by code:        1150
  Matched by name:        47
  Total matched:          1197
  Prices to update:       79
  Prices unchanged:       1118
  NOT found in Kyte:      3

  --- API Results ---
  Successfully updated:   78
  Failed:                 0
  Skipped (unchanged):    1
============================================================
```

---

## Notas

- El `kyte_token` expira en ~1 anio. Si el script empieza a dar error 401, renueva el token logueandote de nuevo en Kyte Web.
- La `Ocp-Apim-Subscription-Key` es fija y esta en `kyte_api.py`. Si Kyte la cambia algun dia, se puede obtener del DevTools (Network > Headers de cualquier request a kyte-api-gateway).
- El script hace las actualizaciones de a una con un delay de 0.3s entre cada una para no saturar la API. Con `--delay 0` va mas rapido pero puede generar rate limiting.
- Siempre usa `--dry-run` primero para verificar que los cambios son correctos.
