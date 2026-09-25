"""Run through Embedded Python in the explicitly named disposable test container.

Creates IrisOps_TestUser/IrisOps_TestRole, tests HTTP boundaries, then removes
those fixtures. Passwords and JWTs exist only in this process and are not printed.
"""
import json
import secrets
import socket
import urllib.error
import urllib.request

import iris

if socket.gethostname() not in {"iris-ops-native-logs", "iris-ops-candidate"}:
    raise RuntimeError("This test is restricted to named disposable IRIS containers")

USER, ROLE = "IrisOps_TestUser", "IrisOps_TestRole"
users, roles = iris.cls("Security.Users"), iris.cls("Security.Roles")
if users.Exists(USER) or roles.Exists(ROLE):
    raise RuntimeError("Disposable fixture names already exist; refusing to replace them")


def check_status(status):
    if iris.system.Status.IsError(status):
        message = iris.system.Status.GetErrorText(status).replace(password, "[REDACTED]")
        raise RuntimeError("IRIS fixture operation failed: " + message)


def request(path, method="GET", body=None, token=None):
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request("http://127.0.0.1:52773" + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = {}
    return response.status, payload, response.headers


def unwrap(payload):
    return payload.get("result", payload)


def require(condition, label):
    if not condition:
        raise AssertionError(label)
    print("PASS " + label)


password = secrets.token_urlsafe(32) + "aA1!"
created_user = created_role = False
try:
    check_status(roles.Create(ROLE, "Disposable native log validation", "%Admin_Operate:U,%DB_IRISOPS:R", ""))
    created_role = True
    check_status(users.Create(USER, ROLE, password, "Disposable log reader", "USER", "", "", 0, 1))
    created_user = True
    diagnostic_status, _, _ = request("/api/admin/login", "POST", {"user": USER, "password": password})
    print("OBSERVED test account SysAdmin login HTTP=" + str(diagnostic_status))
    status, _, _ = request("/api/irisops-logs/logs?source=messages")
    require(status in (401, 403), "unauthenticated log read denied")

    status, payload, _ = request("/api/irisops-logs/login", "POST", {"user": USER, "password": password})
    require(status == 200 and "access_token" in unwrap(payload), "independent native log login (HTTP " + str(status) + ")")
    native = unwrap(payload)
    status, payload, headers = request("/api/irisops-logs/logs?source=messages", token=native["access_token"])
    require(status == 200, "operator reads real messages.log (HTTP " + str(status) + ", code " + str(payload.get("code", "none")) + ")")
    require(len(payload["result"]["records"]) > 0, "real native records returned")
    require(headers.get("Cache-Control") == "no-store", "log responses forbid caching")
    print("OBSERVED messages.log records=" + str(len(payload["result"]["records"])))
    for source in ("monitor", "alerts"):
        status, payload, _ = request("/api/irisops-logs/logs?source=" + source, token=native["access_token"])
        require(status in (200, 404), source + " reports records or explicit absence")
        print("OBSERVED " + source + " HTTP=" + str(status))
    for method in ("POST", "PUT", "PATCH", "DELETE"):
        status, _, _ = request("/api/irisops-logs/logs?source=messages", method, {}, native["access_token"])
        require(status == 405, method + " log mutation rejected by IRIS")
    status, _, _ = request("/api/irisops-logs/logs?source=../iris.cpf", token=native["access_token"])
    require(status == 400, "arbitrary file source refused")
    status, _, _ = request("/api/irisops-logs/logs?source=messages&source=alerts", token=native["access_token"])
    require(status == 400, "ambiguous duplicate source refused")

    status, admin, _ = request("/api/admin/login", "POST", {"user": USER, "password": password})
    require(status == 200 and "access_token" in unwrap(admin), "separate SysAdmin login succeeds")
    status, _, _ = request("/api/irisops-logs/logs?source=messages", token=unwrap(admin)["access_token"])
    require(status == 200, "IRIS shared-auth token still requires authorized operator identity")
    status, _, _ = request("/api/admin/v2/tasks", token=native["access_token"])
    require(status == 200, "IRIS token is not falsely described as an application-scoped credential")

    status, refreshed, _ = request("/api/irisops-logs/refresh", "POST",
        {"refresh_token": native["refresh_token"], "grant_type": "refresh_token"})
    require(status == 200 and "access_token" in unwrap(refreshed), "native log JWT renewal")
    status, _, _ = request("/api/irisops-logs/logs?source=messages", token=unwrap(refreshed)["access_token"])
    require(status == 200, "renewed JWT reads native logs")

    check_status(users.Delete(USER))
    created_user = False
    check_status(roles.Delete(ROLE))
    created_role = False
    check_status(roles.Create(ROLE, "Disposable restricted log reader", "%DB_IRISOPS:R", ""))
    created_role = True
    check_status(users.Create(USER, ROLE, password, "Disposable restricted reader", "USER", "", "", 0, 1))
    created_user = True
    status, restricted, _ = request("/api/irisops-logs/login", "POST", {"user": USER, "password": password})
    if status == 200 and "access_token" in unwrap(restricted):
        status, _, _ = request("/api/irisops-logs/logs?source=messages", token=unwrap(restricted)["access_token"])
    require(status in (401, 403), "restricted account cannot read native logs")
finally:
    if created_user:
        check_status(users.Delete(USER))
    if created_role:
        check_status(roles.Delete(ROLE))
    require(not users.Exists(USER) and not roles.Exists(ROLE), "disposable user and role removed")
