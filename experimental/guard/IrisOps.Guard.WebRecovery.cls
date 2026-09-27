/// Read-only recovery, separate from dispatch. Current permission and proof.
Class IrisOps.Guard.WebRecovery Extends %RegisteredObject
{
ClassMethod Allowed(r As IrisOps.Guard.Receipt, key As %String) As %Boolean
{
    if '$isobject(r) quit 0
    if (r.Kind'="webapp")!(r.Actor'=$username) quit 0
    if '##class(IrisOps.Guard.TargetPolicy).Permits("webapp",r.Target) quit 0
    if '##class(IrisOps.Guard.Protocol).RecoveryMatches(r.OperationId,key,r.RecoveryHash) quit 0
    quit $system.Security.Check("%Admin_Secure","U")
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
        set current=##class(IrisOps.Guard.WebTransport).Read(token,.nativeStatus,r.Target)
        if (nativeStatus=401)!(nativeStatus=403) { do ##class(IrisOps.Guard.Vault).Clear() set status=403,result={"error":"recovery_permission_denied"} quit }
        if nativeStatus'=200 { set status=503,result={"error":"current_state_unavailable","original_result_unchanged":true} quit }
        if '##class(IrisOps.Guard.Vault).Open(.nowToken) { set status=401,result={"error":"upstream_reconnect_required"} quit }
        set same=(token=nowToken) kill nowToken
        if 'same { set status=401,result={"error":"upstream_reconnect_required"} quit }
        if '..Allowed(r,key) quit
        set before={}.%FromJSON(r.BeforeState),expected={}.%FromJSON(r.ExpectedState),outcome="DIFFERS"
        if (current.Enabled=expected.Enabled)&&(current.configurationHash=expected.configurationHash) { set outcome="MATCHES_EXPECTED" }
        elseif (current.Enabled=before.Enabled)&&(current.configurationHash=before.configurationHash) { set outcome="MATCHES_BEFORE" }
        set observation={"at":(##class(IrisOps.Guard.Protocol).Stamp()),"outcome":(outcome),"configurationHash":(current.configurationHash),"causality":"not_proven"}
        do observation.%Set("Enabled",current.Enabled,"boolean")
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
