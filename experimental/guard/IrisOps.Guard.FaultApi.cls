/// LAB ONLY. Never installed by the product module or used in regular service.
Class IrisOps.Guard.FaultApi Extends IrisOps.Guard.HttpApi
{
Parameter ExecutionClass = "IrisOps.Guard.TestExecution";
ClassMethod LoginUpstream(password As %String, Output status As %Integer) As %DynamicObject
{
    set n=$increment(^IrisOpsGuardBoot("observedLogins"))
    quit ##super(password,.status)
}
}
