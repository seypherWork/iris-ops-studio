/// Read-only receipt recovery. A recheck never repeats Security.Roles.Modify.
Class IrisOps.Guard.RoleRecovery Extends %RegisteredObject
{
ClassMethod Allowed(r As IrisOps.Guard.Receipt, key As %String) As %Boolean
{
    if '$isobject(r) quit 0
    if (r.Kind'="role")!(r.Actor'=$username) quit 0
    if '##class(IrisOps.Guard.Protocol).RecoveryMatches(r.OperationId,key,r.RecoveryHash) quit 0
    if '##class(IrisOps.Guard.TargetPolicy).Permits("role",r.Target) quit 0
    if ('$system.Security.Check("%Admin_Secure","U"))!('$system.Security.Check("%DB_IRISSYS","R")) quit 0
    if (r.BeforeState="")!(r.ExpectedState="") quit 0
    set valid=1
    try {
        set before={}.%FromJSON(r.BeforeState),expected={}.%FromJSON(r.ExpectedState)
        if (before.resource'=expected.resource)!('##class(IrisOps.Guard.TargetPolicy).Resource(before.resource)) { set valid=0 quit }
        if '##class(IrisOps.Guard.TargetPolicy).PrivateResource(before.resource) { set valid=0 quit }
    } catch e { set valid=0 }
    quit valid
}
ClassMethod Read(id As %String, token As %String, record As %Boolean, Output status As %Integer, key As %String = "") As %DynamicObject
{
    set status=404,result={"error":"operation_not_found"}
    if $tlevel { set status=503 quit {"error":"ambient_transaction_not_allowed"} }
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit result
    lock +^IrisOpsGuardLocks("operation",id):1
    if '$test { set status=409 quit {"error":"operation_busy"} }
    try {
        set r=##class(IrisOps.Guard.Receipt).%OpenId(id)
        if '..Allowed(r,key) quit
        set before={}.%FromJSON(r.BeforeState),expected={}.%FromJSON(r.ExpectedState)
        set current=##class(IrisOps.Guard.RoleTransport).State(r.Target,before.resource,"","",.nativeStatus,.ignored,.nextResources)
        if nativeStatus=403 { do ##class(IrisOps.Guard.Vault).Clear() set status=403,result={"error":"recovery_permission_denied"} quit }
        if nativeStatus'=200 { set status=503,result={"error":"current_state_unavailable","original_result_unchanged":true} quit }
        if '##class(IrisOps.Guard.Vault).Open(.nowToken) { set status=401,result={"error":"upstream_reconnect_required"} quit }
        set same=(token=nowToken) kill nowToken
        if 'same { set status=401,result={"error":"upstream_reconnect_required"} quit }
        if '..Allowed(r,key) quit
        set outcome="DIFFERS"
        if (current.configurationHash=expected.configurationHash)&&(current.permissions=expected.permissions) { set outcome="MATCHES_EXPECTED" }
        elseif (current.configurationHash=before.configurationHash)&&(current.permissions=before.permissions) { set outcome="MATCHES_BEFORE" }
        set observation={"at":(##class(IrisOps.Guard.Protocol).Stamp()),"outcome":(outcome),"resource":(current.resource),"permissions":(current.permissions),"configurationHash":(current.configurationHash),"causality":"not_proven"}
        if record {
            set checks=$select(r.Rechecks="":[],1:[].%FromJSON(r.Rechecks))
            if checks.%Size()>=20 { set status=429,result={"error":"recheck_limit","original_result_unchanged":true} quit }
            do checks.%Push(observation)
            set r.Rechecks=checks.%ToJSON(),sc=r.%Save()
            if $system.Status.IsError(sc) { set status=503,result={"error":"recheck_not_persisted","original_result_unchanged":true} quit }
        }
        set status=200,result={"receipt":(r.Public()),"currentObservation":(observation),"observationPersisted":(record),"administrativeWrites":0}
    } catch e { set status=503,result={"error":"recovery_unavailable","original_result_unchanged":true} }
    lock -^IrisOpsGuardLocks("operation",id)
    quit result
}
}
