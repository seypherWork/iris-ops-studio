/// LAB ONLY. HALT exits only this request worker after an owned fixture action.
Class IrisOps.Guard.TestExecution Extends IrisOps.Guard.Execution
{
/// Bounded audit-only scheduling, after a REAL native snapshot. No API payload
/// can enable it; only the fixture administrator sets this volatile lab flag.
ClassMethod Snapshot(token As %String, name As %String, Output edit As %String, Output use As %String) As %Boolean
{
    set ok=##super(token,name,.edit,.use)
    set fault=$get(^IrisOpsGuardBoot("auditFault"))
    if ok,fault'="" {
        set n=$increment(^IrisOpsGuardBoot("auditSnapshots"))
        if n=1,fault="delay_snapshot" hang 3
        if n<=2,fault="snapshot_barrier" {
            for i=1:1:40 { quit:$get(^IrisOpsGuardBoot("auditSnapshots"))>=2  hang .05 }
            hang .1
        }
    }
    quit ok
}
ClassMethod AfterReservation(id As %String)
{
    if $get(^IrisOpsGuardBoot("auditFault"))="delay_reservation" hang 3
    if $get(^IrisOpsGuardBoot("auditFault"))="hold_reservation" hang 8
    if $get(^IrisOpsGuardBoot("executionFault"))="crash_before" {
        set ^IrisOpsGuardBoot("interruption",id)="before_dispatch"
        halt
    }
}
ClassMethod AfterDispatch(id As %String)
{
    if $get(^IrisOpsGuardBoot("executionFault"))="crash_after" {
        set ^IrisOpsGuardBoot("interruption",id)="after_dispatch"
        halt
    }
}
ClassMethod SaveFinal(receipt As IrisOps.Guard.Receipt, state As %String, reason As %String) As %Status
{
    if $get(^IrisOpsGuardBoot("executionFault"))="final_save" quit $system.Status.Error(5001,"Injected final receipt save failure")
    quit ##super(receipt,state,reason)
}
}
