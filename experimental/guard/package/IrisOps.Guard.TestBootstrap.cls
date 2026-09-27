/// Terminal-only test fixture, EXCLUDED from the packaged runtime.
Class IrisOps.Guard.TestBootstrap Extends IrisOps.Guard.Bootstrap
{
ClassMethod LoadRuntime(origin As %String)
{
    do ##super(origin)
    // Inject the same native collision at the late boundary without consuming
    // an additional licensed terminal while IRIS compiles the runtime.
    set p("NameSpace")="IRISOPS",p("Description")="Owned late installation collision",p("AutheEnabled")=32,p("ServeFiles")=0,p("Enabled")=0
    do ..Require(##class(Security.Applications).Create("/csp/ops",.p))
}
}
