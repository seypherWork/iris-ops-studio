/// Fixed loopback, documented SysAdmin API only. No service identity or retry.
Class IrisOps.Guard.WebTransport Extends %RegisteredObject
{
/// Canonical JSON: object keys sorted, array order retained (conservative).
ClassMethod Canonical(value As %DynamicAbstractObject) As %String
{
    if value.%IsA("%DynamicArray") {
        set out="["
        for i=0:1:value.%Size()-1 {
            if i set out=out_","
            set v=value.%Get(i),one=[]
            if $isobject(v) { set out=out_..Canonical(v) }
            else { do one.%Push(v,value.%GetTypeOf(i)) set text=one.%ToJSON(),out=out_$extract(text,2,*-1) }
        }
        quit out_"]"
    }
    set it=value.%GetIterator()
    while it.%GetNext(.k,.v) { set keys(k)=1 }
    set out="{",k="",n=0
    for {
        set k=$order(keys(k)) quit:k=""
        if n set out=out_","
        set n=n+1,one=[] do one.%Push(k)
        set text=one.%ToJSON(),out=out_$extract(text,2,*-1)_":",v=value.%Get(k),one=[]
        if $isobject(v) { set out=out_..Canonical(v) }
        else { do one.%Push(v,value.%GetTypeOf(k)) set text=one.%ToJSON(),out=out_$extract(text,2,*-1) }
    }
    quit out_"}"
}
/// Fail closed on undocumented, malformed or missing essential metadata.
/// Full configuration stays request-local; only a digest and Enabled escape.
ClassMethod Metadata(raw As %DynamicObject, Output metadata As %DynamicObject, target As %String = "") As %Boolean
{
    set metadata={}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("webapp",target) quit 0
    if '$isobject(raw) quit 0
    if 'raw.%IsA("%DynamicObject") quit 0
    set strings=",ChangePasswordPage,CookiePath,Description,DispatchClass,ErrorPage,EventClass,GroupById,LoginPage,NameSpace,Package,Path,PermittedClasses,Resource,ServeFiles,SuperClass,UseCookies,SessionScope,UserCookieScope,WSGIAppLocation,WSGIAppName,WSGICallable,"
    set bools=",AutoCompile,CorsCredentialsAllowed,CSPZENEnabled,CSRFToken,DeepSeeEnabled,Enabled,iKnowEnabled,InbndWebServicesEnabled,IsNameSpaceDefault,JWTAuthEnabled,LockCSPName,Recurse,RedirectEmptyPath,TraceEnabled,TwoFactorEnabled,WSGIDebug,"
    set numbers=",AutheEnabled,JWTAccessTokenTimeout,JWTRefreshTokenTimeout,ServeFilesTimeout,Timeout,Type,"
    set it=raw.%GetIterator(),valid=1,config={}
    while it.%GetNext(.k,.v) {
        set type=raw.%GetTypeOf(k),tag=","_k_","
        if k="Name" { if (type'="string")!(v'=target) set valid=0 continue }
        if k="WSGIType" {
            // 2026.2.0.221U returns the label, whereas the OpenAPI snapshot says integer.
            if type="number" { if (v'=0)&&(v'=1) set valid=0 }
            elseif type="string" { if (v'="WSGI")&&(v'="ASGI") set valid=0 }
            else { set valid=0 }
        }
        elseif strings[tag { if (type'="string")!($length(v)>4096) set valid=0 }
        elseif bools[tag { if type'="boolean" set valid=0 }
        elseif numbers[tag { if (type'="number")!(v\1'=v)!(v<0) set valid=0 }
        elseif (k="CorsAllowlist")!(k="CorsHeadersList")!(k="MatchRoles") {
            if type'="array" { set valid=0 }
            elseif k="MatchRoles" { if v.%Size()'=0 set valid=0 }
            else {
                if v.%Size()>64 set valid=0
                for i=0:1:v.%Size()-1 { if v.%GetTypeOf(i)'="string" set valid=0 }
            }
        }
        else { set valid=0 }
        if k'="Enabled" {
            // Dynamic arrays/objects are references, not scalar conversion types.
            if $isobject(v) { do config.%Set(k,v) }
            else { do config.%Set(k,v,type) }
        }
    }
    if 'valid quit 0
    // Never fingerprint a partial response as though it were full configuration.
    set required=strings_bools_",AutheEnabled,JWTAccessTokenTimeout,JWTRefreshTokenTimeout,ServeFilesTimeout,Timeout,WSGIType,CorsAllowlist,CorsHeadersList,MatchRoles,"
    for i=1:1:$length(required,",") {
        set k=$piece(required,",",i)
        if (k'="")&&('raw.%IsDefined(k)) set valid=0
    }
    if 'valid quit 0
    if raw.%GetTypeOf("Enabled")'="boolean" quit 0
    if raw.%GetTypeOf("IsNameSpaceDefault")'="boolean" quit 0
    if raw.IsNameSpaceDefault quit 0
    if (raw.NameSpace="")!($extract(raw.NameSpace,1)="%") quit 0
    // The web-app endpoint omits Type on 2026.2.0.221U; reject another type if supplied.
    if raw.%IsDefined("Type"),raw.%Get("Type")'=2 quit 0
    if raw.AutheEnabled'=32 quit 0
    if ($extract(raw.DispatchClass,1)="%")!($extract($zconvert(raw.DispatchClass,"L"),1,14)="irisops.guard.") quit 0
    if '##class(IrisOps.Guard.TargetPolicy).PrivateResource(raw.Resource) quit 0
    // Custom CSP/REST applications are enrolled explicitly. No WSGI runtime.
    if (raw.%Get("WSGIAppLocation")'="")!(raw.%Get("WSGIAppName")'="") quit 0
    if (raw.%Get("WSGICallable")'="")&&(raw.%Get("WSGICallable")'="app") quit 0
    if raw.%GetTypeOf("MatchRoles")'="array" quit 0
    set hash=$zconvert($system.Encryption.ToHex($system.Encryption.SHAHash(256,..Canonical(config))),"L")
    set metadata={"configurationHash":(hash)}
    do metadata.%Set("Enabled",raw.Enabled,"boolean")
    quit 1
}
ClassMethod Read(token As %String, Output status As %Integer, target As %String = "") As %DynamicObject
{
    set status=503,result={"error":"upstream_unavailable"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("webapp",target) { set status=403 quit {"error":"target_not_allowed"} }
    try {
        set req=..RequestObject(token)
        set sc=req.Get("/api/admin/v2/web-app?name=%2Fcsp%2F"_$extract(target,6,*))
        if $system.Status.IsError(sc) quit
        if '$isobject(req.HttpResponse) quit
        set status=+req.HttpResponse.StatusCode
        if status'=200 quit
        set text=req.HttpResponse.Data.Read(32769)
        if ($length(text)>32768)!('req.HttpResponse.Data.AtEnd) { set status=502 quit }
        set raw={}.%FromJSON(text)
        if '..Metadata(raw.%Get("result"),.result,target) { set status=502,result={"error":"invalid_webapp_metadata"} }
    } catch e { set status=503,result={"error":"upstream_unavailable"} }
    kill token,req,raw,text
    quit result
}
ClassMethod RequestObject(token As %String) As %Net.HttpRequest
{
    set req=##class(%Net.HttpRequest).%New()
    set req.Server="127.0.0.1",req.Port=52773,req.Https=0,req.FollowRedirect=0,req.ProxyServer="",req.ProxyPort=0
    set req.OpenTimeout=3,req.Timeout=5,req.WriteTimeout=5,req.ContentType="application/json"
    do req.SetHeader("Authorization","Bearer "_token),req.SetHeader("Accept","application/json")
    quit req
}
ClassMethod Write(token As %String, enabled As %Boolean, Output status As %Integer, target As %String = "")
{
    set status=503
    if '##class(IrisOps.Guard.TargetPolicy).Permits("webapp",target) { set status=403 quit }
    try {
        set req=..RequestObject(token),body={}
        do body.%Set("Enabled",enabled,"boolean")
        // Only Enabled. The API explicitly permits partial updates. This cannot
        // overwrite old authentication/roles/path values from a prior snapshot.
        do req.EntityBody.Write(body.%ToJSON())
        set sc=req.Send("PUT","/api/admin/v2/web-app?name=%2Fcsp%2F"_$extract(target,6,*))
        if $system.Status.IsError(sc) quit
        if $isobject(req.HttpResponse) set status=+req.HttpResponse.StatusCode
    } catch e { set status=503 }
    kill req,token
}
}
