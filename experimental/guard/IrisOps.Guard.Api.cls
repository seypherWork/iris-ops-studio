/// Read-only feasibility probe. No mutation route exists in this prototype.
Class IrisOps.Guard.Api Extends %CSP.REST
{

Parameter UseSession = 1;
Parameter HandleCorsRequest = 0;

/// Like the native %Api.Admin entry point, do not require generic database
/// access merely to enter the REST dispatcher. Application authentication is
/// still native; every administrative operation checks its own resource.
ClassMethod AccessCheck(Output pAuthorized As %Boolean = 0) As %Status
{
    set pAuthorized=($username'="UnknownUser")&&($username'="")
    quit 1
}

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/v1/session" Method="GET" Call="Session"/>
  <Route Url="/v1/wallet" Method="GET" Call="Wallet"/>
  <Route Url="/v1/logout" Method="POST" Call="Logout"/>
</Routes>
}

ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    set %response.ContentType="application/json"
    do %response.SetHeader("Cache-Control","no-store")
    do %response.SetHeader("X-Content-Type-Options","nosniff")
    set pContinue=1
    if ($username="UnknownUser")!($username="") {
        set pContinue=0
        do ..Reply(401,{"error":"authentication_required"})
    }
    quit 1
}

ClassMethod Reply(status As %Integer, value As %DynamicObject) As %Status
{
    set %response.Status=status
    write value.%ToJSON()
    quit 1
}

ClassMethod Session() As %Status
{
    if '$data(%session.Data("IrisOpsGuard","csrf")) {
        set %session.Data("IrisOpsGuard","csrf")=$system.Encryption.Base64Encode($system.Encryption.GenCryptRand(32),1)
    }
    set value={"actor":($username),"mode":"read-only","experimental":true,"csrf":(%session.Data("IrisOpsGuard","csrf")),"sessionTimeoutSeconds":600}
    quit ..Reply(200,value)
}

ClassMethod Wallet() As %Status
{
    try {
        set name=$get(%request.Data("name",1))
        if name'?1A.63(1A,1N,1"_",1"-") { set status=400,value={"error":"invalid_name"} }
        else {
            set actor=$username,ns=$namespace,request=%request,response=%response
            set value=##class(IrisOps.Guard.Transport).ReadWallet(name,.status)
            if ($username'=actor)!($namespace'=ns)!(%request'=request)!(%response'=response) { set status=500,value={"error":"context_not_restored"} }
        }
    } catch e {
        set status=500,value={"error":"handler_failed"}
    }
    quit ..Reply(status,value)
}

ClassMethod Logout() As %Status
{
    set origin=$get(%request.CgiEnvs("HTTP_ORIGIN"))
    if (origin'=$get(^|"IRISOPS"|IrisOpsGuardConfig("origin")))!(origin="") quit ..Reply(403,{"error":"origin_rejected"})
    set csrf=$get(%request.CgiEnvs("HTTP_X_IRISOPS_CSRF"))
    if (csrf="")!(csrf'=$get(%session.Data("IrisOpsGuard","csrf"))) quit ..Reply(403,{"error":"csrf_rejected"})
    kill %session.Data("IrisOpsGuard")
    do %session.Logout(1)
    set %session.EndSession=1
    quit ..Reply(200,{"loggedOut":true})
}

}
