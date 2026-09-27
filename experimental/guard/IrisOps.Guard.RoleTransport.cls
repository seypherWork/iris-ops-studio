/// Native, identity-preserving access to ONE explicitly enrolled role and resource.
/// No service user, internal SysAdmin class or browser-supplied destination.
Class IrisOps.Guard.RoleTransport Extends %RegisteredObject
{
ClassMethod Permissions(value As %String) As %String
{
    if (value="")!($length(value)>3) quit ""
    set upper=$zconvert(value,"U"),normalized=""
    for i=1:1:$length(upper) {
        set c=$extract(upper,i)
        if (c'="R")&&(c'="W")&&(c'="U") quit ""
        if $find(normalized,c) quit ""
        set normalized=normalized_c
    }
    set canonical=""
    for c="R","W","U" { if $find(normalized,c) set canonical=canonical_c }
    quit canonical
}
ClassMethod Digest(ByRef properties, grants As %String) As %String
{
    set state={"Description":($get(properties("Description"))),"GrantedRoles":($get(properties("GrantedRoles"))),"EscalationOnly":($get(properties("EscalationOnly"))),"Resources":(grants)}
    quit $zconvert($system.Encryption.ToHex($system.Encryption.SHAHash(256,state.%ToJSON())),"L")
}
/// The complete grant set is hashed, but never exposed to the browser.
/// A caller receives only the selected resource's permission and the digest.
ClassMethod State(role As %String, resource As %String, action As %String, permission As %String, Output status As %Integer, Output expected As %DynamicObject, Output nextResources As %String) As %DynamicObject
{
    set status=403,expected={},nextResources="",result={"error":"target_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("role",role) quit result
    if '##class(IrisOps.Guard.TargetPolicy).Resource(resource) quit result
    if '##class(IrisOps.Guard.TargetPolicy).PrivateResource(resource) quit result
    if ('$system.Security.Check("%Admin_Secure","U"))!('$system.Security.Check("%DB_IRISSYS","R")) quit {"error":"operation_denied"}
    if (action'="")&&(action'="grant")&&(action'="revoke") { set status=400 quit {"error":"invalid_action"} }
    if action="grant" {
        set requested=..Permissions(permission)
        if (requested="")!((requested'="R")&&(requested'="RW")&&(requested'="RWU")&&(requested'="U")) { set status=400 quit {"error":"invalid_permissions"} }
    } else { set requested="" }
    set status=503,result={"error":"role_state_unavailable"}
    try {
        new $namespace set $namespace="%SYS"
        kill p
        set sc=##class(Security.Roles).Get(role,.p)
        if $system.Status.IsError(sc) quit
        if $get(p("Name"))'=role quit
        // Enrollment is not a permanent assertion about mutable native role
        // metadata. Refuse a role that has since acquired inherited authority
        // or any administrative resource, before preview AND before Modify.
        if ($get(p("GrantedRoles"))'="")!($get(p("EscalationOnly"))) quit
        if $find($zconvert($get(p("Resources")),"U"),"%ADMIN_") quit
        kill seen,grants,original
        set raw=$get(p("Resources")),count=$select(raw="":0,1:$length(raw,",")),current="",canonical="",nextResources="",valid=1
        for i=1:1:count {
            set pair=$piece(raw,",",i)
            if $length(pair,":")'=2 { set valid=0 quit }
            set name=$piece(pair,":",1),perms=..Permissions($piece(pair,":",2))
            if (name="")!($length(name)>64)!(perms="") { set valid=0 quit }
            set key=$zconvert(name,"U")
            if $data(seen(key)) { set valid=0 quit }
            set seen(key)=1,grants(key)=perms,original(key)=pair
        }
        // Never build a write body from a partial or duplicated grant set.
        if 'valid quit
        set key=""
        for { set key=$order(grants(key)) quit:key=""  set canonical=canonical_$select(canonical="":"",1:",")_key_":"_grants(key) }
        set selected=$zconvert(resource,"U"),current=$get(grants(selected))
        set before={"resource":(selected),"permissions":(current),"configurationHash":(..Digest(.p,canonical))}
        set expected=before
        if action'="" {
            if action="grant",current=requested { set status=400,result={"error":"no_change"} quit }
            if action="revoke",current="" { set status=400,result={"error":"no_change"} quit }
            if action="grant" { set grants(selected)=requested,original(selected)=selected_":"_requested }
            else { kill grants(selected),original(selected) }
            set canonical="",key=""
            for { set key=$order(grants(key)) quit:key=""  set canonical=canonical_$select(canonical="":"",1:",")_key_":"_grants(key) }
            set expected={"resource":(selected),"permissions":($select(action="grant":requested,1:"")),"configurationHash":(..Digest(.p,canonical))}
            set key=""
            for { set key=$order(original(key)) quit:key=""  set nextResources=nextResources_$select(nextResources="":"",1:",")_original(key) }
        }
        set status=200,result=before
    } catch e { set status=503,result={"error":"role_state_unavailable"} }
    quit result
}
/// Re-read under the caller's native identity immediately before Modify.
/// IRIS still enforces the native Security.Roles permission on the write.
ClassMethod Write(role As %String, resource As %String, action As %String, permission As %String, beforeHash As %String, expectedHash As %String, Output status As %Integer)
{
    set before=..State(role,resource,action,permission,.status,.expected,.nextResources)
    if status'=200 quit
    if (before.configurationHash'=beforeHash)!(expected.configurationHash'=expectedHash) { set status=409 quit }
    try {
        new $namespace set $namespace="%SYS"
        kill changed
        set changed("Resources")=nextResources
        set sc=##class(Security.Roles).Modify(role,.changed)
        set status=$select($system.Status.IsError(sc):503,1:200)
    } catch e { set status=503 }
}
}
