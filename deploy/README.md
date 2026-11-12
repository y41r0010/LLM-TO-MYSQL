# Despliegue en el servidor de pruebas (172.20.3.205)

El panel corre en un contenedor Docker, igual que bookstack. La carpeta del proyecto en el servidor es **`/home/admin/LLM-TO-MYSQL`**:

```
/home/admin/LLM-TO-MYSQL/
├── docker-compose.yml       define el contenedor y monta ./app
├── panel.env                claves (chmod 600, solo existe en el servidor)
├── app/                     aplicación ya compilada
├── panel.env.example        plantilla de panel.env
├── crear-usuario-lectura.sql
└── node-22-alpine.tar       imagen de Node (solo la primera vez)
```

**Por qué se compila en tu equipo y no en el servidor:** el servidor no tiene acceso a npm ni a Docker Hub, y le queda poca memoria libre. Un `npm install` o `docker build` ahí fallaría. Por eso:

- el paquete ya trae la aplicación compilada;
- la imagen de Node viaja dentro del paquete;
- el contenedor solo ejecuta `node server.js`.

**Dónde quedan las claves:** no van en el paquete ni en el repositorio. Viven en `panel.env`, que solo puede leer el usuario `admin`.

## Antes de empezar

- **Acceso a Gemini:** el servidor no tiene salida a internet, así que el asistente no podrá responder hasta que TI habilite una de estas dos opciones:
  - salida a `generativelanguage.googleapis.com:443`;
  - un proxy HTTP, que se configura en `LLM_PROXY_URL`.

  El dashboard funciona igual sin esto.
- **Sudo:** `admin` necesita sudo con contraseña para usar Docker.

## En tu equipo

Enciende Docker Desktop. La opción `-ConImagen` incluye la imagen de Node; úsala la primera vez.

```powershell
powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1 -ConImagen
scp dist\LLM-TO-MYSQL.tar.gz admin@172.20.3.205:~/
```

## En el servidor

Entra con `ssh admin@172.20.3.205`.

**1. Descomprime en la carpeta del proyecto:**

```bash
mkdir -p ~/LLM-TO-MYSQL
tar -xzf ~/LLM-TO-MYSQL.tar.gz -C ~/LLM-TO-MYSQL
rm ~/LLM-TO-MYSQL.tar.gz
cd ~/LLM-TO-MYSQL
```

**2. Carga la imagen de Node.** Solo la primera vez, o cuando el paquete la traiga:

```bash
sudo docker load -i node-22-alpine.tar && rm node-22-alpine.tar
```

**3. Crea el usuario de solo lectura de MariaDB.** Solo la primera vez. Pon una clave larga en lugar de `CAMBIAR_ESTA_CLAVE` y, al terminar, borra el archivo, porque contiene esa clave.

```bash
nano crear-usuario-lectura.sql
mysql -u root -p < crear-usuario-lectura.sql
rm crear-usuario-lectura.sql
```

**4. Configura las claves.** Solo la primera vez. Completa en el archivo `DB_PASSWORD` (la clave del paso 3), `LLM_API_KEY`, `PANEL_USER`, `PANEL_PASSWORD` y, si hay proxy, `LLM_PROXY_URL`.

```bash
cp panel.env.example panel.env
nano panel.env
chmod 600 panel.env
```

**5. Levanta el contenedor y abre el puerto.** El puerto solo hay que abrirlo la primera vez.

```bash
sudo docker compose up -d
sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload
```

**6. Verifica:**

```bash
sudo docker compose ps                     # STATUS debe decir "healthy"
curl http://127.0.0.1:3000/api/health      # {"ok":true,"db":true,...}
```

Luego abre `http://172.20.3.205:3000` en el navegador. Te pedirá el usuario y la contraseña de `PANEL_USER` y `PANEL_PASSWORD`.

## Actualizar a una versión nueva

1. En tu equipo, ejecuta `empaquetar.ps1` sin `-ConImagen` y copia el `.tar.gz` con `scp`.
2. En el servidor, reemplaza solo `app/` y reinicia el contenedor:

```bash
cd ~/LLM-TO-MYSQL
rm -rf app
tar -xzf ~/LLM-TO-MYSQL.tar.gz -C ~/LLM-TO-MYSQL ./app
rm ~/LLM-TO-MYSQL.tar.gz
sudo docker compose up -d --force-recreate
```

`panel.env` no se toca. Si cambias una clave, edítalo y ejecuta `sudo docker compose up -d --force-recreate`.

## Problemas comunes

| Síntoma | Revisión |
|---|---|
| Ver qué está pasando | `sudo docker compose logs -f` (muestra los errores completos y las preguntas bloqueadas) |
| `pull access denied` / no encuentra `node:22-alpine` | Falta el paso 2: genera el paquete con `-ConImagen` |
| `Permission denied` al leer `/app` | SELinux: el volumen debe terminar en `:Z` en `docker-compose.yml` |
| `/api/health` responde `"db":false` | `DB_USER`/`DB_PASSWORD` en `panel.env`; prueba con `mysql -u panel_lectura -p -h 127.0.0.1 agendamiento-citas` |
| El asistente responde "no se pudo responder" | Sin acceso a Gemini: revisa `LLM_PROXY_URL` y `LLM_API_KEY` |
| No abre desde otro equipo | Puerto 3000 en el firewall (paso 5) |
| El puerto 3000 ya está en uso | Cambia `PORT` en `docker-compose.yml` y el puerto del firewall |

## Qué protege el panel

- **Contraseña de acceso** (`PANEL_USER`/`PANEL_PASSWORD`) para todas las páginas y APIs, salvo `/api/health`, que no revela datos.
- **Usuario de base de solo lectura**. Además, cada consulta corre en una transacción de solo lectura con límite de tiempo.
- **Contenedor restringido:** corre sin privilegios, con el código montado en modo de solo lectura y la memoria limitada.
- **Asistente protegido contra inyección por prompt:**
  - unas reglas de seguridad que el modelo recibe primero, por encima de cualquier otra instrucción;
  - un filtro de preguntas que bloquea, antes de llamar al modelo, las que piden la estructura, la configuración del motor o credenciales, o que intentan cambiarle las reglas;
  - un filtro del SQL generado que impide consultar `information_schema`, `mysql`, variables `@@`, `VERSION()`, `USER()` y las tablas internas, sin importar lo que escriba el modelo.
- **Sin estructura a la vista:** en producción no se muestra el SQL generado (`ASSISTANT_SHOW_SQL=false`). El explorador de tablas está deshabilitado (`ENABLE_EXPLORER=false`). Los errores de la base no se envían al navegador; solo quedan en los registros del contenedor.

Úsalo dentro de la red interna. La contraseña del panel viaja en cada petición, así que si se va a exponer fuera, ponlo detrás de HTTPS (por ejemplo, con el nginx que ya tiene el servidor).
