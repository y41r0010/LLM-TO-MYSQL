# Compila el panel y arma la carpeta que va en el servidor: /home/admin/LLM-TO-MYSQL
#
#   dist\LLM-TO-MYSQL\                 (y el mismo contenido en dist\LLM-TO-MYSQL.tar.gz)
#   ├── docker-compose.yml
#   ├── app\                           aplicación compilada (standalone)
#   ├── panel.env.example              plantilla de claves
#   ├── crear-usuario-lectura.sql
#   ├── README.md
#   └── node-22-alpine.tar             solo con -ConImagen
#
# Uso (desde la raíz del proyecto):
#   powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1 -ConImagen
# -ConImagen incluye la imagen de Node (requiere Docker Desktop encendido); úsalo la primera vez,
# porque el servidor no tiene acceso a Docker Hub para descargarla.
# El paquete NO incluye archivos .env: las claves se configuran en el servidor.

param([switch]$ConImagen)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$NodeImage = "node:22-alpine"

Write-Host "1/5 Compilando..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "La compilación falló." }

$standalone = ".next\standalone"
if (-not (Test-Path "$standalone\server.js")) { throw "No se generó .next\standalone (revisa output: 'standalone' en next.config.ts)." }

Write-Host "2/5 Armando dist\LLM-TO-MYSQL..." -ForegroundColor Cyan
$out = "dist\LLM-TO-MYSQL"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $standalone "$out\app" -Recurse
Copy-Item ".next\static" "$out\app\.next\static" -Recurse -Force
if (Test-Path "public") { Copy-Item "public" "$out\app\public" -Recurse -Force }
New-Item -ItemType Directory -Force "$out\app\.next\cache" | Out-Null
Copy-Item "deploy\docker-compose.yml", "deploy\panel.env.example", "deploy\crear-usuario-lectura.sql", "deploy\README.md" $out

Write-Host "3/5 Quitando archivos con claves..." -ForegroundColor Cyan
Get-ChildItem $out -Recurse -Force -File -Filter ".env*" | Where-Object { $_.FullName -notmatch "\\node_modules\\" } | ForEach-Object {
  Write-Host "   eliminado: $($_.FullName)"
  Remove-Item $_.FullName -Force
}

if ($ConImagen) {
  Write-Host "4/5 Exportando la imagen $NodeImage (linux/amd64)..." -ForegroundColor Cyan
  docker pull --platform linux/amd64 $NodeImage
  if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar $NodeImage. ¿Está encendido Docker Desktop?" }
  docker save -o "$out\node-22-alpine.tar" $NodeImage
  if ($LASTEXITCODE -ne 0) { throw "No se pudo exportar la imagen." }
} else {
  Write-Host "4/5 Sin imagen de Node (usa -ConImagen si el servidor aún no la tiene)." -ForegroundColor DarkGray
}

Write-Host "5/5 Comprimiendo..." -ForegroundColor Cyan
$tgz = "dist\LLM-TO-MYSQL.tar.gz"
if (Test-Path $tgz) { Remove-Item $tgz -Force }
tar -czf $tgz -C $out .
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el paquete." }

$mb = [math]::Round((Get-Item $tgz).Length / 1MB, 1)
Write-Host "Listo: $tgz ($mb MB)" -ForegroundColor Green
Write-Host "Copiar al servidor:  scp $tgz admin@172.20.3.205:~/"
Write-Host "Luego seguir deploy\README.md (sección 'En el servidor')."
