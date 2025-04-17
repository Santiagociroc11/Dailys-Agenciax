# Instrucciones para mostrar la estructura de la base de datos en Supabase

Para analizar correctamente tu base de datos y proporcionarte recomendaciones sobre qué eliminar o reestructurar, necesito información detallada sobre la estructura actual. Aquí te explico cómo obtener y compartirme esta información:

## Método 1: Usar el SQL Editor de Supabase

1. **Accede a tu dashboard de Supabase** y ve a tu proyecto.
2. **Navega a "SQL Editor"** en el menú lateral izquierdo.
3. Crea una **nueva consulta** haciendo clic en "New Query" o "+ New Query".
4. **Copia y pega** el contenido del archivo `db_schema_query.sql` que te he proporcionado.
5. Ejecuta la consulta haciendo clic en el botón "Run" o presionando Ctrl+Enter (o Cmd+Enter en Mac).
6. Cada consulta mostrará resultados diferentes. **Toma capturas de pantalla** de cada resultado o **exporta** los resultados como CSV si la interfaz lo permite.
7. Es especialmente importante capturar los resultados de:
   - Listado de tablas
   - Estructura detallada de tablas (columnas y tipos)
   - Relaciones entre tablas (claves foráneas)
   - Funciones definidas
   - Triggers
   - Vistas
8. Comparte esas capturas o archivos exportados conmigo.

## Método 2: Usar la herramienta de tablas de Supabase

1. **Accede a tu dashboard de Supabase** y ve a tu proyecto.
2. **Navega a "Table Editor"** en el menú lateral izquierdo.
3. Aquí verás todas tus tablas. Para cada tabla:
   - Toma capturas de pantalla de la estructura (columnas, tipos, etc.)
   - Haz clic en cada tabla y ve a la pestaña "Constraints" para ver las restricciones y relaciones.
   - Visita también la pestaña "Indexes" para ver los índices definidos.
4. **Navega a "Database" → "Functions"** para ver las funciones definidas.
   - Toma capturas de pantalla de la lista de funciones
   - Para cada función importante, haz clic en ella y captura su definición
5. **Navega a "Database" → "Triggers"** para ver los triggers.
   - Toma capturas de pantalla de los triggers y su configuración
6. **Navega a "Database" → "Views"** para ver las vistas definidas.
   - Toma capturas de pantalla de las vistas y sus definiciones
7. Comparte esas capturas conmigo.

## Método 3: Exportar esquema mediante CLI (opción avanzada)

Si tienes acceso a la línea de comandos y tienes instalado el CLI de PostgreSQL:

1. **Instala el CLI de PostgreSQL** si no lo tienes ya.
2. Ejecuta el siguiente comando para generar un archivo de esquema completo:
   ```bash
   pg_dump -h tu_host_supabase -U tu_usuario -d tu_base_de_datos --schema-only > schema.sql
   ```
   (Reemplaza los valores con tu configuración específica de Supabase)
3. Este archivo incluirá todas las tablas, funciones, triggers, vistas y procedimientos.
4. Comparte el archivo `schema.sql` generado conmigo.

## Revisar funciones y procedimientos (importante)

Las funciones, procedimientos y triggers contienen lógica de negocio crítica que puede afectar cómo funciona tu aplicación. Asegúrate de:

1. **Identificar las funciones principales** que utiliza tu aplicación.
2. **Capturar sus definiciones completas** (todo el código SQL).
3. Si hay funciones que se utilizan para mantener integridad referencial o actualizar datos, anótalas.
4. Si conoces funciones o triggers que ya no se utilizan, señálalas también.

## Información adicional útil

Además del esquema, es útil conocer:

1. **Cuáles son las tablas más utilizadas** y con qué frecuencia se accede a ellas.
2. **Qué tablas podrían estar obsoletas** o ya no se usan.
3. **Problemas específicos** que estés enfrentando con la estructura actual.
4. **Objetivos futuros** para la aplicación que podrían requerir cambios en la estructura.
5. **Patrones de consulta comunes** que realiza tu aplicación.
6. **Operaciones lentas o problemas de rendimiento** que hayas notado.

Con esta información, podré analizar completamente tu base de datos y recomendarte qué eliminar, cómo reestructurar o cómo optimizar para tus necesidades específicas. 