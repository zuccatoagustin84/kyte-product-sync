# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app_desktop.py'],
    pathex=[],
    binaries=[],
    datas=[('kyte_api.py', '.'), ('generate_catalog.py', '.'), ('catalog_template.html', '.')],
    hiddenimports=['openpyxl', 'pandas', 'requests', 'jinja2'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='KytePriceSync',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
