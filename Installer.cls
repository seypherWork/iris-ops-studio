/// Creates the isolated IRISOPS database and namespace used by IRIS Ops Studio.
Class IrisOps.Installer
{

XData setup
{
<Manifest>
  <Default Name="Namespace" Value="IRISOPS"/>
  <Default Name="database" Value="irisops"/>
  <Namespace Name="${Namespace}" Code="${Namespace}" Data="${Namespace}" Create="yes" Ensemble="no">
    <Configuration>
      <Database Name="${Namespace}" Dir="${mgrdir}${database}/data" Create="yes" Resource="%DB_${Namespace}"/>
    </Configuration>
  </Namespace>
</Manifest>
}

ClassMethod setup(ByRef pVars, pLogLevel As %Integer = 3, pInstaller As %Installer.Installer, pLogger As %Installer.AbstractLogger) As %Status [ CodeMode = objectgenerator, Internal ]
{
  Quit ##class(%Installer.Manifest).%Generate(%compiledclass, %code, "setup")
}

}
