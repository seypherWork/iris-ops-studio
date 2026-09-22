# IRIS Ops Studio: a safety-first operations console for InterSystems IRIS

> Historical v0.1 publication snapshot. For the v0.2 candidate, see
> [Beyond HTTP 200](community-article-verifiable-operations-en.md).

Published on the [InterSystems Developer Community](https://community.intersystems.com/post/iris-ops-studio-safety-first-operations-console-intersystems-iris).

System administration tools have to solve two different problems at the same time. They must make useful information easy to reach, and they must make dangerous actions difficult to perform by accident.

That idea became **IRIS Ops Studio**, my entry for the InterSystems Programming Contest: Build Your Own Management Portal. It is a focused, responsive console built on the official InterSystems IRIS SysAdmin REST API. Instead of attempting to reproduce every screen in the native Management Portal, it concentrates on common operational workflows and makes the risk of every request visible before it is sent.

- Open Exchange: <https://openexchange.intersystems.com/package/IRIS-Ops-Studio>
- Online demo: <https://seypherwork.github.io/iris-ops-studio/>
- Video demonstration: <https://www.youtube.com/watch?v=Vxn_usXOEPU>
- Source code: <https://github.com/seypherWork/iris-ops-studio>

![IRIS Ops Studio operational overview](https://raw.githubusercontent.com/seypherWork/iris-ops-studio/main/docs/assets/overview-desktop.png)

## One workspace for recurring operational tasks

IRIS Ops Studio groups monitoring and administration into ten workspaces:

- Operational overview with resource posture and recent signals
- Process inspection and control
- Database storage and device inventory
- Logs and audit queries
- Scheduled tasks
- Users, roles and resources
- Web applications
- Wallet and X.509 metadata
- OAuth 2.0 configuration
- A curated SysAdmin API explorer

The explorer includes 27 catalogued operations from the official SysAdmin API v2 specification. Operators can also inspect custom paths, while the client continues to apply its request classification and response-redaction rules.

The production interface is a static browser client. It has no application server and no production JavaScript dependencies. In live mode it communicates with the same-origin `/api/admin` service provided by IRIS. A safe demo mode uses representative fixtures so reviewers can explore the complete interface without credentials or an IRIS installation. Demo information is always labelled and demo mutations remain simulated.

## Making operator intent explicit

The central design decision is a visible safety boundary.

Requests are classified as read-only, state-changing or destructive. Read operations remain immediate. Every state-changing or destructive operation opens a review dialog and requires an exact generated confirmation phrase before the request can be submitted. Incorrect text keeps the action disabled.

IRIS authorization remains authoritative. The interface does not grant privileges or attempt to work around the connected user's roles. The additional controls exist to reduce accidental actions at the operator layer.

Sensitive response fields are redacted recursively before they are rendered. Passwords, secrets, tokens, credentials and private keys are replaced even when they appear inside nested objects or arrays. The login password is cleared after every authentication outcome and is never written to local storage, session storage, logs or URLs. Access and refresh tokens stay only in page memory, rotate through the official IRIS refresh flow, and disappear on reload.

## Verifying the real behavior

A management console should not be considered complete merely because its screens render or its API calls return an accepted status. For the final validation, I tested IRIS Ops Studio against a disposable InterSystems IRIS Community 2026.2 instance.

The automated suite completed **25 tests with zero failures**. The live validation then established the observable result of the protected workflows:

- Authentication returned a valid token, which was redacted from the evidence.
- Monitor, process, database and instance-information endpoints returned live JSON.
- A disposable scheduled task executed and its counter changed from 0 to 1.
- A dedicated test process changed from `HANG` to `SUSP`, returned to `HANG`, and disappeared after suspend, resume and terminate requests.
- Invalid process input was rejected without exposing sensitive content.
- A connection failure produced a clear error and cleared the password field.
- An incorrect confirmation phrase kept execution disabled.
- Desktop at 1440×900 and mobile at 390×844 passed without page overflow.

The disposable mutation container was removed after validation. Existing IRIS containers and volumes were checked and left intact. The sanitized results are published in the [validation report](https://github.com/seypherWork/iris-ops-studio/blob/main/docs/validation-report.md).

## Trying IRIS Ops Studio

The fastest option is the [online safe demo](https://seypherwork.github.io/iris-ops-studio/). It requires no account and sends no administrative requests.

For a local demo with Node.js 20 or newer:

```bash
git clone https://github.com/seypherWork/iris-ops-studio.git
cd iris-ops-studio
npm start
```

Then open `http://127.0.0.1:4173`. There are no npm packages to install and no frontend build step. Run the complete automated verification with:

```bash
npm run check
```

To deploy it with InterSystems IRIS Community 2026.2, use Docker Compose:

```bash
docker compose up --build
```

The complete installation, connection and Windows validation instructions are available in the [project README](https://github.com/seypherWork/iris-ops-studio#readme).

## What I learned

The most valuable part of this project was treating validation as product work. Testing the real mutations uncovered issues that fixture-only testing could not establish, including state refresh after successful operations, exact task behavior and the need to verify process state independently after every request.

IRIS Ops Studio deliberately favors a smaller, clearly explained and fully tested operational surface. Its goal is to help an operator understand the system, understand the risk and confirm the intended action without turning routine administration into a maze.

I welcome feedback on the interface, safety model and the workflows that would be most useful in a future release.
