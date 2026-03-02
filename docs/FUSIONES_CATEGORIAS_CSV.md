# Análisis y fusiones de categorías (CSV categorizador)

Revisión de las 23 categorías generadas por el agente categorizador y recomendaciones de fusión.

---

## 1. Fusiones directas (categoría → categoría)

| Categoría actual | Fusionar en | Motivo |
|-----------------|-------------|--------|
| **FLODESK** | Suscripciones | Herramienta de email marketing, pago recurrente |
| **MANYCHAT** | Suscripciones | Chatbot/automatización, pago recurrente |
| **Servicios de Streaming** | Suscripciones | StreamYard es suscripción mensual |
| **FB ADS** | Marketing | Facebook Ads = publicidad pagada |
| **[INFOPRODUCTOS X] UTILIDADES 15 JUN** | Distribución de Utilidades | Corte específico de utilidades |

**Resultado:** 23 → 18 categorías.

---

## 2. Duplicaciones y solapamientos

### Software vs Suscripciones
Muchas herramientas aparecen en ambas:
- ChatGPT, MailerLite, ManyChat, StreamYard, Stape, Flodesk, Sendflow, Google One

**Criterio recomendado:** Si es pago **recurrente** (mensual/anual) → **Suscripciones**. Si es compra **única** o licencia perpetua → **Software**. En la práctica, la mayoría son suscripciones.

### Servicios de Hosting
Incluye STAPE (facturación electrónica) y STREAMYARD (streaming), que no son hosting. El modelo los agrupó por "servicio digital". Opcional: mover STAPE y StreamYard a Suscripciones/Software.

### Adveronix
Aparece en Software, Marketing y Servicios Profesionales. Es una agencia de marketing/desarrollo. **Recomendación:** Servicios Profesionales (es un proveedor externo).

### Pagos a Equipo vs Nómina vs Comisiones
- **Pagos a Equipo:** Adelantos, bonos, pagos puntuales al equipo (no nómina fija).
- **Nómina:** Sueldos regulares, pagos a colaboradores por trabajo.
- **Comisiones:** Porcentaje por ventas/cierre.

Mantener separadas; el modelo las distinguió bien.

---

## 3. GASTO NO IDENTIFICADO – Reasignaciones

Varios detalles dentro de esta categoría deberían moverse:

| Detalle actual | Mover a |
|---------------|---------|
| CORTE UTILIDADES, UTILIDADES GERSSON L5 | Distribución de Utilidades |
| COMIDA GERSSON, COMIDA EQUIPO | Comidas a Equipo |
| TRASLADO A AGENCIA X | Transferencias Internas |
| PAGO PRESTAMO | Cuentas por Pagar |
| Importación | (revisar manualmente) |

---

## 4. Categorías finales recomendadas (18)

Tras aplicar fusiones:

1. Saldos Iniciales  
2. Educación  
3. Cuentas por Pagar  
4. Servicios de Hosting  
5. Software  
6. Suscripciones *(incluye FLODESK, MANYCHAT, Servicios de Streaming)*  
7. Pagos a Terceros  
8. Transferencias Internas  
9. Retiros  
10. Ingresos por Proyecto  
11. Distribución de Utilidades *(incluye [INFOPRODUCTOS X] UTILIDADES 15 JUN)*  
12. Comisiones  
13. Pagos a Equipo  
14. Servicios Profesionales  
15. Nómina  
16. Marketing *(incluye FB ADS)*  
17. GASTO NO IDENTIFICADO  
18. Comidas a Equipo  

---

## 5. Cómo aplicar las fusiones

```bash
# 1. Fusionar categorías
npx tsx scripts/fusionar-categorias-csv.ts "CUENTAS DINERO PRESUPUESTO final_limpias.csv"
# → genera {nombre}_fusionado.csv

# 2. Normalizar detalles (agrupar variantes)
npx tsx scripts/normalizar-detalles-csv.ts "CUENTAS DINERO PRESUPUESTO final_limpias_fusionado.csv"
# → genera {nombre}_detalles_ok.csv
```

### Detalles que se agrupan

| Variantes | Canónico |
|-----------|----------|
| COMIDA GERSSON, COMIDA EQUIPO, Comida de equipo, Comida a equipo | Comida del equipo |
| MANYCHAT, Manychat, ManyChat | ManyChat |
| MAILERLITE, MAILER LITE | MailerLite |
| FACEBK *xxx, FB ADS | Facebook Ads |
| Hostinguer, HOSTINGUER | Hostinguer |
| VPS N8N agencia, VPS N8N Gersson, etc. | VPS N8N |
| ... (ver script para lista completa) |
