/// Strict, flat-string JSON contracts for the experimental control API.
Class IrisOps.Guard.Protocol Extends %RegisteredObject
{
ClassMethod Body(keys As %String, Output value As %DynamicObject) As %Boolean
{
    set ok=0,value=""
    try {
        if (%request.ContentType'="application/json")!('$isobject(%request.Content)) quit
        set text=%request.Content.Read(4097)
        set complete=%request.Content.AtEnd
        // Proofs may occur in these bodies. Do not retain the consumed stream.
        do %request.Content.Clear()
        if ($length(text)>4096)!('complete) quit
        set value={}.%FromJSON(text)
        if value.%ClassName(1)'="%Library.DynamicObject" quit
        set count=$select(keys="":0,1:$length(keys,","))
        if value.%Size()'=count quit
        set valid=1
        for i=1:1:count {
            if value.%GetTypeOf($piece(keys,",",i))'="string" set valid=0
        }
        if 'valid quit
        // Native parsing validates JSON. Outside-string colon counting rejects
        // duplicate keys, including escaped aliases, without a second JSON parser.
        set quoted=0,escaped=0,colons=0
        for i=1:1:$length(text) {
            set c=$extract(text,i)
            if quoted {
                if escaped { set escaped=0 }
                elseif c=$char(92) { set escaped=1 }
                elseif c=$char(34) { set quoted=0 }
            } else {
                if c=$char(34) set quoted=1
                if c=":" set colons=colons+1
            }
        }
        set ok=(colons=count)
    } catch e { set ok=0 }
    kill text
    if 'ok set value=""
    quit ok
}
ClassMethod Id() As %String
{
    quit $zconvert($system.Encryption.ToHex($system.Encryption.GenCryptRand(16)),"L")
}
ClassMethod IsId(id As %String) As %Boolean
{
    quit id?32(1N,1"a",1"b",1"c",1"d",1"e",1"f")
}
/// A separate 256-bit possession proof; never an administrative credential.
ClassMethod RecoveryHash(id As %String, key As %String) As %String
{
    if '..IsId(id) quit ""
    if key'?64(1N,1"a",1"b",1"c",1"d",1"e",1"f") quit ""
    quit $system.Encryption.ToHex($system.Encryption.SHAHash(256,"IrisOps-recovery-v1|"_$username_"|"_id_"|"_key))
}
ClassMethod RecoveryMatches(id As %String, key As %String, expected As %String) As %Boolean
{
    if $length(expected)'=64 quit 0
    set actual=..RecoveryHash(id,key)
    if $length(actual)'=64 quit 0
    // Compare all digest characters, without a prefix-dependent early return.
    set different=0
    for i=1:1:64 { if $extract(actual,i)'=$extract(expected,i) set different=1 }
    quit 'different
}
ClassMethod Binding() As %String
{
    quit $system.Encryption.ToHex($system.Encryption.SHAHash(256,##class(IrisOps.Guard.Vault).AAD(##class(IrisOps.Guard.Vault).Boot())))
}
ClassMethod Stamp() As %String
{
    quit $translate($zdatetime($ztimestamp,3,1)," ","T")_"Z"
}
ClassMethod Policy(value As %String, defaultPermission As %String) As %String
{
    if (value="")!('##class(IrisOps.Guard.HttpTransport).ValidPolicy(value)) quit ""
    set name=$zconvert($piece(value,":",1),"U"),permission=$zconvert($piece(value,":",2),"U")
    if '##class(IrisOps.Guard.TargetPolicy).Resource(name) quit ""
    if permission="" set permission=defaultPermission
    set permission=$select(permission="R":"READ",permission="W":"WRITE",permission="U":"USE",1:permission)
    quit name_":"_permission
}
ClassMethod CanUse(edit As %String, use As %String) As %Boolean
{
    if '$system.Security.Check("%Admin_Wallet","U") quit 0
    // Additional restrictive guard: operator must also possess both proposed
    // policy permissions. It never grants these permissions to the operator.
    quit $system.Security.Check($piece(edit,":",1),$extract($piece(edit,":",2)))&&$system.Security.Check($piece(use,":",1),$extract($piece(use,":",2)))
}
}
