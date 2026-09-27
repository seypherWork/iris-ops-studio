/// Explicit laboratory installer, never called by a public HTTP route.
Class IrisOps.Guard.LabStore Extends %RegisteredObject
{
ClassMethod Require(sc As %Status)
{
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("Isolated guard storage setup failed")
}
ClassMethod Install()
{
    new $namespace
    set $namespace="%SYS",directory="/durable/irisops-guard-state/"
    if '##class(Config.Databases).Exists("IRISOPSGUARD") {
        if ##class(%File).Exists(directory_"IRIS.DAT") throw ##class(%Exception.General).%New("Unregistered database collision")
        if '##class(Security.Resources).Exists("%DB_IRISOPSGUARD") do ..Require(##class(Security.Resources).Create("%DB_IRISOPSGUARD","Isolated guard receipt storage",""))
        set made=##class(%File).CreateDirectory(directory)
        set p("Size")=16,p("MaxSize")=64,p("ResourceName")="%DB_IRISOPSGUARD",p("GlobalJournalState")=1
        do ..Require(##class(SYS.Database).Create(directory,.p))
        kill p set p("Directory")=directory
        do ..Require(##class(Config.Databases).Create("IRISOPSGUARD",.p))
    }
    kill p do ..Require(##class(Config.Databases).Get("IRISOPSGUARD",.p))
    if p("Directory")'=directory throw ##class(%Exception.General).%New("Database path collision")
    set db=##class(SYS.Database).%OpenId(directory)
    if '$isobject(db) throw ##class(%Exception.General).%New("Receipt database unavailable")
    // SYS.Database exposes 3=Yes and 2=No for GlobalJournalState.
    if (db.ResourceName'="%DB_IRISOPSGUARD")!(db.GlobalJournalState'=3)!(db.ReadOnly) throw ##class(%Exception.General).%New("Unsafe receipt database configuration")
    kill p do ..Require(##class(Security.Resources).Get("%DB_IRISOPSGUARD",.p))
    if $get(p("PublicPermission"))'="" throw ##class(%Exception.General).%New("Receipt resource must not be public")
    for global="IrisOpsGuardStateD","IrisOpsGuardStateI","IrisOpsGuardStateS","IrisOpsGuardStateC","IrisOpsGuardLocks" {
        kill p set sc=##class(Config.MapGlobals).Get("IRISOPS",global,.p)
        if $system.Status.IsError(sc) {
            set p("Database")="IRISOPSGUARD" do ..Require(##class(Config.MapGlobals).Create("IRISOPS",global,.p))
        } elseif p("Database")'="IRISOPSGUARD" { throw ##class(%Exception.General).%New("Global mapping collision") }
    }
    if '##class(Security.Roles).Exists("IrisOps_GuardStorage") do ..Require(##class(Security.Roles).Create("IrisOps_GuardStorage","Only own guard receipt database","%DB_IRISOPSGUARD:RW",""))
    kill p do ..Require(##class(Security.Roles).Get("IrisOps_GuardStorage",.p))
    if p("Resources")'="%DB_IRISOPSGUARD:RW" throw ##class(%Exception.General).%New("Storage role collision")
    kill p do ..Require(##class(Security.Applications).Get("/api/irisops-http-guard",.p))
    if (p("DispatchClass")'="IrisOps.Guard.HttpApi")!(p("NameSpace")'="IRISOPS") throw ##class(%Exception.General).%New("Application collision")
    if (p("MatchRoles")'="")&&(p("MatchRoles")'=":IrisOps_GuardStorage") throw ##class(%Exception.General).%New("Application role collision")
    kill p set p("MatchRoles")=":IrisOps_GuardStorage"
    do ..Require(##class(Security.Applications).Modify("/api/irisops-http-guard",.p))
    write "GUARD_STORE_INSTALLED",!
}
}
