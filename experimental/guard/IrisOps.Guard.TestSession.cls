/// Synthetic object for isolated custody tests. Not an authentication provider.
Class IrisOps.Guard.TestSession Extends %RegisteredObject
{
Property Key As %String;
Property SessionId As %String;
Property Data As %String [ MultiDimensional ];

ClassMethod Assert(condition As %Boolean, label As %String)
{
    if 'condition throw ##class(%Exception.General).%New("Guard test failed: "_label)
    write "PASS ",label,!
}

ClassMethod Run()
{
    new %session
    set %session=..%New(),%session.Key=$system.Encryption.GenCryptRand(32),%session.SessionId="synthetic-custody-A"
    set token="SYNTHETIC-NONCREDENTIAL-"_$system.Encryption.Base64Encode($system.Encryption.GenCryptRand(32),1)
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"synthetic token sealed")
    do ..Assert(##class(IrisOps.Guard.Vault).Open(.readback)&&(readback=token),"ciphertext roundtrip")
    set cipher=%session.Data("IrisOpsGuard","auth","cipher"),iv=%session.Data("IrisOpsGuard","auth","iv")
    do ..Assert(cipher'[token,"session Data ciphertext does not contain plaintext token")
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"second seal")
    do ..Assert((iv'=%session.Data("IrisOpsGuard","auth","iv"))&&(cipher'=%session.Data("IrisOpsGuard","auth","cipher")),"fresh nonce on every seal")
    set cipher=%session.Data("IrisOpsGuard","auth","cipher")
    set %session.Data("IrisOpsGuard","auth","cipher")=$char(($ascii(cipher)+1)#256)_$extract(cipher,2,*)
    do ..Assert('##class(IrisOps.Guard.Vault).Open(.readback)&&(readback=""),"ciphertext tampering rejected")
    do ..Assert('$data(%session.Data("IrisOpsGuard","auth")),"corrupt envelope cleared")
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"reseal before session binding")
    set %session.SessionId="synthetic-custody-B"
    do ..Assert('##class(IrisOps.Guard.Vault).Open(.readback),"same key cannot cross session identity")
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"reseal before expiry")
    set boot=%session.Data("IrisOpsGuard","auth","boot"),iv=%session.Data("IrisOpsGuard","auth","iv"),key=$system.Encryption.SHAHash(256,%session.Key)
    set value={"actor":($username),"expires":(##class(IrisOps.Guard.Vault).Now()-1),"access":(token)}
    set %session.Data("IrisOpsGuard","auth","cipher")=$system.Encryption.AESGCMEncrypt(value.%ToJSON(),key,iv,##class(IrisOps.Guard.Vault).AAD(boot))
    do ..Assert('##class(IrisOps.Guard.Vault).Open(.readback),"expired authorization rejected")
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token),"reseal before boot binding")
    set %session.Data("IrisOpsGuard","auth","boot")="different-boot"
    do ..Assert('##class(IrisOps.Guard.Vault).Open(.readback),"different boot rejected")
    write "CUSTODY_TESTS_COMPLETE",!
}
}
