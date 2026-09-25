/// Optional read-only native logs. IRIS supplies independent JWT authentication.
Class IrisOps.LogApi Extends %CSP.REST
{

Parameter UseSession = 0;
Parameter HandleCorsRequest = 0;

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/logs" Method="GET" Call="Logs"/>
</Routes>
}

ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    Set pContinue = 0
    Set %response.ContentType = "application/json"
    Do %response.SetHeader("Cache-Control", "no-store")
    Do %response.SetHeader("X-Content-Type-Options", "nosniff")
    If '$SYSTEM.Security.Check("%Admin_Operate", "U") {
        Set %response.Status = "403 Forbidden"
        Write {"message":"Native logs require the IRIS operating permission"}.%ToJSON()
        Quit 1
    }
    If pMethod '= "GET" {
        Set %response.Status = "405 Method Not Allowed"
        Do %response.SetHeader("Allow", "GET")
        Write {"message":"Native logs are read-only"}.%ToJSON()
        Quit 1
    }
    Set pContinue = 1
    Quit 1
}

ClassMethod Logs() As %Status
{
    Try {
        Set source = $Get(%request.Data("source",1))
        Set cursor = $Get(%request.Data("cursor",1))
        If ($Length(source)>16)!($Length(cursor)>512)!($Data(%request.Data("source",2)))!($Data(%request.Data("cursor",2))) {
            Set %response.Status = "400 Bad Request"
            Write {"message":"Invalid native log parameters"}.%ToJSON()
            Quit
        }
        Set response = ##class(%DynamicObject).%FromJSON(..ReadPage($System.Util.ManagerDirectory(),$System.Util.InstallDirectory(),source,cursor))
        Set status = response.httpStatus
        Do response.%Remove("httpStatus")
        If status=400 Set %response.Status="400 Bad Request"
        If status=403 Set %response.Status="403 Forbidden"
        If status=404 Set %response.Status="404 Not Found"
        If status=409 Set %response.Status="409 Conflict"
        If status=503 Set %response.Status="503 Service Unavailable"
        Write response.%ToJSON()
    } Catch error {
        Set %response.Status = "503 Service Unavailable"
        Write {"message":"Native log reader unavailable"}.%ToJSON()
    }
    Quit 1
}

ClassMethod ReadPage(manager As %String, install As %String, source As %String, cursor As %String) As %String [ Language = python ]
{
    import importlib.util
    import os
    # A durable-directory migration can change ManagerDirectory() after ZPM
    # copied the bundled reader into the original installation manager dir.
    path = os.path.join(manager, "irisops", "python", "irisops_logs.py")
    if not os.path.isfile(path):
        path = os.path.join(install, "mgr", "irisops", "python", "irisops_logs.py")
    spec = importlib.util.spec_from_file_location("irisops_native_log_reader", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.response(manager, source, cursor)
}

}
