/// Durable operation evidence, stored in its own resource-protected database.
Class IrisOps.Guard.Receipt Extends %Persistent
{
Parameter DEFAULTGLOBAL = "^IrisOpsGuardState";
Parameter USEEXTENTSET = 0;
Property OperationId As %String(MAXLEN = 32) [ Required ];
Index OperationKey On OperationId [ IdKey ];
Property Actor As %String(MAXLEN = 128) [ Required ];
Property Binding As %String(MAXLEN = 64) [ Required ];
Property Target As %String(MAXLEN = 64) [ Required ];
Property State As %String(MAXLEN = 32) [ Required ];
Property Reason As %String(MAXLEN = 64);
Property BeforeEdit As %String(MAXLEN = 64);
Property BeforeUse As %String(MAXLEN = 64);
Property ExpectedEdit As %String(MAXLEN = 64);
Property ExpectedUse As %String(MAXLEN = 64);
Property ObservedEdit As %String(MAXLEN = 64);
Property ObservedUse As %String(MAXLEN = 64);
Property Events As %String(MAXLEN = 8192);
Property DispatchCount As %Integer [ InitialExpression = 0 ];
Property CreatedUTC As %String(MAXLEN = 32);
/// Later observations do NOT replace original execution state or events.
Property Rechecks As %String(MAXLEN = 16384);
/// Hash only. Empty historical values are NOT eligible for recovery.
Property RecoveryHash As %String(MAXLEN = 64);
/// Append-only schema extension; historical wallet records retain their layout.
Property Kind As %String(MAXLEN = 16) [ InitialExpression = "wallet" ];
Property BeforeState As %String(MAXLEN = 512);
Property ExpectedState As %String(MAXLEN = 512);
Property ObservedState As %String(MAXLEN = 512);
Method OperationKind() As %String
{
    quit $select(..Kind="":"wallet",1:..Kind)
}

Method Transition(state As %String, reason As %String) As %Status
{
    set events=$select(..Events="":[],1:[].%FromJSON(..Events))
    do events.%Push({"state":(state),"reason":(reason),"at":(##class(IrisOps.Guard.Protocol).Stamp())})
    set ..State=state,..Reason=reason,..Events=events.%ToJSON()
    quit ..%Save()
}
Method Public() As %DynamicObject
{
    // A durable DISPATCHING record after interruption is not proof of failure
    // or success. It is exposed as UNKNOWN and is never automatically resent.
    set state=$select(..State="DISPATCHING":"UNKNOWN",1:..State)
    set rechecks=$select(..Rechecks="":[],1:[].%FromJSON(..Rechecks))
    if (..Kind="webapp")!(..Kind="role")!(..Kind="user") {
        set observed=$select(..ObservedState="":{},1:{}.%FromJSON(..ObservedState))
        quit {"id":(..OperationId),"actor":(..Actor),"target":(..Target),"state":(state),"reason":(..Reason),"dispatchCount":(..DispatchCount),"before":({}.%FromJSON(..BeforeState)),"expected":({}.%FromJSON(..ExpectedState)),"observed":(observed),"events":([].%FromJSON(..Events)),"rechecks":(rechecks),"createdUTC":(..CreatedUTC)}
    }
    quit {"id":(..OperationId),"actor":(..Actor),"target":(..Target),"state":(state),"reason":(..Reason),"dispatchCount":(..DispatchCount),"before":{"EditResource":(..BeforeEdit),"UseResource":(..BeforeUse)},"expected":{"EditResource":(..ExpectedEdit),"UseResource":(..ExpectedUse)},"observed":{"EditResource":(..ObservedEdit),"UseResource":(..ObservedUse)},"events":([].%FromJSON(..Events)),"rechecks":(rechecks),"createdUTC":(..CreatedUTC)}
}
}
