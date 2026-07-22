@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Onix Messenger Go

echo [1/7] Checking Go...
where go >nul 2>nul
if errorlevel 1 (
  echo Go was not found. Installing official Go 1.26.5...
  set "GO_MSI=%TEMP%\go1.26.5.windows-amd64.msi"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing 'https://go.dev/dl/go1.26.5.windows-amd64.msi' -OutFile '%GO_MSI%'; if ((Get-FileHash '%GO_MSI%' -Algorithm SHA256).Hash.ToLower() -ne 'd554dc209403b101225fc2b54647ef47df09bea23291b1246fe1b35198f55f50') { throw 'Go installer checksum mismatch' }"
  if errorlevel 1 goto :error
  msiexec /i "%GO_MSI%" /qn /norestart
  if errorlevel 1 goto :error
  set "PATH=%PATH%;C:\Program Files\Go\bin"
)
where go >nul 2>nul || goto :error
for /f "delims=" %%G in ('go version') do echo       %%G

echo [2/7] Creating directories...
for %%D in (data data\uploads data\avatars data\voice data\backups bin logs) do if not exist "%%D" mkdir "%%D"

echo [3/7] Preparing configuration...
if not exist ".env" (
  for /f "delims=" %%S in ('powershell -NoProfile -Command "$b=New-Object byte[] 48; $r=[Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); $r.Dispose(); [Convert]::ToBase64String($b)"') do set "ONIX_SECRET=%%S"
  >.env echo ONIX_ADDRESS=127.0.0.1:8000
  >>.env echo ONIX_ENV=development
  >>.env echo ONIX_PUBLIC_URL=http://127.0.0.1:8000
  >>.env echo ONIX_SECRET_KEY=!ONIX_SECRET!
  >>.env echo ONIX_DATA_DIR=data
  >>.env echo ONIX_SHUTDOWN_TIMEOUT=15s
)

echo [4/7] Downloading verified Go modules...
go mod download
if errorlevel 1 goto :error

echo [5/7] Running tests...
go test ./...
if errorlevel 1 goto :error

echo [6/7] Building Onix Messenger...
go build -trimpath -ldflags="-s -w" -o "bin\onix.exe" .\cmd\onix
if errorlevel 1 goto :error

echo [7/7] Starting http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"
"bin\onix.exe"
set "EXIT_CODE=%ERRORLEVEL%"
echo Onix stopped with code %EXIT_CODE%.
exit /b %EXIT_CODE%

:error
echo.
echo ERROR: setup or build failed. Read the message above.
pause
exit /b 1
