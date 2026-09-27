/// Failure injection available only from terminal; never an HTTP route.
Class IrisOps.Guard.TestDeployment Extends IrisOps.Guard.Deployment
{
/// Execute the native identity probe in one call, without an interactive prompt.
/// Test password is supplied via stdin by the runner and never returned.
ClassMethod CheckInstallerDenied(user As %String, password As %String) As %DynamicObject
{
    set result={"authenticated":false,"correctActor":false,"manage":false,"denied":false}
    set ok=$system.Security.Login(user,password)
    do result.%Set("authenticated",ok,"boolean")
    if 'ok quit result
    do result.%Set("correctActor",($username=user),"boolean")
    do result.%Set("manage",$system.Security.Check("%Admin_Manage","U"),"boolean")
    try { do ##class(IrisOps.Guard.Deployment).Admin() } catch e {
        do result.%Set("denied",(e.Name="deployment_admin_required"),"boolean")
    }
    quit result
}
ClassMethod AfterDisabled()
{
    if $get(^IrisOpsGuardBoot("deploymentFault"))="crash" halt
    throw ##class(%Exception.General).%New("synthetic_activation_failure")
}
}
