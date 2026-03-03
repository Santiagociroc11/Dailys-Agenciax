# Import: Entidades, Categorías y Cuentas Contables

## ¿Qué es qué?

| Concepto | Dónde vive | Qué hace en el import |
|----------|------------|------------------------|
| **Entidad (Proyecto)** | `AcctEntity` | Columna **PROYECTO** del CSV → centro de costo. Se guarda en `entity_id` de cada línea del asiento. |
| **Categoría** | `AcctCategory` | Columna **CATEGORIA** + **DETALLE** → catálogo para clasificar. **No se guarda** en las líneas. |
| **Cuenta contable (PUC)** | `AcctChartAccount` | Lo que **sí se guarda** en cada línea (`account_id`). Se crea a partir de categoría + columnas de banco. |

## Flujo del import

```
CSV PROYECTO     →  Entidad (entity_id en cada línea)
CSV CATEGORIA    →  Busca/crea Cuenta PUC (4135-XX ingreso, 5195-XX gasto)
CSV col. PAYO JSD → Busca/crea Cuenta PUC 1110-XX (activo/banco)
```

**La categoría es un comodín de clasificación:** el import usa el nombre de la categoría para crear o buscar la cuenta PUC. La línea del asiento solo guarda `account_id` (cuenta PUC), no `category_id`.

## Cómo corregir si te equivocaste en la entidad (proyecto)

### Opción 1: Editar el asiento (1 o pocos movimientos)

1. Ir a **Asientos** → Libro mayor.
2. Filtrar por entidad o fecha para encontrar el asiento erróneo.
3. Abrir el asiento y **editar** las líneas: cambiar `entity_id` de la línea que tenga el proyecto equivocado.
4. Guardar.

### Opción 2: Fusionar entidades (muchos movimientos mal asignados)

Si asignaste muchos movimientos a "GERSSON L7" cuando debían ser "GERSSON L8":

1. Ir a **Config** → **Entidades**.
2. Seleccionar la entidad origen (ej. GERSSON L7).
3. **Fusionar en** la entidad destino (ej. GERSSON L8).
4. Todas las líneas de GERSSON L7 pasan a GERSSON L8 y la entidad GERSSON L7 se elimina.

⚠️ La fusión afecta **todas** las líneas de esa entidad, no solo las del import.

### Opción 3: Rollback y re-importar

Si el error es masivo y recién importaste:

1. Ir a **Import** → **Historial de imports**.
2. Hacer **Rollback** del batch que importaste.
3. Corregir el CSV (columna PROYECTO) y volver a importar.

## Cómo corregir categoría o cuenta contable

Si te equivocaste en la **categoría** (ej. "GASTOS AGENCIA" en vez de "SOFTWARE"):

- La línea guarda `account_id` (cuenta PUC). Esa cuenta se creó con el nombre de la categoría.
- **Editar el asiento** y cambiar el `account_id` de la línea de ingreso/gasto por la cuenta correcta.
- O **fusionar categorías** en Config → Categorías (mueve las cuentas PUC hijas a la categoría destino).

## Resumen rápido

| Error | Solución |
|-------|----------|
| Proyecto equivocado (1 asiento) | Editar asiento, cambiar entity_id en la línea |
| Proyecto equivocado (toda una entidad) | Fusionar entidad origen → destino |
| Proyecto equivocado (import reciente) | Rollback del batch + re-importar CSV corregido |
| Categoría equivocada | Editar asiento (cambiar account_id) o fusionar categorías |
