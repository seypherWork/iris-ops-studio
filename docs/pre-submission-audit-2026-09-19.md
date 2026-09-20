# IRIS Ops Studio — auditoría de pre-submission

> Documento histórico del 2026-09-19. Sustituido por el
> [informe de validación actual](validation-report.md).

Fecha: 2026-09-19. Base revisada: commit `54401dd`, rama `main`, más las correcciones locales descritas aquí. No se ha hecho commit, push, publicación ni candidatura. El repositorio local existe en `/workspace/scratch/d5126091e93f/seypher-iris-ops`. No tiene remoto configurado. Esta revisión sustituye cualquier certificación anterior de preparación completa.

## 1. VEREDICTO TÉCNICO

**NOT READY TO SUBMIT.** La demo y el cliente tienen pruebas ejecutadas; la aplicación integrada con IRIS no está validada. La auditoría es parcial donde faltan un runtime IRIS y un navegador ejecutable.

## 2. BLOQUEADORES

- Integración real no probada: compilación ObjectScript, instalación ZPM/CSP, autenticación, autorizaciones, operaciones y persistencia.
- Instalación IRIS incompleta: imagen `latest` sin versión verificada, dependencia de ZPM implícita y configuración de credenciales remitida a documentación sin pasos concretos.
- Cobertura funcional insuficiente para certificar el alcance: permisos sólo se consultan; logs sólo consulta auditoría; varias acciones abren un editor vacío sin parámetros obligatorios ni ejemplos.
- Pruebas visuales y funcionales de navegador pendientes. Los tests de expresiones regulares del frontend no certifican botones, foco ni responsive.

## 3. CHECKLIST DE REQUISITOS

Fuentes oficiales consultadas: [convocatoria 48](https://openexchange.intersystems.com/contest/48), [anuncio](https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal), [términos](https://openexchange.intersystems.com/markdown?url=/assets/doc/contest-terms.md), [formato de candidatura](https://docs.openexchange.intersystems.com/contest/apply/), [especificación](https://github.com/intersystems-community/sysadmin-api-specification).

La convocatoria exige una GUI funcional sobre las APIs IRIS, originalidad y código abierto. Áreas enumeradas: aplicaciones web/REST, permisos, seguridad, tareas, sistema operativo y logs. README inglés con instalación y descripción o vídeo. La ficha también pide enlace a la idea; se añadió el de la convocatoria, sin confirmar si basta. Máximo tres entradas. Evaluación: complejidad, instrucciones, experiencia del desarrollador, aplicabilidad y usabilidad. Extras y vídeo no son obligatorios si existe descripción detallada. Bonificaciones tecnológicas aún pendientes en el anuncio consultado.

Deadline publicado: **27 septiembre 2026, 23:59 EST**; no se ha reinterpretado la zona horaria. La candidatura requiere primero publicar la aplicación en Open Exchange. No basta subir a GitHub. Elegibilidad y cobro pueden requerir verificación de identidad; no se ha realizado. Datos falsos, infracciones de reglas/derechos o entrega tardía pueden invalidarla. Participación sin compra; perfil comunitario requerido. La categoría Freshmen tiene condiciones de historial que no se han verificado.

| Requisito | Estado | Evidencia | Acción necesaria |
|---|---|---|---|
| Funcionar sobre IRIS Community/Health Community | NOT VERIFIED | No Docker ni IRIS ejecutable | Ejecutar versión compatible y registrar resultados |
| Aplicación completamente funcional | PARTIAL | 24 tests locales; sin integración ni E2E | Completar ambos niveles |
| Gestionar aplicaciones web y explorar REST | PARTIAL | Ruta PUT válida; acceso abre editor sin `name` ni cuerpo | Documentar y probar configuración real |
| Gestión de permisos | PARTIAL | `renderAccess` sólo GET de usuarios/roles | Resolver cobertura requerida antes de ampliar alcance |
| Seguridad, wallet, X509, OAuth | PARTIAL | Vistas y rutas existentes; escrituras no probadas | Probar flujos y parámetros |
| Tareas | PARTIAL | Cliente/mock prueban operaciones; no ejecución real | Probar run/suspend/resume/create en IRIS |
| Sistema operativo | PARTIAL | Inventario de procesos, BD y dispositivos; CPU/memoria sólo demo | Verificar alcance y datos reales |
| Logs de subsistemas | PARTIAL | Vista live consulta sólo auditoría | Resolver cobertura frente a bases |
| 27 pares método/ruta del catálogo | PASS | Comparación ejecutada contra JSON oficial: 27/27 | Validar cuerpos y respuestas reales |
| README inglés y descripción | PASS | Lectura de README completo | Mantener coherencia con limitaciones |
| Instalación reproducible IRIS | NOT VERIFIED | README no reproducido con contenedor | Completar instrucciones y probar |
| Licencia abierta en código | PASS | LICENSE MIT presente y leído | Conservar al publicar |
| Originalidad y derechos | NOT VERIFIED | Historial local no prueba procedencia universal | Revisar procedencia antes de entrega |
| GitHub/GitLab público | FAIL | Sin remoto local; publicación pendiente | Publicar sólo tras autorización posterior |
| Open Exchange y candidatura | FAIL | No enviados | Completar después de auditoría aprobada |
| Elegibilidad, límite de entradas, Freshmen | NOT VERIFIED | Sin comprobación del perfil/historial | Verificar cuenta y condiciones aplicables |
| Desktop/móvil funcional | NOT VERIFIED | No navegador ejecutado | E2E y revisión visual |

## 4. RESULTADOS DE PRUEBAS

- Entorno: Linux, Node 24.19.0, npm 11.9.0. No se probaron las versiones Node 20/22 declaradas en CI.
- `npm run check` inicial: **21/21**. Ejecuta `node --check` sobre dos JS y `node --test`; no es lint ni type checking.
- Reproducción previa: `resolveServerLocation` aceptaba `//other.example/collect` y resolvía otro origen. `redactSensitive` dejaba visibles strings dentro de `tokens: [...]` y `secret: {value: ...}`. Sólo valores sintéticos; ninguna petición a terceros.
- Tras corregir: `npm run check`: **24/24**, repetido después de los últimos cambios de código. Incluye regresiones de destinos de seguimiento, contenedores sensibles y política de redirects.
- Copia limpia de archivos versionados, sin node_modules: `npm install --offline --ignore-scripts --no-audit --no-fund` exit 0; `npm run check` 24/24. No equivale a máquina limpia con IRIS.
- El test de mock arranca realmente el servidor HTTP, comprueba HTML, login simulado, procesos, BD, dispositivos, OAuth, mutación simulada y auditoría asíncrona. El mock no valida credenciales ni ejecuta acciones IRIS.
- Comprobados errores HTTP 403, timeout, login sin token, trabajos fallidos y límite de polling con fixtures.
- Catálogo: 27/27 rutas/métodos presentes en `mainspec_v2.json` descargado del repositorio oficial. Los accesos directos a configuración también tienen método/ruta existentes. No certifica contratos completos.
- `git diff --check`: sin errores. Rama `main`, ocho commits locales inspeccionados por firmas de secretos.
- Build frontend: no existe ni se necesita transpilación para los archivos estáticos. Build IRIS, lint y type checking: no ejecutados; los dos últimos no tienen scripts/configuración propios.
- Playwright disponible como biblioteca, Chromium ausente. La instalación del navegador falló por timeouts y HTTP 502; se detuvo. No se produjo ninguna captura ni E2E.

## 5. ERRORES ENCONTRADOS

| Severidad | Archivo/componente | Problema | Corrección |
|---|---|---|---|
| HIGH | api.js, seguimiento asíncrono | `//host` podía recibir el bearer token | Rechazo de URLs ambiguas/protocolos ajenos, tests con cero polling posterior |
| HIGH | api.js, redacción | Contenedores sensibles dejaban strings sin ocultar | Redacción recursiva de contenedores sensibles; regresión pasada |
| HIGH | Transporte HTTP | Redirects automáticos incompatibles con destino explícito de credenciales | `redirect: error`; test de opciones y manejo de rechazo; redirect real no probado |
| MEDIUM | confirm-form | Handler no revalidaba frase, dependía del botón deshabilitado | Revalidación en handler y consumo del pending operation; comportamiento navegador pendiente |
| MEDIUM | compose.yaml | Puertos de desarrollo enlazados a todas las interfaces | Limitados a 127.0.0.1; configuración inspeccionada, contenedor pendiente |
| MEDIUM | README/app.js | Afirmaba CPU/memoria en Overview live aunque no se renderizan | Texto corregido, sin inventar telemetría |
| HIGH | README/Dockerfile | Login requiere 2026.2; latest y ZPM no verificados | Advertencia añadida; instalación sigue pendiente |
| HIGH | Configuración desde UI | Botones abren ruta sin `name` obligatorio ni JSON/documentación específica | Pendiente; no se fabricaron cuerpos para APIs administrativas |
| HIGH | Acceso/logs | Consultas no demuestran toda la gestión requerida | Pendiente; sin ampliación creativa |
| MEDIUM | Mock | Acepta mutaciones genéricas y login arbitrario | No corregido: es simulador; jamás usarlo como evidencia de integración |
| LOW | .gitignore | Sólo ignoraba `.env` exacto | Añadidos `.env.*`, claves PEM/KEY y excepción `.env.example` |

## 6. SEGURIDAD

No se encontraron firmas de claves privadas, tokens GitHub, claves AWS u OpenAI en los ocho commits escaneados. No hay `.env` versionado. Es un análisis limitado por patrones, no garantía absoluta. Los tokens presentes en tests/mock son fixtures sintéticos. No existen dependencias npm declaradas; no se ejecutó un escáner CVE del contenedor ni de GitHub Actions. La imagen sin fijar y acciones referenciadas por tags quedan pendientes de validación.

El frontend escapa HTML dinámico y usa textContent para respuestas. No se ejecutaron pruebas XSS en navegador. La autorización depende de IRIS, no del diálogo; CSRF y permisos reales quedan sin verificar. No hay backend propio que consulte URLs remotas en producción; el código hace fetch desde navegador, por lo que el fallo reproducido es de fuga de token a otro origen, no SSRF del servidor.

La redacción por nombres no elimina secretos incrustados en texto libre, URLs o mensajes de error, y mantiene metadatos de listas `credentials`. No debe presentarse como garantía universal. La reconexión durante operaciones en curso, cancelación de login y resultados tardíos del explorer requieren pruebas adicionales de estado. No hay evaluación exhaustiva de estas carreras.

## 7. REPRODUCIBILIDAD

Demo Node: copia limpia instalada y suite HTTP ejecutada con éxito. Producción IRIS: **no confirmada**. README no basta aún para garantizar credenciales, versión, disponibilidad del API, ZPM y arranque CSP. `iris.script` usa rutas absolutas internas coherentes con WORKDIR, pero la compilación/instalación no se ha ejecutado. El volumen `/durable` no demuestra persistencia: falta verificar configuración de durable storage y reinicio sin pérdida.

## 8. RIESGOS RESIDUALES

Integración, responsive real, Safari/iPhone, teclado/foco, todos los flujos de escritura, persistencia, roles insuficientes, expiración de sesión, pruebas de carga/estado concurrente, CVE del contenedor, elegibilidad y criterio final del jurado no comprobados. No se midió de nuevo el 97,65% de cobertura citado en el informe histórico. Algunas métricas live usan cero como fallback; una respuesta incompleta podría aparentar ausencia de alertas.

## 9. ACCIONES PENDIENTES ANTES DE PUBLICAR

1. Disponer de Docker y una imagen IRIS 2026.2+ compatible; completar README, instalar y probar desde cero, incluyendo reinicio/persistencia.
2. Verificar contra bases la cobertura de permisos/logs y completar las instrucciones de las acciones administrativas. Cualquier ampliación funcional debe decidirse explícitamente.
3. Ejecutar E2E desktop 1440×900, móvil 390×844 y flujos live con credenciales sintéticas de una instancia desechable; corregir fallos y repetir.
4. Verificar imagen/dependencias, procedencia, enlaces definitivos y elegibilidad. Actualizar informe con evidencia.
5. Sólo después de revisión y autorización: commit revisado, repositorio público, aplicación Open Exchange y candidatura. Un vídeo es opcional cuando existe descripción detallada.

## 10. DECISIÓN FINAL

**NOT READY TO SUBMIT.** Hay código real y 24 pruebas locales pasando, pero no evidencia suficiente de integración ni de cumplimiento funcional completo. Se han corregido defectos concretos; no se ha certificado lo que no se pudo ejecutar.
