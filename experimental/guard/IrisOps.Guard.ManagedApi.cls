/// Deployment lifecycle wrapper. Existing operation and receipt contracts remain.
Class IrisOps.Guard.ManagedApi Extends IrisOps.Guard.CombinedApi
{
Parameter BuildId = "managed-lab-a";
Parameter UserApi = "IrisOps.Guard.UserApi";
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
<Route Url="/v1/session" Method="GET" Call="Session"/>
<Route Url="/v1/connect" Method="POST" Call="Connect"/>
<Route Url="/v1/renew" Method="POST" Call="Renew"/>
<Route Url="/v1/logout" Method="POST" Call="Logout"/>
<Route Url="/v1/deployment" Method="GET" Call="DeploymentStatus"/>
<Route Url="/v1/capabilities" Method="GET" Call="Capabilities"/>
<Route Url="/v1/wallet/state" Method="GET" Call="Wallet"/>
<Route Url="/v1/webapp/state" Method="GET" Call="Webapp"/>
<Route Url="/v1/role/state" Method="GET" Call="Role"/>
<Route Url="/v1/user/state" Method="GET" Call="User"/>
<Route Url="/v1/:kind/channels" Method="POST" Call="ScopedChannel"/>
<Route Url="/v1/:kind/channels/:id/write-access" Method="POST" Call="ScopedEnable"/>
<Route Url="/v1/:kind/channels/:id/write-access" Method="DELETE" Call="ScopedDisable"/>
<Route Url="/v1/:kind/previews" Method="POST" Call="ScopedPreview"/>
<Route Url="/v1/:kind/previews/:id" Method="DELETE" Call="ScopedCancel"/>
<Route Url="/v1/:kind/previews/:id/execute" Method="POST" Call="ScopedExecute"/>
<Route Url="/v1/:kind/operations/:id/inspect" Method="POST" Call="ScopedInspect"/>
<Route Url="/v1/:kind/operations/:id/reconcile" Method="POST" Call="ScopedReconcile"/>
</Routes>
}
/// Optional installed feature AND explicit enrollment are both required.
/// Capability advertisement remains optional and requires both gates below.
ClassMethod ApiClass(kind As %String) As %String
{
    if kind'="user" quit ##super(kind)
    if ##class(IrisOps.Guard.TargetPolicy).Target("user")="" quit ""
    if '##class(%Dictionary.CompiledClass).%ExistsId(..#UserApi) quit ""
    quit ..#UserApi
}
ClassMethod User() As %Status
{
    set class=..ApiClass("user")
    if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"User")
}
ClassMethod ExtraCapabilities(value As %DynamicObject) As %DynamicObject
{
    set target="",available=0
    if ..ApiClass("user")'="" set target=##class(IrisOps.Guard.TargetPolicy).Target("user")
    if target'="" set available=$system.Security.Check("%Admin_Secure","U")&&$system.Security.Check("%DB_IRISSYS","R")
    set entry={"target":(target),"reason":($select(target="":"target_policy_required",available:"available",1:"native_permission_required"))}
    do entry.%Set("available",available,"boolean")
    set value.user=entry
    quit value
}
ClassMethod DeploymentStatus() As %Status
{
    set state=##class(IrisOps.Guard.Deployment).State()
    quit ..Reply(200,{"mode":(state.mode),"generation":(state.generation),"build":(state.build)})
}
ClassMethod Gate(writing As %Boolean = 0, bind As %Boolean = 0) As %Boolean
{
    set valid=0,error="deployment_unavailable",status=503
    try {
        set state=##class(IrisOps.Guard.Deployment).State()
        if (state.%Get("owner")'="irisops-managed-lab-v1")!(state.%Get("build")'=..#BuildId) quit
        if (state.mode'="READ_ONLY")&&(state.mode'="ACTIVE") quit
        if bind {
            if $get(%session.Data("IrisOpsDeployment"))'=state.generation do ##class(IrisOps.Guard.Vault).Clear()
            set %session.Data("IrisOpsDeployment")=state.generation
        }
        if $get(%session.Data("IrisOpsDeployment"))'=state.generation { set status=401,error="deployment_changed_reconnect_required" quit }
        if writing,state.mode'="ACTIVE" { set status=403,error="deployment_read_only" quit }
        if writing {
            set policy=##class(IrisOps.Guard.TargetPolicy).Current()
            if policy.%Size()=0 { set status=403,error="target_policy_required" quit }
        }
        set valid=1
    } catch e { set valid=0 }
    if 'valid {
        if status'=403 do ##class(IrisOps.Guard.Vault).Clear()
        do ..Reply(status,{"error":(error)})
    }
    quit valid
}
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    set sc=##super(pUrl,pMethod,.pContinue)
    if 'pContinue quit sc
    set bind=(pUrl="/v1/session")&&(pMethod="GET")
    set pContinue=..Gate(0,bind)
    quit sc
}
ClassMethod Connect() As %Status
{
    lock +^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard"):2
    if '$test quit ..Reply(503,{"error":"deployment_busy"})
    try {
        set sc=1
        if ..Gate() set sc=##super()
    } catch e { set sc=..Reply(503,{"error":"connection_unavailable"}) }
    lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
    quit sc
}
/// Serialized with mutations and lifecycle changes. Renewal never grants writes.
ClassMethod Renew() As %Status
{
    if ##class(IrisOps.Guard.Vault).Lifetime()'=300 quit ..Reply(403,{"error":"https_required"})
    if '..ControlsValid() quit ..Reply(403,{"error":"request_controls_rejected"})
    if '##class(IrisOps.Guard.Protocol).Body("confirmation,renewalId",.body) quit ..Reply(400,{"error":"invalid_schema"})
    if (body.confirmation'="RENEW READ ONLY")!('##class(IrisOps.Guard.Protocol).IsId(body.renewalId)) quit ..Reply(400,{"error":"confirmation_mismatch"})
    lock +^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard"):2
    if '$test quit ..Reply(503,{"error":"deployment_busy"})
    set sc=1
    try {
        if '..Gate() quit
        set reason=##class(IrisOps.Guard.Vault).ConsumeRenewal(body.renewalId,.refresh,.until)
        if reason'="" { set sc=..Reply($select(reason="stale_renewal":409,1:401),{"error":(reason)}) quit }
        set upstream=##class(IrisOps.Guard.HttpTransport).Request("renew",refresh,$username,.status)
        kill refresh
        if status'=200 { set sc=..Reply(401,{"error":"renewal_failed_reconnect_required"}) quit }
        if body.renewalId'=$get(%session.Data("IrisOpsGuard","auth","pendingRenewal")) { set sc=..Reply(401,{"error":"renewal_cancelled_reconnect_required"}) quit }
        set seconds=upstream.remainingSeconds
        if seconds>300 set seconds=300
        if '##class(IrisOps.Guard.Vault).Seal(upstream.access,.seconds,upstream.expiresAt,upstream.refresh,until) { set sc=..Reply(401,{"error":"renewal_failed_reconnect_required"}) quit }
        set result={"connected":true,"actor":($username),"mode":"read-only","authorizationSeconds":(seconds),"idleSeconds":($get(%session.Data("IrisOpsGuard","auth","idleUntil"))-##class(IrisOps.Guard.Vault).Now()),"renewalId":($get(%session.Data("IrisOpsGuard","auth","renewalId"))),"renewalSeconds":(until-##class(IrisOps.Guard.Vault).Now())}
        set sc=..Reply(200,result)
    } catch e {
        do ##class(IrisOps.Guard.Vault).Clear()
        set sc=..Reply(401,{"error":"renewal_failed_reconnect_required"})
    }
    kill body,refresh,upstream
    lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
    quit sc
}
ClassMethod InvokeWrite(kind As %String, method As %String, id As %String = "") As %Status
{
    set class=..ApiClass(kind)
    if class="" quit ..Reply(404,{"error":"operation_not_found"})
    if (method'="EnableChannel")&&(method'="Preview")&&(method'="Execute") quit ..Reply(404,{"error":"operation_not_found"})
    lock +^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard"):2
    if '$test quit ..Reply(503,{"error":"deployment_busy"})
    try {
        set sc=1
        if ..Gate(1) {
            if method="Preview" { set sc=$classmethod(class,method) }
            else { set sc=$classmethod(class,method,id) }
        }
    } catch e { set sc=..Reply(503,{"error":"guard_request_unavailable"}) }
    lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
    quit sc
}
ClassMethod ScopedEnable(kind As %String, id As %String) As %Status { quit ..InvokeWrite(kind,"EnableChannel",id) }
ClassMethod ScopedPreview(kind As %String) As %Status { quit ..InvokeWrite(kind,"Preview") }
ClassMethod ScopedExecute(kind As %String, id As %String) As %Status { quit ..InvokeWrite(kind,"Execute",id) }
}
