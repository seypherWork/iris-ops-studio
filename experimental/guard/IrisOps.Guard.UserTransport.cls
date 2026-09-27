/// Optional native transport, included only in the enrolled-user bundle.
/// HTTP access requires the managed guard and explicit target enrollment.
/// One enrolled, DISABLED local test user; zero or one enrolled direct role.
/// This is not an effective-access or SQL-privilege impact analysis.
Class IrisOps.Guard.UserTransport Extends %RegisteredObject
{
ClassMethod Digest(value As %DynamicObject) As %String
{
    quit $zconvert($system.Encryption.ToHex($system.Encryption.SHAHash(256,value.%ToJSON())),"L")
}
ClassMethod NativeMetadata(username As %String, role As %String, Output rp, Output assigned As %Boolean) As %DynamicObject
{
    new $namespace set $namespace="%SYS"
    if '##class(Security.Users).Exists(username,.user,.sc) quit {}
    if $system.Status.IsError(sc) quit {}
    if user.Name'=username quit {}
    if (user.Enabled'=0)!(user.SuperUser)!(user.Flags'=1) quit {}
    if user.EscalationRoles.Count()>0 quit {}
    set count=user.Roles.Count()
    if count>1 quit {}
    set assigned=(count=1)
    if assigned,user.Roles.GetAt(1)'=role quit {}
    set sc=##class(Security.Roles).Get(role,.rp)
    if $system.Status.IsError(sc) quit {}
    quit {"user":(username),"created":(user.CreateDateTime),"enabled":(user.Enabled),"flags":(user.Flags),"namespace":(user.NameSpace),"routine":(user.Routine),"role":(role)}
}
/// Selective documented object access: never call Security.Users.Get, export
/// the native object, or inspect authentication/OTP/credential properties.
ClassMethod Snapshot(config As %DynamicObject, action As %String, Output status As %Integer, Output expected As %DynamicObject, Output nextRoles As %String) As %DynamicObject
{
    set status=403,expected={},nextRoles=""
    if ('$system.Security.Check("%Admin_Secure","U"))!('$system.Security.Check("%DB_IRISSYS","R")) quit {"error":"operation_denied"}
    if (action'="")&&(action'="assign")&&(action'="remove") { set status=400 quit {"error":"invalid_action"} }
    set status=503,result={"error":"user_state_unavailable"}
    try {
        if ('config.%IsDefined("user"))!('config.%IsDefined("role")) quit
        set username=config.user,role=config.role
        if ('##class(IrisOps.Guard.TargetPolicy).Name(username))!($extract(username,1,8)'="IrisOps_") quit
        if ('##class(IrisOps.Guard.TargetPolicy).Name(role))!($extract(role,1,8)'="IrisOps_") quit
        if $zconvert(username,"U")=$zconvert($username,"U") quit
        kill rp
        // Native access changes namespace only inside this helper. Custom
        // guard classes must continue resolving in their own IRISOPS namespace.
        set metadata=..NativeMetadata(username,role,.rp,.assigned)
        if metadata.%Size()=0 quit
        if ($get(rp("Name"))'=role)!($get(rp("GrantedRoles"))'="")!($get(rp("EscalationOnly"))) quit
        // Only explicitly enrolled private resource grants, no system grants.
        set raw=$get(rp("Resources")),valid=1,canonical="",key=""
        kill grants
        for i=1:1:$select(raw="":0,1:$length(raw,",")) {
            set pair=$piece(raw,",",i),resource=$zconvert($piece(pair,":",1),"U"),perms=##class(IrisOps.Guard.RoleTransport).Permissions($piece(pair,":",2))
            if ($length(pair,":")'=2)!(perms="")!($data(grants(resource))) { set valid=0 quit }
            if '((","_config.resources_",")[(","_resource_",")) { set valid=0 quit }
            if '##class(IrisOps.Guard.TargetPolicy).PrivateResource(resource) { set valid=0 quit }
            set grants(resource)=perms
        }
        if 'valid quit
        for { set key=$order(grants(key)) quit:key=""  set canonical=canonical_$select(canonical="":"",1:",")_key_":"_grants(key) }
        set roleHash=##class(IrisOps.Guard.RoleTransport).Digest(.rp,canonical)
        // Exclude volatile modification/login timestamps. Bind stable account
        // identity, enabled state, direct membership and selected role metadata.
        set metadata.roleHash=roleHash
        do metadata.%Set("assigned",assigned,"boolean")
        set before={"role":(role),"configurationHash":(..Digest(metadata))}
        do before.%Set("assigned",assigned,"boolean")
        set expected=before
        if action'="" {
            if ((action="assign")&&assigned)!((action="remove")&&('assigned)) { set status=400,result={"error":"no_change"} quit }
            set nextRoles=$select(action="assign":role,1:"")
            do metadata.%Set("assigned",action="assign","boolean")
            set expected={"role":(role),"configurationHash":(..Digest(metadata))}
            do expected.%Set("assigned",action="assign","boolean")
        }
        set status=200,result=before
    } catch e { set status=503,result={"error":"user_state_unavailable"} }
    quit result
}
ClassMethod State(username As %String, role As %String, action As %String, Output status As %Integer, Output expected As %DynamicObject, Output nextRoles As %String) As %DynamicObject
{
    set status=403,expected={},nextRoles=""
    if '##class(IrisOps.Guard.TargetPolicy).Permits("user",username) quit {"error":"target_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("role",role) quit {"error":"target_not_allowed"}
    set policy=##class(IrisOps.Guard.TargetPolicy).Current()
    quit ..Snapshot(policy.config,action,.status,.expected,.nextRoles)
}
/// Managed HTTP callers retain native Admin_Secure requirements.
/// Revalidate immediately before a delta write; never replace the role list.
ClassMethod Write(username As %String, role As %String, action As %String, beforeHash As %String, expectedHash As %String, Output status As %Integer)
{
    if (action'="assign")&&(action'="remove") { set status=400 quit }
    set before=..State(username,role,action,.status,.expected,.nextRoles)
    if status'=200 quit
    if (before.configurationHash'=beforeHash)!(expected.configurationHash'=expectedHash) { set status=409 quit }
    try {
        new $namespace set $namespace="%SYS"
        // Do not overwrite unrelated membership if an external administrator
        // changes it after the last snapshot. Readback still refuses mismatch.
        set selected=role
        if action="assign" { set sc=##class(Security.Users).AddRoles(username,.selected,0) }
        else { set sc=##class(Security.Users).RemoveRoles(username,.selected) }
        set status=$select($system.Status.IsError(sc):503,1:200)
    } catch e { set status=503 }
}
}
