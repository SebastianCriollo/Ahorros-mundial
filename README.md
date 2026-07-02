# 💰 Gestor de Ahorros y Gastos

Aplicación web de seguimiento de finanzas personales. Registra ingresos y gastos, visualiza tu ahorro mensual y fija metas.

**Stack:** HTML + CSS + JS vanilla · Supabase (base de datos + auth) · GitHub Pages (hosting)

---

## ¿Qué incluye?

| Función | Descripción |
|---|---|
| Login / Registro | Email + contraseña con Supabase Auth |
| Transacciones | Agregar, editar, eliminar (CRUD sin recarga de página) |
| Vista mensual | Total ingresos, gastos y balance |
| Gráficos | Dona por categoría + barras de resumen |
| Comparativa | Últimos 6 meses en tabla y gráfico |
| Meta de ahorro | Barra de progreso con % alcanzado |
| Filtros | Por tipo, categoría y rango de fechas |
| Categorías | Editables: agregar y eliminar las tuyas |
| **Presupuesto por categoría** | Límite mensual por categoría con alerta al superarlo |
| **Transacciones recurrentes** | Plantillas (arriendo, sueldo…) que agregas al mes con un clic |
| **Resumen anual** | Totales del año y gráfico de 12 meses |
| **Exportar CSV** | Descarga tus transacciones para Excel |
| **Tema claro/oscuro** | Cambia la apariencia y se recuerda tu elección |
| Responsive | Funciona en móvil y escritorio |

---

## Paso 1 — Crear tu cuenta y proyecto en Supabase

1. Ve a **[supabase.com](https://supabase.com)** y crea una cuenta gratis (puedes entrar con tu cuenta de GitHub).
2. Haz clic en **"New project"**.
3. Elige un nombre (ej. `ahorros-mundial`), una contraseña para la base de datos y la región más cercana (ej. `South America (São Paulo)`).
4. Espera 1-2 minutos mientras Supabase crea el proyecto.

---

## Paso 2 — Ejecutar el script SQL

1. En el panel de Supabase, ve a **SQL Editor** (menú izquierdo).
2. Haz clic en **"New query"**.
3. Copia y pega todo el contenido del archivo **`supabase_setup.sql`** de este repositorio.
4. Haz clic en **"Run"** (o presiona `Ctrl+Enter`).
5. Deberías ver `Success. No rows returned` — eso significa que todo se creó correctamente.

> **¿Qué crea el script?**
> - Tabla `categorias` con RLS (solo ves las tuyas)
> - Tabla `transacciones` con RLS
> - Tabla `metas_ahorro` con RLS
> - Índices para acelerar las consultas
> - Un trigger que agrega 7 categorías por defecto cuando te registras

6. **Para las funciones nuevas** (presupuestos y transacciones recurrentes), abre otra
   **"New query"** y ejecuta también el archivo **`supabase_extras.sql`**. Es seguro
   correrlo aunque ya tengas las tablas base; solo agrega las tablas `presupuestos` y
   `transacciones_recurrentes` con su RLS.

---

## Paso 3 — Obtener las credenciales de Supabase

1. En el panel de Supabase, ve a **Settings → API**.
2. Copia dos valores:
   - **Project URL**: algo como `https://abcxyz.supabase.co`
   - **anon public** key: una clave larga que empieza con `eyJ...`

---

## Paso 4 — Configurar el proyecto

Abre el archivo **`js/config.js`** y reemplaza los dos valores:

```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';  // ← tu URL
const SUPABASE_ANON_KEY = 'eyJ...';                      // ← tu anon key
```

> La `anon key` es segura para usar en el frontend porque RLS se encarga de que cada usuario solo acceda a sus propios datos.

---

## Paso 5 — Subir a GitHub

Si aún no tienes el repositorio en GitHub:

```bash
git init
git add .
git commit -m "Initial commit: Ahorros Mundial app"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

Si ya tienes el repositorio clonado (como este caso), solo confirma los cambios:

```bash
git add .
git commit -m "Configure Supabase credentials"
git push
```

---

## Paso 6 — Activar GitHub Pages

1. En tu repositorio de GitHub, ve a **Settings → Pages**.
2. En **"Branch"**, selecciona `main` y la carpeta `/ (root)`.
3. Haz clic en **"Save"**.
4. Espera 1-2 minutos. GitHub te dará una URL como:
   `https://TU_USUARIO.github.io/TU_REPOSITORIO/`

> **Importante:** GitHub Pages sirve archivos estáticos. Como la app usa `login.html` como pantalla de inicio de sesión, la URL principal es `index.html`. Cuando alguien no autenticado abra `index.html`, la app lo redirige automáticamente a `login.html`.

---

## Paso 7 — Configurar dominios permitidos en Supabase (opcional pero recomendado)

1. Ve a **Supabase → Authentication → URL Configuration**.
2. En **Site URL**, pon tu URL de GitHub Pages: `https://TU_USUARIO.github.io/TU_REPOSITORIO`
3. En **Redirect URLs**, agrega la misma URL.

Esto evita que otras personas puedan usar tu proyecto de Supabase desde otros dominios.

---

## Probarlo desde el celular

1. Abre la URL de GitHub Pages en tu navegador móvil.
2. Crea tu cuenta con email y contraseña.
3. El trigger de Supabase creará las categorías por defecto automáticamente.
4. ¡Empieza a registrar tus transacciones!

> Tip: En Android puedes agregar la app a la pantalla de inicio (Chrome → menú → "Agregar a pantalla de inicio") para abrirla como una app nativa.

---

## Estructura de archivos

```
/
├── index.html          ← App principal (requiere login)
├── login.html          ← Pantalla de inicio de sesión / registro
├── supabase_setup.sql  ← Script SQL para crear las tablas
├── css/
│   └── styles.css      ← Estilos completos
└── js/
    ├── config.js       ← URL y API key de Supabase (edita este)
    ├── utils.js        ← Funciones de utilidad (formato, fechas)
    ├── auth.js         ← Lógica de autenticación (login.html)
    └── app.js          ← Lógica principal de la app (index.html)
```

---

## Preguntas frecuentes

**¿Es seguro poner la API key en el código?**
Sí, para aplicaciones del lado del cliente se usa la `anon key`, que es pública por diseño. La seguridad real la provee el RLS de Supabase, que garantiza que cada usuario solo acceda a sus propios datos aunque conozca la clave.

**¿Tiene costo?**
No. El plan gratuito de Supabase incluye hasta 500 MB de base de datos y 2 GB de transferencia al mes, más que suficiente para uso personal. GitHub Pages también es gratuito.

**¿Cómo hago backup de mis datos?**
En Supabase → Table Editor puedes exportar cualquier tabla a CSV. También puedes usar el SQL Editor para hacer consultas de exportación.

**¿Puedo cambiar la moneda?**
Abre `js/utils.js` y modifica la función `formatCurrency`: cambia `'es-CO'` y `'COP'` por tu configuración regional y moneda.
