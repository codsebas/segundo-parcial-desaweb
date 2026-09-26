# 🚗 Copart Guatemala — Plataforma Web de Subastas en Tiempo Real

> **Universidad Mariano Gálvez de Guatemala (UMG)**  
> **Centro Universitario de Guastatoya — Facultad de Ingeniería**  
> **Curso:** Desarrollo y Diseño Web (036) | Ciclo VIII  
> **Catedrático:** Ing. Carlos Amílcar Tezo Palencia  
> **Estudiante:** Albino Sebastián Rosales Ruano 
> **Carnet:** 1890-23-12105
> **Evaluación:** 2do. Examen Parcial (Valoración: 15 Puntos)  

---

## 🌐 Enlaces Oficiales del Proyecto
- **Sitio Web Desplegado en Producción (Vercel):** [https://segundo-parcial-desaweb.vercel.app](https://segundo-parcial-desaweb.vercel.app) *(o URL generada tras el deploy en Vercel)*
- **Documentación Swagger / OpenAPI 3.0:** [https://segundo-parcial-desaweb.vercel.app/api-docs](https://segundo-parcial-desaweb.vercel.app/api-docs) (también accesible localmente en `/api-docs` y `/swagger`)
- **Repositorio Oficial en GitHub:** [https://github.com/codsebas/segundo-parcial-desaweb.git](https://github.com/codsebas/segundo-parcial-desaweb.git)

---

## 👥 Credenciales de Prueba Pre-creadas (Pruebas Cruzadas en Múltiples Navegadores)

Para facilitar la evaluación docente de pujas concurrentes y sincronización en tiempo real entre ventanas/navegadores sin refrescar pantalla (**F5 prohibido**), se configuraron las siguientes cuentas en la base de datos oficial:

| Rol de Usuario | Nombre Completo | Correo Electrónico | Contraseña | Teléfono |
|---|---|---|---|---|
| **Comprador 1** | Carlos Méndez | `comprador1@copart.com` | `Password123!` | 50255551111 |
| **Comprador 2** | Ana Morales | `comprador2@copart.com` | `Password123!` | 50255552222 |
| **Publicador** | Sebastián Rosales | `publicador@copart.com` | `Password123!` | 50255553333 |

> **Nota para el Docente:** La barra superior del sitio web cuenta con botones de **Acceso Rápido en 1 Clic** para alternar instantáneamente entre los 3 usuarios de prueba sin escribir contraseñas.

---

## 🏛️ Arquitectura del Sistema (Patrón MVC Estricto)

El proyecto se estructuró siguiendo los lineamientos de la Guía Maestra de Desarrollo Web:

```text
segundo-parcial/
├── config/                  # [MODEL] Conexión Pool a SQL Server con Lazy Initialization y Resiliencia
│   └── db.js
├── controllers/             # [CONTROLLER] Lógica de control HTTP y validación semántica
│   ├── authController.js        # Registro, login con bcrypt y tokens JWT
│   ├── catalogosController.js   # Marcas, modelos, tipos, combustibles, tracciones, etc.
│   ├── vehiculosController.js   # Creación, fotos VARBINARY(MAX), gestión y edición
│   ├── subastasController.js    # Consultas multitarea, detalle y endpoint live de tiempo real
│   └── pujasController.js       # Registro transaccional y reglas de negocio (+10%)
├── middleware/              # Interceptores de autenticación y seguridad
│   └── authMiddleware.js
├── routes/                  # Definición de rutas Express Router
│   └── apiRoutes.js
├── services/                # Lógica de cierre automático de subastas
│   └── subastaService.js
├── public/                  # [VIEW] Single Page Application (SPA)
│   ├── index.html               # Interfaz responsiva con Tailwind CSS (Paleta clara)
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js               # Motor de tiempo real, carrusel y filtros
├── swagger/                 # Especificación OpenAPI 3.0
│   └── swagger.json
├── test/                    # Suite de pruebas automatizadas pre-entrega
│   └── api.test.js
├── server.js                # Servidor Express y fallback SPA
├── vercel.json              # Configuración Serverless para Vercel
├── seed.js                  # Sembrado de catálogos, usuarios y vehículos demo
└── package.json
```

---

## ⚡ Cumplimiento de la Rúbrica de Evaluación (15/15 Puntos)

### SERIE I: Despliegue y Seguridad (5.0 pts)
- **S1.1 Git y Publicación (2.5 pts):** Repositorio Git limpio, despliegue serverless optimizado en Vercel, `README.md` detallado y 3 cuentas de prueba verificadas.
- **S1.2 Autenticación (2.5 pts):** Registro de usuarios (Nombre, Apellido, Correo, Teléfono, Contraseña con hash bcrypt) y Login con JWT. Usuarios anónimos únicamente tienen acceso de lectura al catálogo; para ofertar o publicar se exige autenticación obligatoria.

### SERIE II: Inventario y Filtros (5.0 pts)
- **S2.1 Vehículo y Galería (2.5 pts):** Ficha técnica exhaustiva (Año, Tipo de carrocería, Marca, Modelo, Motor, Cilindros, Transmisión, Combustible, Tracción AWD/FWD/RWD/4WD). Clasificación visual obligatoria de daño:
  - 🟢 **Verde:** Daño menor / Limpio.
  - 🟡 **Amarillo:** Daño medio / Reparable.
  - 🔴 **Rojo:** Daño severo / Salvamento.
  Carrusel interactivo de más de 5 fotografías obligatorias almacenadas en `dbo.FOTOS_VEHICULO2105`.
- **S2.2 Catálogo y Filtros (2.5 pts):** Home con filtros multitarea simultáneos (Marca, Modelo reactivo, Año, Combustible, Nivel de Daño y Rango de Precio Base). Buscador dinámico y diseño con colores claros y limpios. El publicador puede buscar y editar sus publicaciones en el módulo "Mis Publicaciones".

### SERIE III: Subasta y Tiempo Real (5.0 pts)
- **S3.1 Tiempo Real (3.0 pts):** Motor de sincronización en vivo mediante polling reactivo de alta frecuencia (<1.5s) que actualiza la oferta actual y el cronómetro regresivo a todos los clientes concurrentes **sin recargar la pantalla (F5 prohibido)**.
  - 🟢 **Badge Verde ("¡Vas ganando esta subasta!"):** Si el usuario autenticado tiene la puja más alta.
  - 🔴 **Badge Rojo ("Tu oferta ha sido superada. ¡Haz tu oferta ahora antes de que termine el tiempo!"):** Si otro postor supera la oferta del usuario.
  - **Privacidad y Trazabilidad:** Los nombres de los postores se anonimizan (`Postor #1`, `Postor #2`) protegiendo su identidad.
- **S3.2 Reglas de Puja (2.0 pts):** Validadas estrictamente a nivel de servidor y en el Stored Procedure `dbo.REGISTRAR_PUJA2105`:
  1. Ninguna oferta puede ser menor al monto base (mínimo Q. 20,000).
  2. Ninguna oferta puede ser menor o igual a la puja más alta actual.
  3. **Incremento Mínimo Obligatorio (+10%):** La nueva oferta debe ser al menos un 10% mayor que la oferta actual (`monto >= oferta_actual * 1.10`).
  4. Respeto estricto de fechas de vigencia: subastas vencidas se cierran automáticamente como `VENDIDA` o `DESIERTA`.

---

## 🛠️ Ejecución Local y Pruebas

### 1. Instalación de dependencias:
```bash
npm install
```

### 2. Variables de Entorno (`.env`):
Asegúrate de contar con el archivo `.env` configurado con las credenciales de Azure SQL Server:
```env
DB_SERVER=svr-sql-ctezo.southcentralus.cloudapp.azure.com
DB_NAME=db_WebDevUMG
DB_USER=UsuarioEncuestas
DB_PASSWORD=tu_password_aqui
DB_PORT=1433
PORT=3000
JWT_SECRET=tu_clave_secreta_jwt
```

### 3. Poblar Datos y Usuarios de Prueba:
```bash
node seed.js
```

### 4. Ejecutar Suite de Pruebas Automatizadas:
```bash
npm test
# o bien: node test/api.test.js
```
*(Verifica 11 casos de prueba: health, catálogos, login, perfil protegido, catálogo de subastas, subasta live, rechazo de ofertas < base, error de referencia 400, manejo de sintaxis y bloqueo de anónimos).*

### 5. Iniciar la Aplicación:
```bash
npm start
```
Abre en tu navegador [http://localhost:3000](http://localhost:3000).
