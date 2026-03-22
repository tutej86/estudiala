# Estudiala 🩺

Tu carpeta médica digital. Guardá todos tus estudios en un solo lugar.

---

## Pasos para publicar la app

### 1. Configurar Cloudinary (para subir archivos PDF e imágenes)

1. Entrá a [cloudinary.com](https://cloudinary.com) y creá una cuenta gratis (no pide tarjeta)
2. Una vez adentro, en el Dashboard vas a ver tu **Cloud name** (algo como `dxyz123`)
3. Andá a **Settings → Upload → Upload presets**
4. Hacé clic en **Add upload preset**
5. En "Signing Mode" elegí **Unsigned**
6. Copiá el nombre del preset (algo como `ml_default`)
7. Abrí el archivo `src/app.js` y reemplazá:
   - `TU_CLOUD_NAME` con tu Cloud name
   - `TU_UPLOAD_PRESET` con el nombre del preset

### 2. Publicar en Vercel (para que la app esté online)

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta con tu Gmail
2. Hacé clic en **"Add New Project"**
3. Elegí **"Import Third-Party Git Repository"** o subí los archivos directamente
4. Otra opción más fácil: instalá Vercel CLI
   - Abrí una terminal y corré: `npx vercel`
   - Seguí las instrucciones en pantalla
5. Vercel te da una URL como `estudiala.vercel.app`

### 3. Agregar el dominio a Firebase (importante para el login)

1. Andá a Firebase Console → Authentication → Settings → Authorized domains
2. Agregá el dominio que te dio Vercel (ej: `estudiala.vercel.app`)

---

## Estructura del proyecto

```
estudiala/
├── index.html          — App principal
├── vercel.json         — Config de Vercel
├── public/
│   └── manifest.json   — Config PWA (instalable en celular)
└── src/
    ├── style.css       — Estilos
    └── app.js          — Lógica + Firebase + IA
```

---

## Funcionalidades

- ✅ Login con Gmail
- ✅ Subir PDFs e imágenes (via Cloudinary)
- ✅ Escribir notas a mano
- ✅ Análisis automático con IA (Claude)
- ✅ Preguntas a la IA sobre cada estudio
- ✅ Compartir por WhatsApp, email o link
- ✅ Funciona en celular y computadora
- ✅ Instalable como app (PWA)

---

## ⚠️ Seguridad

Antes de compartir el código con alguien, reemplazá la API key de Anthropic en `src/app.js`. 
Podés generar una nueva en [console.anthropic.com](https://console.anthropic.com) → API Keys.
