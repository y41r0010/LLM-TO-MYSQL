-- Usuario de SOLO LECTURA para el panel, en vez de root.
-- Ejecutar una vez en el servidor como administrador de MariaDB:
--   mysql -u root -p < crear-usuario-lectura.sql
-- Antes, reemplaza CAMBIAR_ESTA_CLAVE por una clave larga (y ponla en DB_PASSWORD de panel.env).
-- Solo puede conectarse desde el propio servidor (localhost / 127.0.0.1).

CREATE USER IF NOT EXISTS 'panel_lectura'@'localhost' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';
CREATE USER IF NOT EXISTS 'panel_lectura'@'127.0.0.1' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';

-- SELECT sobre la base de agendamiento (incluye las vistas). Nada de escritura,
-- ni acceso a otras bases, ni a la base `mysql` con los usuarios del servidor.
GRANT SELECT, SHOW VIEW ON `agendamiento-citas`.* TO 'panel_lectura'@'localhost';
GRANT SELECT, SHOW VIEW ON `agendamiento-citas`.* TO 'panel_lectura'@'127.0.0.1';

-- Límite de conexiones simultáneas, por si algo se sale de control.
ALTER USER 'panel_lectura'@'localhost' WITH MAX_USER_CONNECTIONS 20;
ALTER USER 'panel_lectura'@'127.0.0.1' WITH MAX_USER_CONNECTIONS 20;

FLUSH PRIVILEGES;

-- Verificación:
SHOW GRANTS FOR 'panel_lectura'@'127.0.0.1';
