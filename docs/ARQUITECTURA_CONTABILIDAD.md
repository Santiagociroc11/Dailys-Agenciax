# Arquitectura Técnica del Módulo de Contabilidad

Documento generado para validar la arquitectura y facilitar el análisis por AI Dev (Cursor, Claude, Copilot). Describe el modelo de datos, la lógica de agregación y los flujos principales.

---

## 1. Modelo de Datos y Relaciones

### Diagrama de relaciones

```
AcctClient (clientes)
    │
    └── 1:N ──► AcctEntity (proyectos, agencias, internos)
                    │
                    └── 1:N ──► AcctTransaction (libro mayor)
                                    │
                                    ├── N:1 ──► AcctCategory (ingreso/gasto)
                                    └── N:1 ──► AcctPaymentAccount (cuenta de pago)
```

### Entidades principales

| Modelo | Colección | Descripción |
|--------|-----------|-------------|
| **AcctClient** | `acct_clients` | Clientes. Agrupan entidades para P&G por cliente. |
| **AcctEntity** | `acct_entities` | Proyectos, agencias o internos. `type`: `project`, `agency`, `internal`. `client_id` opcional. |
| **AcctTransaction** | `acct_transactions` | Libro mayor. Cada fila = un asiento. |
| **AcctCategory** | `acct_categories` | Categorías de ingreso/gasto. `parent_id` para subcategorías. |
| **AcctPaymentAccount** | `acct_payment_accounts` | Cuentas de pago (Bancolombia, Payoneer, Hotmart, etc.). |

### AcctTransaction (Libro Mayor)

```typescript
{
  id, date, amount, currency,
  type: 'income' | 'expense' | 'transfer',
  entity_id: string | null,      // Centro de costo (proyecto/entidad)
  category_id: string | null,
  payment_account_id: string,    // Requerido
  description: string,
  created_by: string | null
}
```

- **amount**: positivo = ingreso/crédito, negativo = gasto/débito.
- **entity_id**: centro de costo. Si es null → "Sin asignar".
- **payment_account_id**: cuenta donde se registra el movimiento.

---

## 2. Lógica de Negocio del P&G

### ¿Consulta dinámica o tabla de agregación?

**Consulta dinámica.** No hay tabla de agregación. El P&G se calcula en tiempo real con agregaciones de MongoDB sobre `acct_transactions`.

### P&G por Proyecto (`GET /pyg`)

1. **Filtros aplicados:**
   - Rango de fechas (`start`, `end`)
   - Opcional: `client_id` → solo entidades de ese cliente
   - Opcional: `projects_only=true` → solo `entity_type === 'project'`

2. **Exclusión de traslados de utilidades:**
   - Categorías cuyo nombre coincide con `TRASLADO_UTILIDADES_REGEX`
   - Descripciones que coinciden con `traslado.*utilidad|utilidad.*traslado|traslado\s+utilidades`

3. **Agregación:**
   ```javascript
   $group: { _id: { entity_id, currency }, ingresos: $sum(amount>=0), gastos: $sum(|amount| where amount<0) }
   ```

4. **Resultado:** Una fila por entidad con `ingresos`, `gastos`, `resultado` en USD y COP.

### P&G por Cliente (`GET /pyg-by-client`)

1. **Filtros:** Rango de fechas.
2. **Misma exclusión** de traslados de utilidades que en P&G por proyecto.
3. **Agregación:**
   - `$lookup` a `acct_entities` para obtener `client_id`
   - Transacciones sin entidad o con entidad sin cliente → `client_id = '__no_client__'`
   - `$group` por `{ client_id, currency }`
4. **Resultado:** Una fila por cliente (o "Sin cliente") con ingresos, gastos y resultado.

---

## 3. Estructura de Balances

### Balance por Proyecto/Entidad (`GET /balance`)

- **Cálculo:** `$group` por `{ entity_id, currency }` → `$sum: amount`
- **Interpretación:** Saldo neto por entidad (débitos - créditos).
- **Sin exclusión** de traslados: incluye todo.
- **Filtro:** Rango de fechas.

### Balance de Cuentas (`GET /account-balances`)

- **Cálculo:** `$group` por `{ payment_account_id, currency }` → `$sum: amount`
- **Interpretación:** Saldo por cuenta de pago (Bancolombia, Payoneer, etc.).
- **Filtro:** Rango de fechas.

### Diferencia con el Libro Mayor

- **Libro Mayor:** Lista de transacciones con filtros (fecha, entidad, categoría, cuenta).
- **Balance:** Agregación de esas transacciones por entidad o por cuenta.
- No hay partida doble explícita: cada transacción es un movimiento en una sola cuenta, con `amount` positivo o negativo.

---

## 4. Flujo de Importación CSV/Excel

### Columnas esperadas

| Columna | Obligatoria | Uso |
|---------|-------------|-----|
| FECHA | Sí | Fecha del asiento |
| PROYECTO | Sí | Se mapea a `entity_id` (crea entidad si no existe) |
| SUBCATEGORIA / CATEGORÍA/DETALLE | No | Categoría (crea si no existe) |
| DESCRIPCIÓN | No | `description` |
| IMPORTE CONTABLE | No | Monto si no hay columnas de cuentas |
| TIPO | No | "SALIDA CONTABLE" / "INGRESO CONTABLE" |
| Cols. 8+ | No | Columnas de cuentas (Bancolombia, Payoneer, Hotmart, etc.) |

### Procesamiento de una fila con múltiples cuentas

**Una fila del Excel puede generar varias transacciones.**

1. Se lee la fila: FECHA, PROYECTO, categoría, descripción.
2. Se obtiene o crea la entidad a partir de PROYECTO.
3. **Por cada columna de cuenta** (después de IMPORTE CONTABLE o desde col 8):
   - Si la celda tiene monto ≠ 0:
     - Se crea **una transacción** con:
       - `entity_id` = entidad del proyecto
       - `payment_account_id` = cuenta de esa columna (creada si no existe)
       - `category_id` = categoría (subcategoría o categoría/detalle)
       - `amount` = valor de la celda (positivo o negativo)
       - `type` = `income` si amount ≥ 0, `expense` si < 0

4. **Si no hubo montos en columnas de cuentas** pero sí en IMPORTE CONTABLE:
   - Se crea una transacción usando "Mov. Contable" o la primera cuenta.

### Ejemplo

Fila: `2024-01-15 | Proyecto X | Comisiones | 100 | -50 | 30`  
Columnas de cuentas: Bancolombia, Payoneer, Hotmart.

→ Se crean **3 transacciones**:
- Bancolombia: +100 (ingreso)
- Payoneer: -50 (gasto)
- Hotmart: +30 (ingreso)

Todas con la misma fecha, entidad, categoría y descripción.

### Reglas especiales en importación

- `PROYECTO = "TRASLADO"` → se mapea a entidad "AGENCIA X"
- `PROYECTO = "RETIRO HOTMART"` → se mapea a "HOTMART"
- Moneda: si `|amount| > 100000` → COP, si no → `default_currency` (USD por defecto)

---

## 5. Tratamiento de "Traslados"

### Tipos de traslados en el sistema

1. **`type = 'transfer'`**  
   Campo de la transacción. No se usa en la lógica actual de P&G ni Balance: todas las transacciones se suman igual.

2. **Traslados de utilidades** (exclusión en P&G)  
   Se excluyen para que el P&G muestre resultado operativo sin movimientos internos de utilidades.

   **Criterios de exclusión:**
   - **Categoría:** nombre que coincida con  
     `traslado.*utilidad|utilidad.*traslado|traslado\s+utilidades|^utilidades\s|utilidades\s+[a-z0-9]`
   - **Descripción:** que coincida con  
     `traslado.*utilidad|utilidad.*traslado|traslado\s+utilidades`

3. **Movimientos entre cuentas**  
   No hay lógica específica. Un traslado Bancolombia → Payoneer se modela como:
   - Transacción 1: Bancolombia, amount negativo
   - Transacción 2: Payoneer, amount positivo  

   Ambas cuentan en Balance y P&G. No hay pareo automático de transferencias.

### Diferencia gasto real vs movimiento interno

- **Gasto real:** transacción con `amount < 0` en una categoría de gasto.
- **Movimiento interno:** mismo signo de amount, pero categoría/descripción de “traslado de utilidades” → se excluye solo en P&G.
- El Balance por cuenta y por entidad **no** excluye traslados; el P&G sí excluye los de utilidades.

---

## 6. Validación: ¿Soporta contabilidad analítica por centros de costo?

| Requisito | Estado |
|-----------|--------|
| Centro de costo por transacción | ✅ `entity_id` en cada transacción |
| Agrupación por proyecto | ✅ P&G por proyecto, Balance por entidad |
| Agrupación por cliente | ✅ P&G por cliente (vía `entity.client_id`) |
| Múltiples cuentas de pago | ✅ `payment_account_id`, Balance por cuenta |
| Importación multi-cuenta | ✅ Una fila → N transacciones (una por cuenta con monto) |
| Exclusión de traslados en P&G | ✅ Por categoría y descripción |
| Jerarquía categorías | ✅ `parent_id` en categorías |
| Auditoría | ✅ `AuditLog` en creates/updates/deletes |

### Limitaciones actuales

1. **Partida doble:** No hay asientos con débito/crédito en cuentas contables; cada transacción es un movimiento neto en una cuenta.
2. **Transfers:** `type = 'transfer'` no se usa en agregaciones; no hay pareo automático de transferencias entre cuentas.
3. **Balance General:** El “Balance” es por entidad y por cuenta de pago, no por plan contable (activo, pasivo, patrimonio, etc.).

---

## 7. Endpoints principales

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/transactions` | GET | Libro mayor (filtros: start, end, entity_id, category_id, payment_account_id, client_id) |
| `/balance` | GET | Balance por entidad (start, end) |
| `/pyg` | GET | P&G por proyecto (start, end, client_id, projects_only) |
| `/pyg-by-client` | GET | P&G por cliente (start, end) |
| `/account-balances` | GET | Balance por cuenta de pago (start, end) |
| `/import` | POST | Importación CSV (csv_text, default_currency) |

---

*Documento generado para análisis de arquitectura. Última revisión: 2025.*
