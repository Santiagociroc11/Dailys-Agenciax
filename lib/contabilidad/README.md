# Módulo Contabilidad

Modelo de dominio y servicios para el sistema contable.

## Estructura

- **domain.ts** — Conceptos: tipos de movimiento, fórmulas, patrones CSV
- **balanceService.ts** — Cálculo del balance (P&L + liquidación)
- **csvUtils.ts** — parseSpanishDate, parseAmount, isTrasladoBancos

## Fórmula del balance de liquidación

```
Balance = Ingresos - Gastos - Distribuciones
```

**Distribuciones** = todo lo que ya salió de las utilidades del proyecto:
- Traslados (SALIDA CONTABLE) → crédito a Utilidades del origen → se resta
- Reparticiones a socios → débito a Utilidades → se resta

Los débitos de traslados (INGRESO CONTABLE) son del destino y NO se restan.

## Tipos de movimiento (import CSV)

| Tipo | Descripción | Afecta P&L | Afecta liquidación |
|------|-------------|------------|---------------------|
| ingreso | Ventas, cobros | + | — |
| gasto | Operacional | − | — |
| traslado_bancos | Entre cuentas | no | no |
| traslado_utilidades | SALIDA+INGRESO CONTABLE | no (equity) | sí (resta) |
| reparticion | Pago a socio | no | sí (resta) |
