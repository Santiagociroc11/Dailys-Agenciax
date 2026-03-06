# Estrategia de caché y actualizaciones

Documento que describe cómo se evita que los usuarios vean versiones antiguas de la app tras un deploy.

## Problema

Tras un deploy, los usuarios que recargan con F5 podían seguir viendo la versión anterior porque el navegador cacheaba el HTML y los assets.

## Soluciones implementadas

### 1. Headers HTTP en el servidor (server.ts)

- **index.html**: Se sirve con `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`. El navegador siempre pide el HTML fresco.
- **version.json**: Ruta explícita con los mismos headers para que `VersionUpdateChecker` siempre reciba el timestamp actual.

### 2. Meta tags en index.html

- `http-equiv="Cache-Control"`, `Pragma`, `Expires` como respaldo para proxies/CDN que puedan ignorar headers HTTP.

### 3. VersionUpdateChecker (src/components/VersionUpdateChecker.tsx)

- **Primera verificación**: 3 segundos tras cargar (antes 10).
- **Intervalo**: Cada 30 segundos (antes 60).
- **Page Visibility API**: Al volver a la pestaña (`visibilitychange`), se verifica si hay nueva versión.
- Si el servidor tiene un timestamp mayor, muestra toast "Nueva versión disponible" con botón "Actualizar".
- Al hacer clic en "Actualizar", limpia la caché del navegador y recarga.
- **"Más tarde"**: Si el usuario lo elige, se vuelve a mostrar el toast tras 5 minutos (para no dejarlo en versión antigua indefinidamente).
- **Protección contra bucles**: Cooldown de 2 min entre toasts (evita repetición por bugs). Máximo 3 recordatorios por sesión si el usuario sigue eligiendo "Más tarde".

### 4. Build con hashes (Vite)

- Los assets JS/CSS tienen hash en el nombre (ej. `main-abc123.js`).
- Cada deploy genera nombres distintos, así que no hay conflicto de caché.
- El HTML (siempre fresco) referencia los archivos con hash actuales.

## Flujo tras un deploy

1. Usuario tiene la app abierta con versión antigua.
2. **Opción A**: Recarga (F5) → obtiene HTML fresco → carga JS nuevo → ve cambios.
3. **Opción B**: En ~3–30 s, `VersionUpdateChecker` detecta nuevo timestamp → muestra toast → usuario hace clic en "Actualizar" → recarga con versión nueva.
4. **Opción C**: Usuario cambia de pestaña y vuelve → se verifica versión → si hay nueva, muestra toast.

## Archivos relevantes

- `server.ts` – rutas `/`, `*`, `/version.json` con headers anti-caché
- `index.html` – meta tags
- `src/components/VersionUpdateChecker.tsx` – detección de nuevas versiones
- `scripts/set-deploy-version.js` – escribe `public/version.json` en prebuild
- `public/version.json` – timestamp del deploy (en .gitignore)
