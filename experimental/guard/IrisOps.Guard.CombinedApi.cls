/// Explicitly enrolled operations share native identity, never channel authority.
Class IrisOps.Guard.CombinedApi Extends IrisOps.Guard.HttpApi
{
Parameter WalletApi = "IrisOps.Guard.HttpApi";
Parameter WebApi = "IrisOps.Guard.WebApi";
Parameter RoleApi = "IrisOps.Guard.RoleApi";
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
<Route Url="/v1/session" Method="GET" Call="Session"/>
<Route Url="/v1/connect" Method="POST" Call="Connect"/>
<Route Url="/v1/logout" Method="POST" Call="Logout"/>
<Route Url="/v1/capabilities" Method="GET" Call="Capabilities"/>
<Route Url="/v1/wallet/state" Method="GET" Call="Wallet"/>
<Route Url="/v1/webapp/state" Method="GET" Call="Webapp"/>
<Route Url="/v1/role/state" Method="GET" Call="Role"/>
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
ClassMethod ApiClass(kind As %String) As %String
{
    if kind="wallet" quit ..#WalletApi
    if kind="webapp" quit ..#WebApi
    if kind="role" quit ..#RoleApi
    quit ""
}
ClassMethod Capabilities() As %Status
{
    if '##class(IrisOps.Guard.Vault).Open(.token) quit ..Reply(401,{"error":"upstream_reconnect_required"})
    kill token
    set wallet=$system.Security.Check("%Admin_Wallet","U")
    set web=$system.Security.Check("%Admin_Secure","U")&&$system.Security.Check("%DB_IRISSYS","R")
    set current=##class(IrisOps.Guard.TargetPolicy).Current(),resources=[],enrolled=(current.%Size()>0)
    set walletTarget="",webTarget="",roleTarget="",generation=""
    if enrolled {
        set walletTarget=current.config.wallet,webTarget=current.config.webapp,generation=current.generation
        if current.config.%IsDefined("role") set roleTarget=current.config.role
        for i=1:1:$length(current.config.resources,",") { do resources.%Push($piece(current.config.resources,",",i)) }
    }
    set wallet=wallet&&enrolled,web=web&&enrolled
    set role=(roleTarget'="")&&$system.Security.Check("%Admin_Secure","U")&&$system.Security.Check("%DB_IRISSYS","R")
    set w={"target":(walletTarget),"reason":($select('enrolled:"target_policy_required",wallet:"available",1:"native_permission_required"))}
    set a={"target":(webTarget),"reason":($select('enrolled:"target_policy_required",web:"available",1:"native_permission_required"))}
    set r={"target":(roleTarget),"reason":($select(roleTarget="":"target_policy_required",role:"available",1:"native_permission_required"))}
    do w.%Set("available",wallet,"boolean"),a.%Set("available",web,"boolean"),r.%Set("available",role,"boolean")
    quit ..Reply(200,..ExtraCapabilities({"policy":{"generation":(generation),"resources":(resources)},"wallet":(w),"webapp":(a),"role":(r)}))
}
ClassMethod ExtraCapabilities(value As %DynamicObject) As %DynamicObject { quit value }
ClassMethod Wallet() As %Status
{
    if '##class(IrisOps.Guard.TargetPolicy).Permits("wallet",$get(%request.Data("name",1))) quit ..Reply(400,{"error":"target_not_allowed"})
    quit $classmethod(..#WalletApi,"Wallet")
}
ClassMethod Webapp() As %Status { quit $classmethod(..#WebApi,"Webapp") }
ClassMethod Role() As %Status { quit $classmethod(..#RoleApi,"Role") }
ClassMethod ScopedChannel(kind As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"NewChannel")
}
ClassMethod ScopedEnable(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"EnableChannel",id)
}
ClassMethod ScopedDisable(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"DisableChannel",id)
}
ClassMethod ScopedPreview(kind As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"Preview")
}
ClassMethod ScopedCancel(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"CancelPreview",id)
}
ClassMethod ScopedExecute(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"Execute",id)
}
ClassMethod ScopedInspect(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"Inspect",id)
}
ClassMethod ScopedReconcile(kind As %String, id As %String) As %Status
{
    set class=..ApiClass(kind) if class="" quit ..Reply(404,{"error":"operation_not_found"})
    quit $classmethod(class,"Reconcile",id)
}
}
