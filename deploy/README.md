# Despliegue en el servidor de pruebas (172.20.3.205)

El panel se compila en tu equipo y se sube ya empaquetado. El servidor no tiene memoria libre suficiente para compilar ni acceso a internet para `npm install`. En el servidor solo se necesita Node (tiene 20.20.2; el mínimo es 20.18.1).

Las claves **no van en el paquete ni en el repositorio**. Viven en `/etc/agendamiento-panel/panel.env`, un archivo que solo root puede leer y que systemd carga al arrancar el servicio.

| Archivo | Para qué |
|---|---|
| `empaquetar.ps1` | Compila y genera `dist/agendamiento-panel.tar.gz` (sin `.env`) |
| `panel.env.example` | Plantilla de configuración del servidor |
| `crear-usuario-lectura.sql` | Crea el usuario de MariaDB de solo lectura `panel_lectura` |
| `agendamiento-panel.service` | Servicio systemd: arranca con el servidor y se reinicia si falla |

## Antes de empezar

- **Acceso a Gemini:** el servidor no tiene salida a internet, así que el asistente no podrá responder hasta que TI habilite una de estas dos opciones:
  - salida a `generativelanguage.googleapis.com:443`;
  - un proxy HTTP, que se configura en `LLM_PROXY_URL`.

  El dashboard funciona igual sin esto.
- **Sudo:** el usuario `admin` necesita sudo con contraseña para los pasos 4 a 6.

## Primera instalación

**1. En tu equipo**, desde la raíz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
scp dist\agendamiento-panel.tar.gz deploy\panel.env.example deploy\agendamiento-panel.service deploy\crear-usuario-lectura.sql admin@172.20.3.205:~/
```

**2. Entra al servidor** con `ssh admin@172.20.3.205`. Todos los pasos siguientes se ejecutan ahí.

**3. Descomprime la aplicación:**

```bash
mkdir -p ~/agendamiento-panel/app
tar -xzf ~/agendamiento-panel.tar.gz -C ~/agendamiento-panel/app
```

**4. Crea el usuario de solo lectura.** Primero pon una clave larga en lugar de `CAMBIAR_ESTA_CLAVE`. Al terminar, borra el archivo, porque contiene esa clave.

```bash
nano ~/crear-usuario-lectura.sql
mysql -u root -p < ~/crear-usuario-lectura.sql
rm ~/crear-usuario-lectura.sql
```

**5. Configura las claves.** Completa en el archivo `DB_PASSWORD` (la clave del paso 4), `LLM_API_KEY`, `PANEL_USER`, `PANEL_PASSWORD` y, si hay proxy, `LLM_PROXY_URL`.

```bash
sudo mkdir -p /etc/agendamiento-panel
sudo mv ~/panel.env.example /etc/agendamiento-panel/panel.env
sudo nano /etc/agendamiento-panel/panel.env
sudo chown root:root /etc/agendamiento-panel/panel.env
sudo chmod 600 /etc/agendamiento-panel/panel.env
```

**6. Instala el servicio y abre el puerto:**

```bash
sudo mv ~/agendamiento-panel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agendamiento-panel
sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload
```

**7. Verifica:**

```bash
curl http://127.0.0.1:3000/api/health      # {"ok":true,"db":true,...}
systemctl status agendamiento-panel
```

Luego abre `http://172.20.3.205:3000` en el navegador. Te pedirá el usuario y la contraseña de `PANEL_USER` y `PANEL_PASSWORD`.

## Actualizar a una versión nueva

1. En tu equipo, repite el paso 1, pero copia solo el `.tar.gz`.
2. En el servidor:

```bash
rm -rf ~/agendamiento-panel/app && mkdir -p ~/agendamiento-panel/app
tar -xzf ~/agendamiento-panel.tar.gz -C ~/agendamiento-panel/app
sudo systemctl restart agendamiento-panel
```

La configuración de `/etc/agendamiento-panel/panel.env` no se toca. Si cambias una clave, edita ese archivo y reinicia el servicio con `sudo systemctl restart agendamiento-panel`.

## Problemas comunes

| Síntoma | Revisión |
|---|---|
| Ver qué está pasando | `journalctl -u agendamiento-panel -f` (muestra los errores completos y las preguntas bloqueadas) |
| `/api/health` responde `"db":false` | `DB_USER`/`DB_PASSWORD` en `panel.env`; prueba con `mysql -u panel_lectura -p -h 127.0.0.1 agendamiento-citas` |
| El asistente responde "no se pudo responder" | Sin acceso a Gemini: revisa `LLM_PROXY_URL` y `LLM_API_KEY` |
| No abre desde otro equipo | Puerto 3000 en el firewall (paso 6) |
| El panel no pide contraseña | `PANEL_USER` y `PANEL_PASSWORD` vacíos en `panel.env` |

## Qué protege el panel

- **Contraseña de acceso** (`PANEL_USER`/`PANEL_PASSWORD`) para todas las páginas y APIs, salvo `/api/health`, que no revela datos.
- **Usuario de base de solo lectura**. Además, cada consulta corre en una transacción de solo lectura con límite de tiempo.
- **Asistente protegido contra inyección por prompt:**
  - unas reglas de seguridad que el modelo recibe primero, por encima de cualquier otra instrucción;
  - un filtro de preguntas que bloquea, antes de llamar al modelo, las que piden la estructura, la configuración del motor o credenciales, o que intentan cambiarle las reglas;
  - un filtro del SQL generado que impide consultar `information_schema`, `mysql`, variables `@@`, `VERSION()`, `USER()` y las tablas internas, sin importar lo que escriba el modelo.
- **Sin estructura a la vista:** en producción no se muestra el SQL generado (`ASSISTANT_SHOW_SQL=false`). El explorador de tablas está deshabilitado (`ENABLE_EXPLORER=false`). Los errores de la base no se envían al navegador; solo quedan en el registro del servidor.

Úsalo dentro de la red interna. La contraseña del panel viaja en cada petición, así que si se va a exponer fuera, ponlo detrás de HTTPS (por ejemplo, con el nginx que ya tiene el servidor).
