/// One allowlisted disposable target. Shares the hardened execution lifecycle.
Class IrisOps.Guard.WebExecution Extends IrisOps.Guard.Execution
{
Parameter TargetKind = "webapp";
Parameter RecoveryClass = "IrisOps.Guard.WebRecovery";
ClassMethod Permissions(p As %DynamicObject) As %String
{
    if '$system.Security.Check("%Admin_Secure","U") quit "permission_revoked"
    quit ""
}
ClassMethod ReadState(token As %String, Output status As %Integer, target As %String = "") As %DynamicObject
{
    quit ##class(IrisOps.Guard.WebTransport).Read(token,.status,target)
}
ClassMethod Preview(body As %DynamicObject, token As %String, Output status As %Integer) As %DynamicObject
{
    set status=400
    if body.action'="webapp.availability.update" quit {"error":"action_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("webapp",body.name) quit {"error":"target_not_allowed"}
    if (body.Enabled'="true")&&(body.Enabled'="false") quit {"error":"invalid_enabled"}
    if '..Channel(body.channel,1) { set status=403 quit {"error":"read_only_or_expired_channel"} }
    if ..Permissions({})'="" { set status=403 quit {"error":"permission_revoked"} }
    set generation=%session.Data("IrisOpsGuard","channels",body.channel,"generation")
    set before=..ReadState(token,.status,body.name)
    if status'=200 { set status=409 quit {"error":"target_not_readable"} }
    set enabled=(body.Enabled="true")
    if before.Enabled=enabled { set status=400 quit {"error":"no_change"} }
    if $get(%session.Data("IrisOpsGuard","previewCount"))>=16 { set status=429 quit {"error":"preview_limit_reconnect_required"} }
    set expected={}.%FromJSON(before.%ToJSON())
    do expected.%Set("Enabled",enabled,"boolean")
    set id=##class(IrisOps.Guard.Protocol).Id(),phrase="APPLY "_$extract(id,1,8),key=##class(IrisOps.Guard.Protocol).Id()_##class(IrisOps.Guard.Protocol).Id()
    set p={"kind":"webapp","id":(id),"channel":(body.channel),"target":(body.name),"generation":(generation),"expires":(##class(IrisOps.Guard.Vault).Now()+30),"before":(before),"expected":(expected),"phrase":(phrase)}
    set p.policyGeneration=##class(IrisOps.Guard.TargetPolicy).Generation()
    set p.recoveryHash=##class(IrisOps.Guard.Protocol).RecoveryHash(id,key)
    set reason=..Authorization(p,token)
    if reason'="" { set status=403 quit {"error":(reason)} }
    set %session.Data("IrisOpsGuard","previews",id)=p.%ToJSON()
    set %session.Data("IrisOpsGuard","previewCount")=$get(%session.Data("IrisOpsGuard","previewCount"))+1
    set status=200
    quit {"id":(id),"recoveryKey":(key),"target":(body.name),"confirmation":(phrase),"expiresIn":30,"before":(before),"expected":(expected)}
}
ClassMethod CheckSnapshot(p As %DynamicObject, token As %String) As %String
{
    set current=..ReadState(token,.status,p.target)
    if status'=200 quit "target_not_readable"
    if (current.Enabled'=p.before.Enabled)!(current.configurationHash'=p.before.configurationHash) quit "stale"
    quit ""
}
ClassMethod FillReceipt(receipt As IrisOps.Guard.Receipt, p As %DynamicObject)
{
    set receipt.BeforeState=p.before.%ToJSON(),receipt.ExpectedState=p.expected.%ToJSON()
}
ClassMethod Dispatch(p As %DynamicObject, token As %String, Output status As %Integer)
{
    do ##class(IrisOps.Guard.WebTransport).Write(token,p.expected.Enabled,.status,p.target)
}
ClassMethod Readback(p As %DynamicObject, token As %String, receipt As IrisOps.Guard.Receipt, Output state As %String) As %String
{
    set current=..ReadState(token,.status,p.target),state="UNKNOWN"
    if status'=200 quit "readback_unavailable"
    set receipt.ObservedState=current.%ToJSON()
    if (current.Enabled=p.expected.Enabled)&&(current.configurationHash=p.expected.configurationHash) { set state="VERIFIED" quit "availability_and_configuration_match" }
    set state="MISMATCH"
    quit "readback_differs"
}
}
