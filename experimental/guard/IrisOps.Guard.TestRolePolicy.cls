/// Isolated native regression for an OPTIONAL enrolled role. Not a runtime class.
Class IrisOps.Guard.TestRolePolicy Extends %RegisteredObject
{
ClassMethod Assert(ok As %Boolean, label As %String, ByRef count As %Integer)
{
    if 'ok throw ##class(%Exception.General).%New("role_policy_test_failed_"_label)
    set count=count+1
}
ClassMethod Denied(config As %DynamicObject, expected As %String) As %Boolean
{
    set denied=0
    try { set p=##class(IrisOps.Guard.TargetPolicy).Plan(config) }
    catch e { set denied=(e.Name=expected) }
    quit denied
}
ClassMethod ApplyDenied(config As %DynamicObject, fingerprint As %String, expires As %Integer, expected As %String) As %Boolean
{
    set denied=0
    try { set p=##class(IrisOps.Guard.TargetPolicy).Apply(config,fingerprint,expires) }
    catch e { set denied=(e.Name=expected) }
    quit denied
}
ClassMethod Input() As %DynamicObject
{
    quit {"wallet":"IrisOps_EnrolledWallet","webapp":"/csp/irisops-enrolled-app","resources":"IrisOps_EnrolledOne,IrisOps_EnrolledTwo"}
}
ClassMethod Description(role As %String, value As %String)
{
    new $namespace set $namespace="%SYS"
    set change("Description")=value
    set sc=##class(Security.Roles).Modify(role,.change)
    if $system.Status.IsError(sc) throw ##class(%Exception.General).%New("role_policy_test_modify_failed")
}
ClassMethod Run() As %DynamicObject
{
    set count=0,legacy=..Input(),role="IrisOps_PolicyRole"
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("role",role),"legacy_default_deny",.count)
    set c=..Input(),c.role="%Manager"
    do ..Assert(..Denied(c,"policy_role_invalid"),"system_role_rejected",.count)
    set c=..Input(),c.role="IrisOps_MissingRole"
    do ..Assert(..Denied(c,"policy_role_missing"),"missing_role_rejected",.count)
    set c=..Input(),c.role=role
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(c)
    do ..Assert(p.config.role=role,"owned_role_planned",.count)
    set applied=##class(IrisOps.Guard.TargetPolicy).Apply(c,p.fingerprint,p.expires)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Permits("role",role),"explicit_role_enrolled",.count)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("role","IrisOps_OtherRole"),"other_role_denied",.count)
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(c)
    do ..Description(role,"temporary policy drift")
    set denied=..ApplyDenied(c,p.fingerprint,p.expires,"stale_policy_plan")
    do ..Description(role,"Owned policy fixture")
    do ..Assert(denied,"role_drift_blocks_plan",.count)
    set p=##class(IrisOps.Guard.TargetPolicy).Plan(legacy)
    set applied=##class(IrisOps.Guard.TargetPolicy).Apply(legacy,p.fingerprint,p.expires)
    do ..Assert('##class(IrisOps.Guard.TargetPolicy).Permits("role",role),"legacy_reenrollment_revokes_role",.count)
    do ..Assert(##class(IrisOps.Guard.TargetPolicy).Permits("wallet",legacy.wallet),"legacy_wallet_preserved",.count)
    quit {"complete":true,"assertions":(count),"roleRevoked":true,"mode":"SUSPENDED"}
}
}
