# IRIS Ops Studio: una consola operativa centrada en la seguridad para InterSystems IRIS

> Instantánea histórica de la publicación v0.1. Para la candidata v0.2, consulta
> [Más allá de HTTP 200](community-article-verifiable-operations-es.md).

Esta es la traducción al español del [artículo original en inglés](https://community.intersystems.com/post/iris-ops-studio-safety-first-operations-console-intersystems-iris).

Las herramientas de administración de sistemas deben resolver dos problemas al mismo tiempo: facilitar el acceso a la información necesaria y dificultar que una acción peligrosa se ejecute por accidente.

De esa idea nació **IRIS Ops Studio**, mi candidatura para el concurso de programación de InterSystems «Build Your Own Management Portal». Es una consola enfocada y adaptable construida sobre la API REST SysAdmin oficial de InterSystems IRIS. En lugar de intentar reproducir todas las pantallas del Management Portal nativo, se concentra en flujos operativos habituales y muestra el riesgo de cada petición antes de enviarla.

- Open Exchange: <https://openexchange.intersystems.com/package/IRIS-Ops-Studio>
- Demostración online: <https://seypherwork.github.io/iris-ops-studio/>
- Vídeo de demostración: <https://www.youtube.com/watch?v=Vxn_usXOEPU>
- Código fuente: <https://github.com/seypherWork/iris-ops-studio>

![Resumen operativo de IRIS Ops Studio](https://raw.githubusercontent.com/seypherWork/iris-ops-studio/main/docs/assets/overview-desktop.png)

## Un espacio de trabajo para las operaciones habituales

IRIS Ops Studio agrupa la monitorización y la administración en diez áreas:

- Resumen operativo con el estado de los recursos y las señales recientes
- Inspección y control de procesos
- Inventario de almacenamiento de bases de datos y dispositivos
- Consultas de logs y auditoría
- Tareas programadas
- Usuarios, roles y recursos
- Aplicaciones web
- Metadatos de wallets y certificados X.509
- Configuración de OAuth 2.0
- Un explorador seleccionado de la API SysAdmin

El explorador incluye 27 operaciones catalogadas a partir de la especificación oficial de SysAdmin API v2. También permite inspeccionar rutas personalizadas, manteniendo la clasificación de peticiones y la eliminación de información sensible en las respuestas.

La interfaz de producción es un cliente web estático. No necesita un servidor de aplicación propio ni dependencias JavaScript de producción. En modo real se comunica con el servicio `/api/admin` del mismo origen proporcionado por IRIS. El modo de demostración segura utiliza datos representativos para que cualquier persona pueda recorrer la interfaz completa sin credenciales ni una instalación de IRIS. Los datos simulados siempre aparecen identificados y las modificaciones de la demo nunca se envían a un sistema real.

## Hacer explícita la intención del operador

La decisión principal de diseño es establecer un límite de seguridad visible.

Las peticiones se clasifican como de solo lectura, cambios de estado o destructivas. Las lecturas siguen siendo inmediatas. Todas las operaciones que modifican el sistema abren un diálogo de revisión y exigen escribir exactamente una frase generada antes de habilitar el envío. Una frase incorrecta mantiene la operación desactivada.

La autorización de IRIS sigue siendo la fuente de verdad. La interfaz no concede privilegios ni intenta eludir los roles del usuario conectado. Estos controles adicionales reducen la posibilidad de ejecutar cambios accidentales desde la capa del operador.

Los campos sensibles se ocultan de forma recursiva antes de mostrar una respuesta. Contraseñas, secretos, tokens, credenciales y claves privadas se sustituyen incluso cuando aparecen dentro de objetos o listas anidadas. La contraseña de inicio de sesión se borra después de cualquier resultado de autenticación y nunca se escribe en el almacenamiento del navegador, logs o direcciones URL. Los tokens de acceso y renovación permanecen únicamente en la memoria de la página, rotan mediante el flujo oficial de IRIS y desaparecen al recargarla.

## Comprobar el comportamiento real

Una consola de administración no debería considerarse terminada simplemente porque sus pantallas se muestran o porque una API devuelve que ha aceptado una petición. Para la validación final probé IRIS Ops Studio contra una instancia desechable de InterSystems IRIS Community 2026.2.

La batería automatizada completó **25 pruebas sin ningún fallo**. La validación real comprobó después los resultados observables de los flujos protegidos:

- La autenticación devolvió un token válido, eliminado de las evidencias.
- Los endpoints de monitorización, procesos, bases de datos e información de la instancia devolvieron JSON real.
- Una tarea programada desechable se ejecutó y su contador pasó de 0 a 1.
- Un proceso dedicado de prueba pasó de `HANG` a `SUSP`, volvió a `HANG` y desapareció después de las peticiones de suspensión, reanudación y terminación.
- Un identificador de proceso inválido fue rechazado sin revelar contenido sensible.
- Un fallo de conexión produjo un error claro y borró el campo de contraseña.
- Una frase de confirmación incorrecta mantuvo la ejecución desactivada.
- Las pruebas visuales a 1440×900 en escritorio y 390×844 en móvil finalizaron sin desbordamiento de la página.

El contenedor utilizado para las mutaciones se eliminó después de la validación. Los contenedores y volúmenes de IRIS ya existentes se comprobaron y permanecieron intactos. Los resultados saneados están publicados en el [informe de validación](https://github.com/seypherWork/iris-ops-studio/blob/main/docs/validation-report.md).

## Probar IRIS Ops Studio

La opción más rápida es la [demostración online segura](https://seypherwork.github.io/iris-ops-studio/). No requiere una cuenta y no envía peticiones administrativas.

Para ejecutar la demostración local con Node.js 20 o posterior:

```bash
git clone https://github.com/seypherWork/iris-ops-studio.git
cd iris-ops-studio
npm start
```

Después se abre `http://127.0.0.1:4173`. No hay paquetes npm que instalar ni un paso de compilación de la interfaz. La verificación automatizada completa se ejecuta con:

```bash
npm run check
```

Para desplegarlo con InterSystems IRIS Community 2026.2 mediante Docker Compose:

```bash
docker compose up --build
```

Las instrucciones completas de instalación, conexión y validación en Windows están disponibles en el [README del proyecto](https://github.com/seypherWork/iris-ops-studio#readme).

## Lo que aprendí

La parte más valiosa del proyecto fue tratar la validación como parte del producto. Probar las modificaciones reales permitió encontrar problemas que las pruebas con datos simulados no podían demostrar, como la actualización del estado después de una operación correcta, el comportamiento exacto de las tareas y la necesidad de verificar independientemente el estado de un proceso después de cada petición.

IRIS Ops Studio apuesta deliberadamente por una superficie operativa más pequeña, claramente explicada y completamente probada. Su objetivo es ayudar a que el operador comprenda el sistema, entienda el riesgo y confirme la acción prevista sin convertir la administración habitual en un laberinto.

Agradezco cualquier comentario sobre la interfaz, el modelo de seguridad y los flujos que resultarían más útiles en una futura versión.
