/// LAB ONLY: read just the current account creation marker, never user records.
Class IrisOps.Guard.IdentityProbe Extends IrisOps.Guard.HttpApi
{
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes><Route Url="/v1/identity-probe" Method="GET" Call="Probe"/></Routes>
}
ClassMethod Probe() As %Status
{
    set available=0,kind="unavailable"
    try {
        set created=##class(Security.Users).CreateDateTimeGetStored($username)
        set available=(created'=""),kind="stored_creation_property"
    } catch e {
        // Only a short exception name, not the exception message or data.
        set kind=$piece(e.Name,">",1)_">"
    }
    quit ..Reply(200,{"available":(available),"kind":(kind)})
}
}
