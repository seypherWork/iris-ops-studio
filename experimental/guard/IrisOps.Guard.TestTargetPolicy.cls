/// Terminal-only tests in a NEW owned instance. Not a runtime package class.
Class IrisOps.Guard.TestTargetPolicy Extends %RegisteredObject
{
ClassMethod Assert(ok As %Boolean, label As %String, ByRef count As %Integer)
{
    if 'ok throw ##class(%Exception.General).%New("policy_test_failed_"_label)
    set count=count+1
}
ClassMethod Input() As %DynamicObject
{
    quit {"wallet":"IrisOps_EnrolledWallet","webapp":"/csp/irisops-enrolled-app","resources":"IrisOps_EnrolledOne,IrisOps_EnrolledTwo"}
}
ClassMethod Denied(config As %DynamicObject, code As %String) As %Boolean
{
    set denied=0
    try { set p=##class(IrisOps.Guard.TargetPolicy).Plan(config) } catch e {
        set denied=(e.Name=code)
        if 'denied throw ##class(%Exception.General).%New("policy_unexpected_"_$translate(e.Name,"<> ","___"))
    }
    quit denied
}
ClassMethod ApplyDenied(p As %DynamicObject, code As %String, fingerprint As %String = "", expires As %Integer = 0) As %Boolean
{
    set denied=0
    if fingerprint="" set fingerprint=p.fingerprint
    if expires=0 set expires=p.expires
    try { set r=##class(IrisOps.Guard.TargetPolicy).Apply(p.config,fingerprint,expires) } catch e { set denied=(e.Name=code) }
    quit denied
}
ClassMethod Mode(mode As %String)
{
    set p=##class(IrisOps.Guard.Deployment).Plan(),r=##class(IrisOps.Guard.Deployment).Apply(p.fingerprint,mode)
    if r.mode'=mode throw ##class(%Exception.General).%New("test_mode_failed")
}
ClassMethod Description(value As %String)
{
    new $namespace set $namespace="%SYS"
    set p("Description")=value,sc=##class(Security.Applications).Modify("/csp/irisops-enrolled-app",.p)
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("test_description_failed")
}
ClassMethod Run() As %DynamicObject
{
    set count=0,initial=..Input()
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("wallet",initial.wallet),"empty_denies",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Name($char(233)_"vil"),"ascii_only",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Name("a.b"),"transport_dot_denied",.count)
    set long="" for i=1:1:65 { set long=long_"A" }
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Name(long),"transport_length",.count)
    set c=..Input(),c.resources=$extract(long,1,59),denied=0
    try { set normalized=##class(IrisOps.Guard.TargetPolicy).Normalize(c) } catch e { set denied=(e.Name="policy_resources_invalid") }
    do ..Assert(denied,"resource_permission_length",.count)
    do ..Assert(..Denied(initial,"suspend_before_policy_change"),"readonly_cannot_enroll",.count)
    do ..Mode("SUSPENDED")
    for wallet="%System","../escape","*","with space" {
        set c=..Input(),c.wallet=wallet
        do ..Assert(..Denied(c,"policy_wallet_invalid"),"wallet_shape",.count)
    }
    for web="/csp/sys","/csp/ops","/api/admin","/csp/%73ys","/csp/a/b","/csp/a?x=1" {
        set c=..Input(),c.webapp=web
        do ..Assert(..Denied(c,"policy_webapp_invalid"),"web_shape",.count)
    }
    set c=..Input(),c.resources="IrisOps_EnrolledOne,irisops_enrolledone"
    do ..Assert(..Denied(c,"policy_duplicate_resource"),"case_duplicate",.count)
    set c=..Input(),c.resources="%Admin_Secure"
    do ..Assert(..Denied(c,"policy_resources_invalid"),"system_resource",.count)
    set c=..Input(),c.resources="IrisOps_MissingResource"
    do ..Assert(..Denied(c,"policy_resource_missing"),"missing_resource",.count)
    set c=..Input(),c.wallet="IrisOps_MissingWallet"
    do ..Assert(..Denied(c,"policy_wallet_missing"),"missing_wallet",.count)
    set c=..Input(),c.resources="IrisOps_EnrolledTwo"
    do ..Assert(..Denied(c,"policy_current_resource_not_enrolled"),"current_access_not_enrolled",.count)
    set c=..Input(),c.extra="unexpected"
    do ..Assert(..Denied(c,"policy_schema_invalid"),"extra_field",.count)
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(initial)
    do ..Assert(..ApplyDenied(p,"stale_policy_plan","incorrect"),"wrong_confirmation",.count)
    do ..Assert(..ApplyDenied(p,"policy_plan_expired","",##class(IrisOps.Guard.Vault).Now()-1),"expired",.count)
    do ..Assert(..ApplyDenied(p,"policy_plan_expired","",##class(IrisOps.Guard.Vault).Now()+301),"future_expiry",.count)
    tstart
    do ..Assert(..ApplyDenied(p,"policy_ambient_transaction_refused"),"caller_transaction_refused",.count)
    trollback
    do ..Description("temporary policy drift")
    do ..Assert(..ApplyDenied(p,"stale_policy_plan"),"native_drift",.count)
    do ..Description("Owned policy fixture")
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(initial),prior=##class(IrisOps.Guard.Deployment).State()
    set applied=##class(IrisOps.Guard.TargetPolicy).Apply(initial,p.fingerprint,p.expires),after=##class(IrisOps.Guard.Deployment).State()
    do ..Assert(after.mode="SUSPENDED","remains_suspended",.count)
    do ..Assert(prior.generation'=after.generation,"authority_epoch_changed",.count)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Permits("wallet",initial.wallet),"enrolled_wallet",.count)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Permits("webapp",initial.webapp),"enrolled_webapp",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("wallet","IrisOps_GuardProbeWallet"),"no_legacy_fallback",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("webapp","/csp/sys"),"no_admin_target",.count)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Resource("irisops_enrolledone"),"resource_case",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Resource("%Admin_Secure"),"no_system_resource",.count)
    do ..Assert(..ApplyDenied(p,"stale_policy_plan"),"replay_refused",.count)
    set raw=$get(^IrisOpsGuardDeploy("targetPolicy"))
    set ^IrisOpsGuardDeploy("targetPolicy")="broken"
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("wallet",initial.wallet),"corrupt_deny",.count)
    set ^IrisOpsGuardDeploy("targetPolicy")=raw
    set bad={}.%FromJSON(raw),bad.config.wallet="OtherWallet",^IrisOpsGuardDeploy("targetPolicy")=bad.%ToJSON()
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("wallet","OtherWallet"),"altered_deny",.count)
    set ^IrisOpsGuardDeploy("targetPolicy")=raw
    do ..Mode("ACTIVE")
    do ..Assert(..Denied(initial,"suspend_before_policy_change"),"active_cannot_enroll",.count)
    do ..Mode("SUSPENDED")
    set revoke=##class(IrisOps.Guard.TargetPolicy).RevokePlan(),denied=0
    try { set r=##class(IrisOps.Guard.TargetPolicy).Revoke("wrong",revoke.expires) } catch e { set denied=(e.Name="stale_policy_plan") }
    do ..Assert(denied,"unconfirmed_revocation",.count)
    set revoked=##class(IrisOps.Guard.TargetPolicy).Revoke(revoke.fingerprint,revoke.expires)
    do ..Assert(revoked.revoked,"revocation_readback",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("wallet",initial.wallet),"revoked_wallet_denied",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("webapp",initial.webapp),"revoked_webapp_denied",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Resource("IrisOps_EnrolledOne"),"revoked_resource_denied",.count)
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(initial),applied=##class(IrisOps.Guard.TargetPolicy).Apply(initial,p.fingerprint,p.expires)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Permits("wallet",initial.wallet),"explicit_reenrollment",.count)
    quit {"complete":true,"assertions":(count),"policyGeneration":(applied.generation),"mode":"SUSPENDED","enrollmentOnly":true}
}
ClassMethod CheckDenied(user As %String, password As %String) As %DynamicObject
{
    set ok=$system.Security.Login(user,password),denied=0
    if ok { try { set p=##class(IrisOps.Guard.TargetPolicy).Plan(..Input()) } catch e { set denied=(e.Name="deployment_admin_required") } }
    quit {"authenticated":(ok),"denied":(denied)}
}
}
