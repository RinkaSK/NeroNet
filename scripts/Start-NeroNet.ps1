# Start NeroNet. start.bat runs this script without arguments.
#
#   Without arguments: the package folder is used as it is. Data goes to <package>\data, the QQ
#   that is running is the bot (there must be exactly one), Node.js is node.exe in the package
#   folder or on PATH.
#   -BotPid / -AdminPid: when several QQ are running, name the bot and/or a QQ that must never be used.
#   -DeploymentProfile + -HomeDirectory: an installation with its own deployment profile and a data
#   directory outside the package (docs\DEPLOY.md).
#   -WaitSeconds: how long to wait for "ready" before returning (the application keeps running either way).
param(
 [int]$BotPid=0,
 [int]$AdminPid=0,
 [string]$HomeDirectory,
 [string]$NodePath,
 [string]$NativeDirectory,
 [string]$DeploymentProfile=$env:NERONET_DEPLOYMENT_PROFILE,
 [int]$WaitSeconds=90,
 [switch]$PassThru
)
$ErrorActionPreference='Stop'
# The launchers (start.bat, stop.bat) set NERONET_LAUNCHER: a failure is then shown as one plain line.
$main={
$root=Split-Path -Parent $PSScriptRoot
# Node.js 24 runs on Windows 10 and later; older systems also lack what this script uses.
if([Environment]::OSVersion.Version.Major -lt 10){throw '需要 Windows 10 或 Windows 11（64 位）。这台电脑的系统版本过旧，NeroNet 使用的 Node.js 24 无法在上面运行'}
if(Test-Path -LiteralPath (Join-Path $root '.install-incomplete')){throw '这个目录的安装没有完成，请重新安装到一个新目录'}

if(!$NodePath){$local=Join-Path $root 'node.exe';$NodePath=if(Test-Path -LiteralPath $local -PathType Leaf){$local}else{'node.exe'}}
$command=Get-Command $NodePath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$command){throw '找不到 Node.js。请安装 Node.js 24（x64），或把 node.exe 放进 NeroNet 文件夹，或用 -NodePath 指定它的位置'}
$NodePath=$command.Path
$app=Join-Path $root 'app\index.mjs'
if(!$NativeDirectory){$NativeDirectory=Join-Path $root 'native'}

# Runs one application command; what it prints on stderr is read as text, not raised as an error.
function Invoke-App {
 param([string[]]$Arguments)
 $ErrorActionPreference='Continue'
 $lines=@(& $NodePath $app @Arguments 2>&1 | ForEach-Object {"$_"})
 [pscustomobject]@{code=$LASTEXITCODE;text=($lines -join ' ').Trim();json=($lines | Where-Object {$_ -match '^[\{\[]'} | Select-Object -Last 1)}
}
function Explain-NoQQ {'没有找到正在运行的 QQ。第一次使用时请先登录机器人 QQ，再启动 NeroNet。（QQ 以管理员身份运行时，NeroNet 也要以管理员身份启动。）'}

$portable=!$DeploymentProfile
if($portable){
 if($HomeDirectory){throw '-HomeDirectory 要和 -DeploymentProfile 一起使用。不带这两个参数时，数据保存在 NeroNet 文件夹的 data 目录里'}
 $request=@('default-profile');if($BotPid -gt 0){$request+=@('--bot-pid',"$BotPid")}
 $prepared=Invoke-App $request
 if($prepared.code -or !$prepared.json){
  if($prepared.text -match 'NERONET_NO_QQ_PROCESS'){throw (Explain-NoQQ)}
  if($prepared.text -match 'NERONET_SEVERAL_QQ_INSTALLATIONS: (.+)'){throw ('电脑上运行着不同安装位置的 QQ（'+$Matches[1].Trim()+'）。NeroNet 不会自己挑选，请用 -BotPid 指定机器人 QQ 的进程号，例如 start.bat -BotPid 1234（见 docs\DEPLOY.md 第 3 节）')}
  if($prepared.text -match 'NERONET_NOT_A_QQ_PROCESS'){throw ('进程 '+$BotPid+' 不是已登录的 QQ 主进程。可用的进程号见 docs\DEPLOY.md 第 3 节的命令')}
  throw ('准备运行配置失败：'+$prepared.text)
 }
 $prepared=$prepared.json|ConvertFrom-Json
 $DeploymentProfile=$prepared.file;$HomeDirectory=$prepared.home
}else{
 if(!$HomeDirectory){throw '使用 -DeploymentProfile 时需要用 -HomeDirectory 指定数据目录'}
 $DeploymentProfile=(Resolve-Path -LiteralPath $DeploymentProfile).Path
}
$h=[IO.Path]::GetFullPath($HomeDirectory)

$checked=Invoke-App @('profile','--profile',$DeploymentProfile,'--home',$h,'--artifacts',$NativeDirectory,'--package',$root)
if($checked.code -or !$checked.json){throw ('部署配置检查没有通过，没有启动任何程序：'+$checked.text)}
$policy=$checked.json|ConvertFrom-Json

# -BotPid is optional when exactly one QQ is running: that one is the bot.
# -AdminPid is optional: another QQ process on this computer that must never be attached to.
if($BotPid -lt 0 -or $AdminPid -lt 0){throw '进程号必须是正数'}
$botSelection='由 -BotPid 指定'
if(!$BotPid){
 $query=@('bot-process','--profile',$DeploymentProfile);if($AdminPid){$query+=@('--exclude',"$AdminPid")}
 $found=Invoke-App $query
 if($found.code -or !$found.json){
  if($found.text -match 'NERONET_NO_QQ_PROCESS'){
   # The deployment is known (earlier start or own profile): start now and attach to the bot QQ
   # when it is started and logged in.
   $BotPid=0;$botSelection='还没有 QQ 在运行：登录机器人 QQ 后自动接入'
  }
  elseif($found.text -match 'NERONET_SEVERAL_QQ_PROCESSES: (.+)'){throw ('电脑上运行着多个 QQ（进程号 '+$Matches[1].Trim()+'）。NeroNet 不会自己挑选，请用 -BotPid 指定机器人 QQ 的进程号')}
  else{throw ('查找机器人 QQ 进程失败：'+$found.text)}
 }
 else{$BotPid=[int](($found.json|ConvertFrom-Json).pid)}
 # Say how the process was chosen: the only QQ on this computer, or the only one left once the
 # -AdminPid process is set aside (then two QQ are running, and "the only one" would be wrong).
 if($BotPid){$botSelection=if($AdminPid){'排除 -AdminPid 指定的 QQ（进程 '+$AdminPid+'）后，剩下的唯一一个 QQ'}else{'电脑上唯一运行的 QQ'}}
}
if($AdminPid -and $AdminPid -eq $BotPid){throw '-AdminPid 必须是另一个 QQ 进程，不能和 -BotPid 相同'}
$selected=@();if($BotPid){$selected+=$BotPid};if($AdminPid){$selected+=$AdminPid}
foreach($id in $selected){if((Get-Process -Id $id -ErrorAction Stop).Path -ne $policy.qqExecutable){throw ('进程 '+$id+' 不是部署配置里的 QQ 程序（'+$policy.qqExecutable+'）')}}

# Check the package files and the selected Native build before anything is written
# or started. This command never touches QQ or its data files.
& (Join-Path $PSScriptRoot 'Test-NeroNet.ps1') -NodePath $NodePath -NativeDirectory $NativeDirectory | Out-Null
New-Item -ItemType Directory -Path $h -Force | Out-Null
$activeFile=Join-Path $h 'active-supervisor.json'
# NeroNet is already running. When it is holding a failed attach for the operator, this start is the
# request to try again: nothing new is started, the running NeroNet is told to retry.
$reuse=$null
if(Test-Path -LiteralPath $activeFile){
 $active=Get-Content -LiteralPath $activeFile -Raw -Encoding UTF8|ConvertFrom-Json
 $running=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$active.pid)
 if($running -and $running.CommandLine -like '*index.mjs* supervisor *' -and $running.CommandLine.Contains($h)){
  $held=$null
  try{$held=Get-Content -LiteralPath (Join-Path $h 'startup-result.json') -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
  if($held -and $held.schema -eq 1 -and $held.state -eq 'attach-failed' -and $held.retry -eq 'manual' -and $held.runId){
   Set-Content -LiteralPath (Join-Path $h 'RETRY') -Value 'retry requested by start' -Encoding ASCII
   $reuse=[pscustomobject]@{pid=[int]$active.pid;runId=[string]$held.runId}
   Write-Host 'NeroNet 已经在运行，正在让它重新接入 QQ ...'
  }else{
   $now=if($held -and $held.text){'（当前状态：'+@($held.text)[0]+'）'}else{''}
   throw ('NeroNet 已经在运行，不需要再次启动'+$now+'。要重新启动，请先运行 stop.bat（或 scripts\Stop-NeroNet.ps1）')
  }
 }
}
if($reuse){
 # The running NeroNet is reused: its run identifier is the one its records and result carry.
 $process=Get-Process -Id $reuse.pid -ErrorAction Stop
 $runId=$reuse.runId
 $errorLog=''
 # Until the running NeroNet has taken the request, its result file still shows the old failure.
 for($i=0;$i -lt 20 -and (Test-Path -LiteralPath (Join-Path $h 'RETRY'));$i++){Start-Sleep -Milliseconds 500}
 Start-Sleep -Milliseconds 1200
}else{
 if(Test-Path -LiteralPath (Join-Path $h 'STOP')){Move-Item -LiteralPath (Join-Path $h 'STOP') -Destination (Join-Path $h ('STOP-completed-'+[guid]::NewGuid().ToString()))}
 $env:NERONET_NATIVE_DIR=[IO.Path]::GetFullPath($NativeDirectory)
 $env:NERONET_DEPLOYMENT_PROFILE=$DeploymentProfile
 # This run's identifier: the application writes it on its records and on the startup result it leaves for this script.
 $runId=[guid]::NewGuid().ToString()
 $env:NERONET_RUN_ID=$runId
 $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
 $errorLog=Join-Path $h ('supervisor-'+$stamp+'.err.log')
 $arguments=@(('"'+$app+'"'),'supervisor',$BotPid)
 if($AdminPid){$arguments+=$AdminPid}
 $arguments+=('"'+$h+'"')
 $process=Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $h ('supervisor-'+$stamp+'.out.log')) -RedirectStandardError $errorLog -PassThru
 $startedProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$process.Id)
 if(!$startedProcess){throw ('NeroNet 启动后立即结束了，原因见 '+$errorLog)}
 $record=@{pid=$process.Id;package=$root;home=$h;deploymentProfile=$DeploymentProfile;nodePath=[IO.Path]::GetFullPath($NodePath);processCreatedUtc=$startedProcess.CreationDate.ToUniversalTime().ToString('o');utc=[DateTime]::UtcNow.ToString('o')}
 $record|ConvertTo-Json|Set-Content -LiteralPath $activeFile -Encoding UTF8
}

# Wait for "ready". The readiness address answers JSON (also while not ready); it is a local address, never asked through a proxy.
function Get-Readiness {
 $response=$null
 try{$request=[Net.HttpWebRequest]::Create('http://127.0.0.1:5100/');$request.Proxy=$null;$request.Timeout=2000;$response=$request.GetResponse()}
 catch [Net.WebException]{$response=$_.Exception.Response}
 catch{return $null}
 if(!$response){return $null}
 try{$reader=New-Object IO.StreamReader($response.GetResponseStream());return ($reader.ReadToEnd()|ConvertFrom-Json)}catch{return $null}finally{$response.Close()}
}
function Get-LastRecord {
 $file=Join-Path $h 'supervisor-metadata.jsonl'
 if(!(Test-Path -LiteralPath $file)){return $null}
 $rows=@(Get-Content -LiteralPath $file -Tail 12 -Encoding UTF8 | ForEach-Object {try{$_|ConvertFrom-Json}catch{}})
 $rows | Where-Object {$_.waiting -or $_.startupRejected -or $_.supervisorFailed -or $_.startupGuardBlocked -or $_.gatewayEnded -or $_.recoveryBlocked -or $_.recoveryExhausted} | Select-Object -Last 1
}
# Was a QQ refused in this run because another NeroNet build is still loaded in it? The record that
# follows it is only "waiting for the bot", which would hide the reason the operator needs.
function Test-BuildMismatch {
 $file=Join-Path $h 'supervisor-metadata.jsonl'
 if(!(Test-Path -LiteralPath $file)){return $false}
 $rows=@(Get-Content -LiteralPath $file -Tail 12 -Encoding UTF8 | ForEach-Object {try{$_|ConvertFrom-Json}catch{}})
 $begin=-1;for($i=0;$i -lt $rows.Count;$i++){if($rows[$i].selectedProcesses){$begin=$i}}
 [bool](@($rows | Select-Object -Skip ($begin+1) | Where-Object {$_.startupRejected -and $_.reason -eq 'NERONET_NATIVE_BUILD_MISMATCH_RESTART_QQ'}).Count)
}
function Test-GatewayStarted {
 $file=Join-Path $h 'supervisor-metadata.jsonl'
 if(!(Test-Path -LiteralPath $file)){return $false}
 $rows=@(Get-Content -LiteralPath $file -Tail 60 -Encoding UTF8 | ForEach-Object {try{$_|ConvertFrom-Json}catch{}})
 [bool](@($rows | Where-Object {$_.gatewayStarted -and $_.runId -eq $runId}).Count)
}
# The first attach failure of this run, as the application described it (data\startup-result.json).
# A result left by another run is never shown.
function Get-StartupResult {
 $file=Join-Path $h 'startup-result.json'
 if(!(Test-Path -LiteralPath $file)){return $null}
 try{$result=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json}catch{return $null}
 if($result.schema -ne 1 -or $result.runId -ne $runId -or !$result.text){return $null}
 $result
}
# Wait for "ready", for a failure that needs the operator, or for the time limit. Identifying an
# unfamiliar QQ takes some time the first time (seconds, at most minutes): while the application reports that step,
# the wait goes on (up to the application's own limit for it) and the progress is shown once.
$state='starting';$deadline=(Get-Date).AddSeconds([Math]::Max(0,$WaitSeconds))
$identifyDeadline=(Get-Date).AddSeconds(660);$identifyShown=$false;$result=$null
while($true){
 Start-Sleep -Milliseconds 1500
 if(!(Get-Process -Id $process.Id -ErrorAction SilentlyContinue)){$state='ended';break}
 $ready=Get-Readiness
 # The readiness address is a fixed local port: "ready" counts only once this run has started its
 # own gateway, so that the answer of another NeroNet on this computer is not taken for this one.
 if($ready -and $ready.ready -and (Test-GatewayStarted)){$state='ready';break}
 $result=Get-StartupResult
 $identifying=$result -and $result.state -eq 'preparing-binding'
 if($identifying -and !$identifyShown){Write-Host '正在识别当前 QQ。第一次遇到一个 QQ 版本时需要一些时间，请稍候 ...';$identifyShown=$true}
 # A failure that will not change by waiting: shown at once.
 if($result -and ($result.state -eq 'guarded' -or ($result.state -eq 'attach-failed' -and $result.retry -ne 'automatic'))){break}
 $now=Get-Date
 if($now -ge $deadline -and !($identifying -and $now -lt $identifyDeadline)){break}
}
$last=Get-LastRecord
$result=Get-StartupResult
$resultLines=if($result){@($result.text)}else{@()}
$resultText=$resultLines -join "`r`n  "
# A component of another NeroNet build is still loaded in that QQ: it is not called, QQ must be restarted.
$buildMismatch='NERONET_NATIVE_BUILD_MISMATCH_RESTART_QQ'
$buildMismatchText='这个 QQ 里还留着另一个版本的 NeroNet 组件，不能直接接入。请正常退出机器人 QQ 再重新登录；重新登录后 NeroNet 会自动接入'
if($state -eq 'ended'){
 $detail=if($errorLog -and (Test-Path -LiteralPath $errorLog)){((Get-Content -LiteralPath $errorLog -Tail 6 -Encoding UTF8) -join ' ').Trim()}else{''}
 # The application's own account of this run's first failure comes before anything read from the log tail.
 if($resultText -and $result.state -ne 'stopped'){throw ("NeroNet 没有启动成功，并且已经退出。`r`n  "+$resultText)}
 $reason=if($last.recoveryExhausted){'与 QQ 的连接多次中断，自动恢复已达到次数上限'}elseif($last.supervisorFailed){'内部错误（'+$last.errorCode+'，步骤 '+$last.operation+'）'}else{$detail}
 throw ('NeroNet 没有启动成功，并且已经退出。'+$reason+'（记录在 '+$h+'）')
}
# Attaching failed and NeroNet keeps running: the reason, what was done, and what happens next.
if($state -ne 'ready' -and $result -and ($result.state -eq 'guarded' -or $result.state -eq 'attach-failed')){
 Write-Host ("NeroNet 已启动，但还没有接入机器人 QQ（进程 "+$result.pid+"）。") -ForegroundColor Yellow
 Write-Host ("  "+$resultText)
 Write-Host  '  NeroNet 在后台继续运行。状态页：http://127.0.0.1:5100/status ；要停止请运行 stop.bat。'
 if($PassThru){[pscustomobject]@{startedPid=$process.Id;botPid=$BotPid;state=$result.state;home=$h;deploymentProfile=$DeploymentProfile;webui='http://127.0.0.1:5099';readiness='http://127.0.0.1:5100'}}
 return
}
$status=switch($state){
 'ready'{'已就绪'}
 default{
  if($last.waiting -and (Test-BuildMismatch)){'等待中：'+$buildMismatchText}
  elseif($last.startupRejected -and $last.reason -eq 'account-mismatch'){'等待中：这个 QQ 登录的不是数据目录绑定的机器人账号，已跳过它。请登录机器人账号'}
  elseif($last.startupRejected -and $last.reason -eq $buildMismatch){'等待中：'+$buildMismatchText}
  elseif($resultLines.Count){'还没有就绪：'+$resultLines[0]}
  elseif($last.waiting -eq 'account-login'){'正在启动：等待 QQ 完成登录'}
  elseif($last.waiting -eq 'waiting-for-bot'){'等待中：没有找到机器人 QQ，请登录机器人账号'}
  elseif($last.waiting -eq 'ambiguous-bot-process'){'等待中：有多个 QQ，无法确定哪个是机器人，请停止后用 -BotPid 重新启动'}
  elseif($last.waiting){'正在启动：'+$last.waiting}
  else{'正在启动，还没有就绪'}
 }
}
# The first-start password is mentioned only while it is still the password that opens the
# management interface (the application checks it against the stored credentials).
$boot=$null
try{$bootResult=Invoke-App @('bootstrap-state','--home',$h);if(!$bootResult.code -and $bootResult.json){$boot=$bootResult.json|ConvertFrom-Json}}catch{}
Write-Host ''
Write-Host ('NeroNet 已启动。状态：'+$status)
if($BotPid){Write-Host ('  机器人 QQ 进程：'+$BotPid+'（'+$botSelection+'）')}else{Write-Host ('  机器人 QQ：'+$botSelection)}
Write-Host  '  管理界面：http://127.0.0.1:5099'
if($boot -and $boot.initialPasswordActive){Write-Host ('  初始密码：'+$boot.file+'（首次登录后请修改，修改后这个文件会自动删除）')}
elseif($boot -and $boot.initialPasswordPending){Write-Host ('  初始密码：就绪后写入 '+$boot.file)}
Write-Host ('  数据目录：'+$h)
Write-Host  '  停止：运行 stop.bat'
if($state -ne 'ready'){Write-Host '  NeroNet 在后台继续运行，就绪后即可使用。就绪之前的状态见 http://127.0.0.1:5100/status ，就绪之后见管理界面。'}
if($PassThru){[pscustomobject]@{startedPid=$process.Id;botPid=$BotPid;botSelection=$botSelection;state=$state;home=$h;deploymentProfile=$DeploymentProfile;webui='http://127.0.0.1:5099';readiness='http://127.0.0.1:5100'}}
}
if($env:NERONET_LAUNCHER -eq '1'){
 try{& $main}catch{Write-Host '';Write-Host ('启动失败：'+$_.Exception.Message) -ForegroundColor Red;exit 1}
}else{& $main}
