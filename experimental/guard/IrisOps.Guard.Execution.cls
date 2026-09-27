/// Only the wallet enrolled by a native administrator is eligible.
Class IrisOps.Guard.Execution Extends %RegisteredObject
{
Parameter TargetKind = "wallet";
Parameter RecoveryClass = "IrisOps.Guard.Recovery";
/// No-op seams for a separately installed LAB-ONLY fault subclass.
ClassMethod AfterReservation(id As %String) { }
ClassMethod AfterDispatch(id As %String) { }
ClassMethod SaveFinal(receipt As IrisOps.Guard.Receipt, state As %String, reason As %String) As %Status
{
    quit receipt.Transition(state,reason)
}
ClassMethod Channel(id As %String, writing As %Boolean = 0) As %Boolean
{
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit 0
    if '$data(%session.Data("IrisOpsGuard","channels",id)) quit 0
    if $get(%session.Data("IrisOpsGuard","channels",id,"kind"))'=..#TargetKind quit 0
    if $get(%session.Data("IrisOpsGuard","channels",id,"boot"))'=##class(IrisOps.Guard.Vault).Boot() quit 0
    if writing,$get(%session.Data("IrisOpsGuard","channels",id,"until"))<=##class(IrisOps.Guard.Vault).Now() quit 0
    quit 1
}
ClassMethod Snapshot(token As %String, name As %String, Output edit As %String, Output use As %String) As %Boolean
{
    set edit="",use=""
    set r=##class(IrisOps.Guard.HttpTransport).Request("wallet.read",token,name,.status)
    if status'=200 quit 0
    set edit=##class(IrisOps.Guard.Protocol).Policy(r.EditResource,"WRITE"),use=##class(IrisOps.Guard.Protocol).Policy(r.UseResource,"READ")
    quit (edit'="")&&(use'="")
}
/// Recheck after waits/native reads and immediately before dispatch. No refresh.
ClassMethod Authorization(p As %DynamicObject, token As %String) As %String
{
    if '##class(IrisOps.Guard.Vault).Open(.currentToken) quit "authorization_expired"
    set same=(currentToken=token)
    kill currentToken
    if 'same quit "authorization_changed"
    if '..Channel(p.channel,1) quit "read_only_or_expired_channel"
    if %session.Data("IrisOpsGuard","channels",p.channel,"generation")'=p.generation quit "channel_changed"
    if p.expires<=##class(IrisOps.Guard.Vault).Now() quit "preview_expired"
    set policyReason=##class(IrisOps.Guard.TargetPolicy).CheckPreview(p,..#TargetKind)
    if policyReason'="" quit policyReason
    quit ..Permissions(p)
}
ClassMethod Permissions(p As %DynamicObject) As %String
{
    if '##class(IrisOps.Guard.Protocol).CanUse(p.edit,p.use) quit "permission_revoked"
    if '##class(IrisOps.Guard.Protocol).CanUse(p.beforeEdit,p.beforeUse) quit "recovery_permission_required"
    quit ""
}
ClassMethod CheckSnapshot(p As %DynamicObject, token As %String) As %String
{
    if '..Snapshot(token,p.target,.edit,.use) quit "target_not_readable"
    if (edit'=p.beforeEdit)!(use'=p.beforeUse) quit "stale"
    quit ""
}
ClassMethod FillReceipt(receipt As IrisOps.Guard.Receipt, p As %DynamicObject)
{
    set receipt.BeforeEdit=p.beforeEdit,receipt.BeforeUse=p.beforeUse,receipt.ExpectedEdit=p.edit,receipt.ExpectedUse=p.use
}
ClassMethod Dispatch(p As %DynamicObject, token As %String, Output status As %Integer)
{
    set answer=##class(IrisOps.Guard.HttpTransport).WriteWallet(token,p.target,p.edit,p.use,.status)
}
ClassMethod Readback(p As %DynamicObject, token As %String, receipt As IrisOps.Guard.Receipt, Output state As %String) As %String
{
    set state="UNKNOWN"
    if '..Snapshot(token,p.target,.edit,.use) quit "readback_unavailable"
    set receipt.ObservedEdit=edit,receipt.ObservedUse=use
    if (edit=p.edit)&&(use=p.use) { set state="VERIFIED" quit "both_policy_fields_match" }
    set state="MISMATCH"
    quit "readback_differs"
}
ClassMethod Preview(body As %DynamicObject, token As %String, Output status As %Integer) As %DynamicObject
{
    set status=400
    if body.action'="wallet.policy.update" quit {"error":"action_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("wallet",body.name) quit {"error":"target_not_allowed"}
    if '..Channel(body.channel,1) { set status=403 quit {"error":"read_only_or_expired_channel"} }
    set generation=%session.Data("IrisOpsGuard","channels",body.channel,"generation")
    set edit=##class(IrisOps.Guard.Protocol).Policy(body.EditResource,"WRITE"),use=##class(IrisOps.Guard.Protocol).Policy(body.UseResource,"READ")
    if (edit="")!(use="") quit {"error":"invalid_policy"}
    if '##class(IrisOps.Guard.Protocol).CanUse(edit,use) { set status=403 quit {"error":"policy_permission_denied"} }
    if '..Snapshot(token,body.name,.beforeEdit,.beforeUse) { set status=409 quit {"error":"target_not_readable"} }
    if (beforeEdit=edit)&&(beforeUse=use) quit {"error":"no_change"}
    if $get(%session.Data("IrisOpsGuard","previewCount"))>=16 { set status=429 quit {"error":"preview_limit_reconnect_required"} }
    set id=##class(IrisOps.Guard.Protocol).Id(),phrase="APPLY "_$extract(id,1,8)
    set recoveryKey=##class(IrisOps.Guard.Protocol).Id()_##class(IrisOps.Guard.Protocol).Id()
    set preview={"id":(id),"channel":(body.channel),"target":(body.name),"generation":(generation),"expires":(##class(IrisOps.Guard.Vault).Now()+30),"beforeEdit":(beforeEdit),"beforeUse":(beforeUse),"edit":(edit),"use":(use),"phrase":(phrase)}
    set preview.policyGeneration=##class(IrisOps.Guard.TargetPolicy).Generation()
    set preview.recoveryHash=##class(IrisOps.Guard.Protocol).RecoveryHash(id,recoveryKey)
    set reason=..Authorization(preview,token)
    if reason'="" { set status=403 quit {"error":(reason)} }
    set %session.Data("IrisOpsGuard","previews",id)=preview.%ToJSON()
    set %session.Data("IrisOpsGuard","previewCount")=$get(%session.Data("IrisOpsGuard","previewCount"))+1
    set status=200
    quit {"id":(id),"recoveryKey":(recoveryKey),"target":(body.name),"confirmation":(phrase),"expiresIn":30,"before":{"EditResource":(beforeEdit),"UseResource":(beforeUse)},"expected":{"EditResource":(edit),"UseResource":(use)}}
}
ClassMethod Execute(id As %String, body As %DynamicObject, token As %String, Output status As %Integer) As %DynamicObject
{
    set status=400,result={"error":"invalid_preview"}
    // The dispatch reservation must commit independently BEFORE network I/O.
    // Never enter inside (or roll back) a caller-owned transaction.
    if $tlevel { set status=503 quit {"error":"ambient_transaction_not_allowed"} }
    if '##class(IrisOps.Guard.Protocol).IsId(id) quit result
    lock +^IrisOpsGuardLocks("operation",id):2
    if '$test { set status=409 quit {"error":"operation_busy"} }
    set dispatching=0,targetLocked=0,target=""
    try {
        set receipt=##class(IrisOps.Guard.Receipt).%OpenId(id)
        if $isobject(receipt) {
            if receipt.OperationKind()'=..#TargetKind { set status=404,result={"error":"operation_not_found"} quit }
            if (receipt.Actor'=$username)!(receipt.Binding'=##class(IrisOps.Guard.Protocol).Binding()) { set status=404,result={"error":"operation_not_found"} quit }
            // Replay is a read, not an authorization bypass or second dispatch.
            set result=$classmethod(..#RecoveryClass,"Read",id,token,0,.status,body.recoveryKey)
            if status=200 set result=result.receipt
            quit
        }
        if '$data(%session.Data("IrisOpsGuard","previews",id)) quit
        set p={}.%FromJSON(%session.Data("IrisOpsGuard","previews",id))
        if p.%Get("kind","wallet")'=..#TargetKind quit
        if '##class(IrisOps.Guard.Protocol).RecoveryMatches(id,body.recoveryKey,p.%Get("recoveryHash")) { set status=404,result={"error":"operation_not_found"} quit }
        if body.confirmation'=p.phrase { set status=400,result={"error":"confirmation_mismatch"} quit }
        // One operation lock, then one target lock. Recovery never acquires a
        // target lock; no reverse lock ordering. All are local to this instance.
        set target=p.target
        lock +^IrisOpsGuardLocks("target",..#TargetKind,target):2
        set targetLocked=$test,reason=$select(targetLocked:"",1:"target_busy")
        if reason="" set reason=..Authorization(p,token)
        if reason="" set reason=..CheckSnapshot(p,token)
        if reason="" set reason=..Authorization(p,token)
        set receipt=##class(IrisOps.Guard.Receipt).%New()
        set receipt.OperationId=id,receipt.Actor=$username,receipt.Binding=##class(IrisOps.Guard.Protocol).Binding(),receipt.Target=p.target
        set receipt.RecoveryHash=p.recoveryHash
        set receipt.Kind=..#TargetKind,receipt.CreatedUTC=##class(IrisOps.Guard.Protocol).Stamp()
        do ..FillReceipt(receipt,p)
        set state=$select(reason="":"DISPATCHING",1:"BLOCKED")
        if reason="" set reason="submitted_once",receipt.DispatchCount=1
        // Durable reservation BEFORE HTTP. Session Data alone cannot prevent
        // replay after process failure before native session persistence.
        tstart
        set sc=receipt.Transition(state,reason)
        if $system.Status.IsError(sc) {
            trollback
            set status=503,result={"error":"receipt_storage_unavailable"}
            quit
        }
        tcommit
        kill %session.Data("IrisOpsGuard","previews",id)
        if state="BLOCKED" { set status=409,result=receipt.Public() quit }
        do ..AfterReservation(id)
        // Persistence itself may block. A late rejection is durably recorded;
        // if recording fails we still NEVER dispatch, and keep uncertainty.
        set reason=..Authorization(p,token)
        if reason'="" {
            set receipt.DispatchCount=0
            set sc=receipt.Transition("BLOCKED",reason)
            if $system.Status.IsError(sc) { set status=503,result={"id":(id),"state":"RECEIPT_INCOMPLETE","error":"result_could_not_be_persisted"} }
            else { set status=409,result=receipt.Public() }
            quit
        }
        set dispatching=1
        do ..Dispatch(p,token,.writeStatus)
        do ..AfterDispatch(id)
        if writeStatus'=200 {
            set state="UNKNOWN",reason="write_outcome_not_verified"
        } else {
            set reason=..Readback(p,token,receipt,.state)
        }
        set sc=..SaveFinal(receipt,state,reason)
        if $system.Status.IsError(sc) { set status=503,result={"id":(id),"state":"RECEIPT_INCOMPLETE","error":"result_could_not_be_persisted"} quit }
        set status=200,result=receipt.Public()
    } catch e {
        if $tlevel trollback
        set status=503,result={"id":(id),"state":($select(dispatching:"UNKNOWN",1:"FAILED_BEFORE_DISPATCH")),"error":"execution_unavailable"}
    }
    if targetLocked lock -^IrisOpsGuardLocks("target",..#TargetKind,target)
    lock -^IrisOpsGuardLocks("operation",id)
    quit result
}
}
