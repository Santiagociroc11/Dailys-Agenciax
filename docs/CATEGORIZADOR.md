# Agente categorizador de transacciones

Scripts que normalizan categorías y descripciones de transacciones usando IA (OpenRouter + Gemini 2.5 Flash Lite).

## Problema que resuelve

Cuando importas un CSV con transacciones, muchas categorías vienen como nombres de plataformas (ej. "ChatGPT", "Netflix") en lugar de categorías contables (ej. "Suscripciones" con detalle "ChatGPT"). Estos scripts las normalizan de forma consistente.

---

## Modo interactivo (recomendado)

El categorizador interactivo **pregunta y aprende** de tus correcciones:

- **Primeras veces**: pregunta cada transacción nueva, la IA sugiere y tú confirmas o corriges.
- **Cuando ya aprobaste 2+ veces** el mismo patrón → aplica automáticamente.
- **Si no está claro** → sigue preguntando.

```bash
OPENROUTER_API_KEY=tu_api_key npm run categorizador:interactivo -- "ruta/al/csv.csv"
```

**Comandos durante la sesión:**
- `Enter` = Aceptar sugerencia de la IA
- `categoria, detalle` = Corregir (con coma obligatoria, ej: `Gastos de la Agencia, Viaje`)
- `s` = Saltar (mantener original)
- `k` = Mantener original y aprender (no preguntar más para este patrón)
- `q` = Salir y guardar lo procesado

**Guía detallada:** Ver `docs/CATEGORIZADOR_INTERACTIVO.md` para ejemplos y errores frecuentes.

El aprendizaje se guarda en `categorizador_aprendizaje.json`. Si lo borras, vuelve a preguntar todo.

---

## Modo automático

```bash
OPENROUTER_API_KEY=tu_api_key npm run categorizador -- ruta/a/tu_archivo.csv
```

Si no pasas ruta, usa `csvejemplo.csv` en la raíz del proyecto.

## Requisitos del CSV

- Debe tener al menos una columna **CATEGORIA** (o CATEGORIA/DETALLE, DETALLE) y/o **DESCRIPCION** (o NOTA, CONCEPTO).
- Detecta automáticamente SUBCATEGORIA si existe.
- Compatible con el formato de importación de contabilidad (FECHA, PROYECTO, cuentas, etc.).

## Proceso

1. **Lotes de 50**: Procesa las transacciones en lotes para no superar límites de tokens.
2. **Estado global**: Mantiene una lista de categorías ya creadas y la pasa al modelo en cada lote.
3. **Prompt dinámico**: "Usa estas categorías existentes: [lista]. Si ninguna encaja, crea una nueva."
4. **Actualización**: Tras cada lote, agrega las nuevas categorías al diccionario global.

## Salida

- **`{nombre}_limpias.csv`**: Mismo CSV con categorías y descripciones normalizadas. Se agrega columna DETALLE si no existe.
- **`diccionario_categorias.json`**: Mapa de categoría → lista de detalles usados (útil para auditoría o futuros mapeos).

## API Key

Obtén tu API key en [OpenRouter](https://openrouter.ai/). El modelo `google/gemini-2.5-flash-lite` es económico y rápido.
