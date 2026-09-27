/// Terminal-only administrator control. No HTTP route exposes these methods.
Class IrisOps.Guard.Deployment Extends %RegisteredObject
{
Parameter App = "/api/irisops-managed-guard";
Parameter Owner = "irisops-managed-lab-v1";
ClassMethod Require(sc As %Status)
{
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("deployment_configuration_failed")
}
ClassMethod Admin()
{
    if '$system.Security.Check("%Admin_Secure","U")!('$system.Security.Check("%Admin_Manage","U")) throw ##class(%Exception.General).%New("deployment_admin_required")
    if $namespace'="IRISOPS" throw ##class(%Exception.General).%New("prepared_namespace_required")
}
ClassMethod Dispatcher(build As %String) As %String
{
    if build="managed-lab-a" quit "IrisOps.Guard.ManagedApi"
    if build="managed-lab-b" quit "IrisOps.Guard.ManagedNextApi"
    quit ""
}
ClassMethod Digest(text As %String) As %String
{
    quit $system.Encryption.ToHex($system.Encryption.SHAHash(256,text))
}
ClassMethod State() As %DynamicObject
{
    set raw=$get(^IrisOpsGuardDeploy("state"))
    if raw="" quit {}
    quit {}.%FromJSON(raw)
}
ClassMethod Properties(Output props) As %Boolean
{
    new $namespace set $namespace="%SYS"
    if '##class(Security.Applications).Exists(..#App) quit 0
    do ..Require(##class(Security.Applications).Get(..#App,.props))
    quit 1
}
ClassMethod AppHash() As %String
{
    if '..Properties(.p) quit "absent"
    // Hash all returned native properties; never store/display their values.
    set name="",value={}
    for { set name=$order(p(name)) quit:name=""  do value.%Set(name,p(name)) }
    quit ..Digest(value.%ToJSON())
}
ClassMethod Prerequisites()
{
    do ..Admin()
    new $namespace set $namespace="%SYS"
    do ..Require(##class(Config.Databases).Get("IRISOPSGUARD",.p))
    set db=##class(SYS.Database).%OpenId(p("Directory"))
    if '$isobject(db) throw ##class(%Exception.General).%New("prepared_storage_required")
    if (db.ResourceName'="%DB_IRISOPSGUARD")!(db.GlobalJournalState'=3)!(db.ReadOnly) throw ##class(%Exception.General).%New("unsafe_storage")
    kill p do ..Require(##class(Security.Resources).Get("%DB_IRISOPSGUARD",.p))
    if $get(p("PublicPermission"))'="" throw ##class(%Exception.General).%New("public_storage_refused")
    kill p do ..Require(##class(Security.Roles).Get("IrisOps_GuardStorage",.p))
    if p("Resources")'="%DB_IRISOPSGUARD:RW" throw ##class(%Exception.General).%New("storage_role_collision")
    for name="IrisOpsGuardStateD","IrisOpsGuardStateI","IrisOpsGuardStateS","IrisOpsGuardStateC","IrisOpsGuardLocks" {
        kill p do ..Require(##class(Config.MapGlobals).Get("IRISOPS",name,.p))
        if p("Database")'="IRISOPSGUARD" throw ##class(%Exception.General).%New("storage_mapping_collision")
    }
    kill p set sc=##class(Config.MapGlobals).Get("IRISOPS","IrisOpsGuardDeploy",.p)
    if '$system.Status.IsError(sc),p("Database")'="IRISOPSGUARD" throw ##class(%Exception.General).%New("deployment_mapping_collision")
}
ClassMethod Fingerprint() As %String
{
    quit ..Digest(..AppHash()_"|"_$get(^IrisOpsGuardDeploy("state"))_"|"_$get(^IrisOpsGuardDeploy("install","origin"))_"|"_..SourceStamp())
}
ClassMethod SourceStamp() As %String
{
    set value=""
    for name="Api","Transport","Protocol","Vault","HttpTransport","Execution","Recovery","Receipt","HttpApi","WebTransport","WebExecution","WebRecovery","WebApi","CombinedApi","ManagedApi","Deployment","TargetPolicy" {
        set cls=##class(%Dictionary.ClassDefinition).%OpenId("IrisOps.Guard."_name)
        if '$isobject(cls) throw ##class(%Exception.General).%New("prepared_classes_required")
        set value=value_name_":"_cls.TimeChanged_"|"
    }
    // Optional feature classes are fenced even when absent: adding, removing
    // or changing them invalidates an earlier administrator plan. Historical
    // installations without Access Control remain supported.
    for name="RoleTransport","RoleExecution","RoleRecovery","RoleApi","UserTransport","UserExecution","UserRecovery","UserApi" {
        set cls=##class(%Dictionary.ClassDefinition).%OpenId("IrisOps.Guard."_name)
        if $isobject(cls) { set value=value_name_":"_cls.TimeChanged_"|" }
        else { set value=value_name_":absent|" }
    }
    // Optional replacement fixture is not a dependency of the installable runtime.
    set cls=##class(%Dictionary.ClassDefinition).%OpenId("IrisOps.Guard.ManagedNextApi")
    if $isobject(cls) set value=value_"ManagedNextApi:"_cls.TimeChanged_"|"
    // Dictionary revision fence, not a cryptographic software-signing claim.
    quit ..Digest(value)
}
ClassMethod Plan() As %DynamicObject
{
    do ..Prerequisites()
    set state=..State(),hash=..AppHash()
    if state.%Size()=0 {
        if hash'="absent" throw ##class(%Exception.General).%New("application_collision")
    } else {
        if state.owner'=..#Owner throw ##class(%Exception.General).%New("deployment_owner_collision")
        if state.appHash'=hash throw ##class(%Exception.General).%New("native_configuration_drift")
    }
    set result={"app":(..#App),"fingerprint":(..Fingerprint()),"mode":(state.%Get("mode","ABSENT")),"build":(state.%Get("build","")),"generation":(state.%Get("generation","")),"preservesReceipts":true}
    do result.%Set("installed",state.%Size()>0,"boolean")
    quit result
}
ClassMethod EnsureMapping()
{
    new $namespace set $namespace="%SYS"
    set sc=##class(Config.MapGlobals).Get("IRISOPS","IrisOpsGuardDeploy",.p)
    if $system.Status.IsError(sc) {
        // Refuse adopting pre-existing data in the namespace default database.
        if $data(^|"IRISOPS"|IrisOpsGuardDeploy) throw ##class(%Exception.General).%New("deployment_data_collision")
        kill p set p("Database")="IRISOPSGUARD"
        do ..Require(##class(Config.MapGlobals).Create("IRISOPS","IrisOpsGuardDeploy",.p))
    }
}
ClassMethod NativeChange(build As %String, enabled As %Boolean)
{
    new $namespace set $namespace="%SYS"
    if '##class(Security.Applications).Exists(..#App) {
        set p("NameSpace")="IRISOPS",p("Description")=..#Owner,p("DispatchClass")=..Dispatcher(build),p("Enabled")=0
        set p("AutheEnabled")=32,p("UseCookies")=2,p("CookiePath")=..#App_"/",p("Timeout")=3600,p("SessionScope")=2,p("UserCookieScope")=2,p("MatchRoles")=":IrisOps_GuardStorage"
        set p("ServeFiles")=0,p("CSPZENEnabled")=1,p("InbndWebServicesEnabled")=0
        do ..Require(##class(Security.Applications).Create(..#App,.p))
    }
    kill p set p("DispatchClass")=..Dispatcher(build),p("Enabled")=enabled,p("CSPZENEnabled")=1,p("Timeout")=3600
    do ..Require(##class(Security.Applications).Modify(..#App,.p))
}
/// Test seam has no behavior in this implementation.
ClassMethod AfterDisabled() { }
/// Explicit recovery of an interrupted TRANSITION. Never enable or delete.
ClassMethod RecoverInterrupted(expected As %String) As %DynamicObject
{
    do ..Admin()
    lock +^IrisOpsGuardLocks("deployment",..#App):2
    if '$test throw ##class(%Exception.General).%New("deployment_busy")
    try {
        do ..Prerequisites()
        if expected'=..Fingerprint() throw ##class(%Exception.General).%New("stale_deployment_plan")
        set state=..State()
        if (state.%Get("owner")'=..#Owner)!(state.%Get("mode")'="TRANSITION") throw ##class(%Exception.General).%New("interrupted_transition_required")
        if ..Properties(.p) {
            if (p("Description")'=..#Owner)!(p("NameSpace")'="IRISOPS")!(p("DispatchClass")'=..Dispatcher(state.build)) throw ##class(%Exception.General).%New("application_collision")
            do ..NativeChange(state.build,0)
        }
        set state.mode="SUSPENDED",state.generation=##class(IrisOps.Guard.Protocol).Id(),state.appHash=..AppHash(),state.at=##class(IrisOps.Guard.Protocol).Stamp()
        set ^IrisOpsGuardDeploy("state")=state.%ToJSON()
        set n=$increment(^IrisOpsGuardDeploy("history")),^IrisOpsGuardDeploy("history",n)=state.%ToJSON()
        set result=..Plan()
    } catch e { lock -^IrisOpsGuardLocks("deployment",..#App) throw e }
    lock -^IrisOpsGuardLocks("deployment",..#App)
    quit result
}
ClassMethod Apply(expected As %String, mode As %String, build As %String = "managed-lab-a") As %DynamicObject
{
    do ..Admin()
    if (mode'="READ_ONLY")&&(mode'="ACTIVE")&&(mode'="SUSPENDED") throw ##class(%Exception.General).%New("invalid_deployment_mode")
    if ..Dispatcher(build)="" throw ##class(%Exception.General).%New("unknown_build")
    if '##class(%Dictionary.CompiledClass).%ExistsId(..Dispatcher(build)) throw ##class(%Exception.General).%New("compiled_build_required")
    lock +^IrisOpsGuardLocks("deployment",..#App):2
    if '$test throw ##class(%Exception.General).%New("deployment_busy")
    set changed=0
    try {
        set plan=..Plan()
        if expected'=plan.fingerprint throw ##class(%Exception.General).%New("stale_deployment_plan")
        set prior=..State()
        if (prior.%Size()=0)&&(mode'="READ_ONLY") throw ##class(%Exception.General).%New("initial_readonly_required")
        if (prior.%Get("build",build)'=build)&&(prior.mode'="SUSPENDED") throw ##class(%Exception.General).%New("suspend_before_replacement")
        if (prior.%Get("mode")=mode)&&(prior.%Get("build")=build) { set result=plan quit }
        do ..EnsureMapping()
        set state={"owner":(..#Owner),"generation":(##class(IrisOps.Guard.Protocol).Id()),"mode":"TRANSITION","build":(build),"appHash":(..AppHash()),"at":(##class(IrisOps.Guard.Protocol).Stamp())}
        set ^IrisOpsGuardDeploy("state")=state.%ToJSON(),changed=1
        do ..NativeChange(build,0)
        do ..AfterDisabled()
        if mode'="SUSPENDED" do ..NativeChange(build,1)
        set state.mode=mode,state.appHash=..AppHash()
        set ^IrisOpsGuardDeploy("state")=state.%ToJSON()
        set n=$increment(^IrisOpsGuardDeploy("history"))
        set ^IrisOpsGuardDeploy("history",n)=state.%ToJSON()
        set result=..Plan()
    } catch e {
        if changed {
            // Recovery is fail-closed, not an automatic rollback to write mode.
            try { do ..NativeChange(build,0) } catch ignored { }
            set state.mode="SUSPENDED",state.appHash=..AppHash()
            set ^IrisOpsGuardDeploy("state")=state.%ToJSON()
            set n=$increment(^IrisOpsGuardDeploy("history")),^IrisOpsGuardDeploy("history",n)=state.%ToJSON()
        }
        lock -^IrisOpsGuardLocks("deployment",..#App)
        throw e
    }
    lock -^IrisOpsGuardLocks("deployment",..#App)
    quit result
}
}
