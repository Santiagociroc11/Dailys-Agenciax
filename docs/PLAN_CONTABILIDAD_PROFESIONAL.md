# Plan: Contabilidad Profesional con Partida Doble

## Objetivo

Migrar a un único modelo contable basado en **asientos** (partida doble), eliminando la dualidad actual entre transacciones y asientos.

---

## Cambios Implementados

### 1. Importador → Crea Asientos

El importador CSV/Excel ahora genera **asientos contables** en lugar de transacciones:

- **Por cada celda con monto** en las columnas de cuentas (Bancolombia, Payoneer, etc.):
  - **Monto positivo (ingreso):** Débito en cuenta de banco, Crédito en cuenta de ingreso
  - **Monto negativo (gasto):** Débito en cuenta de gasto, Crédito en cuenta de banco

- **Mapeos automáticos:**
  - Cada cuenta de pago (Bancolombia, Payoneer, Hotmart…) → subcuenta de activo (1110-XX)
  - Cada categoría de ingreso → subcuenta 4135-XX
  - Cada categoría de gasto → subcuenta 5195-XX

- **Centro de costo:** Se mantiene `entity_id` (proyecto) en cada línea del asiento.

### 2. Libro Mayor → Lee de Asientos

El Libro mayor muestra **asientos** con sus líneas (débitos/créditos), en lugar de transacciones sueltas.

### 3. Balance y P&G → Agregación desde Asientos

- **Balance por entidad:** Suma de (débito - crédito) por cuenta y entidad.
- **P&G:** Suma por cuentas de tipo income/expense agrupadas por entidad.

### 4. Fuente Única de Verdad

- **AcctJournalEntry** + **AcctJournalEntryLine** = único registro de movimientos.
- **AcctTransaction** deprecado: GET /transactions devuelve vacío; todo lee de asientos.

### 5. Migración completada

- **Libro mayor:** Muestra líneas de asientos (débito/crédito). Editar/eliminar = asiento completo.
- **Balance, P&G, P&G por cliente, Balance de cuentas:** Agregan desde `AcctJournalEntryLine`.
- **Fusiones:** Entidad y categoría actualizan `AcctJournalEntryLine` y `AcctChartAccount`.

---

## Flujo de Uso Recomendado

1. **Cargar PUC básico** (si el plan está vacío).
2. **Importar CSV/Excel** → se crean asientos automáticamente.
3. **Crear asientos manuales** para ajustes o movimientos que no vienen del Excel.
4. **Revisar Balance de comprobación** para validar que todo cuadra.
5. **Consultar P&G y Balance** por proyecto/cliente.

---

## Estructura del Plan de Cuentas (PUC)

| Código | Nombre | Tipo |
|--------|--------|------|
| 1105 | Caja | asset |
| 1110 | Bancos | asset |
| 1110-01, 1110-02... | (por banco) | asset |
| 4135 | Ingresos operacionales | income |
| 4135-01, 4135-02... | (por categoría) | income |
| 5195 | Otros gastos | expense |
| 5195-01, 5195-02... | (por categoría) | expense |

Los códigos con sufijo (-01, -02) se crean automáticamente durante la importación.
