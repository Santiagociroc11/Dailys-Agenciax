# Estructura Categoría + Detalle como Subcuentas

## Resumen

El import de CSV usa **Categoría** y **Detalle** como subcuentas jerárquicas en el plan de cuentas.

## Columnas CSV esperadas

| Columna | Uso |
|---------|-----|
| **CATEGORIA/DETALLE** | Categoría (subcuenta nivel 2): Gastos de la Agencia, Software y suscripciones, etc. |
| **DETALLE** | Detalle (subcuenta nivel 3): MANYCHAT, FB ADS, Viaje, etc. |
| **DESCRIPCION** | Texto del movimiento |

## Jerarquía en el plan de cuentas

```
5195 - Gastos operacionales
├── 5195-01 Gastos de la Agencia (categoría)
│   ├── 5195-01-01 Viaje (detalle)
│   ├── 5195-01-02 Coworking (detalle)
│   └── ...
├── 5195-02 Software y suscripciones
│   ├── 5195-02-01 MANYCHAT
│   ├── 5195-02-02 CHATGPT
│   └── ...
└── 5195-03 Gastos Publicitarios
    ├── 5195-03-01 FB ADS
    └── ...

4135 - Ingresos operacionales
├── 4135-01 Ingresos por Proyecto
│   ├── 4135-01-01 Hotmart
│   └── ...
└── ...
```

## Lógica del import

1. Si hay columna **DETALLE** y tiene valor → se crea subcuenta bajo la categoría.
2. Si no hay detalle → se crea cuenta plana (solo categoría).
3. Las transacciones se registran en la **subcuenta hoja** (detalle).
4. La estructura es **transversal**: misma categoría/detalle en todos los proyectos.

## Compatibilidad

- CSV sin columna DETALLE: funciona igual que antes (solo categoría).
- `category_mapping` en el body del import: se aplica al `categoryName` final (Categoría - Detalle).
