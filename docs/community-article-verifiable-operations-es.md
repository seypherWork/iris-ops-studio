# Más allá de HTTP 200: operaciones administrativas verificables para InterSystems IRIS

Que una petición administrativa devuelva HTTP 200 indica que el servidor la ha
aceptado y procesado. Por sí solo, no demuestra que el objetivo haya alcanzado
el estado que pretendía el operador.

Esa diferencia importa al suspender un proceso, ejecutar una tarea programada,
cambiar los roles de un usuario o modificar los permisos de recursos de un rol.
Por eso, la versión 1.1.0 de IRIS Ops Studio trata la respuesta como la
mitad del flujo, no como su final.

> Nota de validación: la implementación y las pruebas automatizadas y con mock
> descritas aquí pasaron. Los flujos de usuarios, roles, procesos y tareas
> también se comprobaron en una instancia desechable de IRIS 2026.2. Estas
> protecciones del navegador no sustituyen la autorización del servidor IRIS;
> el informe de validación detalla la evidencia.

## El flujo: Preview → Confirm → Execute → Readback

Para una mutación compatible, Ops Studio ejecuta cuatro etapas explícitas:

1. **Preview** — lee el objeto actual y calcula el estado esperado.
2. **Confirm** — exige una frase ligada al objetivo, por ejemplo
   `SUSPEND PROCESS 8421`.
3. **Execute** — envía la petición documentada a SysAdmin API.
4. **Readback** — realiza un segundo GET y compara el estado observado con el
   esperado.

El journal de operaciones registra un resultado preciso:

- `verified` cuando la segunda lectura coincide;
- `pending` cuando la tarea fue aceptada pero no terminó dentro de la ventana
  acotada de comprobación;
- `mismatch` cuando el recurso sigue accesible, pero no alcanzó el estado
  esperado;
- `error` cuando falla la propia lectura de verificación;
- `unverified` para una mutación personalizada del API Explorer sin contrato de
  comprobación conocido;
- `demo-verified` cuando la transición se reproduce con datos de demostración y
  no contra una instancia IRIS real.

Una actualización de permisos puede quedar `blocked / stale` si el objeto
cambia después del preview. El resultado se registra sin enviar el `PUT`.

El vocabulario es deliberadamente conservador: una respuesta HTTP correcta no
se convierte silenciosamente en una verificación correcta.

## Contratos de comprobación para procesos y tareas

La regla depende de cada operación:

| Operación | Ejecución | Verificación |
| --- | --- | --- |
| Suspender proceso | `POST /v2/process/suspend?id=…` | `GET /v2/process?id=…` informa de estado suspendido |
| Reanudar proceso | `POST /v2/process/resume?id=…` | El estado ya no está suspendido |
| Terminar proceso | `POST /v2/process/terminate?id=…` | `GET /v2/process?id=…` devuelve HTTP 404 |
| Suspender/reanudar tarea | `POST /v2/task/{suspend,resume}?id=…` | `GET /v2/task/info?id=…` devuelve el booleano `Suspended` esperado |
| Ejecutar tarea | `POST /v2/task/run?id=…` | Tras refrescar la referencia previa, cambia `LastFinished` sin estado de ejecución ni de error |

La terminación es un buen ejemplo: en esa operación, “no encontrado” no es un
error que ocultar, sino evidencia positiva de que el proceso ya no existe.

## Cambios de permisos sin reenviar toda la respuesta

El espacio Access control deja de ser únicamente un inventario.

Para modificar los roles de un usuario, el cliente:

1. lee `GET /v2/security/user?name=…`;
2. extrae solo los campos que el esquema User oficial documenta como mutables;
3. añade o elimina el valor seleccionado de `Roles`;
4. vuelve a leer el objeto justo antes de ejecutar y bloquea si ha cambiado;
5. envía `PUT /v2/security/user?name=…`;
6. vuelve a leer el usuario y verifica la colección Roles completa.

Los cambios de recursos de un rol siguen el mismo patrón mediante
`GET, PUT /v2/security/role`. Se conservan los permisos ajenos a la
modificación, se verifica el conjunto completo y las cadenas se normalizan al
orden documentado `R`, `W` y `U`. Las colecciones ausentes, mal formadas o con
duplicados se rechazan de forma segura.

El flujo guiado excluye las identidades administrativas integradas e impide
editar directamente roles cuyo nombre empieza por `%`. El Explorer mantiene la
posibilidad de realizar peticiones avanzadas, pero no las presenta como
verificadas automáticamente.

## Un Incident Timeline con tres fuentes de evidencia

La verificación resulta útil si el operador puede revisarla en la misma sesión.
El nuevo Incident Timeline normaliza tres fuentes:

- registros asíncronos de auditoría de seguridad;
- historial de ejecución de tareas programadas;
- journal en memoria de Ops Studio.

Cada evento adopta un formato común:

`hora · severidad · fuente · subsistema · entidad · actor · mensaje · correlación`

La vista permite filtrar por fuente, severidad, texto, entidad, actor o
identificador de correlación. Las fuentes se cargan de forma independiente: si
la cuenta no puede consultar una de ellas, las demás siguen visibles y la
fuente fallida informa de su propio estado.

El journal es deliberadamente efímero. No se escribe en localStorage ni en
sessionStorage. Las contraseñas, tokens, credenciales, claves privadas y
parámetros secretos de URL se redactan antes de mostrar la evidencia.

## Validación y reproducibilidad

La candidata mantiene cero dependencias en producción. El servidor mock local
ahora conserva estado suficiente para probar mutación y segunda lectura en
procesos, tareas, usuarios y roles.

La batería actual ejecuta 57 pruebas sin fallos. Los módulos comprobables de
API, explorador, operaciones y saneamiento alcanzan entre un 98,75 % y un
98,98 % de cobertura de líneas en ejecuciones repetidas; esta cifra no incluye
la aplicación del navegador. Los
34 pares de endpoint y método también fueron contrastados con la especificación
oficial de SysAdmin API v2.

Las nuevas mutaciones de permisos, los flujos de procesos y tareas, los fallos
parciales de fuentes de logs y los diseños de escritorio y móvil se comprobaron
con elementos desechables en IRIS 2026.2. La instancia de prueba está detenida
y su volumen se conserva para posibles comprobaciones. Publicar es una decisión
aparte; el informe de validación recoge la evidencia y los pasos pendientes.

## Probar la demo segura

```bash
git clone https://github.com/seypherWork/iris-ops-studio.git
cd iris-ops-studio
npm start
```

Abre `http://127.0.0.1:4173`, mantén activado **Safe demo** y sigue la ruta de 90
segundos del README.

- Repositorio: https://github.com/seypherWork/iris-ops-studio
- Demo pública: https://seypherwork.github.io/iris-ops-studio/
- Especificación oficial de SysAdmin API:
  https://github.com/intersystems-community/sysadmin-api-specification

IRIS Ops Studio no sustituye la autorización de IRIS. Los roles y privilegios
de IRIS siguen siendo la frontera de control. El objetivo del portal es más
concreto: hacer explícita la intención del operador, verificar lo verificable y
etiquetar con honestidad todo lo demás.
