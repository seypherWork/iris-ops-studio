/// Loopback-only experimental wallet guard. Not installed by module.xml.
Class IrisOps.Guard.HttpApi Extends IrisOps.Guard.Api
{
Parameter ExecutionClass = "IrisOps.Guard.Execution";
Parameter RecoveryClass = "IrisOps.Guard.Recovery";
Parameter WriteResource = "%Admin_Wallet";
Parameter TargetKind = "wallet";

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/v1/session" Method="GET" Call="Session"/>
  <Route Url="/v1/connect" Method="POST" Call="Connect"/>
  <Route Url="/v1/wallet" Method="GET" Call="Wallet"/>
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

/// Installer-owned loopback origin, never taken from a request or forwarded header.
/// The absent setting preserves the original prepared laboratory profile.
ClassMethod ExpectedOrigin() As %String
{
    set value=$get(^IrisOpsGuardDeploy("install","origin"),"http://127.0.0.1:52801")
    if (value'?1"http://127.0.0.1:"4.5N)&&(value'?1"https://127.0.0.1:"4.5N) quit ""
    set port=$piece(value,":",3)
    if (+port<1024)!(+port>65535)!(port'=+port) quit ""
    quit value
}
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    set sc=##super(pUrl,pMethod,.pContinue)
    if 'pContinue quit sc
    set expected=..ExpectedOrigin(),origin=$get(%request.CgiEnvs("HTTP_ORIGIN"))
    if (expected="")!($get(%request.CgiEnvs("HTTP_HOST"))'=$piece(expected,"://",2))!((origin'="")&&(origin'=expected)) {
        set pContinue=0 do ..Reply(403,{"error":"request_origin_rejected"}) quit sc
    }
    // Trust only the native web gateway's TLS indicator, never proxy headers.
    if $extract(expected,1,8)="https://",$zconvert($get(%request.CgiEnvs("HTTPS")),"U")'="ON" {
        set pContinue=0 do ..Reply(403,{"error":"https_required"}) quit sc
    }
    do %response.SetHeader("Referrer-Policy","no-referrer")
    quit sc
}
ClassMethod ControlsValid() As %Boolean
{
    set origin=$get(%request.CgiEnvs("HTTP_ORIGIN"))
    set csrf=$get(%request.CgiEnvs("HTTP_X_IRISOPS_CSRF"))
    set expected=..ExpectedOrigin()
    quit (expected'="")&&(origin=expected)&&(csrf'="")&&(csrf=$get(%session.Data("IrisOpsGuard","csrf")))
}

/// Fixed official transport; separate method permits lab-only call counting.
ClassMethod LoginUpstream(password As %String, Output status As %Integer) As %DynamicObject
{
    quit ##class(IrisOps.Guard.HttpTransport).Request("login",password,$username,.status)
}

ClassMethod Connect() As %Status
{
    if '..ControlsValid() quit ..Reply(403,{"error":"request_controls_rejected"})
    // Host is defense in depth, not a network or TLS boundary by itself.
    // OnPreDispatch requires native HTTPS for a TLS-configured installation.
    if $get(%request.CgiEnvs("HTTP_HOST"))'=$piece(..ExpectedOrigin(),"://",2) quit ..Reply(403,{"error":"lab_origin_required"})
    do ##class(IrisOps.Guard.Vault).Clear()
    set status=400,result={"error":"invalid_login_request"}
    try {
        if '##class(IrisOps.Guard.Protocol).Body("user,password",.body) quit
        if (body.user'=$username)!(body.password="") quit
        set upstream=..LoginUpstream(body.password,.status)
        kill text,body
        if status'=200 { set result={"error":(upstream.%Get("error","upstream_login_rejected"))} quit }
        set seconds=upstream.%Get("remainingSeconds",0),cap=##class(IrisOps.Guard.Vault).Lifetime()
        if (upstream.%GetTypeOf("remainingSeconds")'="number")!(upstream.%GetTypeOf("expiresAt")'="number")!(seconds<1) { set status=502,result={"error":"invalid_upstream_expiry"} quit }
        if seconds>cap set seconds=cap
        if '##class(IrisOps.Guard.Vault).Seal(upstream.access,.seconds,upstream.expiresAt,upstream.%Get("refresh","")) { set status=503,result={"error":"custody_unavailable"} quit }
        set result={"connected":true,"actor":($username),"mode":"read-only","authorizationSeconds":(seconds),"experimental":true}
        if cap=300 {
            set result.idleSeconds=$get(%session.Data("IrisOpsGuard","auth","idleUntil"))-##class(IrisOps.Guard.Vault).Now()
            set result.renewalId=$get(%session.Data("IrisOpsGuard","auth","renewalId"))
            set result.renewalSeconds=$get(%session.Data("IrisOpsGuard","auth","renewUntil"))-##class(IrisOps.Guard.Vault).Now()
        }
    } catch e {
        do ##class(IrisOps.Guard.Vault).Clear()
        set status=503,result={"error":"connection_unavailable"}
    }
    kill text,body,upstream
    quit ..Reply(status,result)
}

ClassMethod Wallet() As %Status
{
    set name=$get(%request.Data("name",1))
    if name'?1A.63(1A,1N,1"_",1"-") quit ..Reply(400,{"error":"invalid_name"})
    if '##class(IrisOps.Guard.Vault).Open(.token) quit ..Reply(401,{"error":"upstream_reconnect_required"})
    set result=##class(IrisOps.Guard.HttpTransport).Request("wallet.read",token,name,.status)
    kill token
    if (status=401)!(status=403) do ##class(IrisOps.Guard.Vault).Clear()
    quit ..Reply(status,result)
}

ClassMethod Logout() As %Status
{
    if '..ControlsValid() quit ..Reply(403,{"error":"request_controls_rejected"})
    // Independent of the retired internal probe's application configuration.
    kill %session.Data("IrisOpsGuard")
    do %session.Logout(1)
    set %session.EndSession=1
    quit ..Reply(200,{"loggedOut":true})
}

ClassMethod Ready(Output token As %String) As %Boolean
{
    set token=""
    if '..ControlsValid() { do ..Reply(403,{"error":"request_controls_rejected"}) quit 0 }
    if '##class(IrisOps.Guard.Vault).Open(.token) { do ..Reply(401,{"error":"upstream_reconnect_required"}) quit 0 }
    quit 1
}
ClassMethod NewChannel() As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set count=0,key=""
    for { set key=$order(%session.Data("IrisOpsGuard","channels",key)) quit:key=""  set count=count+1 }
    if count>=4 quit ..Reply(429,{"error":"channel_limit_reconnect_required"})
    set id=##class(IrisOps.Guard.Protocol).Id()
    set %session.Data("IrisOpsGuard","channels",id,"kind")=..#TargetKind
    set %session.Data("IrisOpsGuard","channels",id,"until")=0,%session.Data("IrisOpsGuard","channels",id,"generation")=1,%session.Data("IrisOpsGuard","channels",id,"boot")=##class(IrisOps.Guard.Vault).Boot()
    quit ..Reply(200,{"channel":(id),"mode":"read-only"})
}
ClassMethod EnableChannel(id As %String) As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("confirmation",.body) quit ..Reply(400,{"error":"invalid_schema"})
    if body.confirmation'="ENABLE WRITES" quit ..Reply(400,{"error":"confirmation_mismatch"})
    if '$classmethod(..#ExecutionClass,"Channel",id) quit ..Reply(404,{"error":"channel_not_found"})
    if '$system.Security.Check(..#WriteResource,"U") quit ..Reply(403,{"error":"operation_denied"})
    set %session.Data("IrisOpsGuard","channels",id,"until")=##class(IrisOps.Guard.Vault).Now()+60
    set %session.Data("IrisOpsGuard","channels",id,"generation")=%session.Data("IrisOpsGuard","channels",id,"generation")+1
    quit ..Reply(200,{"channel":(id),"mode":"write-enabled","expiresIn":60})
}
ClassMethod DisableChannel(id As %String) As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("",.body) quit ..Reply(400,{"error":"invalid_schema"})
    if '$classmethod(..#ExecutionClass,"Channel",id) quit ..Reply(404,{"error":"channel_not_found"})
    set %session.Data("IrisOpsGuard","channels",id,"until")=0,%session.Data("IrisOpsGuard","channels",id,"generation")=%session.Data("IrisOpsGuard","channels",id,"generation")+1
    quit ..Reply(200,{"channel":(id),"mode":"read-only"})
}
ClassMethod Preview() As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("channel,action,name,EditResource,UseResource",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=##class(IrisOps.Guard.Execution).Preview(body,token,.status)
    quit ..Reply(status,result)
}
ClassMethod CancelPreview(id As %String) As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("",.body) quit ..Reply(400,{"error":"invalid_schema"})
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit ..Reply(400,{"error":"invalid_id"})
    if '$data(%session.Data("IrisOpsGuard","previews",id)) quit ..Reply(404,{"error":"preview_not_found"})
    set preview={}.%FromJSON(%session.Data("IrisOpsGuard","previews",id))
    if preview.%Get("kind","wallet")'=..#TargetKind quit ..Reply(404,{"error":"preview_not_found"})
    kill %session.Data("IrisOpsGuard","previews",id)
    quit ..Reply(200,{"cancelled":true})
}
ClassMethod Execute(id As %String) As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("confirmation,recoveryKey",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=$classmethod(..#ExecutionClass,"Execute",id,body,token,.status)
    quit ..Reply(status,result)
}
ClassMethod Receipt(id As %String) As %Status
{
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit ..Reply(404,{"error":"operation_not_found"})
    set status=503,result={"error":"receipt_unavailable"}
    try {
        set r=##class(IrisOps.Guard.Receipt).%OpenId(id)
        // Legacy GET remains session-bound. Explicit recovery POST is separate.
        if '$isobject(r) { set status=404,result={"error":"operation_not_found"} quit }
        if r.OperationKind()'=..#TargetKind { set status=404,result={"error":"operation_not_found"} quit }
        if (r.Actor'=$username)!(r.Binding'=##class(IrisOps.Guard.Protocol).Binding()) { set status=404,result={"error":"operation_not_found"} quit }
        if '##class(IrisOps.Guard.Vault).Open(.token) { set status=401,result={"error":"upstream_reconnect_required"} quit }
        set result=$classmethod(..#RecoveryClass,"Read",id,token,0,.status,$get(%request.CgiEnvs("HTTP_X_IRISOPS_RECOVERY_KEY")))
        if status=200 set result=result.receipt
    } catch e { set status=503,result={"error":"receipt_unavailable"} }
    kill token
    quit ..Reply(status,result)
}
ClassMethod Inspect(id As %String) As %Status
{
    quit ..Recover(id,0)
}
ClassMethod Reconcile(id As %String) As %Status
{
    quit ..Recover(id,1)
}
ClassMethod Recover(id As %String, record As %Boolean) As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("recoveryKey",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=$classmethod(..#RecoveryClass,"Read",id,token,record,.status,body.recoveryKey)
    kill body
    kill token
    quit ..Reply(status,result)
}

}
