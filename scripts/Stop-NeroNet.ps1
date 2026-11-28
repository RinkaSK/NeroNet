# Stop NeroNet normally. stop.bat runs this script without arguments (data folder <package>\data).
param([string]$HomeDirectory,[switch]$PassThru)
function Get-NeroNetShutdownEvidence {
 param([object[]]$Events,[string]$StartedUtc,[int]$StopRequestIndex)
 # A generation can finish before STOP, e.g. QQ exits while the application
 # waits for a replacement. Only evidence from this supervisor run is valid.
 $first=-1
 for($i=0;$i -lt $Events.Count;$i++){if($Events[$i].selectedProcesses){$first=$i}}
 if($first -lt 0 -or [DateTimeOffset]::Parse($Events[$first].utc) -lt [DateTimeOffset]::Parse($StartedUtc)){throw 'Current supervisor selection record missing'}
 $run=@($Events | Select-Object -Skip $first)
 if(!$run[-1].supervisorStopped){throw 'Process ended without normal supervisorStopped record'}
 if($run | Where-Object {$_.supervisorFailed -or $_.gatewayShutdownBlocked -or $_.generationCloseUnresolved -or $_.shutdownUnresolved -or ($_.nativeCloseResult -and !$_.closed)}){throw 'Shutdown reported an unresolved error; inspect metadata'}
 $gatewayIndex=-1
 for($i=$first;$i -lt $Events.Count;$i++){if($Events[$i].gatewayStarted){$gatewayIndex=$i}}
 if($gatewayIndex -lt 0){throw 'No gateway generation evidence; inspect startup cleanup'}
 $gateway=$Events[$gatewayIndex];$close=$null;$generation=$null;$closedIndex=-1
 for($i=$gatewayIndex+1;$i -lt $Events.Count;$i++){
  $event=$Events[$i]
  if($event.nativeCloseResult -and $event.pid -eq $gateway.pid){$close=$event}
  if($event.generationClosed -and $event.epoch -eq $gateway.epoch){
   $generation=$event;$closedIndex=$i
   if($generation.targetExists -and (!$close -or !$close.closed)){throw 'Generation closure lacks matching Native drain'}
  }
 }
 if(!$generation){throw 'No successful generation cleanup observed; inspect metadata'}
 if($run[-1].generations -ne $gateway.epoch){throw 'Final generation count differs from cleanup evidence'}
 [pscustomobject]@{supervisorStopped=$true;generationClosed=$true;nativeDrained=[bool]($close -and $close.closed);targetAlreadyExited=(!$generation.targetExists);cleanupBeforeStopRequest=($closedIndex -lt $StopRequestIndex);nativeCodeMayRemainLoadedUntilQQExits=$true}
}
$ErrorActionPreference='Stop'
# The launchers (start.bat, stop.bat) set NERONET_LAUNCHER: a failure is then shown as one plain line.
$main={
if(!$HomeDirectory){$HomeDirectory=Join-Path (Split-Path -Parent $PSScriptRoot) 'data'}
$h=[IO.Path]::GetFullPath($HomeDirectory)
$activeFile=Join-Path $h 'active-supervisor.json'
if(!(Test-Path -LiteralPath $activeFile)){Write-Host ('NeroNet 没有在运行（这个数据目录没有启动记录：'+$h+'）。');return}
$active=Get-Content -LiteralPath $activeFile -Raw -Encoding UTF8|ConvertFrom-Json
$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$active.pid)
if(!$p){Write-Host 'NeroNet 没有在运行（上次启动的进程已经结束）。';return}
if([IO.Path]::GetFullPath([string]$active.home) -ne $h){throw '启动记录里的数据目录与这次指定的不同，没有发出停止请求。请检查 -HomeDirectory。'}
# The recorded process number now belongs to another program: NeroNet is not running, nothing is touched.
if(($active.processCreatedUtc -and $p.CreationDate.ToUniversalTime().ToString('o') -ne $active.processCreatedUtc) -or
   ($active.nodePath -and [IO.Path]::GetFullPath([string]$p.ExecutablePath) -ne [IO.Path]::GetFullPath([string]$active.nodePath)) -or
   $p.CommandLine -notlike '*index.mjs* supervisor *' -or !$p.CommandLine.Contains($h)){
 Write-Host 'NeroNet 没有在运行（记录里的进程号现在属于别的程序，没有对它做任何操作）。';return
}
$started=$p.CreationDate
$metadata=Join-Path $h 'supervisor-metadata.jsonl'
$before=@(Get-Content -LiteralPath $metadata -Encoding UTF8).Count
Set-Content -LiteralPath (Join-Path $h 'STOP') -Value 'Operator requested normal application shutdown' -Encoding UTF8
$until=[DateTime]::UtcNow.AddSeconds(40)
do{
 Start-Sleep -Milliseconds 250
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$active.pid)
 if(!$p -or $p.CreationDate -ne $started){break}
}while([DateTime]::UtcNow -lt $until)
if($p -and $p.CreationDate -eq $started){throw 'NeroNet 在 40 秒内没有完成正常关闭。进程没有被强行结束，请稍后再试或查看数据目录里的记录'}
$events=@(Get-Content -LiteralPath $metadata -Encoding UTF8 | ForEach-Object {$_|ConvertFrom-Json})
# A run that never attached to QQ (still waiting, or refused) has nothing to drain: a normal stop record is enough.
$thisRun=@($events | Where-Object {$_.utc -and [DateTimeOffset]::Parse($_.utc) -ge [DateTimeOffset]::Parse($active.utc).AddSeconds(-5)})
if(!($thisRun | Where-Object {$_.gatewayStarted})){
 if(!$thisRun -or !$thisRun[-1].supervisorStopped -or ($thisRun | Where-Object {$_.supervisorFailed -or $_.shutdownUnresolved})){throw 'NeroNet 进程已结束，但没有留下正常关闭的记录，请查看数据目录里的 supervisor-metadata.jsonl'}
 Write-Host 'NeroNet 已停止（这次运行没有接入过 QQ）。'
 if($PassThru){[pscustomobject]@{supervisorStopped=$true;generationClosed=$false;attached=$false}}
 return
}
$evidence=Get-NeroNetShutdownEvidence -Events $events -StartedUtc $active.utc -StopRequestIndex $before
Write-Host 'NeroNet 已停止。已加载的组件会留在 QQ 进程里，直到 QQ 退出。'
if($PassThru){$evidence}
}
if($env:NERONET_LAUNCHER -eq '1'){
 try{& $main}catch{Write-Host '';Write-Host ('停止失败：'+$_.Exception.Message) -ForegroundColor Red;exit 1}
}else{& $main}
