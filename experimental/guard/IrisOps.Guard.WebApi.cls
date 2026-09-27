/// Separate lab CSP session/application; no unguarded native browser fallback.
Class IrisOps.Guard.WebApi Extends IrisOps.Guard.HttpApi
{
Parameter TargetKind = "webapp";
Parameter WriteResource = "%Admin_Secure";
Parameter ExecutionClass = "IrisOps.Guard.WebExecution";
Parameter RecoveryClass = "IrisOps.Guard.WebRecovery";
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
<Route Url="/v1/session" Method="GET" Call="Session"/>
<Route Url="/v1/connect" Method="POST" Call="Connect"/>
<Route Url="/v1/webapp" Method="GET" Call="Webapp"/>
<Route Url="/v1/logout" Method="POST" Call="Logout"/>
<Route Url="/v1/channels" Method="POST" Call="NewChannel"/>
<Route Url="/v1/channels/:id/write-access" Method="POST" Call="EnableChannel"/>
<Route Url="/v1/channels/:id/write-access" Method="DELETE" Call="DisableChannel"/>
<Route Url="/v1/previews" Method="POST" Call="Preview"/>
<Route Url="/v1/previews/:id" Method="DELETE" Call="CancelPreview"/>
<Route Url="/v1/previews/:id/execute" Method="POST" Call="Execute"/>
<Route Url="/v1/operations/:id" Method="GET" Call="Receipt"/>
<Route Url="/v1/operations/:id/inspect" Method="POST" Call="Inspect"/>
<Route Url="/v1/operations/:id/reconcile" Method="POST" Call="Reconcile"/>
</Routes>
}
ClassMethod Preview() As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("channel,action,name,Enabled",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=$classmethod(..#ExecutionClass,"Preview",body,token,.status)
    quit ..Reply(status,result)
}
ClassMethod Webapp() As %Status
{
    if '##class(IrisOps.Guard.Vault).Open(.token) quit ..Reply(401,{"error":"upstream_reconnect_required"})
    if '$system.Security.Check("%Admin_Secure","U") quit ..Reply(403,{"error":"operation_denied"})
    set target=$get(%request.Data("name",1))
    if target="" set target=##class(IrisOps.Guard.TargetPolicy).Target("webapp")
    set result=##class(IrisOps.Guard.WebTransport).Read(token,.status,target)
    if status=200 {
        if '##class(IrisOps.Guard.Vault).Open(.current) { set status=401,result={"error":"upstream_reconnect_required"} }
        elseif (current'=token)!('$system.Security.Check("%Admin_Secure","U")) { set status=403,result={"error":"operation_denied"} }
    }
    kill token,current
    quit ..Reply(status,result)
}
}
