# Brechas: P&G por Proyecto, P&G por Cliente y Balance General

## Resumen ejecutivo

El sistema actual tiene una estructura **vertical** (filas = entidades/proyectos) cuando el estándar para un Estado de Resultados por proyecto es **horizontal** (columnas = proyectos, filas = conceptos). Además, faltan clasificaciones clave (directos vs indirectos), márgenes y un Balance General contable real.

---

## 1. P&G por Proyecto – Lo que hay vs lo que debe ser

### Estructura actual (incorrecta para decisión)

| Proyecto / Entidad | Ingresos | Gastos | Resultado |
|--------------------|----------|--------|-----------|
| Proyecto A         | $10,000  | $5,000 | $5,000    |
| Proyecto B         | $5,000   | $3,000 | $2,000    |
| Sin asignar        | $0       | $2,000 | -$2,000   |
| **Total**          | $15,000  | $10,000| $5,000     |

- **Layout**: filas = proyectos, columnas = Ingresos / Gastos / Resultado
- **Problema**: se lee por filas; no permite comparar proyectos en columnas ni ver la estructura del resultado.

### Estructura ideal (lectura horizontal)

| Cuentas / Conceptos        | Proyecto A | Proyecto B | Admin/No asignado | TOTAL    |
|----------------------------|------------|------------|-------------------|----------|
| **(+) Ingresos Operacionales** | $10,000    | $5,000     | $0                | $15,000  |
| **(-) Costos Directos**    | ($4,000)   | ($2,000)   | $0                | ($6,000) |
| **(=) UTILIDAD BRUTA**     | $6,000     | $3,000     | $0                | $9,000   |
| **Margen Bruto (%)**       | 60%        | 60%        | —                 | 60%      |
| **(-) Gastos Operativos**  | ($1,000)   | ($1,000)   | ($2,000)          | ($4,000) |
| **(=) UTILIDAD OPERATIVA** | $5,000     | $2,000     | ($2,000)          | $5,000   |
| **Margen Operativo (%)**   | 50%        | 40%        | —                 | 33.3%    |

- **Layout**: filas = conceptos, columnas = proyectos + Admin + TOTAL
- **Ventaja**: se ve qué proyecto aporta y cuál consume, y la eficiencia relativa (márgenes).

### Elementos que faltan

| Elemento | Estado actual | Acción necesaria |
|----------|---------------|------------------|
| **Layout invertido** | Filas = proyectos | Cambiar a filas = conceptos, columnas = proyectos |
| **Clasificación Directos vs Indirectos** | No existe | Costos directos = gastos con `entity_id`; Gastos operativos = gastos sin `entity_id` |
| **Columna "No Asignado" / "Administración"** | Existe como fila "Sin asignar" | Convertir en columna fija para gastos indirectos |
| **Márgenes en tiempo real** | No existen | Margen = Utilidad / Ingresos × 100 |
| **Utilidad Bruta vs Operativa** | Solo "Resultado" | Separar: Bruta (Ingresos - Directos), Operativa (Bruta - Indirectos) |
| **Filtro por proyectos** | Parcial (client_id) | Selector multi-proyecto para comparar A vs C |
| **Agrupar por cliente** | Sí (P&G por cliente) | Mantener y alinear estructura con P&G por proyecto |

---

## 2. P&G por Cliente – Brechas similares

- Misma lógica: layout vertical (filas = clientes).
- Falta: layout horizontal (columnas = clientes), conceptos en filas, márgenes y clasificación directos/indirectos.
- La agrupación por cliente ya existe; falta la estructura de filas (Ingresos, Costos directos, Utilidad bruta, Gastos operativos, Utilidad operativa, márgenes).

---

## 3. Balance General – Lo que hay vs lo que debe ser

### Estructura actual (no es Balance General)

- El endpoint `/balance` devuelve **resultado por entidad** (ingresos - gastos por proyecto).
- Es más un “resultado acumulado por proyecto” que un Balance General.

### Estructura ideal de Balance General

```
ACTIVOS
  Activo Corriente
    1110 Bancos                    $X
    1305 Clientes                  $X
  Activo No Corriente
    ...

PASIVOS
  Pasivo Corriente
    2205 Proveedores               $X
  Pasivo No Corriente
    ...

PATRIMONIO
  3105 Capital social              $X
  3605 Utilidades acumuladas       $X

TOTAL ACTIVOS = TOTAL PASIVOS + PATRIMONIO
```

### Elementos que faltan

| Elemento | Estado actual | Acción necesaria |
|----------|---------------|------------------|
| **Estructura Activo / Pasivo / Patrimonio** | No existe | Agrupar cuentas por tipo (asset, liability, equity) |
| **Balance de comprobación** | Existe en Asientos | Usar como base para construir Balance General |
| **Cuentas por tipo** | Sí en PUC | Usar `AcctChartAccount.type` para agrupar |
| **Desglose por entidad** | Solo en "balance" actual | Opcional: subcolumnas por proyecto en activos/pasivos |

---

## 4. Plan de implementación (con especificaciones técnicas)

### Fase 1: P&G Matrix (La joya de la corona)

#### Backend – Transformación de datos (Pivot)

> **Regla de oro**: El pivot (vertical → horizontal) **NO** debe hacerse en el Frontend. Debe venir procesado desde el Backend para que sea veloz.

**Nuevo endpoint**: `GET /pyg-matrix`

**Lógica de agregación (Query Pro)** – MongoDB debe usar `$facet` o varios `$group` seguidos para separar:

| Grupo | Criterio | Descripción |
|-------|----------|-------------|
| **A (Ingresos)** | Cuentas cuyo código empieza por **4** | Ingresos operacionales |
| **B (Costos Directos)** | Cuentas cuyo código empieza por **5 o 6** Y `entity_id != null` | Gastos asignados al proyecto |
| **C (Gastos Indirectos)** | Cuentas cuyo código empieza por **5** Y `entity_id == null` | Gastos de administración/estructura |

**Fórmula de validación** (el dev debe verificar que el reporte la cumpla):

$$Utilidad\ Operativa = (Ingresos - Costos\ Directos) - Gastos\ Indirectos$$

**Margen de Contribución** (obligatorio para decisiones de precios):

$$Margen\ Contribución = Ingresos - Costos\ Directos$$

Si el reporte no permite ver el Margen de Contribución por proyecto, no sirve para tomar decisiones de precios.

**Estructura de respuesta**:
- Filas: conceptos (Ingresos, Costos directos, Utilidad bruta, Gastos operativos, Utilidad operativa, márgenes %)
- Columnas: proyectos + "No asignado" + TOTAL
- Por moneda: **separar USD y COP** (nunca mezclar en una columna "Total")

---

### Fase 2: Balance General (La verdad contable)

> **Importante**: Dejar de usar el endpoint `/balance` para esto. Crear uno nuevo que respete la jerarquía PUC.

**Nuevo endpoint**: `GET /balance-general`

**El secreto: el primer dígito del código**

Agrupar por el primer número del código de cuenta:

| Rango | Tipo | Sección |
|-------|------|---------|
| **1xxx** | Activos | Activo Corriente / No Corriente |
| **2xxx** | Pasivos | Pasivo Corriente / No Corriente |
| **3xxx** | Patrimonio | Capital, Utilidades |

**Regla de oro de integridad**:

El sistema debe calcular la **Utilidad del Ejercicio** en tiempo real (Ingresos - Gastos del periodo actual) y **sumarla automáticamente al Patrimonio** (cuentas 36xx) para que el balance cuadre.

Si no hace esto, el balance siempre va a estar descuadrado por el valor de las ganancias del mes.

**Fórmula de cierre**:
```
Total Activos = Total Pasivos + Patrimonio
Patrimonio incluye: Capital (31xx) + Utilidades acumuladas (36xx) + Utilidad del ejercicio (calculada)
```

---

### Fase 3: P&G por Cliente (misma estructura)

1. Reutilizar lógica de matriz pero agrupando por `client_id`.
2. Misma estructura de filas (conceptos) y columnas (clientes + No asignado + TOTAL).
3. Mismos criterios de clasificación (Grupos A, B, C) y fórmulas.

---

## 5. Especificaciones Frontend (UI/UX)

| Elemento | Requisito | Motivo |
|----------|-----------|--------|
| **Toggle de moneda** | Switch global USD/COP. **Nunca** mezclar monedas en una columna "Total". | Mezclar monedas mata la credibilidad del software. |
| **Sticky columns** | En el P&G horizontal: la primera columna (Conceptos) y la última (TOTAL) deben quedarse fijas al hacer scroll lateral. | Permite comparar proyectos sin perder el contexto. |
| **Filtro "Admin"** | Poder ocultar la columna "No asignado" para comparar solo proyectos operativos, o mostrarla para ver la realidad total. | Flexibilidad para análisis. |

---

## 6. Requisito no negociable: Log de auditoría de edición

> En contabilidad, "borrar" un rastro es un pecado capital.

Cada vez que alguien **edite un asiento** (incluido asientos antiguos), el sistema debe guardar:

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| **Quién** | Sí | `user_id` del usuario que editó |
| **Cuándo** | Sí | Timestamp de la edición |
| **Qué cambió** | Sí | Valores anteriores vs nuevos (por línea: cuenta, débito, crédito, entity_id) |

**Estado actual**: El modelo `AuditLog` tiene `field_name`, `old_value`, `new_value`, pero el endpoint `PUT /journal-entries/:id` solo registra `summary` genérico. **Falta** persistir el detalle de qué valores cambiaron (antes/después).

**Acción**: Antes de aplicar el `update`, leer el asiento actual, comparar línea por línea con el payload, y crear registros de auditoría con `old_value` y `new_value` para cada cambio.

---

## 7. Consideraciones técnicas adicionales

### Clasificación Directos vs Indirectos (por código PUC)

- **Costos directos**: cuentas 5xx o 6xx con `entity_id` presente.
- **Gastos indirectos**: cuentas 5xx con `entity_id` null.

### Márgenes

- Margen Bruto % = Utilidad Bruta / Ingresos × 100
- Margen Operativo % = Utilidad Operativa / Ingresos × 100
- Margen de Contribución = Ingresos - Costos Directos (en $ y en %)
- Para proyectos sin ingresos: mostrar "—" o N/A.

### Filtros dinámicos

- Rango de fechas: ya existe.
- Selector de proyectos: añadir multi-select para comparar proyectos concretos.
- Agrupar por cliente: ya existe; alinear estructura con P&G por proyecto.
