# Categorizador interactivo — Guía paso a paso

## ¿Qué hace?

Normaliza las categorías de tu CSV de transacciones. **Te pregunta** cuando no está seguro y **aprende** de tus respuestas para no volver a preguntar lo mismo.

---

## Conceptos: Categoría y Detalle

Cada transacción tiene dos campos que se rellenan:

| Campo | Qué es | Ejemplos |
|-------|--------|----------|
| **CATEGORÍA** | Tipo amplio del gasto/ingreso | Gastos de la Agencia, Software y Herramientas, Nómina, Retiros |
| **DETALLE** | Proveedor o concepto específico | Viaje, ManyChat, Coworking, Jorge Varela |

**Ejemplo:** Un vuelo a un evento Hotmart:
- Categoría: `Gastos de la Agencia`
- Detalle: `Viaje`

---

## Cómo se ve en pantalla

```
--- 1/2071 ---
[GASTO] AGENCIA X | "VUELOS HOTMART"
  Desc: Card charge (LATAM AIRLINES COLOMBI)

  IA: Ingresos por Proyecto / Hotmart

>
```

- **Línea 1:** Número de transacción, si es ingreso o gasto, proyecto, categoría original del CSV
- **Desc:** Descripción original
- **IA:** Sugerencia de la IA (Categoría / Detalle)
- **>** Espera tu respuesta

---

## Qué puedes escribir

### 1. Enter (vacío)
**Aceptas** la sugerencia de la IA.

```
> [Enter]
```

### 2. Corregir: `categoria, detalle`
La IA se equivocó. Escribes la **categoría**, una **coma**, y el **detalle**.

```
> Gastos de la Agencia, Viaje
```

Importante: **tiene que haber una coma** entre categoría y detalle. Si no hay coma, se interpreta como "aceptar".

### 3. Saltar: `s`
Dejas la categoría original del CSV (sin normalizar). Si vuelve a aparecer el mismo patrón, te preguntará otra vez.

```
> s
```

### 4. Mantener y aprender: `k`
Dejas la categoría original y le dices que **no vuelva a preguntar** por ese patrón.

```
> k
```

### 5. Salir: `q`
Guardas lo procesado y sales. Puedes continuar más tarde.

```
> q
```

---

## Ejemplos completos

### Ejemplo 1: La IA se equivoca (VUELOS = gasto, no ingreso)

```
[GASTO] AGENCIA X | "VUELOS HOTMART"
  Desc: Card charge (LATAM AIRLINES COLOMBI)
  IA: Ingresos por Proyecto / Hotmart

> Gastos de la Agencia, Viaje
```

### Ejemplo 2: La IA acierta

```
[GASTO] AGENCIA X | "MANYCHAT"
  Desc: Pago mensual ManyChat
  IA: Software y Herramientas / ManyChat

> [Enter]
```

### Ejemplo 3: Quieres dejar el original tal cual

```
[?] JSD | "ALGO RARO"
  Desc: No sé qué es esto
  IA: GASTO NO IDENTIFICADO / Algo raro

> k
```
(Así no te volverá a preguntar por "ALGO RARO")

---

## Errores frecuentes

| Error | Qué pasa | Cómo hacerlo bien |
|-------|----------|-------------------|
| Escribir solo la categoría | Se interpreta como "aceptar" | Siempre usa `categoria, detalle` |
| Olvidar la coma | Se interpreta como "aceptar" | `Gastos de la Agencia, Viaje` |
| Escribir "corregir" o "c" | No es un comando | Escribe directo: `categoria, detalle` |

---

## Resumen rápido

1. **IA correcta** → Enter
2. **IA incorrecta** → `categoria, detalle` (con coma)
3. **Dejar original, que pregunte otra vez** → `s`
4. **Dejar original, que no pregunte más** → `k`
5. **Parar y guardar** → `q`
