/// Optional managed role-resource workflow; no generic role/user editor.
Class IrisOps.Guard.RoleApi Extends IrisOps.Guard.HttpApi
{
Parameter TargetKind = "role";
Parameter WriteResource = "%Admin_Secure";
Parameter ExecutionClass = "IrisOps.Guard.RoleExecution";
Parameter RecoveryClass = "IrisOps.Guard.RoleRecovery";
ClassMethod Preview() As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("channel,action,name,resource,permissions",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=$classmethod(..#ExecutionClass,"Preview",body,token,.status)
    kill body,token
    quit ..Reply(status,result)
}
ClassMethod Role() As %Status
{
    if '##class(IrisOps.Guard.Vault).Open(.token) quit ..Reply(401,{"error":"upstream_reconnect_required"})
    set role=$get(%request.Data("name",1)),resource=$get(%request.Data("resource",1))
    set result=##class(IrisOps.Guard.RoleTransport).State(role,resource,"","",.status,.ignored,.nextResources)
    if status=200 {
        if '##class(IrisOps.Guard.Vault).Open(.current) { set status=401,result={"error":"upstream_reconnect_required"} }
        elseif (current'=token)!('$system.Security.Check("%Admin_Secure","U")) { set status=403,result={"error":"operation_denied"} }
    }
    kill token,current
    quit ..Reply(status,result)
}
}
