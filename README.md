# Mis Cuentas — app web instalable (PWA)

App personal para controlar ingresos, gastos diarios, reparto del dinero, tarjetas de crédito (corte, pago, pagos programados) y ahorro.

- **Instalable** en el celular con su propio ícono y a pantalla completa.
- **Funciona sin internet**: los cambios se guardan en el celular y se suben solos cuando vuelve la conexión.
- **Sincroniza** entre celular y computadora con tu cuenta (Firebase).
- Sin servidor propio: se publica gratis en **GitHub Pages**.

## Estructura del proyecto

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página y los estilos de la app |
| `app.js` | Toda la lógica: vistas, cálculos de tarjetas, guardado |
| `firebase-config.js` | Las llaves de tu proyecto de Firebase (lo llenas tú) |
| `sw.js` | Service worker: guarda la app para que abra sin internet |
| `manifest.webmanifest` | Nombre, ícono y colores para instalarla |
| `firestore.rules` | Reglas de seguridad: cada usuario solo ve sus datos |
| `icon-*.png`, `maskable-512.png`, `apple-touch-icon.png` | Íconos de la app |

Los datos se guardan en Firestore así: `users/{tuUid}/docs/{settings | deuda | ahorro | m2026-10 | …}`. Cada mes es un documento.

---

## Paso 1 · Probarla en tu computadora (opcional)

Mientras `firebase-config.js` diga `PEGA_AQUI`, la app funciona en **modo local** (guarda solo en ese navegador). Para verla:

```bash
cd mis-cuentas
python -m http.server 8000
```

Abre `http://localhost:8000`. (Abrir el `index.html` con doble clic no sirve: el service worker necesita un servidor.)

## Paso 2 · Crear el proyecto en Firebase (gratis)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google y toca **Crear un proyecto**. Nombre: `mis-cuentas`. Puedes desactivar Google Analytics.
2. **Activar el inicio de sesión**: menú **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar → Guardar**.
3. **Crear la base de datos**: menú **Compilación → Firestore Database → Crear base de datos**. Ubicación: la que sugiera (por ejemplo `nam5`). Elige **Iniciar en modo de producción**.
4. **Pegar las reglas de seguridad**: en Firestore, pestaña **Reglas**, borra lo que hay, pega el contenido de `firestore.rules` y toca **Publicar**.

## Paso 3 · Conectar la app con Firebase

1. En Firebase, toca el engranaje ⚙️ → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, toca el ícono web `</>`. Nombre: `mis-cuentas-web`. **No** marques Firebase Hosting. Toca **Registrar app**.
3. Te muestra un bloque `const firebaseConfig = { apiKey: "...", ... }`. Copia esos valores en `firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "mis-cuentas-xxxx.firebaseapp.com",
  projectId: "mis-cuentas-xxxx",
  storageBucket: "mis-cuentas-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

> La `apiKey` de Firebase **no es secreta**: identifica tu proyecto, y quien protege tus datos son las reglas del paso 2. Por eso se puede subir a GitHub sin problema.

## Paso 4 · Publicar en GitHub Pages (gratis)

1. Entra a <https://github.com> y crea un repositorio nuevo, por ejemplo `mis-cuentas` (puede ser **Public**; tus datos no están en el código sino en Firebase).
2. Sube todos los archivos de esta carpeta (botón **Add file → Upload files**, arrastra todo) y toca **Commit changes**.
   - O con git: `git init`, `git add .`, `git commit -m "Mis Cuentas"`, `git branch -M main`, `git remote add origin https://github.com/TU_USUARIO/mis-cuentas.git`, `git push -u origin main`.
3. En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Espera 1–2 minutos. Tu app queda en `https://TU_USUARIO.github.io/mis-cuentas/`.

## Paso 5 · Autorizar tu dominio en Firebase

En Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** y escribe `TU_USUARIO.github.io` (sin `https://` ni `/mis-cuentas`).

## Paso 6 · Crear tu cuenta y pasar tus datos

1. Abre tu app, toca **Crear una cuenta nueva** y regístrate con tu correo y una contraseña.
2. Ve a la pestaña **Cuenta → Cargar respaldo** y elige `mis-cuentas-respaldo.json` (tus datos de la versión de Claude). Confirma con **Sí, cargar**.
3. Revisa en **Tarjetas** y **Mes** que todo esté.

## Paso 7 · Instalarla en el celular

Abre `https://TU_USUARIO.github.io/mis-cuentas/` en el celular e inicia sesión.

- **Android (Chrome):** menú ⋮ → **Instalar app** (o **Agregar a pantalla principal**).
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.

Queda con su ícono, se abre a pantalla completa y funciona sin internet.

---

## Cómo hacer cambios después

1. Edita los archivos (por ejemplo `app.js`).
2. En `sw.js`, sube la versión: `const CACHE = 'mis-cuentas-v2';` (si no, los celulares siguen mostrando la versión guardada).
3. Sube los cambios a GitHub. En 1–2 minutos se actualiza; en el celular, cierra y vuelve a abrir la app.

## Problemas comunes

| Síntoma | Solución |
|---|---|
| Dice "Solo en este celular" en vez de "Sincronizado" | `firebase-config.js` todavía tiene `PEGA_AQUI` o le falta algún valor. |
| Al entrar dice "auth/unauthorized-domain" | Falta el paso 5. |
| "Sin permiso para guardar" | Las reglas del paso 2.4 no se publicaron o tienen un error. |
| No aparece "Instalar app" | La página debe abrirse por `https://` (GitHub Pages lo hace) y haberse cargado una vez completa. |
| No veo los cambios nuevos | Sube el número de `CACHE` en `sw.js` y vuelve a abrir la app. |

## Ideas para seguir mejorándola (portafolio)

- Gráfico de gastos por categoría del mes.
- Recordatorios con notificaciones push para las fechas de pago.
- Exportar a Excel/CSV.
- Separar `app.js` en módulos (`storage.js`, `tarjetas.js`, `vistas.js`) y agregar pruebas para los cálculos de corte y pago.
