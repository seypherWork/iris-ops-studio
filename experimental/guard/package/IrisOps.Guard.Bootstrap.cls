/// Fresh-instance installer, terminal only. Never replace foreign resources.
Class IrisOps.Guard.Bootstrap Extends %RegisteredObject
{
Parameter Version = "clean-install-lab-1";
ClassMethod Require(sc As %Status)
{
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("bootstrap_native_step_failed")
}
ClassMethod Admin()
{
    if ($namespace'="%SYS")!('$system.Security.Check("%Admin_Secure","U"))!('$system.Security.Check("%Admin_Manage","U")) throw ##class(%Exception.General).%New("bootstrap_admin_required")
}
ClassMethod OriginValid(origin As %String) As %Boolean
{
    if (origin'?1"http://127.0.0.1:"4.5N)&&(origin'?1"https://127.0.0.1:"4.5N) quit 0
    set port=$piece(origin,":",3)
    quit (+port>=1024)&&(+port<=65535)&&(port=+port)
}
ClassMethod Fingerprint(value As %String) As %String
{
    quit $system.Encryption.ToHex($system.Encryption.SHAHash(256,value))
}
ClassMethod Plan(origin As %String) As %DynamicObject
{
    do ..Admin()
    if '..OriginValid(origin) throw ##class(%Exception.General).%New("loopback_origin_required")
    if ##class(Config.Namespaces).Exists("IRISOPS") {
        do ..Require(##class(Config.Namespaces).Get("IRISOPS",.p))
        if (p("Globals")'="IRISOPS")!(p("Routines")'="IRISOPS") throw ##class(%Exception.General).%New("namespace_collision")
        if $get(^|"IRISOPS"|IrisOpsGuardDeploy("install","version"))'=..#Version throw ##class(%Exception.General).%New("namespace_collision_or_partial_install")
        do ..ValidateExisting(origin)
        quit {"installed":true,"origin":(origin),"fingerprint":(..Fingerprint(..#Version_"|installed|"_origin)),"action":"NO_CHANGE"}
    }
    for name="IRISOPS","IRISOPSGUARD" {
        if ##class(Config.Databases).Exists(name) throw ##class(%Exception.General).%New("database_collision")
        if ##class(Security.Resources).Exists("%DB_"_name) throw ##class(%Exception.General).%New("resource_collision")
    }
    for path="/durable/irisops-code/","/durable/irisops-guard-state/" {
        if ##class(%File).Exists(path) throw ##class(%Exception.General).%New("directory_collision")
    }
    if ##class(Security.Roles).Exists("IrisOps_GuardStorage") throw ##class(%Exception.General).%New("role_collision")
    for name="/api/irisops-managed-guard","/csp/ops" {
        if ##class(Security.Applications).Exists(name) throw ##class(%Exception.General).%New("application_collision")
    }
    quit {"installed":false,"origin":(origin),"fingerprint":(..Fingerprint(..#Version_"|absent|"_origin)),"action":"INSTALL_READ_ONLY"}
}
ClassMethod Database(name As %String, path As %String)
{
    do ..Require(##class(Security.Resources).Create("%DB_"_name,"Owned isolated guard database",""))
    if '##class(%File).CreateDirectory(path) throw ##class(%Exception.General).%New("directory_creation_failed")
    set p("Size")=16,p("MaxSize")=128,p("ResourceName")="%DB_"_name,p("GlobalJournalState")=1
    do ..Require(##class(SYS.Database).Create(path,.p))
    kill p set p("Directory")=path
    do ..Require(##class(Config.Databases).Create(name,.p))
}
ClassMethod ValidateExisting(origin As %String)
{
    if $get(^|"IRISOPS"|IrisOpsGuardDeploy("install","origin"))'=origin throw ##class(%Exception.General).%New("installed_origin_conflict")
    for name="IRISOPS","IRISOPSGUARD" {
        kill p do ..Require(##class(Config.Databases).Get(name,.p))
        set expected=$select(name="IRISOPS":"/durable/irisops-code/",1:"/durable/irisops-guard-state/")
        if p("Directory")'=expected throw ##class(%Exception.General).%New("database_path_collision")
        set db=##class(SYS.Database).%OpenId(expected)
        if '$isobject(db) throw ##class(%Exception.General).%New("database_unavailable")
        if (db.ResourceName'=("%DB_"_name))!(db.GlobalJournalState'=3)!(db.ReadOnly) throw ##class(%Exception.General).%New("unsafe_database")
        kill p do ..Require(##class(Security.Resources).Get("%DB_"_name,.p))
        if p("PublicPermission")'="" throw ##class(%Exception.General).%New("public_database_refused")
    }
    kill p do ..Require(##class(Config.MapGlobals).Get("IRISOPS","IrisOpsGuardBoot",.p))
    if p("Database")'="IRISTEMP" throw ##class(%Exception.General).%New("boot_mapping_collision")
    kill p do ..Require(##class(Security.Applications).Get("/csp/ops",.p))
    if (p("NameSpace")'="IRISOPS")!(p("Path")'="/opt/irisops-guard/ui/")!(p("AutheEnabled")'=64)!(p("ServeFiles")'=1)!(p("DispatchClass")'="")!(p("MatchRoles")'="") throw ##class(%Exception.General).%New("ui_application_drift")
    if ..AppHash("/csp/ops")'=$get(^|"IRISOPS"|IrisOpsGuardDeploy("install","uiHash")) throw ##class(%Exception.General).%New("ui_application_drift")
    new $namespace set $namespace="IRISOPS"
    set plan=##class(IrisOps.Guard.Deployment).Plan()
}
ClassMethod Install(expected As %String, origin As %String) As %DynamicObject
{
    do ..Admin()
    lock +^IrisOpsGuardBootstrap:2
    if '$test throw ##class(%Exception.General).%New("bootstrap_busy")
    set changed=0
    try {
        set plan=..Plan(origin)
        if expected'=plan.fingerprint throw ##class(%Exception.General).%New("stale_bootstrap_plan")
        if plan.installed { set result=plan quit }
        set changed=1
        do ..Database("IRISOPS","/durable/irisops-code/")
        do ..Database("IRISOPSGUARD","/durable/irisops-guard-state/")
        set p("Globals")="IRISOPS",p("Routines")="IRISOPS",p("TempGlobals")="IRISTEMP"
        do ..Require(##class(Config.Namespaces).Create("IRISOPS",.p))
        for name="IrisOpsGuardStateD","IrisOpsGuardStateI","IrisOpsGuardStateS","IrisOpsGuardStateC","IrisOpsGuardLocks","IrisOpsGuardDeploy","IrisOpsGuardBoot" {
            kill p set p("Database")=$select(name="IrisOpsGuardBoot":"IRISTEMP",1:"IRISOPSGUARD")
            do ..Require(##class(Config.MapGlobals).Create("IRISOPS",name,.p))
        }
        do ..Require(##class(Security.Roles).Create("IrisOps_GuardStorage","Only own guard receipt database","%DB_IRISOPSGUARD:RW",""))
        do ..LoadRuntime(origin)
        kill p set p("NameSpace")="IRISOPS",p("Path")="/opt/irisops-guard/ui/",p("Description")="Owned static managed guard UI",p("AutheEnabled")=64,p("ServeFiles")=1,p("CSPZENEnabled")=0,p("InbndWebServicesEnabled")=0,p("UseCookies")=0
        do ..Require(##class(Security.Applications).Create("/csp/ops",.p))
        set ^|"IRISOPS"|IrisOpsGuardDeploy("install","uiHash")=..AppHash("/csp/ops")
        do ..ValidateExisting(origin)
        set ^|"IRISOPS"|IrisOpsGuardDeploy("install","version")=..#Version
        set result=..Plan(origin)
    } catch e {
        // Never delete partly created databases or adopt them on a blind retry.
        // Runtime is registered READ_ONLY only after all classes and maps exist.
        if changed { try { do ..ClosePartial() } catch ignored { } }
        lock -^IrisOpsGuardBootstrap
        throw e
    }
    lock -^IrisOpsGuardBootstrap
    quit result
}
ClassMethod AppHash(name As %String) As %String
{
    do ..Require(##class(Security.Applications).Get(name,.p))
    set value={},key=""
    for { set key=$order(p(key)) quit:key=""  do value.%Set(key,p(key)) }
    quit ..Fingerprint(value.%ToJSON())
}
ClassMethod ClosePartial()
{
    set sc=##class(Security.Applications).Get("/api/irisops-managed-guard",.p)
    if $system.Status.IsError(sc) quit
    if (p("NameSpace")'="IRISOPS")!(p("Description")'="irisops-managed-lab-v1") quit
    kill p set p("Enabled")=0
    do ..Require(##class(Security.Applications).Modify("/api/irisops-managed-guard",.p))
    // Retain partial resources. An explicit inspection/repair is required.
}
ClassMethod LoadRuntime(origin As %String)
{
    new $namespace set $namespace="IRISOPS"
    set ^IrisOpsGuardDeploy("install","origin")=origin
    set sc=$system.OBJ.LoadDir("/opt/irisops-guard/classes/","ck",,1)
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("runtime_compile_failed")
    set plan=##class(IrisOps.Guard.Deployment).Plan()
    set result=##class(IrisOps.Guard.Deployment).Apply(plan.fingerprint,"READ_ONLY","managed-lab-a")
    if result.mode'="READ_ONLY" throw ##class(%Exception.General).%New("initial_readonly_required")
}
}
