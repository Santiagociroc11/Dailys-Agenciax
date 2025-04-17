-- Consulta para obtener todas las tablas de la base de datos
SELECT 
    tablename 
FROM 
    pg_catalog.pg_tables
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename;

-- Consulta para obtener la estructura detallada de cada tabla (columnas, tipos, restricciones)
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    (SELECT pg_catalog.obj_description(oid) 
     FROM pg_catalog.pg_class 
     WHERE relname = t.table_name) AS table_comment,
    pgd.description AS column_comment
FROM 
    information_schema.tables t
JOIN 
    information_schema.columns c ON t.table_name = c.table_name
LEFT JOIN 
    pg_catalog.pg_description pgd ON 
        pgd.objoid = (SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name) AND
        pgd.objsubid = c.ordinal_position
WHERE 
    t.table_schema = 'public' AND
    t.table_type = 'BASE TABLE'
ORDER BY 
    t.table_name, 
    c.ordinal_position;

-- Consulta para obtener todas las claves primarias
SELECT
    tc.table_name, 
    kc.column_name 
FROM 
    information_schema.table_constraints tc
JOIN 
    information_schema.key_column_usage kc ON 
        kc.constraint_name = tc.constraint_name AND
        kc.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'PRIMARY KEY' AND
    tc.table_schema = 'public'
ORDER BY 
    tc.table_name,
    kc.column_name;

-- Consulta para obtener todas las claves foráneas y relaciones
SELECT
    tc.table_name AS table_name, 
    kcu.column_name AS column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
JOIN 
    information_schema.key_column_usage AS kcu ON 
        tc.constraint_name = kcu.constraint_name AND
        tc.table_schema = kcu.table_schema
JOIN 
    information_schema.constraint_column_usage AS ccu ON 
        ccu.constraint_name = tc.constraint_name AND
        ccu.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY' AND
    tc.table_schema = 'public'
ORDER BY 
    tc.table_name,
    kcu.column_name;

-- Consulta para obtener todas las restricciones (UNIQUE, CHECK, etc.)
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM
    information_schema.table_constraints tc
JOIN
    information_schema.key_column_usage kcu ON 
        tc.constraint_name = kcu.constraint_name AND
        tc.table_schema = kcu.table_schema
WHERE
    tc.table_schema = 'public' AND
    tc.constraint_type NOT IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY
    tc.table_name,
    tc.constraint_name,
    kcu.column_name;

-- Consulta para obtener todos los índices
SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary
FROM
    pg_class t,
    pg_class i,
    pg_index ix,
    pg_attribute a
WHERE
    t.oid = ix.indrelid AND
    i.oid = ix.indexrelid AND
    a.attrelid = t.oid AND
    a.attnum = ANY(ix.indkey) AND
    t.relkind = 'r' AND
    t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY
    t.relname,
    i.relname,
    a.attnum;

-- Consulta para obtener todas las funciones definidas
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS function_arguments,
    pg_get_function_result(p.oid) AS function_result,
    l.lanname AS language,
    CASE WHEN p.prosecdef THEN 'security definer' ELSE 'security invoker' END AS security,
    pg_get_functiondef(p.oid) AS function_definition,
    obj_description(p.oid, 'pg_proc') AS description
FROM 
    pg_proc p
LEFT JOIN 
    pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN 
    pg_language l ON p.prolang = l.oid
WHERE 
    n.nspname = 'public'
ORDER BY 
    n.nspname,
    p.proname;

-- Consulta para obtener todas las vistas
SELECT 
    table_name AS view_name, 
    view_definition 
FROM 
    information_schema.views 
WHERE 
    table_schema = 'public' 
ORDER BY 
    table_name;

-- Consulta para obtener todos los triggers
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement,
    event_object_table
FROM 
    information_schema.triggers
WHERE 
    trigger_schema = 'public'
ORDER BY 
    event_object_table,
    trigger_name;

-- Consulta para obtener todas las secuencias
SELECT 
    sequence_name,
    data_type,
    start_value,
    minimum_value,
    maximum_value,
    increment
FROM 
    information_schema.sequences
WHERE 
    sequence_schema = 'public'
ORDER BY 
    sequence_name;

-- Consulta para obtener permisos y roles
SELECT 
    grantee,
    table_name,
    privilege_type
FROM 
    information_schema.table_privileges 
WHERE 
    table_schema = 'public'
ORDER BY 
    grantee,
    table_name,
    privilege_type;

-- Consulta para obtener información sobre extensiones instaladas
SELECT 
    name,
    default_version,
    installed_version,
    comment
FROM 
    pg_available_extensions
WHERE 
    installed_version IS NOT NULL
ORDER BY 
    name; 