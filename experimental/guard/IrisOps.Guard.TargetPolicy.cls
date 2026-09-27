/// Terminal-only enrollment for the experimental managed guard.
/// No native object modification, credential handling or permission grants.
Class IrisOps.Guard.TargetPolicy Extends %RegisteredObject
{
Parameter Schema = 1;
ClassMethod Fail(reason As %String)
{
    throw ##class(%Exception.General).%New(reason)
}
ClassMethod Require(sc As %Status)
{
    if $system.Status.IsError(sc) do ..Fail("policy_native_metadata_unavailable")
}
ClassMethod Name(value As %String) As %Boolean
{
    if ($length(value)<1)!($length(value)>64) quit 0
    set first=$ascii(value,1)
    if '(((first>=65)&&(first<=90))!((first>=97)&&(first<=122))) quit 0
    set valid=1
    for i=1:1:$length(value) {
        set c=$ascii(value,i)
        if '(((c>=65)&&(c<=90))!((c>=97)&&(c<=122))!((c>=48)&&(c<=57))!(c=95)!(c=45)) set valid=0
    }
    quit valid
}
ClassMethod WebName(value As %String) As %Boolean
{
    // One application segment only; no percent escapes, query, nesting or aliases.
    if $extract(value,1,5)'="/csp/" quit 0
    set suffix=$extract(value,6,*)
    if '..Name(suffix) quit 0
    set lower=$zconvert(suffix,"L")
    if ",sys,ops,docbook,broker,healthshare,ensportal,oauth2,irisops-managed-guard,"[(","_lower_",") quit 0
    quit 1
}
ClassMethod Normalize(input As %DynamicObject) As %DynamicObject
{
    if '$isobject(input) do ..Fail("policy_schema_invalid")
    if 'input.%IsA("%DynamicObject") do ..Fail("policy_schema_invalid")
    // Schema 1 deployments with the original three targets stay valid. A role
    // is opt-in and never inferred from an existing account or resource.
    if (input.%Size()'=3)&&(input.%Size()'=4)&&(input.%Size()'=5) do ..Fail("policy_schema_invalid")
    for key="wallet","webapp","resources" { if input.%GetTypeOf(key)'="string" do ..Fail("policy_schema_invalid") }
    if input.%Size()>=4 {
        if input.%GetTypeOf("role")'="string" do ..Fail("policy_schema_invalid")
        if ('..Name(input.role))!($extract(input.role,1,8)'="IrisOps_") do ..Fail("policy_role_invalid")
    }
    if input.%Size()=5 {
        if input.%GetTypeOf("user")'="string" do ..Fail("policy_schema_invalid")
        if ('..Name(input.user))!($extract(input.user,1,8)'="IrisOps_") do ..Fail("policy_user_invalid")
        if $zconvert(input.user,"U")=$zconvert(input.role,"U") do ..Fail("policy_user_invalid")
    }
    if '..Name(input.wallet) do ..Fail("policy_wallet_invalid")
    if '..WebName(input.webapp) do ..Fail("policy_webapp_invalid")
    set count=$length(input.resources,",")
    if (count<1)!(count>8) do ..Fail("policy_resources_invalid")
    for i=1:1:count {
        set name=$zconvert($piece(input.resources,",",i),"U")
        if ('..Name(name))!($length(name)>58) do ..Fail("policy_resources_invalid")
        if $data(seen(name)) do ..Fail("policy_duplicate_resource")
        set seen(name)=1
    }
    set name="",resources=""
    for { set name=$order(seen(name)) quit:name=""  set resources=resources_$select(resources="":"",1:",")_name }
    set config={"wallet":(input.wallet),"webapp":(input.webapp),"resources":(resources)}
    if input.%Size()>=4 set config.role=input.role
    if input.%Size()=5 set config.user=input.user
    quit config
}
ClassMethod NativeSnapshot(config As %DynamicObject) As %String
{
    set userHash=""
    if config.%IsDefined("user") {
        set snapshot=##class(IrisOps.Guard.UserTransport).Snapshot(config,"",.status,.expected,.nextRoles)
        if status'=200 do ..Fail("policy_user_profile_refused")
        set userHash=snapshot.configurationHash
    }
    new $namespace set $namespace="%SYS"
    for i=1:1:$length(config.resources,",") {
        set name=$piece(config.resources,",",i)
        if '##class(Security.Resources).Exists(name) do ..Fail("policy_resource_missing")
        kill rp
        do ..Require(##class(Security.Resources).Get(name,.rp))
        if $get(rp("PublicPermission"))'="" do ..Fail("policy_public_resource_refused")
    }
    set found=##class(%Wallet.Collection).Exists(config.wallet,.wallet,.sc)
    if 'found do ..Fail("policy_wallet_missing")
    // Only access-policy metadata; never fetch a wallet secret value.
    set edit=wallet.EditResource,use=wallet.UseResource
    for value=edit,use {
        set resource=$zconvert($piece(value,":",1),"U")
        if '((","_config.resources_",")[(","_resource_",")) do ..Fail("policy_current_resource_not_enrolled")
    }
    kill p
    do ..Require(##class(Security.Applications).Get(config.webapp,.p))
    if ($get(p("NameSpace"))="")!($extract($get(p("NameSpace")),1)="%") do ..Fail("policy_system_namespace_refused")
    if $get(p("IsNameSpaceDefault")) do ..Fail("policy_default_application_refused")
    if ($get(p("AutheEnabled"))'=32)!($get(p("MatchRoles"))'="") do ..Fail("policy_authentication_profile_refused")
    if ($extract($get(p("DispatchClass")),1)="%")!($extract($zconvert($get(p("DispatchClass")),"L"),1,14)="irisops.guard.") do ..Fail("policy_admin_dispatcher_refused")
    if '..Name($get(p("Resource"))) do ..Fail("policy_web_resource_required")
    if '##class(Security.Resources).Exists(p("Resource")) do ..Fail("policy_web_resource_missing")
    kill rp
    do ..Require(##class(Security.Resources).Get(p("Resource"),.rp))
    if $get(rp("PublicPermission"))'="" do ..Fail("policy_public_resource_refused")
    if ($get(p("WSGIAppLocation"))'="")!($get(p("WSGIAppName"))'="") do ..Fail("policy_wsgi_refused")
    // Optional role enrollment is deliberately restricted to an owned lab
    // identity with no inherited or administrative grants. No role is edited.
    set roleHash=""
    if config.%IsDefined("role") {
        if '##class(Security.Roles).Exists(config.role) do ..Fail("policy_role_missing")
        kill role
        do ..Require(##class(Security.Roles).Get(config.role,.role))
        if ($get(role("Name"))'=config.role)!($get(role("GrantedRoles"))'="")!($get(role("EscalationOnly"))) do ..Fail("policy_role_profile_refused")
        if $find($zconvert($get(role("Resources")),"U"),"%ADMIN_") do ..Fail("policy_role_profile_refused")
        set roleHash=$system.Encryption.ToHex($system.Encryption.SHAHash(256,$get(role("Description"))_"|"_$get(role("Resources"))))
    }
    // Compare native application properties by hash, never return their values.
    set object={},key=""
    for { set key=$order(p(key)) quit:key=""  do object.%Set(key,p(key)) }
    quit $system.Encryption.ToHex($system.Encryption.SHAHash(256,config.%ToJSON()_"|"_edit_"|"_use_"|"_object.%ToJSON()_"|"_roleHash_"|"_userHash))
}
ClassMethod PrivateResource(name As %String) As %Boolean
{
    if '..Name(name) quit 0
    new $namespace set $namespace="%SYS"
    set sc=##class(Security.Resources).Get(name,.p)
    if $system.Status.IsError(sc) quit 0
    quit $get(p("PublicPermission"))=""
}
ClassMethod Current() As %DynamicObject
{
    set result={}
    try {
        set text=$get(^IrisOpsGuardDeploy("targetPolicy"))
        if text="" quit
        set stored={}.%FromJSON(text)
        if (stored.%Size()'=5)!(stored.schema'=..#Schema) quit
        if '##class(IrisOps.Guard.Protocol).IsId(stored.generation) quit
        set config=..Normalize(stored.config)
        if config.%ToJSON()'=stored.config.%ToJSON() quit
        set check=##class(IrisOps.Guard.Deployment).Digest(stored.schema_"|"_stored.generation_"|"_stored.at_"|"_config.%ToJSON())
        if check'=stored.digest quit
        set result=stored
    } catch e { set result={} }
    quit result
}
ClassMethod Permits(kind As %String, target As %String) As %Boolean
{
    if (kind'="wallet")&&(kind'="webapp")&&(kind'="role")&&(kind'="user") quit 0
    set current=..Current()
    if current.%Size()=0 quit 0
    if 'current.config.%IsDefined(kind) quit 0
    quit current.config.%Get(kind)=target
}
/// Missing, corrupt or revoked policy never falls back to a lab target.
ClassMethod Target(kind As %String) As %String
{
    if (kind'="wallet")&&(kind'="webapp")&&(kind'="role")&&(kind'="user") quit ""
    set current=..Current()
    if current.%Size()=0 quit ""
    if 'current.config.%IsDefined(kind) quit ""
    quit current.config.%Get(kind)
}
ClassMethod Generation() As %String
{
    set current=..Current()
    quit current.%Get("generation","")
}
ClassMethod CheckPreview(p As %DynamicObject, kind As %String) As %String
{
    set current=..Current()
    if current.%Size()=0 quit "target_policy_changed"
    if p.%Get("policyGeneration")'=current.generation quit "target_policy_changed"
    if p.%Get("target")'=current.config.%Get(kind) quit "target_policy_changed"
    quit ""
}
ClassMethod Resource(name As %String) As %Boolean
{
    if '..Name(name) quit 0
    set current=..Current()
    if current.%Size()=0 quit 0
    quit (","_current.config.resources_",")[(","_$zconvert(name,"U")_",")
}
ClassMethod MakePlan(input As %DynamicObject, expires As %Integer) As %DynamicObject
{
    do ##class(IrisOps.Guard.Deployment).Admin()
    set now=##class(IrisOps.Guard.Vault).Now()
    if (expires'>now)!(expires>(now+300)) do ..Fail("policy_plan_expired")
    set deployment=##class(IrisOps.Guard.Deployment).Plan()
    if deployment.mode'="SUSPENDED" do ..Fail("suspend_before_policy_change")
    set config=..Normalize(input),nativeHash=..NativeSnapshot(config)
    set cls=##class(%Dictionary.ClassDefinition).%OpenId("IrisOps.Guard.TargetPolicy")
    if '$isobject(cls) do ..Fail("policy_class_missing")
    set fingerprint=##class(IrisOps.Guard.Deployment).Digest(config.%ToJSON()_"|"_nativeHash_"|"_deployment.fingerprint_"|"_$get(^IrisOpsGuardDeploy("targetPolicy"))_"|"_expires_"|"_cls.TimeChanged)
    quit {"schema":1,"action":"ENROLL_TARGETS_KEEP_SUSPENDED","config":(config),"fingerprint":(fingerprint),"expires":(expires),"mode":"SUSPENDED","nativeHash":(nativeHash),"grantsNativePermissions":false}
}
ClassMethod Plan(input As %DynamicObject) As %DynamicObject
{
    quit ..MakePlan(input,##class(IrisOps.Guard.Vault).Now()+300)
}
ClassMethod Apply(input As %DynamicObject, expected As %String, expires As %Integer) As %DynamicObject
{
    do ##class(IrisOps.Guard.Deployment).Admin()
    if $tlevel do ..Fail("policy_ambient_transaction_refused")
    lock +^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard"):2
    if '$test do ..Fail("deployment_busy")
    try {
        set plan=..MakePlan(input,expires)
        if expected'=plan.fingerprint do ..Fail("stale_policy_plan")
        set generation=##class(IrisOps.Guard.Protocol).Id(),at=##class(IrisOps.Guard.Protocol).Stamp(),config=plan.config
        set digest=##class(IrisOps.Guard.Deployment).Digest(..#Schema_"|"_generation_"|"_at_"|"_config.%ToJSON())
        set stored={"schema":(..#Schema),"generation":(generation),"at":(at),"config":(config),"digest":(digest)}
        set deployment=##class(IrisOps.Guard.Deployment).State()
        set deployment.generation=##class(IrisOps.Guard.Protocol).Id(),deployment.at=at
        if expires'>##class(IrisOps.Guard.Vault).Now() do ..Fail("policy_plan_expired")
        // Same journaled database: policy, authority epoch and history commit together.
        tstart
        set ^IrisOpsGuardDeploy("targetPolicy")=stored.%ToJSON()
        set ^IrisOpsGuardDeploy("state")=deployment.%ToJSON()
        set n=$increment(^IrisOpsGuardDeploy("targetPolicyHistory")),^IrisOpsGuardDeploy("targetPolicyHistory",n)=stored.%ToJSON()
        tcommit
        set result=..Current()
        if result.%Size()=0 do ..Fail("policy_readback_failed")
        if result.generation'=generation do ..Fail("policy_readback_failed")
    } catch e {
        if $tlevel trollback
        lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
        throw e
    }
    lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
    quit result
}
ClassMethod RevokePlan(expires As %Integer = 0) As %DynamicObject
{
    do ##class(IrisOps.Guard.Deployment).Admin()
    set now=##class(IrisOps.Guard.Vault).Now()
    if expires=0 set expires=now+300
    if (expires'>now)!(expires>(now+300)) do ..Fail("policy_plan_expired")
    set deployment=##class(IrisOps.Guard.Deployment).Plan()
    if deployment.mode'="SUSPENDED" do ..Fail("suspend_before_policy_change")
    // Revocation must remain possible even when a native target was removed.
    set fingerprint=##class(IrisOps.Guard.Deployment).Digest("REVOKE|"_deployment.fingerprint_"|"_$get(^IrisOpsGuardDeploy("targetPolicy"))_"|"_expires)
    quit {"action":"REVOKE_TARGETS_KEEP_SUSPENDED","expires":(expires),"fingerprint":(fingerprint),"mode":"SUSPENDED","deletesNativeObjects":false}
}
ClassMethod Revoke(expected As %String, expires As %Integer) As %DynamicObject
{
    do ##class(IrisOps.Guard.Deployment).Admin()
    if $tlevel do ..Fail("policy_ambient_transaction_refused")
    lock +^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard"):2
    if '$test do ..Fail("deployment_busy")
    try {
        set plan=..RevokePlan(expires)
        if expected'=plan.fingerprint do ..Fail("stale_policy_plan")
        set generation=##class(IrisOps.Guard.Protocol).Id(),at=##class(IrisOps.Guard.Protocol).Stamp()
        set stored={"schema":(..#Schema),"generation":(generation),"at":(at),"revoked":true}
        set deployment=##class(IrisOps.Guard.Deployment).State(),deployment.generation=generation,deployment.at=at
        if expires'>##class(IrisOps.Guard.Vault).Now() do ..Fail("policy_plan_expired")
        tstart
        set ^IrisOpsGuardDeploy("targetPolicy")=stored.%ToJSON()
        set ^IrisOpsGuardDeploy("state")=deployment.%ToJSON()
        set n=$increment(^IrisOpsGuardDeploy("targetPolicyHistory")),^IrisOpsGuardDeploy("targetPolicyHistory",n)=stored.%ToJSON()
        tcommit
        set current=..Current()
        if current.%Size()'=0 do ..Fail("policy_revocation_readback_failed")
    } catch e {
        if $tlevel trollback
        lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
        throw e
    }
    lock -^IrisOpsGuardLocks("deployment","/api/irisops-managed-guard")
    quit {"revoked":true,"generation":(generation),"mode":"SUSPENDED","nativeObjectsDeleted":false}
}
}
