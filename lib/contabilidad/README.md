# Módulo Contabilidad

Modelo de dominio y servicios para el sistema contable.

## Estructura

- **domain.ts** — Conceptos: tipos de movimiento, fórmulas, patrones CSV
- **balanceService.ts** — Cálculo del balance (P&L + liquidación)
- **csvUtils.ts** — parseSpanishDate, parseAmount, isTrasladoBancos

---

## Flujo de caja y utilidades

```
Proyectos (GERSSON, ADRIANA, etc.)
    │
    │ Liquidar (saldo positivo)
    ▼
FONDO LIBRE (hub central)
    │
    ├── Reponer AGENCIA X (si está en negativo)
    │
    └── Repartir a socios (pago final)
```

---

## Acciones desde la plataforma

### Liquidar
**Qué hace:** Traslada utilidades de un proyecto con saldo positivo → FONDO LIBRE.

**Asiento:** Débito Utilidades FONDO LIBRE, Crédito Utilidades [proyecto]

**Cuándo usar:** Cuando un proyecto (ej. GERSSON L10) tiene balance positivo y quieres consolidar en FONDO LIBRE.

---

### Reponer
**Qué hace:** Traslada desde FONDO LIBRE → AGENCIA X para cubrir su saldo negativo.

**Asiento:** Débito Utilidades FONDO LIBRE, Crédito Ingreso CORTE UTILIDADES (entity: AGENCIA X)

**Cuándo usar:** Cuando AGENCIA X está en rojo y necesitas inyectar fondos desde el hub.

---

### Repartir
**Qué hace:** Paga a socios desde FONDO LIBRE (sale dinero real).

**Asiento:** Débito Gasto REPARTICIÓN [socio], Crédito Utilidades FONDO LIBRE

**Cuándo usar:** Cuando quieres distribuir las utilidades acumuladas a los socios (JUANCA, SANTIAGO, etc.).

---

## Fórmula del balance de liquidación

```
Balance = Ingresos - Gastos - Distribuciones
```

**Distribuciones** = todo lo que ya salió de las utilidades del proyecto:
- Traslados (SALIDA CONTABLE) → crédito a Utilidades del origen → se resta
- Reparticiones a socios → débito a Utilidades (import) o crédito (plataforma) → se resta

Los débitos de traslados (INGRESO CONTABLE) son del destino y NO se restan.

---

## Tipos de movimiento (import CSV)

| Tipo | Descripción | Afecta P&L | Afecta liquidación |
|------|-------------|------------|---------------------|
| ingreso | Ventas, cobros | + | — |
| gasto | Operacional | − | — |
| traslado_bancos | Entre cuentas | no | no |
| traslado_utilidades | SALIDA+INGRESO CONTABLE | no (equity) | sí (resta) |
| reparticion | Pago a socio | no | sí (resta) |

---

## Cuentas clave

| Cuenta | Tipo | Uso |
|--------|------|-----|
| Utilidades [entidad] | equity | Saldo acumulado por proyecto |
| CORTE UTILIDADES | income | Traslados recibidos (INGRESO CONTABLE, Reponer) |
| REPARTICIÓN DE UTILIDADES SOCIOS | expense | Pagos a socios |

---

## Entidades especiales

| Entidad | Rol |
|---------|-----|
| **FONDO LIBRE** | Hub central. Recibe liquidaciones de proyectos, alimenta AGENCIA X y paga a socios. |
| **AGENCIA X** | Operación principal. Puede tener saldo negativo; se repone desde FONDO LIBRE. |

---

## Total de cuentas (Balance de cuentas)

El total USD/COP debe coincidir con la suma de las columnas de cuentas en el Excel/CSV.

**Si el total en la app es mayor que en el Excel**, causas habituales:

1. **CSV importado más de una vez** — La detección de duplicados ahora usa un hash completo (fila + fecha + descripción + proyecto + montos por cuenta) para evitar re-importar el mismo CSV. Si ya importaste dos veces, haz rollback de un batch y re-importa solo una vez.

2. **Montos COP contados como USD** — Montos > 100.000 o en cuentas BANCOLOMBIA/DAVIVIENDA se clasifican como COP. Si un monto USD grande se clasificó como COP por error, el total USD sería menor (no mayor).

3. **Script de verificación** — Ejecuta `npx tsx scripts/totales-cuentas-csv.ts "CUENTAS DINERO PRESUPUESTO final.csv"` para ver los totales esperados desde el CSV.

---

## Balance vs movimientos no contables

La vista **Balance** excluye CORTE UTILIDADES (SALIDA/INGRESO CONTABLE) para coincidir con una tabla dinámica de "movimientos no contables". La vista **Liquidación** los incluye para mostrar el saldo pendiente correcto.

- **Balance** (`excluir_contables=1`): ingresos − gastos, sin traslados contables.
- **Liquidación** (`liquidacion=1`): balance − distribuciones (saldo pendiente de liquidar).

Script de simulación: `npx tsx scripts/simular-movimientos-no-contables.ts "CUENTAS DINERO PRESUPUESTO final.csv"`
