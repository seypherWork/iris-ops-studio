/// Session-bound token custody, experimental. Never returns a token to HTTP.
Class IrisOps.Guard.Vault Extends %RegisteredObject
{

ClassMethod Now() As %Integer
{
    set t=$ztimestamp
    quit (+t*86400)+$piece(t,",",2)\1
}

ClassMethod Clear()
{
    kill %session.Data("IrisOpsGuard","auth")
    kill %session.Data("IrisOpsGuard","channels"),%session.Data("IrisOpsGuard","previews"),%session.Data("IrisOpsGuard","previewCount")
}
/// Access custody is short; the HTTPS session family has a separate fixed deadline.
ClassMethod Lifetime() As %Integer
{
    quit $select($extract(##class(IrisOps.Guard.HttpApi).ExpectedOrigin(),1,8)="https://":300,1:60)
}
ClassMethod FamilySeconds() As %Integer
{
    quit $select(..Lifetime()=300:3600,1:60)
}
ClassMethod IdleSeconds() As %Integer
{
    quit ..FamilySeconds()
}

ClassMethod Boot(create As %Boolean = 0) As %String
{
    if create,'$data(^IrisOpsGuardBoot("epoch")) {
        lock +^IrisOpsGuardBoot:2
        if '$test quit ""
        set failed=0
        try {
            if '$data(^IrisOpsGuardBoot("epoch")) set ^IrisOpsGuardBoot("epoch")=$system.Encryption.Base64Encode($system.Encryption.GenCryptRand(32),1)
        } catch e {
            set failed=1
        }
        lock -^IrisOpsGuardBoot
        if failed quit ""
    }
    quit $get(^IrisOpsGuardBoot("epoch"))
}

ClassMethod AAD(boot As %String) As %String
{
    quit "IrisOpsGuard/v1|"_$length($username)_":"_$username_"|"_%session.SessionId_"|"_boot_"|"_##class(IrisOps.Guard.HttpApi).ExpectedOrigin()
}

ClassMethod Seal(token As %String, ByRef seconds As %Integer = 0, nativeExpiry As %Numeric = 0, refresh As %String = "", renewUntil As %Integer = 0) As %Boolean
{
    do ..Clear()
    set success=0
    try {
        set boot=..Boot(1)
        if (boot="")!(%session.Key="") quit
        set iv=$system.Encryption.GenCryptRand(12)
        set key=$system.Encryption.SHAHash(256,%session.Key)
        if seconds=0 set seconds=..Lifetime()
        if (seconds<1)!(seconds>..Lifetime())!(seconds\1'=seconds) quit
        set now=..Now(),expires=now+seconds
        if nativeExpiry>0 {
            set nativeEnd=(nativeExpiry\1)+($zdateh("1970-01-01",3)*86400)-1
            if nativeEnd<expires set expires=nativeEnd
        }
        if refresh'="" {
            if ..Lifetime()'=300 quit
            if renewUntil=0 set renewUntil=now+..FamilySeconds()
            if (renewUntil<=now)!(renewUntil>(now+..FamilySeconds())) quit
            if renewUntil<expires set expires=renewUntil
        }
        set seconds=expires-now
        if seconds<1 quit
        set value={"actor":($username),"expires":(expires),"access":(token)}
        if refresh'="" set value.refresh=refresh,value.renewUntil=renewUntil
        set cipher=$system.Encryption.AESGCMEncrypt(value.%ToJSON(),key,iv,..AAD(boot))
        set %session.Data("IrisOpsGuard","auth","iv")=iv
        set %session.Data("IrisOpsGuard","auth","cipher")=cipher
        set %session.Data("IrisOpsGuard","auth","boot")=boot
        set idleEnd=$select(refresh'="":renewUntil,1:expires)
        set %session.Data("IrisOpsGuard","auth","idleUntil")=$select(now+..IdleSeconds()<idleEnd:now+..IdleSeconds(),1:idleEnd)
        if refresh'="" {
            set %session.Data("IrisOpsGuard","auth","renewalId")=##class(IrisOps.Guard.Protocol).Id()
            set %session.Data("IrisOpsGuard","auth","renewUntil")=renewUntil
        }
        set success=1
    } catch e {
        do ..Clear()
    }
    kill token,refresh,key,value,cipher
    quit success
}

ClassMethod Open(Output token As %String, Output context As %DynamicObject, forRenewal As %Boolean = 0) As %Boolean
{
    set token="",context="",success=0
    try {
        set boot=..Boot(),stored=$get(%session.Data("IrisOpsGuard","auth","boot"))
        if (boot="")!(boot'=stored) quit
        set iv=$get(%session.Data("IrisOpsGuard","auth","iv")),cipher=$get(%session.Data("IrisOpsGuard","auth","cipher"))
        if ($length(iv)'=12)!(cipher="") quit
        set key=$system.Encryption.SHAHash(256,%session.Key)
        set text=$system.Encryption.AESGCMDecrypt(cipher,key,iv,..AAD(boot))
        set value={}.%FromJSON(text)
        set now=..Now(),idle=$get(%session.Data("IrisOpsGuard","auth","idleUntil"))
        set familyEnd=value.%Get("renewUntil",value.expires)
        if (value.actor'=$username)!(idle<=now)!(idle>familyEnd)!(familyEnd<=now) quit
        if forRenewal {
            if (value.%Get("refresh","")="") quit
            // An expired access token is never returned or used for an operation.
            set context=value,success=1
        } else {
            if value.expires<=now quit
            set %session.Data("IrisOpsGuard","auth","idleUntil")=$select(now+..IdleSeconds()<familyEnd:now+..IdleSeconds(),1:familyEnd)
            set token=value.access,context=value,success=1
        }
    } catch e {
        set success=0
    }
    if 'success { set token="",context="" do ..Clear() }
    kill key,text,value
    quit success
}

/// Consume encrypted refresh custody and all previous write approvals before I/O.
ClassMethod ConsumeRenewal(id As %String, Output refresh As %String, Output until As %Integer) As %String
{
    set refresh="",until=0
    if id'=$get(%session.Data("IrisOpsGuard","auth","renewalId")) quit "stale_renewal"
    if '..Open(.token,.value,1) quit "upstream_reconnect_required"
    set refresh=value.%Get("refresh",""),until=value.%Get("renewUntil",0)
    kill token,value
    do ..Clear()
    if (refresh="")!(until<=..Now()) { set refresh="",until=0 quit "upstream_reconnect_required" }
    set %session.Data("IrisOpsGuard","auth","pendingRenewal")=id
    quit ""
}

}
