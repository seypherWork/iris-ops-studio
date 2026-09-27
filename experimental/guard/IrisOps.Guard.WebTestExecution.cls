/// LAB ONLY, isolated disposable application. Real native I/O before each seam.
Class IrisOps.Guard.WebTestExecution Extends IrisOps.Guard.WebExecution
{
ClassMethod ReadState(token As %String, Output status As %Integer, target As %String = "") As %DynamicObject
{
    set result=##super(token,.status,target)
    if status=200 {
        if $get(^IrisOpsGuardBoot("webFault"))="delay_read" {
            set ^IrisOpsGuardBoot("webWaiting")=1
            hang 3
        }
    }
    quit result
}
ClassMethod AfterReservation(id As %String)
{
    if $get(^IrisOpsGuardBoot("webFault"))="delay_reservation" hang 3
    if $get(^IrisOpsGuardBoot("webFault"))="crash_before" {
        set ^IrisOpsGuardBoot("interruption",id)="before_dispatch"
        halt
    }
}
ClassMethod AfterDispatch(id As %String)
{
    if $get(^IrisOpsGuardBoot("webFault"))="crash_after" {
        set ^IrisOpsGuardBoot("interruption",id)="after_dispatch"
        halt
    }
}
ClassMethod SaveFinal(receipt As IrisOps.Guard.Receipt, state As %String, reason As %String) As %Status
{
    if $get(^IrisOpsGuardBoot("webFault"))="final_save" quit $system.Status.Error(5001,"Synthetic final save failure")
    quit ##super(receipt,state,reason)
}
}
