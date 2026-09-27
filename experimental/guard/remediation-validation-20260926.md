# Corrección de F01–F06 — guard wallet experimental

Fecha: 2026-09-26 (Europe/Brussels). Base pública conservada: 1.2.1.
Este informe complementa la [auditoría original](audit-report-20260925.md);
no borra sus resultados negativos ni los presenta como pruebas superadas.

**Resultado: F01–F06 corregidos y cerrados dentro del alcance auditado**, tras
la validación completa y las reproducciones adversariales. Esto no declara
el guard listo para producción ni libre de todo error posible.
No se ha publicado nada, añadido otra operación administrativa ni modificado
el paquete público. El guard continúa siendo un piloto de laboratorio.

## Cambios y criterios de cierre

| Hallazgo | Corrección | Prueba requerida |
| --- | --- | --- |
| F01: caducidad/permisos durante una espera | Se reabren y contrastan las credenciales custodiadas y se comprueban canal, generación, caducidad y permisos tras el lock, después de la lectura y después de guardar la reserva, inmediatamente antes de enviar. La preview también se valida después de leer el destino. | Caducidad durante lectura, caducidad durante reserva y revocación durante lectura: BLOCKED y 0 PUTs. Autorización expirada: BLOCKED, contador de envío 0. |
| F02: dos IDs sobre el mismo destino | Lock por colección local, además del lock por ID; se mantiene hasta completar envío/readback/recibo. Orden fijo: ID y después destino; recuperación solo utiliza el lock de ID. Espera de destino limitada a 2 segundos. | Dos sesiones con previews diferentes del mismo estado: exactamente 1 PUT, un VERIFIED y un BLOCKED stale/busy. Replays del mismo ID siguen sin repetir. Salida del worker libera locks. |
| F03: ejecución sin posibilidad inicial de recuperación | La preview y la ejecución exigen permisos tanto de la política anterior como de la propuesta. No se amplía el rol ni se relaja el control del histórico. | Sin permiso READ anterior: preview 403 `recovery_permission_required`, sin PUT. Retirarlo después de la preview también bloquea la ejecución. |
| F04: login JSON ambiguo | Connect utiliza el mismo parser de objeto plano con claves exactas, tipos string, rechazo de duplicados/alias y límite de lectura. Se limpia el texto consumido y se descarta el objeto inválido. | Duplicados, alias escapados, campos extra, tipos incorrectos, lista, JSON truncado/extra y exceso de tamaño: 400, sin llamadas al transporte de login. Control positivo: un Connect válido sí incrementa el contador. |
| F05: evidencia insuficiente/filtrado superficial | Un único contrato compartido por las dos interfaces valida actor, destino, ID, políticas aprobadas, readback, estado, contador, secuencia de eventos, fechas y observaciones. Reconstruye campos permitidos a todos los niveles y rechaza extras. Los resultados incompletos son otro formato y nunca VERIFIED. | Respuestas sintéticas incompletas, contradictorias o con secretos anidados se rechazan. Prueba de navegador: respuesta alterada después de un cambio real no muestra VERIFIED ni el campo añadido; recuperar el recibo original no reenvía. |
| F06: coerción de tipos | IDs/claves/canales exigen string antes de aplicar la expresión regular. Se valida también la estructura persistida y se rechaza antes de escribir o enviar a la red. | Listas, objetos, números y null no se guardan ni envían; el almacén manipulado se rechaza. |

## Detalles relevantes

- El rechazo tardío después de reservar un envío genera una transición explícita
  DISPATCHING → BLOCKED, con `dispatchCount=0`. Si no puede persistir ese rechazo,
  no se envía el cambio y se comunica un resultado incompleto; la recuperación
  posterior no presupone éxito ni repite el envío.
- El lock del destino solo coordina peticiones de este guard. No es una
  transacción distribuida con `/api/admin`, ni evita cambios de otros clientes.
  La autorización nativa de IRIS sigue siendo independiente y obligatoria.
  Tampoco se promete revocación atómica entre el último control local y la
  recepción de la llamada HTTP. Los casos reproducidos de espera sí se bloquean.
- `dispatchCount=1` en un recibo incierto representa una reserva de envío, no
  prueba por sí solo que IRIS recibió un PUT. Los ensayos cuentan por separado
  los PUTs que llegan al dispatcher nativo.
- Se vuelve a comprobar la custodia al recuperar tras la lectura nativa: una
  autorización que vence durante la espera no entrega el histórico.
- El navegador conserva una copia privada de la política aprobada, independiente
  del objeto devuelto al formulario. Modificar ese objeto no cambia lo aprobado.
- Un resultado UNKNOWN conserva esa clasificación aunque una lectura posterior
  coincida. La recuperación verifica que la clasificación de la observación
  concuerde con sus campos, sin atribuir quién causó ese estado.
- Se conserva el código de error `invalid_preview` para no romper su contrato
  anterior; las respuestas de ejecución inválidas producen `invalid_response`.
- Las claves de recuperación siguen limitadas a la pestaña. No se añaden
  contraseñas persistidas ni un usuario de servicio privilegiado.

## Evidencia

- `audit-observations*.json` y `audit-client-observations.json`: evidencia histórica
  anterior a las correcciones, conservada sin sobrescribir.
- `audit-remediation-evidence.json`: aserciones adversariales completas sobre
  IRIS real. El runner falla si cualquiera de los defectos se reproduce.
- `audit-remediation-fast.json`: subconjunto sin esperas de caducidad.
- `audit-client-remediation.json`: cierre de las reproducciones sintéticas
  originales del controlador/almacenamiento.
- `wallet-integrated-evidence.json`: regresión combinada completa y restauración
  de las fixtures; incluye `integrated-ui-evidence/result.json`.
- `http-transport-evidence.json`: custodia, identidad y denegaciones de la API nativa.
- `contracts.test.mjs`: regresiones nuevas que no se limitan a los ejemplos
  incompletos de la auditoría; añaden campos extra a recibos por lo demás válidos.

JavaScript: 133/133 pruebas superadas al implementar las correcciones, incluidas
las 103 pruebas de la base y 30 pruebas del piloto/integración. Sintaxis verificada
en 27 archivos JavaScript/MJS. El primer pase detectó una diferencia del código
de error de preview; se restauró su contrato y se repitió toda la batería.
No se ha medido cobertura porcentual nueva.

Una comprobación adicional detectó que `OnPreDispatch` de la instrumentación
nativa no observaba `/login`: su contador permanecía a cero incluso con un login
válido. Ese ensayo no se acepta como evidencia. Se sustituyó por una subclase
exclusivamente de laboratorio que cuenta invocaciones de `LoginUpstream` antes
de delegar en el mismo transporte oficial. Un control positivo exige el aumento
de uno al conectar correctamente; los cuerpos inválidos no lo incrementan.
No se inspecciona ni registra el contenido de la contraseña. Tras corregir el
instrumento se repite la validación completa, no solo se cambia una expectativa.

### Ejecución final comprobada

- Regresiones adversariales: `2026-09-25T22:19:16.166Z`, `complete=true`,
  ocho casos registrados, incluidos los dos puntos de caducidad de preview,
  caducidad de autorización y retirada de permisos anteriores/propuestos.
- Regresión combinada: `2026-09-25T22:21:39.584Z`, **68 grupos**,
  `complete=true`, `restored=true`, `releaseReady=false`.
- Dentro de esos 68, interfaz principal: **15 grupos**, final
  `2026-09-25T22:20:59.067Z`, cero excepciones JavaScript y cero solicitudes
  del navegador a `/api/admin`. No sumar estos 15 de nuevo a los 68.
- Custodia/transporte: `2026-09-25T22:21:56.345Z`, **38 grupos**, proceso
  terminado correctamente, `featureReady=false`.
- Capturas de preview y recuperación revisadas a **1440×900 y 390×844**.
  Los controles y textos permanecen utilizables. UNKNOWN se presenta separado
  de MATCHES_EXPECTED. Se conserva el aviso temporal superpuesto en móvil;
  no se ha hecho un rediseño visual en esta corrección.
- El ensayo de respuesta alterada comprueba expresamente que el marcador
  sensible no llega al contenido visible ni al diario. No se observan claves
  de recuperación/contraseñas conocidas en las capturas o los logs inspeccionados.
  Esto no sustituye una búsqueda exhaustiva de cualquier secreto desconocido.

Comprobación final independiente de configuración: `/api/admin` habilitada,
recurso vacío y dispatcher `%Api.Admin`; guard en `IrisOps.Guard.HttpApi`, no
en la subclase de inyección de fallos. Usuario, rol, wallet y ambos recursos
temporales ausentes. Recibos persistentes y contenedor conservados.
README público, `package.json` y `module.xml` coinciden con HEAD; no hubo cambio
de versión, commit, push ni publicación. Revisión de espacios del diff sin errores.

## Respaldo y reversibilidad

Antes de editar se copiaron `experimental/` y `web/` a:

`C:\Users\ilyas\Documents\Codex\2026-09-21\files-pasted-by-the-user-act\work\iris-ops-guard-pre-fix-20260925`

Se contrastaron ocho hashes de archivos principales con la auditoría original.
Es una copia de la base anterior, no una versión corregida para publicar.
Para revertir, comparar y restaurar selectivamente los archivos modificados;
no sustituir el proyecto completo ni eliminar recibos o volúmenes.

Las pruebas solo usan el contenedor fijado `iris-ops-guard-dev-20260925`, puerto
52801, ID `d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
Los usuarios, roles, recursos y wallet de prueba son propios y temporales.
Los recibos y el laboratorio se conservan.

## Huellas de la lógica corregida (SHA-256)

- `IrisOps.Guard.Execution.cls`: `C2C38724CB39EE3892C4A7A76C9C0E3365A1FB2DF279184C7CE4EDE26DF07394`
- `IrisOps.Guard.HttpApi.cls`: `585BA368C3D3B22FF1B2B31A6FF5D60B63D656196DEB808966833606AF30C601`
- `IrisOps.Guard.Protocol.cls`: `FDB5615B22247AFC6FB4B26E731754018F6FF24876D69ACAD5D0D8B7ABFF2E44`
- `IrisOps.Guard.Recovery.cls`: `9A0003FB0924D07781C93D5CD4B56F16CAAE6B313DD8264AE358C0182D43405E`
- `ui/client.js`: `5842BB923048AB5A291413D5A4A6A83AD02D04B437E8931D5FCD1D0903806FBA`
- `ui/contracts.js`: `202C7BA3C3F65F48774F945F4775C8BB0EFEF32F9E6348B44A5D5B30295B0343`
- `ui/recovery-store.js`: `6CF4146AA0B26FC723C498599EF4DA00F262A72B68269AFBB268A4046F16CD71`
- `web/assets/wallet-guard.js`: `E6B35897680A55EEFAD5BF41A61C44551212D0DC04BD82D6C70FF3BAEDE16E1E`

## Reproducción

Con el runtime y Docker locales, establecer `IRISOPS_DOCKER_EXECUTABLE`,
`IRISOPS_PLAYWRIGHT_MODULE`, `IRISOPS_BROWSER_EXECUTABLE` y activar:

- `IRISOPS_AUDIT_TEST=1`
- `IRISOPS_RECOVERY_TEST=1`
- `IRISOPS_UI_TEST=1`
- `IRISOPS_INTEGRATED_UI_TEST=1`
- `IRISOPS_EXTENDED_WALLET_TEST=1`

Dejar `IRISOPS_AUDIT_FAST` desactivado. Ejecutar
`node experimental/guard/verify-wallet-execution.mjs`, después
`node experimental/guard/verify-http-transport.mjs`. Nunca simultáneamente.
Ejecutar también `node --experimental-vm-modules --test` y
`node experimental/guard/audit-client-observations.mjs`.

## Límite de la conclusión

Corregir estos seis hallazgos no equivale a auditar todo IRIS, migrar todas las
pantallas ni certificar ausencia absoluta de errores. HTTPS/despliegue,
actualización en instalaciones existentes, otras operaciones y el ciclo de
vida completo de las claves siguen fuera de esta validación. No se cambia
`NOT READY` a `READY` ni se publica el guard con este trabajo.
