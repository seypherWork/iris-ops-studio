/// Optional enrolled disabled-user workflow. No general user editor or secrets.
Class IrisOps.Guard.UserApi Extends IrisOps.Guard.HttpApi
{
Parameter TargetKind = "user";
Parameter WriteResource = "%Admin_Secure";
Parameter ExecutionClass = "IrisOps.Guard.UserExecution";
Parameter RecoveryClass = "IrisOps.Guard.UserRecovery";
ClassMethod Preview() As %Status
{
    if '..Ready(.token) quit 1
    if '##class(IrisOps.Guard.Protocol).Body("channel,action,name,role",.body) quit ..Reply(400,{"error":"invalid_schema"})
    set result=$classmethod(..#ExecutionClass,"Preview",body,token,.status)
    kill body,token
    quit ..Reply(status,result)
}
ClassMethod User() As %Status
{
    if '##class(IrisOps.Guard.Vault).Open(.token) quit ..Reply(401,{"error":"upstream_reconnect_required"})
    set username=$get(%request.Data("name",1)),role=$get(%request.Data("role",1))
    set result=##class(IrisOps.Guard.UserTransport).State(username,role,"",.status,.ignored,.nextRoles)
    if status=200 {
        if '##class(IrisOps.Guard.Vault).Open(.current) { set status=401,result={"error":"upstream_reconnect_required"} }
        elseif (current'=token)!('$system.Security.Check("%Admin_Secure","U")) { set status=403,result={"error":"operation_denied"} }
    }
    kill token,current
    quit ..Reply(status,result)
}
}
