/// LAB ONLY: real native writes/receipts, synthetic session custody, admin actor.
/// Does NOT claim browser authentication, network or non-admin validation.
Class IrisOps.Guard.TestUserWorkflow Extends %RegisteredObject
{
ClassMethod Assert(ok As %Boolean, name As %String)
{
    if 'ok throw ##class(%Exception.General).%New("user_workflow_assertion_"_name)
    write "PASS ",name,!
}
ClassMethod Session(token As %String) As %String
{
    set %session=##class(IrisOps.Guard.TestSession).%New()
    set %session.Key=$system.Encryption.GenCryptRand(32),%session.SessionId=##class(IrisOps.Guard.Protocol).Id()
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"synthetic_custody")
    set channel=##class(IrisOps.Guard.Protocol).Id()
    set %session.Data("IrisOpsGuard","channels",channel,"kind")="user"
    set %session.Data("IrisOpsGuard","channels",channel,"generation")=##class(IrisOps.Guard.Protocol).Id()
    set %session.Data("IrisOpsGuard","channels",channel,"boot")=##class(IrisOps.Guard.Vault).Boot()
    set %session.Data("IrisOpsGuard","channels",channel,"until")=##class(IrisOps.Guard.Vault).Now()+60
    quit channel
}
ClassMethod Preview(channel As %String, action As %String, token As %String) As %DynamicObject
{
    set b={"channel":(channel),"action":("user.membership."_action),"name":"IrisOps_UserRoleProbeUser","role":"IrisOps_UserRoleProbeRole"}
    set p=##class(IrisOps.Guard.UserExecution).Preview(b,token,.status)
    do ..Assert(status=200,"preview_"_action)
    quit p
}
ClassMethod Execute(p As %DynamicObject, token As %String) As %DynamicObject
{
    set b={"confirmation":(p.confirmation),"recoveryKey":(p.recoveryKey)}
    set r=##class(IrisOps.Guard.UserExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=200)&&(r.state="VERIFIED")&&(r.dispatchCount=1),"verified_dispatch_once")
    quit r
}
ClassMethod NativeAssigned() As %Boolean
{
    new $namespace set $namespace="%SYS"
    set exists=##class(Security.Users).Exists("IrisOps_UserRoleProbeUser",.u,.sc)
    if ('exists)!($system.Status.IsError(sc)) quit -1
    quit u.Roles.Count()=1
}
ClassMethod RoleDescription(text As %String)
{
    new $namespace set $namespace="%SYS"
    set p("Description")=text,sc=##class(Security.Roles).Modify("IrisOps_UserRoleProbeRole",.p)
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("fixture_drift_failed")
}
ClassMethod Run() As %DynamicObject
{
    new %session
    set token="SYNTHETIC-NONCREDENTIAL-USER-WORKFLOW",channel=..Session(token)
    do ..Assert(..NativeAssigned()=0,"initial_unassigned")
    set b={"channel":(channel),"action":"user.membership.assign","name":"IrisOps_UserRoleProbeUser","role":"IrisOps_UserRoleProbeRole"}
    set %session.Data("IrisOpsGuard","channels",channel,"until")=0
    set p=##class(IrisOps.Guard.UserExecution).Preview(b,token,.status)
    do ..Assert(status=403,"readonly_channel_refused")
    set %session.Data("IrisOpsGuard","channels",channel,"until")=##class(IrisOps.Guard.Vault).Now()+60
    set %session.Data("IrisOpsGuard","channels",channel,"kind")="role"
    set p=##class(IrisOps.Guard.UserExecution).Preview(b,token,.status)
    do ..Assert(status=403,"wrong_kind_channel_refused")
    set %session.Data("IrisOpsGuard","channels",channel,"kind")="user"
    set p=..Preview(channel,"assign",token),bad={"confirmation":"WRONG","recoveryKey":(p.recoveryKey)}
    set r=##class(IrisOps.Guard.UserExecution).Execute(p.id,bad,token,.status)
    do ..Assert((status=400)&&('..NativeAssigned()),"wrong_confirmation_zero_write")
    set r=..Execute(p,token)
    do ..Assert(..NativeAssigned(),"assign_native_readback")
    set b={"confirmation":(p.confirmation),"recoveryKey":(p.recoveryKey)}
    set r=##class(IrisOps.Guard.UserExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=200)&&(r.dispatchCount=1),"replay_returns_original_receipt")
    set p=..Preview(channel,"remove",token)
    do ..RoleDescription("Owned user workflow temporary drift")
    set b={"confirmation":(p.confirmation),"recoveryKey":(p.recoveryKey)}
    set r=##class(IrisOps.Guard.UserExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=409)&&(r.state="BLOCKED")&&(r.reason="stale")&&(r.dispatchCount=0)&&..NativeAssigned(),"stale_zero_dispatch")
    do ..RoleDescription("Owned disabled-user role probe")
    set p=..Preview(channel,"remove",token),r=..Execute(p,token)
    do ..Assert('..NativeAssigned(),"remove_native_readback")
    set p=..Preview(channel,"assign",token),b={"confirmation":(p.confirmation),"recoveryKey":(p.recoveryKey)}
    set %session.Data("UserTestFault")="after"
    set r=##class(IrisOps.Guard.UserTestExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=503)&&(r.state="UNKNOWN")&&..NativeAssigned(),"post_dispatch_uncertainty")
    kill %session.Data("UserTestFault")
    set stored=##class(IrisOps.Guard.Receipt).%OpenId(p.id),events=stored.Events
    do ..Assert(stored.State="DISPATCHING","durable_reservation_survives_exception")
    set r=##class(IrisOps.Guard.UserRecovery).Read(p.id,token,0,.status,"invalid")
    do ..Assert(status=404,"wrong_recovery_proof_refused")
    set channel=..Session(token)
    set r=##class(IrisOps.Guard.UserRecovery).Read(p.id,token,1,.status,p.recoveryKey)
    do ..Assert((status=200)&&(r.currentObservation.outcome="MATCHES_EXPECTED")&&(r.administrativeWrites=0)&&(r.receipt.state="UNKNOWN"),"new_session_reconcile_without_rewrite")
    set stored=##class(IrisOps.Guard.Receipt).%OpenId(p.id)
    do ..Assert((stored.Events=events)&&(stored.State="DISPATCHING"),"historical_result_not_rewritten")
    set p=..Preview(channel,"remove",token),r=..Execute(p,token)
    set p=..Preview(channel,"assign",token),b={"confirmation":(p.confirmation),"recoveryKey":(p.recoveryKey)}
    set %session.Data("UserTestFault")="before"
    set r=##class(IrisOps.Guard.UserTestExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=503)&&('..NativeAssigned()),"pre_dispatch_interruption_zero_native_write")
    kill %session.Data("UserTestFault")
    set r=##class(IrisOps.Guard.UserRecovery).Read(p.id,token,0,.status,p.recoveryKey)
    do ..Assert((status=200)&&(r.currentObservation.outcome="MATCHES_BEFORE")&&(r.receipt.state="UNKNOWN")&&(r.administrativeWrites=0),"pre_dispatch_recovery_does_not_retry")
    set r=##class(IrisOps.Guard.UserExecution).Execute(p.id,b,token,.status)
    do ..Assert((status=200)&&(r.state="UNKNOWN")&&('..NativeAssigned()),"uncertain_replay_does_not_dispatch")
    do ##class(IrisOps.Guard.Vault).Clear()
    quit {"complete":true,"realNativeMutations":true,"realDurableReceipts":true,"syntheticSession":true,"httpAuthenticationVerified":false,"nativeTargetRestored":true}
}
}
