/// Test-only dispatcher wrapper: count incoming wallet PUTs, preserve native API.
Class IrisOps.Guard.CountingAdmin Extends %Api.Admin
{
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    set pContinue=1
    if (pMethod="PUT")&&(pUrl="/v2/web-app") {
        set n=$increment(^|"IRISOPS"|IrisOpsGuardBoot("webPuts"))
        if $get(^|"IRISOPS"|IrisOpsGuardBoot("webFault"))="readback" set ^|"IRISOPS"|IrisOpsGuardBoot("webDenyReadback")=1
    }
    if (pMethod="GET")&&(pUrl="/v2/web-app"),$get(^|"IRISOPS"|IrisOpsGuardBoot("webDenyReadback")) {
        set pContinue=0,%response.Status=503,%response.ContentType="application/json"
        write {"error":"synthetic_readback_failure"}.%ToJSON()
    }
    if (pMethod="PUT")&&(pUrl="/v2/wallet/collection") {
        set n=$increment(^|"IRISOPS"|IrisOpsGuardBoot("observedPuts"))
        if $get(^|"IRISOPS"|IrisOpsGuardBoot("walletFault"))="readback" set ^|"IRISOPS"|IrisOpsGuardBoot("denyReadback")=1
    }
    if (pMethod="GET")&&(pUrl="/v2/wallet/collection"),$get(^|"IRISOPS"|IrisOpsGuardBoot("denyReadback")) {
        set pContinue=0,%response.Status=503,%response.ContentType="application/json"
        write {"error":"synthetic_readback_failure"}.%ToJSON()
    }
    quit 1
}
}
