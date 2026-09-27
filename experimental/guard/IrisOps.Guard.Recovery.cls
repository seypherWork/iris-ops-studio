/// Recovery only reads native administrative state. It NEVER dispatches PUT.
Class IrisOps.Guard.Recovery Extends %RegisteredObject
{
ClassMethod Allowed(receipt As IrisOps.Guard.Receipt, key As %String) As %Boolean
{
    if '$isobject(receipt) quit 0
    if receipt.OperationKind()'="wallet" quit 0
    // Name and present permissions alone do not establish historical ownership.
    if receipt.Actor'=$username quit 0
    if '##class(IrisOps.Guard.Protocol).RecoveryMatches(receipt.OperationId,key,receipt.RecoveryHash) quit 0
    if '##class(IrisOps.Guard.TargetPolicy).Permits("wallet",receipt.Target) quit 0
    if (##class(IrisOps.Guard.Protocol).Policy(receipt.BeforeEdit,"WRITE")="")!(##class(IrisOps.Guard.Protocol).Policy(receipt.BeforeUse,"READ")="") quit 0
    if (##class(IrisOps.Guard.Protocol).Policy(receipt.ExpectedEdit,"WRITE")="")!(##class(IrisOps.Guard.Protocol).Policy(receipt.ExpectedUse,"READ")="") quit 0
    if '##class(IrisOps.Guard.Protocol).CanUse(receipt.BeforeEdit,receipt.BeforeUse) quit 0
    quit ##class(IrisOps.Guard.Protocol).CanUse(receipt.ExpectedEdit,receipt.ExpectedUse)
}
ClassMethod Read(id As %String, token As %String, record As %Boolean, Output status As %Integer, key As %String = "") As %DynamicObject
{
    set status=404,result={"error":"operation_not_found"}
    if $tlevel { set status=503 quit {"error":"ambient_transaction_not_allowed"} }
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit result
    lock +^IrisOpsGuardLocks("operation",id):1
    if '$test { set status=409 quit {"error":"operation_busy"} }
    try {
        set receipt=##class(IrisOps.Guard.Receipt).%OpenId(id)
        if '..Allowed(receipt,key) quit
        // Also preserve the native API's gateway/application permission check.
        set raw=##class(IrisOps.Guard.HttpTransport).Request("wallet.read",token,receipt.Target,.upstreamStatus)
        if (upstreamStatus=401)!(upstreamStatus=403) {
            do ##class(IrisOps.Guard.Vault).Clear()
            set status=403,result={"error":"recovery_permission_denied"} quit
        }
        // Never return historical content merely because the actor name matches
        // when the upstream cannot currently authorize a read.
        if upstreamStatus'=200 { set status=503,result={"error":"current_state_unavailable","original_result_unchanged":true} quit }
        if '##class(IrisOps.Guard.Vault).Open(.currentToken) { set status=401,result={"error":"upstream_reconnect_required"} quit }
        set same=(currentToken=token)
        kill currentToken
        if 'same { set status=401,result={"error":"upstream_reconnect_required"} quit }
        if '..Allowed(receipt,key) quit
        set edit=##class(IrisOps.Guard.Protocol).Policy(raw.EditResource,"WRITE"),use=##class(IrisOps.Guard.Protocol).Policy(raw.UseResource,"READ")
        if (edit="")!(use="") { set status=503,result={"error":"current_state_unavailable","original_result_unchanged":true} quit }
        set outcome="DIFFERS"
        if (edit=receipt.ExpectedEdit)&&(use=receipt.ExpectedUse) { set outcome="MATCHES_EXPECTED" }
        elseif (edit=receipt.BeforeEdit)&&(use=receipt.BeforeUse) { set outcome="MATCHES_BEFORE" }
        set observation={"at":(##class(IrisOps.Guard.Protocol).Stamp()),"outcome":(outcome),"EditResource":(edit),"UseResource":(use),"causality":"not_proven"}
        if record {
            set checks=$select(receipt.Rechecks="":[],1:[].%FromJSON(receipt.Rechecks))
            if checks.%Size()>=20 { set status=429,result={"error":"recheck_limit","original_result_unchanged":true} quit }
            do checks.%Push(observation)
            set receipt.Rechecks=checks.%ToJSON()
            set sc=receipt.%Save()
            if $system.Status.IsError(sc) { set status=503,result={"error":"recheck_not_persisted","original_result_unchanged":true} quit }
        }
        set status=200,result={"receipt":(receipt.Public()),"currentObservation":(observation),"observationPersisted":(record),"administrativeWrites":0}
    } catch e {
        set status=503,result={"error":"recovery_unavailable","original_result_unchanged":true}
    }
    lock -^IrisOpsGuardLocks("operation",id)
    quit result
}
}
