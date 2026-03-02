# Revisión de huérfanas (1 transacción cada una)

Revisar cada una y decidir: **¿Mantener, fusionar con otra categoría/detalle, o cambiar?**

## Modo interactivo (recomendado)

```bash
npm run revisar:huerfanas
# o
npx tsx scripts/revisar-huerfanas.ts "CUENTAS DINERO PRESUPUESTO final_interactivo.csv"
```

El script muestra por cada huérfana:
- **Transacción completa** (fecha, tipo, proyecto, descripción, categoría, detalle)
- **Montos por cuenta** (IMPORTE CONTABLE, CUENTA JUAN CARLOS, etc.)
- **Todas las columnas** con valores no vacíos
- **Transacciones cercanas** (2 filas antes y después)
- **Similares** (mismo proyecto, descripción o categoría parecida)
- **Sugerencia** con razón

**Comandos:** `A`=aceptar, `B`=mantener, `C,d`=corregir, `S`=saltar, `Q`=salir

El aprendizaje se guarda en `huerfanas_aprendizaje.json` para futuras ejecuciones.

---

---

## 1. PARTE JERWIN - ADELANTO AV VILLAS
- **Fila:** 9
- **Fecha:** 1 nov 2023 | **Proyecto:** AGENCIA X
- **Descripción:** PARTE JERWIN - ADELANTO AV VILLAS
- **Actual:** Categoría = PARTE JERWIN - ADELANTO AV VILLAS, Detalle = PARTE JERWIN - ADELANTO AV VILLAS

**Sugerencia:** `REPARTICION UTILIDADES SOCIOS | JERWIN` (es adelanto a socio)

---

## 2. Ingresos | PLATA GIORGIO DEUDA
- **Fila:** 13
- **Fecha:** 1 nov 2023 | **Proyecto:** GIGI
- **Descripción:** PLATA GIORGIO DEUDA
- **Actual:** Categoría = Ingresos, Detalle = PLATA GIORGIO DEUDA

**Sugerencia:** `Ingresos por Proyecto | GIGI` (ingreso del proyecto GIGI)

---

## 3. GASTOS DE LA AGENCIA | TRATO DANIEL CANIZO
- **Fila:** 35
- **Fecha:** 26 dic 2023 | **Proyecto:** GERSSON L1
- **Descripción:** TRATO DANIEL CANIZO - GERSSON
- **Actual:** GASTOS DE LA AGENCIA | TRATO DANIEL CANIZO

**Sugerencia:** `Gastos de la Agencia | Trato Daniel Canizo` (unificar mayúsculas; es gasto de agencia/trato comercial)

---

## 4. Gastos de la Agencia | COSTO ANUAL PAYONEER
- **Fila:** 79
- **Fecha:** 1 feb 2024 | **Proyecto:** AGENCIA X
- **Descripción:** COSTO ANUAL PAYONEER
- **Actual:** Gastos de la Agencia | COSTO ANUAL PAYONEER

**Sugerencia:** Mantener o `Gastos de la Agencia | Comisiones y costos bancarios`

---

## 5. Ingresos por Proyecto | VENTA JSD Y COMPENSACION INICIAL
- **Fila:** 88
- **Fecha:** 10 feb 2024 | **Proyecto:** JSD
- **Descripción:** SALDO INICIAL
- **Actual:** Ingresos por Proyecto | VENTA JSD Y COMPENSACION INICIAL

**Sugerencia:** `Ingresos por Proyecto | JSD` o `Ingresos por Proyecto | Saldos Iniciales` (similar a otras entradas JSD)

---

## 6. Sotware y suscripciones | TOKECHAT
- **Fila:** 92 | **Proyecto:** AGENCIA X
- **Descripción:** TOKECHAT

**Sugerencia:** Mantener (Software correcto). Corregir "Sotware" → "Software".

---

## 7. Sotware y suscripciones | CAPTIONS
- **Fila:** 266 | **Proyecto:** AGENCIA X
- **Descripción:** CAPTIONS

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 8. Sotware y suscripciones | IPSTACK
- **Fila:** 275 | **Proyecto:** GERSSON L4
- **Descripción:** IPSTACK

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 9. GASTOS PUBLICITARIOS | TIKTOK ADS
- **Fila:** 315 | **Proyecto:** GERSSON L5
- **Descripción:** TIKTOK ADS

**Sugerencia:** Mantener (publicidad TikTok). Unificar a `Gastos Publicitarios | TikTok Ads`.

---

## 10. Sotware y suscripciones | UCHAT
- **Fila:** 322 | **Proyecto:** GERSSON L5
- **Descripción:** UCHAT

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 11. Sotware y suscripciones | VOIP
- **Fila:** 324 | **Proyecto:** GERSSON L5
- **Descripción:** VOIP PRUEBA

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 12. Sotware y suscripciones | SENDMAILS
- **Fila:** 326 | **Proyecto:** GERSSON L6
- **Descripción:** SENDMAILS

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 13. Ingresos por Proyecto | AGENCIA X
- **Fila:** 365 | **Proyecto:** AGENCIA X
- **Descripción:** PAYONEER

**Sugerencia:** Mantener o `Ingresos por Proyecto | Traslados` (ingreso Payoneer a AGENCIA X)

---

## 14. Gastos de la Agencia | DANIEL ADELANTO
- **Fila:** 379 | **Proyecto:** GERSSON L6
- **Descripción:** DANIEL ADELANTO

**Sugerencia:** `REPARTICION UTILIDADES SOCIOS | DANIEL` o mantener si es adelanto operativo

---

## 15. Sotware y suscripciones | EASYPANEL
- **Fila:** 385 | **Proyecto:** AGENCIA X
- **Descripción:** EASYPANEL

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 16. Gastos de la Agencia | Contratos
- **Fila:** 450 | **Proyecto:** AGENCIA X
- **Descripción:** CONTRATOS ANDRES RENDON

**Sugerencia:** Mantener o `Gastos de la Agencia | Nómina` si es pago a freelancer

---

## 17. Gastos de la Agencia | PRESTAMO A GERSSON DE THRIVE
- **Fila:** 458 | **Proyecto:** GERSSON L7
- **Descripción:** Prestamo a un miembro del equipo

**Sugerencia:** `PRESTAMOS | GERSSON` (hay categoría PRESTAMOS con SANTIAGO)

---

## 18. Gastos de la Agencia | PAGOS COMISIONES
- **Fila:** 460 | **Proyecto:** GERSSON L6
- **Descripción:** PAGO COMISIONES L6

**Sugerencia:** `Gastos de la Agencia | PAGOS PENDIENTES` (comisiones pendientes)

---

## 19. INGRESOS POR PROEYCTO | ADRIANA
- **Fila:** 567 | **Proyecto:** AGENCIA X
- **Descripción:** UTILIDADES ADRIANA | Importe: $ 2,129

**Sugerencia:** `CORTE UTILIDADES | ADRIANA` (es pago de utilidades, no ingreso por proyecto)

---

## 20. Sotware y suscripciones | SUPABASE
- **Fila:** 589 | **Proyecto:** GERSSON L7
- **Descripción:** Card charge (SUPABASE)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 21. Sotware y suscripciones | WHATZAPPER
- **Fila:** 611 | **Proyecto:** GERSSON L7
- **Descripción:** Card charge (Paypro 448003688867)

**Sugerencia:** Mantener (WhatsApp API). Corregir typo categoría.

---

## 22. Gastos de la Agencia | FIVEER
- **Fila:** 722 | **Proyecto:** AGENCIA X
- **Descripción:** Pago por verificación de app hotapi

**Sugerencia:** `Gastos de la Agencia | Fiverr` (typo) o `Software y suscripciones | Fiverr` si es servicio

---

## 23. Sotware y suscripciones | IA REUNIONES
- **Fila:** 770 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (READ - MEETING MANAGER)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 24. CORTE UTILIDADES | INFOPRODUCTOS X
- **Fila:** 801 | **Proyecto:** FONDO LIBRE
- **Descripción:** UTILIDADES A 15 DE JULIO | Importe: $ 2,596

**Sugerencia:** Mantener (corte utilidades Infoproductos X)

---

## 25. Sotware y suscripciones | CHATWOOT
- **Fila:** 1176 | **Proyecto:** GERSSON L8
- **Descripción:** Card charge (CHATWOOT)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 26. Sotware y suscripciones | COCOCUT
- **Fila:** 1203 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (COCOCUT)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 27. Sotware y suscripciones | HEYGEN
- **Fila:** 1257 | **Proyecto:** GERSSON L8
- **Descripción:** Card charge (HEYGEN TECHNOLOGY INC.)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 28. Sotware y suscripciones | PLATAFORMA COPY
- **Fila:** 1315 | **Proyecto:** AGENCIA X
- **Descripción:** PAGO PLATAFORMA COPY

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 29. CORTE UTILIDADES | EXCEDENTE
- **Fila:** 1407 | **Proyecto:** FONDO LIBRE
- **Descripción:** TRASLADO EXCEDENTE PARA REPARTIR | Importe: $ 50,518

**Sugerencia:** Mantener (traslado para repartir)

---

## 30. Sin clasificar | Importación
- **Fila:** 1549 | **Proyecto:** (vacío)
- **Descripción:** Sin descripción

**Sugerencia:** Revisar fila original en CSV; posiblemente eliminar o `Ingresos por Proyecto | Sin clasificar`

---

## 31. Gastos de la Agencia | MENTORIA JUANITA
- **Fila:** 1683 | **Proyecto:** AGENCIA X
- **Descripción:** Payment to Elevatech LLC

**Sugerencia:** Mantener o `Gastos de la Agencia | CURSOS` (mentoría = capacitación)

---

## 32. Gastos de la Agencia | CONTADORES LLC
- **Fila:** 1716 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (VANGUARD BUSINESS)

**Sugerencia:** Mantener o `Gastos de la Agencia | Servicios profesionales`

---

## 33. Sotware y suscripciones | ARTLIST
- **Fila:** 1728 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (WWW.ARTLIST.IO)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## 34. Gastos de la Agencia | CURSO HOTMART
- **Fila:** 1737 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (DLO*Hotmart)

**Sugerencia:** `Gastos de la Agencia | CURSOS` (unificar con otros cursos)

---

## 35. Gastos de la Agencia | Viaje
- **Fila:** 1791 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (LATAM AIRLINES COLOMBI)

**Sugerencia:** Mantener (viaje correcto)

---

## 36. Sotware y suscripciones | PRUEBA PDF
- **Fila:** 1799 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (SGT*abestpdfcom)

**Sugerencia:** Mantener o `Software y suscripciones | PDF` (herramienta PDF)

---

## 37. Gastos de la Agencia | CUADRE COMISIONES
- **Fila:** 1806 | **Proyecto:** GERSSON L9
- **Descripción:** Payment to Gersson Lopez

**Sugerencia:** `REPARTICION UTILIDADES SOCIOS | GERSSON` o `Gastos de la Agencia | PAGOS PENDIENTES`

---

## 38. Gastos de la Agencia | Regalos Clientes
- **Fila:** 1822 | **Proyecto:** AGENCIA X
- **Descripción:** Payment to Bancolombia (5406)

**Sugerencia:** Mantener (regalo a cliente)

---

## 39. Gastos de la Agencia | FIVER
- **Fila:** 1919 | **Proyecto:** SANTIAGO
- **Descripción:** Card charge (www.fiverr.com)

**Sugerencia:** `Gastos de la Agencia | Fiverr` (corregir typo) o `Servicios Profesionales | Fiverr`

---

## 40. Sotware y suscripciones | AMERICAN SWIPE
- **Fila:** 2060 | **Proyecto:** AGENCIA X
- **Descripción:** Card charge (LLAMERICANSW)

**Sugerencia:** Mantener. Corregir typo categoría.

---

## Resumen de cambios sugeridos

| Tipo | Cantidad | Acción |
|------|----------|--------|
| Corregir "Sotware" | 15 | Software y suscripciones |
| Reasignar categoría | ~12 | Ver sugerencias arriba |
| Corregir typos detalle | 2 | FIVEER→Fiverr, FIVER→Fiverr |
| Mantener | ~11 | Ya están bien clasificadas |
