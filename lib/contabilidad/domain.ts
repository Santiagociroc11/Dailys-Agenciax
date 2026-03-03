/**
 * Modelo de dominio contable
 *
 * Define los conceptos y reglas de negocio de forma explícita,
 * para que el import y el balance sigan la misma lógica.
 */

// ─── Eventos contables (qué puede pasar en un movimiento) ───
export type MovimientoTipo =
  | 'ingreso'           // Entra dinero por ventas/cobros
  | 'gasto'             // Sale dinero por operación
  | 'traslado_bancos'   // Mueve entre cuentas (no afecta P&L)
  | 'traslado_utilidades' // Mueve utilidades entre proyectos (SALIDA+INGRESO CONTABLE)
  | 'reparticion';      // Pago a socio desde utilidades (reduce pendiente de liquidar)

// ─── Fórmula del balance de liquidación ───
// Balance = Ingresos - Gastos - Distribuciones
// Donde "Distribuciones" = todo lo que ya salió de las utilidades del proyecto:
//   - Traslados a otros proyectos (crédito a Utilidades)
//   - Reparticiones a socios (débito a Utilidades)
// Usamos max(credit, debit) porque SALIDA+INGRESO crean ambos; solo contamos una vez.
export const LIQUIDACION_FORMULA = 'income - expense - distribuciones_utilidades' as const;

// ─── Cuentas de utilidades (equity por proyecto) ───
export const UTILIDADES_ACCOUNT_PREFIX = 'Utilidades ';

// ─── Clasificación de filas CSV ───
export const CSV_PATTERNS = {
  SALIDA_CONTABLE: /SALIDA\s*CONTABLE/i,
  INGRESO_CONTABLE: /INGRESO\s*CONTABLE/i,
  REPARTICION: /REPARTO|REPARTICI[OÓ]N/i,
  CORTE_UTILIDADES: /CORTE\s*UTILIDADES/i,
  FONDO_LIBRE: /FONDO\s*LIBRE/i,
} as const;
