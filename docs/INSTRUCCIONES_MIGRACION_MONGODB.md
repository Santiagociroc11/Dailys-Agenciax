# Instrucciones para replicar la migración Supabase → MongoDB

Este documento describe cómo pedirle a otro desarrollador AI que replique la migración de Supabase (PostgreSQL) a MongoDB. **Es genérico**: aplica a cualquier dominio (clientes, asesores, ventas, reportes, etc.), no solo a gestión de tareas.

---

## Prompt sugerido para otro Dev AI

Copia y pega este prompt en tu **otro proyecto** (el de clientes, asesores, ventas, reportes):

```
Necesito migrar mi aplicación de Supabase (PostgreSQL) a MongoDB. El patrón de migración está en el proyecto Dailys-Agenciax. Mi proyecto es de [clientes / asesores / ventas / reportes / etc.] — las tablas y RPCs son distintas, pero la arquitectura debe ser la misma.

## 1. ARQUITECTURA OBJETIVO

- **Backend**: Express con Mongoose. La API mantiene compatibilidad con el cliente existente (API estilo Supabase).
- **Frontend**: Sin cambios. Sigue usando `db.from('tabla').select()`, `insert()`, `update()`, `delete()`, `upsert()` y `rpc()`.
- **Capa de abstracción**: Un cliente (`dbClient`) que envía requests a `/api/db/query` y `/api/db/rpc`. El servidor traduce esos requests a operaciones MongoDB.

## 2. COMPONENTES A CREAR/ADAPTAR

### A) Conexión MongoDB
- Archivo `lib/mongoose.ts`: conexión con `MONGODB_URI`, cache para evitar múltiples conexiones en dev.
- Variable de entorno: `MONGODB_URI` en `.env`.

### B) Modelos Mongoose
Crear modelos para **cada tabla que uses en Supabase** (ej. clients, advisors, sales, reports, users, app_settings, etc.). Mantener el campo `id` (string UUID) como identificador principal además de `_id`. Los schemas deben usar `id: { type: String, unique: true }` para compatibilidad con el frontend.

### C) Capa de query (traductor Supabase → MongoDB)
- `lib/db/queryBuilder.ts`: convierte filtros estilo Supabase (eq, in, gte, lte, or, contains) a `FilterQuery` de Mongoose.
- `lib/db/queryExecutor.ts`: ejecuta select/insert/update/delete/upsert contra los modelos Mongoose.
- `lib/db/models.ts`: mapeo tabla → modelo Mongoose.
- `lib/db/types.ts`: tipos QueryRequest, QueryResponse, QueryFilter.

### D) API REST
- `api/db.ts`: handlers `handleDbQuery` (POST /api/db/query) y `handleDbRpc` (POST /api/db/rpc).
- `handleDbRpc`: reimplementar **todas las funciones RPC** que usaba Supabase (ej. reportes por cliente, ventas por asesor, métricas, etc.) usando agregaciones MongoDB o queries Mongoose.

### E) Cliente frontend
- `src/lib/dbClient.ts`: envía a `/api/db/query` y `/api/db/rpc`. Asegurar que `VITE_API_URL` apunte al backend.
- `src/lib/supabase.ts`: reexportar `db` desde dbClient (el frontend importa desde aquí).

### F) Script de migración
- `scripts/migrate-supabase-to-mongodb.ts`: lee de Supabase con el cliente JS, escribe en MongoDB con Mongoose.
- Migrar **todas las tablas** en orden respetando foreign keys (primero tablas sin dependencias: users, clients, etc.; luego las que referencian: sales, reports, etc.).
- Usar `findOneAndUpdate(..., { upsert: true })` para cada registro.
- Convertir fechas ISO string → Date donde corresponda.
- Mapear campos que puedan venir de tablas relacionadas (ej. client_id, advisor_id) según tu esquema.

## 3. DETALLES TÉCNICOS IMPORTANTES

- **Joins**: El queryExecutor debe soportar filtros por tablas relacionadas. Usar `$lookup` en agregaciones o resolver filtros antes de ejecutar.
- **Timestamps**: Mongoose usa `createdAt`/`updatedAt`; la API puede enviar `created_at`/`updated_at`. Soportar ambos en filtros de fecha si aplica.
- **RPCs**: Cada RPC de Supabase debe reimplementarse con agregaciones MongoDB o queries Mongoose directas (reportes, métricas, dashboards, etc.).
- **Índices**: Crear índice único en `id` para cada colección. Índices en campos de búsqueda frecuente (client_id, advisor_id, date, status, etc.).

## 4. ORDEN DE IMPLEMENTACIÓN

1. Instalar: mongoose, dotenv, @supabase/supabase-js, tsx
2. Crear lib/mongoose.ts y modelos Mongoose (según tus tablas)
3. Crear lib/db/ (queryBuilder, queryExecutor, models, types)
4. Crear api/db.ts y registrar rutas en server
5. Implementar handleDbRpc para cada función RPC usada en el frontend
6. Crear script migrate-supabase-to-mongodb.ts con tus tablas
7. Ejecutar migración: `npx tsx scripts/migrate-supabase-to-mongodb.ts`
8. Scripts post-migración si aplica (campos nuevos, correcciones de datos)

## 5. VARIABLES DE ENTORNO

```
MONGODB_URI=mongodb://...
VITE_SUPABASE_URL=...        # solo para migración
VITE_SUPABASE_ANON_KEY=...   # solo para migración
VITE_API_URL=...             # URL del backend para el frontend
```

## 6. REFERENCIA (código de ejemplo)

Revisa el proyecto Dailys-Agenciax como referencia de la arquitectura (el dominio es distinto, pero el patrón es el mismo):
- scripts/migrate-supabase-to-mongodb.ts — estructura del script de migración
- lib/mongoose.ts — conexión
- lib/db/queryExecutor.ts, queryBuilder.ts, models.ts — capa de query
- api/db.ts — handlers y ejemplos de RPCs con agregaciones MongoDB
- models/*.ts — ejemplos de schemas Mongoose
```

---

## Archivos clave de referencia (en Dailys-Agenciax)

Usa estos archivos como **patrón**, no como copia literal. Tu proyecto tendrá otras tablas (clientes, asesores, ventas, reportes) y otras RPCs:

| Componente | Archivo en Dailys-Agenciax |
|------------|----------------------------|
| Script migración | `scripts/migrate-supabase-to-mongodb.ts` |
| Conexión DB | `lib/mongoose.ts` |
| Query executor | `lib/db/queryExecutor.ts` |
| Query builder | `lib/db/queryBuilder.ts` |
| API handlers + RPCs | `api/db.ts` |
| Cliente frontend | `src/lib/dbClient.ts` |
| Modelos | `models/*.ts` |

---

## Diferencia clave

- **Dailys-Agenciax**: dominio de tareas, proyectos, asignaciones, horas.
- **Tu proyecto**: dominio de clientes, asesores, ventas, reportes.

La arquitectura (Express + Mongoose, capa query, API compatible Supabase, script de migración) es la misma. Solo cambian las tablas, modelos y lógica de las RPCs.

---

## Comando para ejecutar la migración (en tu proyecto)

```bash
npx tsx scripts/migrate-supabase-to-mongodb.ts
```
