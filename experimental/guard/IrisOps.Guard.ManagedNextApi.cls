/// Distinct LAB build used to verify dispatcher replacement and rollback only.
Class IrisOps.Guard.ManagedNextApi Extends IrisOps.Guard.ManagedApi
{
Parameter BuildId = "managed-lab-b";
// This build is only an upgrade/concurrency fixture, never a public package.
Parameter WalletApi = "IrisOps.Guard.FaultApi";
Parameter WebApi = "IrisOps.Guard.WebFaultApi";
}
