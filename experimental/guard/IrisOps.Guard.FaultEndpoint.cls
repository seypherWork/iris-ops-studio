/// Test-only upstream faults. No credential parsing or storage.
Class IrisOps.Guard.FaultEndpoint Extends IrisOps.Guard.Api
{
Parameter UseSession = 0;
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes><Route Url="/v2/wallet/collection" Method="GET" Call="Fault"/></Routes>
}
ClassMethod Fault() As %Status
{
    set mode=$get(^|"IRISOPS"|IrisOpsGuardFixture("fault"))
    if mode="redirect" {
        do %response.SetHeader("Location","http://127.0.0.1:1/must-not-follow")
        quit ..Reply(302,{"error":"synthetic_redirect"})
    }
    if mode="extra" quit ..Reply(200,{"result":{"EditResource":"IrisOps_GuardProbeResource:WRITE","UseResource":"IrisOps_GuardProbeResource:READ","SecretValue":"TEST-SECRET-MUST-NOT-LEAK"}})
    if mode="missing" quit ..Reply(200,{"result":{"EditResource":"IrisOps_GuardProbeResource:WRITE"}})
    if mode="invalidpolicy" quit ..Reply(200,{"result":{"EditResource":"TEST SECRET VALUE MUST NOT LEAK","UseResource":"IrisOps_GuardProbeResource:READ"}})
    if mode="wrongtarget" quit ..Reply(200,{"result":{"Name":"IrisOps_DifferentWallet","EditResource":"IrisOps_GuardProbeResource:WRITE","UseResource":"IrisOps_GuardProbeResource:READ"}})
    if mode="oversized" {
        set huge=$justify("",33000)
        quit ..Reply(200,{"result":{"EditResource":(huge),"UseResource":"IrisOps_GuardProbeResource:READ"}})
    }
    if mode="error" quit ..Reply(500,{"password":"TEST-SECRET-MUST-NOT-LEAK","error":"private_stack_trace"})
    set %response.Status=200 write "not JSON TEST-SECRET-MUST-NOT-LEAK"
    quit 1
}
}
