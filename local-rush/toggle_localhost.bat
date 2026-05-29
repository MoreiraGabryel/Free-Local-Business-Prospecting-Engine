@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PROJECT_DIR=%~dp0"
set "PORT=8000"
set "HOST=127.0.0.1"
set "APP=backend.app:app"
set "VENV_PYTHON=%PROJECT_DIR%.venv\Scripts\python.exe"

set "PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set "PID=%%P"
    goto :stop_server
)

:start_server
echo [INFO] Localhost na porta %PORT% esta desligado. Iniciando servidor...

if exist "%VENV_PYTHON%" (
    set "SERVER_CMD=""%VENV_PYTHON%"" -m uvicorn %APP% --host %HOST% --port %PORT% --reload"
) else (
    set "SERVER_CMD=py -3 -m uvicorn %APP% --host %HOST% --port %PORT% --reload"
)

start "Local Rush API :%PORT%" cmd /k "cd /d ""%PROJECT_DIR%"" && !SERVER_CMD!"
echo [OK] Servidor iniciado em http://%HOST%:%PORT%
exit /b 0

:stop_server
echo [INFO] Localhost na porta %PORT% esta ligado (PID !PID!). Encerrando...
taskkill /PID !PID! /T /F >nul 2>nul

if errorlevel 1 (
    echo [ERRO] Nao foi possivel encerrar o processo da porta %PORT%.
    exit /b 1
)

echo [OK] Servidor encerrado.
exit /b 0
