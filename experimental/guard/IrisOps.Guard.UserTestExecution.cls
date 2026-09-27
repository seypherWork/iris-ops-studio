/// LAB ONLY. Faults are native test-session flags, never HTTP inputs.
Class IrisOps.Guard.UserTestExecution Extends IrisOps.Guard.UserExecution
{
ClassMethod AfterReservation(id As %String)
{
    if $get(%session.Data("UserTestFault"))="before" throw ##class(%Exception.General).%New("simulated_pre_dispatch_interruption")
}
ClassMethod AfterDispatch(id As %String)
{
    if $get(%session.Data("UserTestFault"))="after" throw ##class(%Exception.General).%New("simulated_post_dispatch_interruption")
}
}
