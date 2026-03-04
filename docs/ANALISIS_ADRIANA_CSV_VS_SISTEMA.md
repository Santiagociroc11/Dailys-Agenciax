# Análisis: Proyecto ADRIANA - CSV vs Sistema

## Resumen ejecutivo

| Concepto | Excel (CSV) | Sistema | Diferencia |
|----------|-------------|---------|------------|
| **Ingresos** | $34,636.00 | $34,636.00 | ✓ Coinciden |
| **Gastos** | $28,124.20 | $35.20 | $28,089 |
| **Balance** | $6,511.80 | $34,600.80 | $28,089 |

**Conclusión:** Los datos están correctos en ambos lados. La diferencia se debe a que **Excel y sistema usan definiciones distintas de "gastos" y "balance"**.

---

## 1. Desglose de gastos en el CSV (Excel)

| Categoría | Detalle | Monto | En el sistema |
|-----------|---------|-------|---------------|
| CORTE UTILIDADES | CORTE UTILIDADES | $13,080 | → Cuenta **equity** (patrimonio) |
| CORTE UTILIDADES | UTILIDAD A JUNIO 30 | $4,659 | → Cuenta **equity** |
| CORTE UTILIDADES | TRASLADO A AGENCIA X | $2,129 | → Cuenta **equity** |
| REPARTICIÓN DE UTILIDADES SOCIOS | JUANCA | $8,221 | → Cuenta **equity** |
| SOFTWARE Y SUSCRIPCIONES | DEVZAPP | $28.20 | ✓ Cuenta **expense** (ADRIANA) |
| SOFTWARE Y SUSCRIPCIONES | CHATGPT | $5.00 | ✓ Cuenta **expense** (ADRIANA) |
| GASTO PUBLICITARIO | FB ADS | $2.00 | ✓ Cuenta **expense** (ADRIANA) |

**Total gastos operativos (expense):** $35.20 → **El sistema los tiene correctamente en ADRIANA.**

**Total distribuciones/traslados (equity):** $28,089 → **El sistema los registra en cuentas de patrimonio (equity), no en expense.**

---

## 2. Cómo trata cada concepto el sistema

| Concepto | Cuenta PUC | Tipo | ¿Afecta Balance (income - expense)? |
|----------|------------|------|-------------------------------------|
| Ingresos Hotmart, Pago Fee | 4135-xx | income | Sí |
| FB ADS, ChatGPT, DEVZAPP | 5195-xx | expense | Sí |
| REPARTICIÓN (pago a JUANCA) | 3605-15 Utilidades ADRIANA | equity | **No** (solo en vista Liquidación) |
| CORTE UTILIDADES (SALIDA CONTABLE) | 3605-15 Utilidades ADRIANA | equity | **No** (solo en vista Liquidación) |

El **Balance** estándar del sistema = `ingresos - gastos` (solo cuentas income/expense).  
Las distribuciones (REPARTICIÓN, CORTE UTILIDADES) van a equity y **no se restan** en el Balance normal.  
Solo en la vista **Liquidación** se restan las distribuciones para mostrar el "pendiente de liquidar".

---

## 3. Por qué el Excel muestra otro número

El Excel trata como "gastos" todo lo que reduce el saldo del proyecto:
- Gastos operativos (software, publicidad) ✓
- REPARTICIÓN (pagos a socios) ✓
- CORTE UTILIDADES (traslados a AGENCIA X / FONDO LIBRE) ✓

Por eso: **Balance Excel = Ingresos - (Gastos operativos + Repartición + Corte utilidades)** = $6,511.80

---

## 4. Qué hacer para alinear

### Opción A: Usar la vista Liquidación en el sistema ✓

En **Balance** → **Liquidación**, el sistema resta las distribuciones (REPARTICIÓN + CORTE UTILIDADES) del resultado.  
**El balance de ADRIANA en Liquidación debería coincidir con el Excel (~$6,512).**

### Opción B: Añadir una vista "Balance tipo Excel"

Si se necesita que el Balance muestre el mismo concepto que el Excel (ingresos - gastos - distribuciones), se podría añadir una vista o un reporte que reste también las líneas de equity (Utilidades [proyecto]) del resultado.

### Opción C: Documentar la diferencia

Dejar claro que:
- **Balance (sistema)** = resultado operativo (ingresos - gastos)
- **Balance Excel** = resultado operativo - distribuciones - traslados

---

## 5. Verificación de datos

- ✓ Los ingresos coinciden ($34,636)
- ✓ Los gastos operativos ($35.20) están correctamente asignados a ADRIANA
- ✓ REPARTICIÓN y CORTE UTILIDADES están en equity con entity_id = ADRIANA
- ✓ No hay gastos de Adriana mal asignados a otras entidades (los $35.20 están en ADRIANA)

**Script de análisis:** `npx tsx scripts/analizar-adriana.ts`
