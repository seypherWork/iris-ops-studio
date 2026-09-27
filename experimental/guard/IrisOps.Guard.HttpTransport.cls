/// Experimental fixed-loopback client. Never accepts a caller-selected URL.
Class IrisOps.Guard.HttpTransport Extends %RegisteredObject
{

ClassMethod ValidPolicy(value As %String) As %Boolean
{
    if value="" quit 1
    if ($length(value)>64)!($length(value,":")>2) quit 0
    set resource=$piece(value,":",1),permission=$zconvert($piece(value,":",2),"U")
    if resource'?0.1"%"1A.63(1A,1N,1"_",1"-",1".",1"$") quit 0
    if $length(value,":")=1 quit 1
    quit (permission="R")!(permission="READ")!(permission="W")!(permission="WRITE")!(permission="U")!(permission="USE")
}

ClassMethod WriteWallet(token As %String, name As %String, edit As %String, use As %String, Output status As %Integer) As %DynamicObject
{
    set status=400,result={"error":"write_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("wallet",name) quit result
    if (##class(IrisOps.Guard.Protocol).Policy(edit,"WRITE")'=edit)!(##class(IrisOps.Guard.Protocol).Policy(use,"READ")'=use) quit result
    if (edit="")!(use="") quit result
    set status=503,result={"error":"write_outcome_unknown"}
    try {
        set req=##class(%Net.HttpRequest).%New()
        set req.Server="127.0.0.1",req.Port=52773,req.Https=0,req.FollowRedirect=0,req.ProxyServer="",req.ProxyPort=0
        set req.OpenTimeout=3,req.Timeout=5,req.WriteTimeout=5,req.ContentType="application/json"
        do req.SetHeader("Authorization","Bearer "_token)
        do req.SetHeader("Accept","application/json")
        do req.EntityBody.Write({"EditResource":(edit),"UseResource":(use)}.%ToJSON())
        // A single send. There is deliberately no token refresh or retry here.
        set sc=req.Send("PUT","/api/admin/v2/wallet/collection?name="_name)
        if $system.Status.IsError(sc) quit
        if '$isobject(req.HttpResponse) quit
        set status=+req.HttpResponse.StatusCode
        set result={"accepted":(status=200)}
    } catch e { set status=503 }
    kill token,req
    quit result
}

ClassMethod Request(operation As %String, secret As %String, name As %String, Output status As %Integer) As %DynamicObject
{
    set status=503,result={"error":"upstream_unavailable"}
    try {
        if (operation'="login")&&(operation'="renew")&&(operation'="wallet.read") quit
        set req=##class(%Net.HttpRequest).%New()
        set req.Server="127.0.0.1",req.Port=52773,req.Https=0
        set req.FollowRedirect=0,req.ProxyServer="",req.ProxyPort=0
        set req.OpenTimeout=3,req.Timeout=5,req.WriteTimeout=5
        do req.SetHeader("Accept","application/json")
        if (operation="login")!(operation="renew") {
            set req.ContentType="application/json"
            if operation="login" {
                set body={"user":(name),"password":(secret)},path="/api/admin/login"
            } else {
                set body={"refresh_token":(secret),"grant_type":"refresh_token"},path="/api/admin/refresh"
            }
            do req.EntityBody.Write(body.%ToJSON())
            // Explicit caller only. Never retry a consumed refresh credential.
            set sc=req.Post(path)
            do req.EntityBody.Clear()
            kill body,secret
        } else {
            if name'?1A.63(1A,1N,1"_",1"-") { set status=400,result={"error":"invalid_name"} quit }
            if '##class(IrisOps.Guard.TargetPolicy).Permits("wallet",name) { set status=403,result={"error":"target_not_allowed"} quit }
            do req.SetHeader("Authorization","Bearer "_secret)
            set sc=req.Get("/api/admin/v2/wallet/collection?name="_name)
            kill secret
        }
        if $system.Status.IsError(sc) quit
        if '$isobject(req.HttpResponse) quit
        set status=+req.HttpResponse.StatusCode
        if status'=200 { set result={"error":"upstream_rejected"} quit }
        // Bound the response before parsing. Never echo upstream errors or HTML.
        set text=req.HttpResponse.Data.Read(32769)
        if ($length(text)>32768)!('req.HttpResponse.Data.AtEnd) { set status=502,result={"error":"upstream_response_too_large"} quit }
        set raw={}.%FromJSON(text),body=raw.%Get("result")
        if (operation="login")!(operation="renew"),raw.%GetTypeOf("access_token")="string" set body=raw
        if '$isobject(body) { set status=502,result={"error":"invalid_upstream_shape"} quit }
        if (operation="login")!(operation="renew") {
            set upstreamToken=body.%Get("access_token")
            if (body.%GetTypeOf("access_token")'="string")!($length(upstreamToken)>16384)!($length(upstreamToken)<20) { set status=502,result={"error":"invalid_upstream_auth"} quit }
            // Use the documented login response's exp, never decode or expose JWTs.
            // Subtract one second so custody cannot outlive native expiration.
            if body.%GetTypeOf("exp")'="number" { set status=502,result={"error":"invalid_upstream_expiry"} quit }
            set unixNow=##class(IrisOps.Guard.Vault).Now()-($zdateh("1970-01-01",3)*86400)
            set remaining=(body.exp-unixNow)\1-1
            if remaining<1 { set status=401,result={"error":"upstream_authorization_expired"} quit }
            // Internal-only result. HttpApi must seal it and never serialize it.
            set result={"access":(upstreamToken),"remainingSeconds":(remaining),"expiresAt":(body.exp)}
            if ##class(IrisOps.Guard.Vault).Lifetime()=300 {
                set refresh=body.%Get("refresh_token","")
                if (body.%GetTypeOf("refresh_token")'="string")!($length(refresh)<20)!($length(refresh)>16384)!(body.%Get("sub","")'=name) { set status=502,result={"error":"invalid_upstream_auth"} quit }
                set result.refresh=refresh
            }
        } else {
            if (body.%GetTypeOf("EditResource")'="string")!(body.%GetTypeOf("UseResource")'="string") { set status=502,result={"error":"incomplete_upstream_shape"} quit }
            if body.%IsDefined("Name"),((body.%GetTypeOf("Name")'="string")!(body.Name'=name)) { set status=502,result={"error":"wrong_upstream_target"} quit }
            if '..ValidPolicy(body.EditResource)!('..ValidPolicy(body.UseResource)) { set status=502,result={"error":"invalid_policy_metadata"} quit }
            set result={"name":(name),"EditResource":(body.EditResource),"UseResource":(body.UseResource)}
        }
    } catch e {
        set status=503,result={"error":"upstream_unavailable"}
    }
    quit result
}

}
