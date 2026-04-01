@echo off
echo ========================================
echo  Kyte Price Sync - Build Desktop .exe
echo ========================================

:: Verificar que PyInstaller esta instalado
python -m pyinstaller --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Instalando PyInstaller...
    pip install pyinstaller
)

:: Limpiar builds anteriores
if exist dist\app_desktop rmdir /s /q dist\app_desktop
if exist build\app_desktop rmdir /s /q build\app_desktop

:: Build
python -m pyinstaller ^
    --onefile ^
    --windowed ^
    --name "KytePriceSync" ^
    --add-data "kyte_api.py;." ^
    --hidden-import "openpyxl" ^
    --hidden-import "pandas" ^
    --hidden-import "requests" ^
    --hidden-import "tkinter" ^
    app_desktop.py

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build fallido.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Build exitoso!
echo  Ejecutable: dist\KytePriceSync.exe
echo ========================================
pause
