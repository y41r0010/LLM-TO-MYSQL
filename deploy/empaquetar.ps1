# Compila el panel y genera dist\agendamiento-panel.tar.gz listo para copiar al servidor.
# Uso (desde la raíz del proyecto):  powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
# El paquete NO incluye archivos .env: las claves se configuran en el servidor (deploy/README.md).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "1/4 Compilando..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "La compilación falló." }

$standalone = ".next\standalone"
if (-not (Test-Path "$standalone\server.js")) { throw "No se generó .next\standalone (revisa output: 'standalone' en next.config.ts)." }

Write-Host "2/4 Copiando archivos estáticos..." -ForegroundColor Cyan
Copy-Item ".next\static" "$standalone\.next\static" -Recurse -Force
if (Test-Path "public") { Copy-Item "public" "$standalone\public" -Recurse -Force }
New-Item -ItemType Directory -Force "$standalone\.next\cache" | Out-Null

Write-Host "3/4 Quitando archivos con claves..." -ForegroundColor Cyan
Get-ChildItem $standalone -Recurse -Force -File -Filter ".env*" | Where-Object { $_.FullName -notmatch "\\node_modules\\" } | ForEach-Object {
  Write-Host "   eliminado: $($_.Name)"
  Remove-Item $_.FullName -Force
}

Write-Host "4/4 Empaquetando..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force "dist" | Out-Null
$out = "dist\agendamiento-panel.tar.gz"
if (Test-Path $out) { Remove-Item $out -Force }
tar -czf $out -C $standalone .
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el paquete." }

$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "Listo: $out ($mb MB)" -ForegroundColor Green
Write-Host "Siguiente paso: copiarlo al servidor (ver deploy\README.md)."
