/// Resource grants on one explicitly enrolled, non-system laboratory role.
/// Never changes users, role membership, descriptions or system resources.
Class IrisOps.Guard.RoleExecution Extends IrisOps.Guard.Execution
{
Parameter TargetKind = "role";
Parameter RecoveryClass = "IrisOps.Guard.RoleRecovery";
ClassMethod Permissions(p As %DynamicObject) As %String
{
    if ('$system.Security.Check("%Admin_Secure","U"))!('$system.Security.Check("%DB_IRISSYS","R")) quit "permission_revoked"
    if '##class(IrisOps.Guard.TargetPolicy).Permits("role",p.target) quit "target_policy_changed"
    if '##class(IrisOps.Guard.TargetPolicy).Resource(p.resource) quit "target_policy_changed"
    if '##class(IrisOps.Guard.TargetPolicy).PrivateResource(p.resource) quit "target_policy_changed"
    quit ""
}
ClassMethod Preview(body As %DynamicObject, token As %String, Output status As %Integer) As %DynamicObject
{
    set status=400
    if (body.action'="role.resource.grant")&&(body.action'="role.resource.revoke") quit {"error":"action_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Permits("role",body.name) quit {"error":"target_not_allowed"}
    if '##class(IrisOps.Guard.TargetPolicy).Resource(body.resource) quit {"error":"target_not_allowed"}
    if '..Channel(body.channel,1) { set status=403 quit {"error":"read_only_or_expired_channel"} }
    set generation=%session.Data("IrisOpsGuard","channels",body.channel,"generation")
    set action=$select(body.action="role.resource.grant":"grant",1:"revoke")
    set requested=$select(action="grant":body.permissions,1:"")
    set p={"target":(body.name),"resource":(body.resource),"action":(action),"permission":(requested)}
    set reason=..Permissions(p)
    if reason'="" { set status=403 quit {"error":(reason)} }
    set before=##class(IrisOps.Guard.RoleTransport).State(body.name,body.resource,action,requested,.status,.expected,.nextResources)
    if status'=200 quit {"error":($select(status=400:"no_change",status=403:"operation_denied",1:"target_not_readable"))}
    if $get(%session.Data("IrisOpsGuard","previewCount"))>=16 { set status=429 quit {"error":"preview_limit_reconnect_required"} }
    set id=##class(IrisOps.Guard.Protocol).Id(),phrase="APPLY "_$extract(id,1,8),key=##class(IrisOps.Guard.Protocol).Id()_##class(IrisOps.Guard.Protocol).Id()
    set p.id=id,p.channel=body.channel,p.generation=generation,p.expires=##class(IrisOps.Guard.Vault).Now()+30,p.before=before,p.expected=expected,p.phrase=phrase
    set p.kind="role",p.policyGeneration=##class(IrisOps.Guard.TargetPolicy).Generation(),p.recoveryHash=##class(IrisOps.Guard.Protocol).RecoveryHash(id,key)
    set reason=..Authorization(p,token)
    if reason'="" { set status=403 quit {"error":(reason)} }
    set %session.Data("IrisOpsGuard","previews",id)=p.%ToJSON()
    set %session.Data("IrisOpsGuard","previewCount")=$get(%session.Data("IrisOpsGuard","previewCount"))+1
    set status=200
    quit {"id":(id),"recoveryKey":(key),"target":(body.name),"confirmation":(phrase),"expiresIn":30,"before":(before),"expected":(expected)}
}
ClassMethod CheckSnapshot(p As %DynamicObject, token As %String) As %String
{
    set current=##class(IrisOps.Guard.RoleTransport).State(p.target,p.resource,"","",.status,.ignored,.nextResources)
    if status'=200 quit "target_not_readable"
    if (current.configurationHash'=p.before.configurationHash)!(current.permissions'=p.before.permissions) quit "stale"
    quit ""
}
ClassMethod FillReceipt(receipt As IrisOps.Guard.Receipt, p As %DynamicObject)
{
    set receipt.BeforeState=p.before.%ToJSON(),receipt.ExpectedState=p.expected.%ToJSON()
}
ClassMethod Dispatch(p As %DynamicObject, token As %String, Output status As %Integer)
{
    do ##class(IrisOps.Guard.RoleTransport).Write(p.target,p.resource,p.action,p.permission,p.before.configurationHash,p.expected.configurationHash,.status)
}
ClassMethod Readback(p As %DynamicObject, token As %String, receipt As IrisOps.Guard.Receipt, Output state As %String) As %String
{
    set current=##class(IrisOps.Guard.RoleTransport).State(p.target,p.resource,"","",.status,.ignored,.nextResources),state="UNKNOWN"
    if status'=200 quit "readback_unavailable"
    set receipt.ObservedState=current.%ToJSON()
    if (current.permissions=p.expected.permissions)&&(current.configurationHash=p.expected.configurationHash) { set state="VERIFIED" quit "role_grant_set_matches" }
    set state="MISMATCH"
    quit "readback_differs"
}
}
