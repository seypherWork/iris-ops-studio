// Synthetic public metadata only. Match the full native guard response contract.
export const id='a'.repeat(32),key='b'.repeat(64),at='2026-09-26T00:00:00Z';
export const before={EditResource:'IRISOPS_GUARDPROBERESOURCE:WRITE',UseResource:'IRISOPS_GUARDPROBERESOURCE:READ'};
export const expected={...before,UseResource:'IRISOPS_GUARDPROBEALTERNATE:READ'};
export function validReceipt(state='VERIFIED'){
 const reason=state==='VERIFIED'?'both_policy_fields_match':state==='UNKNOWN'?'readback_unavailable':state==='BLOCKED'?'stale':'readback_differs';
 return {id,actor:'Tester',target:'IrisOps_GuardProbeWallet',state,reason,dispatchCount:state==='BLOCKED'?0:1,
   before:{...before},expected:{...expected},observed:state==='VERIFIED'?{...expected}:state==='MISMATCH'?{...before}:{EditResource:'',UseResource:''},
   events:state==='BLOCKED'?[{state,reason,at}]:[{state:'DISPATCHING',reason:'submitted_once',at},{state,reason,at}],rechecks:[],createdUTC:at};
}
export function validRecovery(record=false){
 const receipt=validReceipt('UNKNOWN'),currentObservation={at,outcome:'MATCHES_EXPECTED',...expected,causality:'not_proven'};
 if(record)receipt.rechecks.push({...currentObservation});
 return {receipt,currentObservation,administrativeWrites:0,observationPersisted:record};
}
