/// Synthetic custody regression tests. Excluded from the installable package.
Class IrisOps.Guard.TestRenewal Extends IrisOps.Guard.TestSession
{
ClassMethod Run()
{
    new %session
    set %session=..%New(),%session.Key=$system.Encryption.GenCryptRand(32),%session.SessionId="synthetic-renewal-A"
    do ..Assert(##class(IrisOps.Guard.Vault).Lifetime()=300,"TLS policy selected")
    set token="SYNTHETIC-ACCESS-NONCREDENTIAL",refresh="SYNTHETIC-REFRESH-NONCREDENTIAL",seconds=59
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token,.seconds,0,refresh),"TLS access and refresh pair sealed")
    set id=%session.Data("IrisOpsGuard","auth","renewalId"),until=%session.Data("IrisOpsGuard","auth","renewUntil")
    do ..Assert(##class(IrisOps.Guard.Protocol).IsId(id),"renewal nonce generated")
    set cipher=%session.Data("IrisOpsGuard","auth","cipher")
    do ..Assert((cipher'[token)&&(cipher'[refresh),"both synthetic credentials absent from ciphertext plaintext")
    do ..Assert(##class(IrisOps.Guard.Vault).ConsumeRenewal("wrong",.r,.u)="stale_renewal","wrong nonce rejected without consuming current custody")
    do ..Assert(##class(IrisOps.Guard.Vault).Open(.a)&&(a=token),"correct custody survives wrong nonce")
    set %session.Data("IrisOpsGuard","channels","test")=1,%session.Data("IrisOpsGuard","previews","test")=1
    do ..Assert(##class(IrisOps.Guard.Vault).ConsumeRenewal(id,.r,.u)="","correct renewal consumed once")
    do ..Assert((r=refresh)&&(u=until),"encrypted refresh and original family deadline recovered internally")
    do ..Assert('$data(%session.Data("IrisOpsGuard","auth","cipher"))&&'$data(%session.Data("IrisOpsGuard","channels"))&&'$data(%session.Data("IrisOpsGuard","previews")),"access custody and both approval collections removed before refresh")
    do ..Assert(%session.Data("IrisOpsGuard","auth","pendingRenewal")=id,"pending renewal can be cancelled by custody clear")
    do ##class(IrisOps.Guard.Vault).Clear()
    do ..Assert('$data(%session.Data("IrisOpsGuard","auth","pendingRenewal")),"logout or failure clears pending renewal marker")
    set seconds=59,deadline=##class(IrisOps.Guard.Vault).Now()+10
    do ..Assert(##class(IrisOps.Guard.Vault).Seal(token,.seconds,0,refresh,deadline)&&(seconds'>10),"original family limit clamps new access lifetime")
    set seconds=59,deadline=##class(IrisOps.Guard.Vault).Now()+301
    do ..Assert('##class(IrisOps.Guard.Vault).Seal(token,.seconds,0,refresh,deadline),"family deadline beyond policy rejected")
    set seconds=59,deadline=##class(IrisOps.Guard.Vault).Now()-1
    do ..Assert('##class(IrisOps.Guard.Vault).Seal(token,.seconds,0,refresh,deadline),"expired family rejected")
    do ##class(IrisOps.Guard.Vault).Clear()
    write "RENEWAL_CUSTODY_TESTS_COMPLETE",!
}
}
