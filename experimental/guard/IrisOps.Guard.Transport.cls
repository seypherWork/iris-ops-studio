/// Experimental, pinned to IRIS 2026.2. Not installed by the production module.
/// No arbitrary path, host, method or body is accepted by this read-only probe.
Class IrisOps.Guard.Transport Extends %RegisteredObject
{

ClassMethod ReadWallet(name As %String, Output httpStatus As %Integer) As %DynamicObject
{
    new %request, %response, $namespace
    set httpStatus=503, result={"error":"transport_unavailable"}
    try {
        if $namespace'="%SYS" { set httpStatus=503,result={"error":"wrong_dispatch_namespace"} quit }
        set sc=##class(Security.Applications).Get("/api/admin",.props)
        if $system.Status.IsError(sc) { set result={"error":"source_configuration_unreadable"} quit }
        // Internal dispatch does not enter the original application's gateway.
        // Reject every unvalidated configuration rather than broadening access.
        if '$get(props("Enabled")) { set httpStatus=403,result={"error":"source_application_denied"} quit }
        if ($get(props("DispatchClass"))'="%Api.Admin")!($get(props("NameSpace"))'="%SYS") { set result={"error":"source_dispatch_incompatible"} quit }
        if ($get(props("AutheEnabled"))'=32)!($get(props("MatchRoles"))'="")!($get(props("TwoFactorEnabled"))'=0) { set result={"error":"source_auth_incompatible"} quit }
        set resource=$get(props("Resource"))
        if resource'="",'$system.Security.Check(resource,"U") { set httpStatus=403,result={"error":"source_application_denied"} quit }
        if '$system.Security.Check("%Admin_Wallet","U") { set httpStatus=403,result={"error":"operation_denied"} quit }
        set %request=##class(%CSP.Request).%New()
        set %response=##class(%CSP.Response).%New()
        set %request.Method="GET",%request.Data("name",1)=name
        set %request.CgiEnvs("HTTP_ACCEPT")="application/json"
        set sc=##class(%Api.Admin.Util.General).BeginCaptureOutput(.cookie)
        if $system.Status.IsError(sc) quit
        try {
            set sc=##class(%Api.Admin.Dispatch.v2).GetWalletCollection()
            set httpStatus=+%response.Status
        } catch dispatchError {
            set httpStatus=503
        }
        set endSC=##class(%Api.Admin.Util.General).EndCaptureOutput(cookie,.lines)
        if $system.Status.IsError(endSC) { set httpStatus=503 quit }
        if httpStatus'=200 { set result={"error":"upstream_read_rejected"} quit }
        set text="",it=lines.%GetIterator()
        while it.%GetNext(.key,.line) { set text=text_line }
        set raw={}.%FromJSON(text),body=raw.%Get("result")
        if '$isobject(body) { set httpStatus=502,result={"error":"invalid_upstream_shape"} quit }
        if (body.%GetTypeOf("EditResource")'="string")!(body.%GetTypeOf("UseResource")'="string") { set httpStatus=502,result={"error":"incomplete_upstream_shape"} quit }
        // Never return raw responses, even when upstream adds fields later.
        set result={"name":(name),"EditResource":(body.EditResource),"UseResource":(body.UseResource)}
    } catch internalError {
        set httpStatus=503,result={"error":"transport_unavailable"}
    }
    quit result
}

}
