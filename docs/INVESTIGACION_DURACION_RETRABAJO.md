# Investigación: Duración del retrabajo y tiempo ya trabajado

## Preguntas

1. ¿El usuario puede reportar la duración del retrabajo?
2. ¿Ese reporte reemplaza el tiempo ya trabajado o se suma?

---

## 1. ¿Puede reportar la duración del retrabajo?

**Sí.** Cuando el usuario completa una tarea devuelta:

- Abre el modal con "Completar"
- El campo **"Tiempo real trabajado en esta sesión"** es obligatorio
- El valor se guarda en una nueva fila de `work_sessions` con `session_type = 'completion'`
- El modal siempre inicia con duración en 0 (no pre-llena con el tiempo anterior)

---

## 2. ¿Reemplaza o suma el tiempo ya trabajado?

**No reemplaza. Se suma.**

### Flujo actual

```
1. createWorkSession(assignmentId, durationMin, ...)
   → INSERT nueva fila en work_sessions (duration_minutes = lo que reportó)

2. SELECT * FROM work_sessions WHERE assignment_id = X

3. totalDuration = SUM(duration_minutes) de TODAS las sesiones

4. UPDATE task_work_assignments SET actual_duration = totalDuration
```

### Ejemplo

| Momento | Acción | work_sessions | actual_duration |
|---------|--------|---------------|-----------------|
| Día 1 | Primera entrega: 60 min | Session 1: 60 min | 60 |
| Día 2 | Devuelta por revisor | (sin cambio) | 60 |
| Día 3 | Retrabajo: 30 min | Session 1: 60, Session 2: 30 | **90** |

El total es 90 min (60 + 30), no 30.

---

## 3. Código relevante

```typescript
// UserProjectView.tsx - handleSubmitStatus
await createWorkSession(assignmentId, durationMin, statusDetails, sessionType);

if (selectedStatus === "completed") {
  const { data: sessions } = await supabase
    .from("work_sessions")
    .select("duration_minutes")
    .eq("assignment_id", assignmentId);

  const totalDuration = sessions.reduce((total, session) => 
    total + (session.duration_minutes || 0), 0);

  await supabase
    .from("task_work_assignments")
    .update({ actual_duration: totalDuration })
    .eq("id", assignmentId);
}
```

- Cada completado crea una **nueva** sesión.
- `actual_duration` se recalcula como suma de **todas** las sesiones.
- No se borran ni se sobrescriben sesiones anteriores.

---

## 4. Conclusión

| Pregunta | Respuesta |
|----------|-----------|
| ¿Puede reportar duración del retrabajo? | Sí |
| ¿Reemplaza el tiempo ya trabajado? | No, se suma al total |

El diseño actual es correcto: el retrabajo se suma al tiempo ya trabajado.

---

## 5. Mejora opcional de UX

Para que el usuario vea que no se reemplaza, se podría mostrar en el modal algo como:

> "Tiempo ya registrado en esta tarea: 60 min. Ingresa el tiempo adicional de retrabajo:"

Eso requeriría consultar las sesiones existentes antes de abrir el modal y mostrarlas en la UI.
