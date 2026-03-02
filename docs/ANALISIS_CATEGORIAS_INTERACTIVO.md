# Análisis de categorías – CSV interactivo

## Resumen

- **89 combinaciones** únicas de Categoría | Detalle
- **2071 transacciones** procesadas

---

## Inconsistencias detectadas

### 1. Typos a corregir

| Actual | Correcto | Ocurrencias |
|-------|----------|-------------|
| **Sotware** y suscripciones | **Software** y suscripciones | 826 |
| INGRESOS POR **PROEYCTO** | Ingresos por **Proyecto** | 1 |
| **FIVEER** | **Fiverr** | 1 (en detalle) |

### 2. Mayúsculas/minúsculas inconsistentes

| Variante 1 | Variante 2 | Ocurrencias |
|------------|------------|-------------|
| Gastos de la Agencia | **GASTOS DE LA AGENCIA** | 11 vs 43 |
| Gastos Publicitarios | **GASTOS PUBLICITARIOS** | 0 vs 865 |
| Nómina | **NOMINA** | 43 vs 2 |

### 3. Detalles que podrían unificarse

| Detalle | Sugerencia | Motivo |
|---------|------------|--------|
| DOMINIO | Dominios | Mismo concepto (3 vs 3) |
| Viaje | VIAJES | Mismo concepto (1 vs 4) |
| Coworking | Comida del equipo | Diferentes (cada uno correcto) |

### 4. Categorías huérfanas (1 sola transacción)

- `PARTE JERWIN - ADELANTO AV VILLAS` – considerar mover a Repartición de utilidades
- `Ingresos` | PLATA GIORGIO DEUDA – unificar con Ingresos por Proyecto
- `Sin clasificar` | Importación – revisar
- `INGRESOS POR PROEYCTO` – typo, corregir a Ingresos por Proyecto

---

## Cómo aplicar correcciones

1. **Script automático** (typos y unificaciones básicas):

   ```bash
   npx tsx scripts/normalizar-interactivo-csv.ts "CUENTAS DINERO PRESUPUESTO final_interactivo.csv"
   ```

   Genera `*_normalizado.csv` con las correcciones aplicadas.

2. **Correcciones manuales** recomendadas:
   - Revisar las 11 filas con `GASTOS DE LA AGENCIA` → cambiar a `Gastos de la Agencia`
   - Revisar las 2 filas con `NOMINA` → cambiar a `Nómina`
   - Revisar las 4 filas con `GASTOS DE LA AGENCIA` → cambiar a `Gastos de la Agencia`

---

## Top 50 por frecuencia

| # | Frec | Categoría | Detalle |
|---|------|-----------|---------|
| 1 | 855 | GASTOS PUBLICITARIOS | FB ADS |
| 2 | 426 | Sotware y suscripciones | MANYCHAT |
| 3 | 139 | Sotware y suscripciones | HOSTINGUER |
| 4 | 60 | Ingresos por Proyecto / Hotmart | VENTAS DICIEMBRE HOTMART |
| 5 | 43 | Gastos de la Agencia | Nómina |
| ... | ... | ... | ... |
