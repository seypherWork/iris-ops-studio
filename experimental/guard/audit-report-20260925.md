# Auditoría del guard de servidor y su integración — NO APTO para ampliar/publicar

**Documento histórico.** Los seis hallazgos de esta auditoría fueron corregidos
y sus regresiones verificadas posteriormente; el estado actual, los hashes y
la evidencia están en [el cierre del 26/09](remediation-validation-20260926.md).
Las referencias a hallazgos abiertos y código sin modificar que siguen describen
el momento de esta auditoría, no la revisión corregida. El guard sigue sin estar
listo para publicación general.

Fecha de inicio: 2026-09-25. Alcance: prototipo local wallet, transporte,
identidad, sesiones, pruebas de recuperación, concurrencia, interrupciones e
integración con la interfaz principal. Base pública: 1.2.1, commit
`a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`.

**Conclusión:** se confirman dos defectos de prioridad alta en el nuevo guard.
No debe extenderse todavía a Web apps ni presentarse como listo para publicar.
Las pruebas anteriores pasan, pero no cubrían las carreras demostradas aquí.
No se ha encontrado una vía demostrada de acceso administrativo anónimo ni se
ha probado una escalada fuera de los permisos nativos de IRIS. Esto no certifica
ausencia de otras vulnerabilidades.

Esta entrega es una auditoría: conserva la lógica funcional auditada y añade
reproducciones/informe. Los hallazgos siguientes quedan **ABIERTOS**, no corregidos.
No se realizó commit, push, publicación ni cambio de versión. Las clases de
inyección de fallos son exclusivamente de laboratorio y se restauró el dispatcher
normal después de usarlas. No se eliminan históricos de recibos ni volúmenes.

## Orden y método

1. Identidad y permisos: usuario real en el transporte oficial, denegaciones
   nativas, permisos de aplicación, controles propios y revocación durante lectura.
2. Sesiones/pestañas: inicio bloqueado, cancelación tardía, reconexión y aprobación
   anterior invalidada, caducidad real y separación de usuarios.
3. Recuperación por operación: posesión de clave, usuario/permisos actuales,
   conservación de UNKNOWN, reinicios y coherencia con requisitos de ejecución.
4. Concurrencia: mismo ID y dos IDs distintos sobre el mismo destino.
5. Interrupciones: salida real del worker antes/después del PUT, respuesta perdida,
   fallo de guardado final y recuperación sin repetir el cambio.
6. Rutas de elusión y contratos: Origin/CSRF, métodos no permitidos, JSON ambiguo,
   respuestas incompletas, módulos ausentes y ausencia de fallback a /api/admin.
7. Regresión y presentación: pruebas JavaScript, IRIS real y flujo visual de
   wallet a 1440×900 y 390×844. Otras pantallas están deliberadamente sin migrar.

Las reproducciones reales usan exclusivamente el contenedor fijado
`iris-ops-guard-dev-20260925`, ID
`d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`,
publicado solo en `127.0.0.1:52801`. Únicos cambios de negocio: la colección
`IrisOps_GuardProbeWallet` y los recursos/usuarios de prueba del runner.
Los ensayos no solicitan ni registran credenciales del usuario.

## Hallazgos

### F01 — Alta: decisiones de autorización envejecen durante la lectura previa

Código: `IrisOps.Guard.Execution.cls:71-100`.
El canal, la generación, la caducidad de la preview y los permisos se comprueban
ANTES de `Snapshot`. Después de esa lectura no se vuelven a validar antes de
reservar el recibo y llamar a `WriteWallet`.

**Pruebas reales:**

- Preview con vida de 30 segundos: esperar 28 segundos y retrasar 3 segundos
  el retorno de una lectura real mediante la subclase de prueba. Resultado:
  HTTP 200, VERIFIED y **1 PUT recibido por la API nativa** después de caducar.
- Con la lectura real ya completada pero el método todavía esperando, retirar
  al rol de prueba el permiso del recurso alternativo propuesto. Resultado:
  HTTP 200, VERIFIED y **1 PUT nativo**. `%Admin_Wallet:U` se mantiene: falla
  el requisito adicional que el propio guard pretende imponer, no la frontera
  de privilegios de IRIS.
- Caducidad de autorización durante esa espera: resultado UNKNOWN y **0 PUTs
  contados en el dispatcher nativo**. No se presenta este caso como cambio
  aceptado por IRIS; demuestra que el guard llegó a la fase de envío/resultado
  incierto sin bloquear explícitamente por caducidad. La autenticación nativa
  puede impedir que el envío llegue al contador.

La demora es un punto de planificación acotado en `TestExecution.Snapshot`,
DESPUÉS de consultar IRIS realmente; no se inventa el contenido de la lectura
ni se falsifica el reloj. No existe un parámetro HTTP para activar esa demora.

**Corrección propuesta:** revalidar custodia, canal/generación, deadline y
permisos después de cualquier espera/lectura/bloqueo y lo más cerca posible
del envío. Comprobar también el vencimiento después de construir la preview.
Mantener las comprobaciones nativas y no ampliar privilegios para resolverlo.
Documentar el límite inevitable entre el último control local y una API remota.

**Cierre requerido:** ambas carreras de preview/permiso terminan BLOCKED, con
0 PUTs; la caducidad de autorización queda explícitamente bloqueada, sin nueva
reserva que sugiera un envío autorizado. Repetir además los casos normales.

### F02 — Alta: bloqueo por operación no serializa dos cambios al mismo destino

Código: `IrisOps.Guard.Execution.cls:55` y `:76-112`.
El lock protege el ID de operación, no la colección wallet. Dos sesiones con
previews distintas pueden leer el mismo estado inicial, superar la comprobación
de obsolescencia y sobrescribirse.

**Prueba real repetida en dos ejecuciones de la auditoría:** dos sesiones
independientes, dos IDs distintos, dos políticas propuestas distintas y una
barrera acotada tras las lecturas reales. Resultado: **2 PUTs nativos y ambos
recibos VERIFIED**. El segundo envío no se bloquea aunque parte de la misma
versión anterior del destino. No es el replay del mismo ID; ese caso sí pasa.

**Corrección propuesta:** exclusión mutua por instancia/tipo/destino, desde
antes de la lectura de precondición hasta finalizar envío/readback/recibo,
además del lock de ID. Orden de locks uniforme, espera limitada, liberación
en excepciones y worker abortado. Revalidar F01 después de adquirir el lock.
Un lock de este guard NO impide cambios de clientes externos: ese límite debe
seguir declarado, salvo que una API oficial proporcione precondición atómica.

**Cierre requerido:** con dos previews distintas del mismo estado, como máximo
un envío; la otra solicitud queda stale/busy sin sobrescribir. Destinos distintos
no deben bloquearse innecesariamente cuando se amplíe el alcance.

### F03 — Media: ejecutar requiere menos permisos que recuperar el mismo recibo

Código: `IrisOps.Guard.Execution.cls:35,75` frente a
`IrisOps.Guard.Recovery.cls:11-12`.
La ejecución verifica los permisos propuestos, pero la recuperación exige
permisos tanto de la política anterior como de la propuesta.

**Prueba real:** retirar solo READ del recurso anterior, manteniendo WRITE,
`%Admin_Wallet:U` y los permisos del recurso nuevo. La preview devuelve 200;
el cambio queda VERIFIED con 1 PUT. Una inspección inmediata por el mismo
usuario y con su clave correcta devuelve **404**. No hubo revocación posterior.

**Impacto:** una operación autorizada por el guard puede nacer sin posibilidad
de recuperación para su propio operador. Es especialmente problemático si se
pierde la respuesta y el usuario necesita resolver el resultado incierto.

**Corrección propuesta:** alinear los requisitos de preview/ejecución con los
de recuperación; preferiblemente bloquear antes de ejecutar cuando no puede
satisfacerse el modelo actual de recuperación. No resolverlo entregando el
histórico sin permiso ni concediendo permisos nuevos automáticamente.

**Cierre requerido:** bloquear antes del PUT con un motivo preciso, o un modelo
alternativo expresamente diseñado/probado que preserve la autorización.

### F04 — Baja: el login acepta claves JSON duplicadas/alias escapados

Código: `IrisOps.Guard.HttpApi.cls:40-48`.
Connect emplea un parser distinto del contrato estricto `Protocol.Body`.
El tamaño final del objeto no detecta claves duplicadas.

**Prueba real:** cuerpo con `user` y `us\\u0065r` equivalentes y la contraseña
válida de la fixture: HTTP 200. Los endpoints de preview sí rechazan este caso.
No se ha demostrado suplantación: el usuario final sigue contrastándose con
`$username` y las credenciales nativas siguen siendo necesarias.

**Corrección propuesta:** unificar el parser estricto, incluyendo objeto plano,
tipos, claves exactas, duplicados/alias, límite de tamaño/fin de stream y limpieza
de contenido sensible. La regresión debe exigir 400 sin autenticar upstream.

### F05 — Media: la interfaz acepta VERIFIED sin evidencia y filtra solo primer nivel

Código: `web/assets/wallet-guard.js:90-95`; consumo en
`web/assets/app.js:577-584,645-660`. El recibo se acepta comprobando solo ID y
estado. No se comprueba actor/destino, política observada ni estructura de
eventos. `before/expected/observed/events/rechecks` se copian enteros.

**Pruebas sintéticas del controlador real, no fugas observadas en IRIS:**

- `{id, state: "VERIFIED"}` basta para generar un resultado VERIFIED.
- Actor/destino incorrectos y readback que no coincide con expected también
  se aceptan como VERIFIED.
- Campos anidados `password/privateKey` con un marcador ficticio llegan al
  objeto que consume la interfaz, donde se serializa el recibo completo.

El servidor actual construye explícitamente sus recibos y no se observó que
enviase esos campos. No se afirma una fuga real de credenciales ni una ruta de
inyección de HTML: la salida de texto se escapa. Es una defensa de contrato y
redacción insuficiente frente a respuestas defectuosas o futuras regresiones.

**Corrección propuesta:** validar recibos completos según su estado, fijar
destino/actor, conservar la expectativa aprobada para contrastar el resultado
de ejecución y reconstruir estructuras anidadas mediante listas de campos
permitidos. Separar los recibos completos de los resultados incompletos.
Aplicar el mismo criterio al piloto independiente y las observaciones.

**Cierre requerido:** rechazar los dos VERIFIED inválidos y demostrar que el
marcador anidado nunca llega a pantalla, diario, exportación ni copia.

### F06 — Baja: los validadores de claves del navegador aceptan valores no string

Código: `experimental/guard/ui/recovery-store.js:11-19` y `ui/client.js:42-59`.
`RegExp.test` convierte automáticamente el valor a texto; una lista con una
cadena de 64 caracteres válidos supera la validación.

**Prueba sintética:** `remember(id, [key])` guarda el valor y `get(id)` devuelve
un objeto/lista. El servidor exige cadenas y lo rechazaría; no permite recuperar
históricos ajenos, pero contradice el contrato y puede dejar datos inválidos
persistidos que inutilicen una recuperación.

**Corrección propuesta:** exigir `typeof value === "string"` antes de las
expresiones regulares para IDs/claves/canales y estructuras leídas del almacén;
añadir listas, objetos, null y tipos numéricos a las regresiones.

## Controles que sí se han comprobado

La validación existente se repite separadamente; no convierte los hallazgos en
resueltos. El mismo ID no se reenvía, UNKNOWN no se transforma en VERIFIED solo
porque una observación posterior coincida y la recuperación no ejecuta PUT.
Las pruebas de usuario distinto, clave incorrecta/ausente/cruzada, Origin/CSRF
inválidos, revocación antes de comenzar y pérdida de almacenamiento bloquean.
Los recibos sobreviven a reinicios y salidas reales de workers. El perfil
experimental no hace fallback al cliente nativo y deja otras pantallas bloqueadas.

Las limitaciones conocidas siguen siendo tales, no nuevos hallazgos:
`/api/admin` conserva autorización independiente; el guard no protege la versión
pública ni todas sus pantallas; no hay despliegue HTTPS/actualización de producción
validado; cookies nativas compartidas pueden invalidar otra pestaña; perder la
clave puede impedir recuperar; transferirla a una cuenta recreada con el mismo
nombre y permisos permite lectura histórica. No se garantiza seguridad frente
a un administrador del host o una copia/clon de toda la instancia.

## Evidencia y reproducción

- `audit-observations.json`: primera ejecución de observaciones reales.
- `audit-observations-fast.json`: repetición de concurrencia/recuperación/JSON
  y revocación del permiso DURANTE la lectura.
- `audit-client-observations.json`: respuestas sintéticas y tipos inválidos.
- `verify-audit-suite.mjs`: se incorpora al runner con `IRISOPS_AUDIT_TEST=1`.
  `IRISOPS_AUDIT_FAST=1` omite solo las dos esperas de caducidad.
- `audit-client-observations.mjs`: reproducción local sin red.
- `wallet-integrated-evidence.json`, `integrated-ui-evidence/result.json` y
  `http-transport-evidence.json`: regresiones independientes, no aceptación de
  las observaciones adversariales.

Los scripts de observación pueden terminar con código 0 habiendo demostrado
un defecto: recopilan comportamiento, no son puertas de aceptación. En la fase
de corrección deben convertirse en aserciones que exijan el comportamiento seguro.
No ejecutar dos runners de IRIS simultáneamente. Solo el laboratorio fijado.

JavaScript existente: **122/122** pruebas pasaron en esta auditoría. Eso no es
una cobertura porcentual ni una certificación de ausencia de errores.

Regresión final real: **64 grupos**, `complete=true`, `restored=true`,
`releaseReady=false`, finalizada a `2026-09-25T21:54:31.159Z`. Incluye los
**14 grupos de la interfaz principal**, `complete=true`, cero excepciones
JavaScript y cero solicitudes del navegador a `/api/admin`; final de navegador:
`2026-09-25T21:53:50.670Z`. Transporte/custodia: **38 grupos**, proceso terminado
con código 0, evidencia `2026-09-25T21:55:49.594Z`, `featureReady=false`.
No sumar 14 a 64: los grupos de navegador ya están incluidos.

Las cuatro capturas nuevas de preview/recuperación se inspeccionaron visualmente
a 1440×900 y 390×844: diálogos y controles caben, los campos largos se ajustan y
UNKNOWN se distingue de MATCHES_EXPECTED. El aviso temporal se superpone a una
parte del contenido móvil; no se observó bloqueo permanente. Se verificaron
ausencia de credenciales/claves conocidas en contenido visible y logs durante
los ensayos. Esto no equivale a una búsqueda exhaustiva de todo secreto posible.

Comprobación final adicional por terminal: `/api/admin` habilitada, sin recurso
extra y con dispatcher `%Api.Admin`; guard restaurado a `IrisOps.Guard.HttpApi`;
usuario, rol y colección principales de la fixture ausentes. Los runners
también verifican la retirada de sus recursos propios. El laboratorio y sus
recibos persistentes se conservan. La sintaxis de los tres scripts nuevos o
modificados es válida y la revisión de espacios del diff no encontró errores.

## Identidad del código auditado (SHA-256)

La lógica funcional no se modifica durante esta auditoría:

- `web/index.html`: `717A04679A65F1C7FF23C9A38441A2098FCE732B3F3C6D00E45A04A7386C2222`
- `web/assets/app.js`: `7DA29217E9159C583A1E5F5A68E286B1033EA39861BB538F82D56014B024C335`
- `web/assets/styles.css`: `A05E6E26D1A240568EDE1A29C7C6FEFD4530055DFCADCC69277A2075F10ACFC2`
- `web/assets/wallet-guard.js`: `B0C3569A40899290EC9D3883F61B8F67B685F9AED7BA78201E056ACE04A64F4E`
- `IrisOps.Guard.Execution.cls`: `1B4A18C0DFE321A9AE383CA6A0E389692E8DC1BD686CA2123B4DE23977A6A4C7`
- `IrisOps.Guard.HttpApi.cls`: `6C18DE113E56A38693A1D90671BD85645B23024D9459CB8504E4AD4787A2FD6E`
- `IrisOps.Guard.Recovery.cls`: `0A70198971E06E0CD2E0FA31F725D6B2565307193B4EBE0282E9C88E34C0F817`
- `IrisOps.Guard.Vault.cls`: `F16291F46D375154FFFB6715A9601C40B38BA563CBD90D0647B301E3849C04CF`
- `ui/client.js`: `CAAAC872E06D17AAF0DEC24DA48A11E16A5EF37867869019D72A35E2EEC6E479`
- `ui/recovery-store.js`: `B892488EAE178D7E6082D557B76F5050987A702E26C47F1E1B045706FE6EC952`

## Siguiente paso recomendado

Corregir F01/F02 conjuntamente, después F03, contratos F04/F05/F06, y repetir
la validación completa (incluidas carreras, interrupciones y navegador real).
Solo entonces avanzar con Web apps. El objetivo de este informe es impedir
que se reutilice un mecanismo con defectos en más operaciones, no prometer
que ganar un concurso ni estar libre de errores pueda asegurarse.
