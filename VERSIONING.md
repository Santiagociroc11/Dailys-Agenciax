# 📦 Sistema de Versionado

Este proyecto implementa un sistema de versionado semántico para controlar y mostrar las versiones de la aplicación.

## 🏗️ Estructura del Sistema

### Archivos principales:
- `package.json` - Contiene la versión principal del proyecto
- `src/lib/version.ts` - Configuración de versión para la aplicación
- `src/components/VersionInfo.tsx` - Componente para mostrar información de versión
- `scripts/update-version.js` - Script para actualizar versiones automáticamente

## 🚀 Cómo usar el sistema

### Actualizar versión con script automático:

```bash
# Actualización de parche (1.0.0 → 1.0.1)
npm run version:patch "Corrección de errores menores"

# Actualización menor (1.0.0 → 1.1.0)  
npm run version:minor "Nueva funcionalidad agregada"

# Actualización mayor (1.0.0 → 2.0.0)
npm run version:major "Cambios importantes que rompen compatibilidad"

# Usando el script directamente
npm run update-version patch "Descripción del cambio"
```

### Actualización manual:

1. **Editar package.json:**
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Actualizar src/lib/version.ts:**
   ```typescript
   export const VERSION_INFO = {
     version: '1.0.1',
     buildDate: '2024-01-15',
     releaseNotes: [
       'Descripción de los cambios realizados'
     ]
   };
   ```

## 📱 Visualización en la aplicación

La versión se muestra en la parte inferior de ambos sidebars (admin y usuario):
- Icono de información clickeable que muestra detalles
- Versión actual (ej: v1.0.0)
- Fecha de compilación
- Modal con notas de la versión al hacer click

## 🔄 Versionado Semántico

Seguimos el estándar de [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Cambios incompatibles con versiones anteriores
- **MINOR** (1.X.0): Nueva funcionalidad compatible con versiones anteriores  
- **PATCH** (1.0.X): Correcciones de errores compatibles

## 📝 Mejores prácticas

1. **Siempre actualiza la versión** cuando hagas cambios significativos
2. **Incluye notas descriptivas** de los cambios realizados
3. **Haz commit** de los archivos de versión junto con tus cambios
4. **Crea tags de git** para versiones importantes:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

## 🛠️ Mantenimiento

### Para desarrolladores:
- Revisa la versión antes de hacer deploy
- Actualiza las notas de versión con cambios importantes
- Mantén sincronizados package.json y version.ts

### Para administradores:
- La versión es visible para todos los usuarios
- Úsala para comunicar actualizaciones y mejoras
- Referencia la versión en reportes de problemas 