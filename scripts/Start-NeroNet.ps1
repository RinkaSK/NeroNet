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
if(Test-Path -LiteralPath (Join-Path $root '.install-incomplete')){throw '这个目录的安装没有完成，请重新安装到一个新目录'}

if(!$NodePath){$local=Join-Path $root 'node.exe';$NodePath=if(Test-Path -LiteralPath $local -PathType Leaf){$local}else{'node.exe'}}
$command=Get-Command $NodePath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$command){throw '找不到 Node.js。请安装 Node.js 24（x64），或把 node.exe 放进 NeroNet 文件夹，或用 -NodePath 指定它的位置'}
$NodePath=$command.Source
$app=Join-Path $root 'app\index.mjs'
if(!$NativeDirectory){$NativeDirectory=Join-Path $root 'native'}

# Runs one application command; what it prints on stderr is read as text, not raised as an error.
function Invoke-App {
 param([string[]]$Arguments)
 $ErrorActionPreference='Continue'
 $lines=@(& $NodePath $app @Arguments 2>&1 | ForEach-Object {"$_"})
 [pscustomobject]@{code=$LASTEXITCODE;text=($lines -join ' ').Trim();json=($lines | Where-Object {$_ -match '^[\{\[]'} | Select-Object -Last 1)}
}
function Explain-NoQQ {'没有找到正在运行的 QQ。请先登录机器人 QQ，再启动 NeroNet。（QQ 以管理员身份运行时，NeroNet 也要以管理员身份启动。）'}

$portable=!$DeploymentProfile
if($portable){
 if($HomeDirectory){throw '-HomeDirectory 要和 -DeploymentProfile 一起使用。不带这两个参数时，数据保存在 NeroNet 文件夹的 data 目录里'}
 $request=@('default-profile');if($BotPid -gt 0){$request+=@('--bot-pid',"$BotPid")}
 $prepared=Invoke-App $request
 if($prepared.code -or !$prepared.json){
  if($prepared.text -match 'NERONET_NO_QQ_PROCESS'){throw (Explain-NoQQ)}
  if($prepared.text -match 'NERONET_SEVERAL_QQ_INSTALLATIONS: (.+)'){throw ('电脑上运行着不同安装位置的 QQ（'+$Matches[1].Trim()+'）。NeroNet 不会自己挑选，请用 -BotPid 指定机器人 QQ 的进程号，例如 start.bat -BotPid 1234（见 docs\DEPLOY.md 第 3 节）')}
  if($prepared.text -match 'NERONET_NOT_A_QQ_PROCESS'){throw ('进程 '+$BotPid+' 不是已登录的 QQ 主进程。可用的进程号见 docs\DEPLOY.md 第 3 节的命令')}
  if($prepared.text -match 'NERONET_PACKAGE_AT_DRIVE_ROOT'){throw '请把 NeroNet 放在一个文件夹里，不要直接解压到磁盘根目录'}
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
$botSelection='用 -BotPid 指定'
if(!$BotPid){
 $query=@('bot-process','--profile',$DeploymentProfile);if($AdminPid){$query+=@('--exclude',"$AdminPid")}
 $found=Invoke-App $query
 if($found.code -or !$found.json){
  if($found.text -match 'NERONET_NO_QQ_PROCESS'){throw (Explain-NoQQ)}
  if($found.text -match 'NERONET_SEVERAL_QQ_PROCESSES: (.+)'){throw ('电脑上运行着多个 QQ（进程号 '+$Matches[1].Trim()+'）。NeroNet 不会自己挑选，请用 -BotPid 指定机器人 QQ 的进程号')}
  throw ('查找机器人 QQ 进程失败：'+$found.text)
 }
 $BotPid=[int](($found.json|ConvertFrom-Json).pid)
 $botSelection='电脑上唯一运行的 QQ'
}
if($AdminPid -and $AdminPid -eq $BotPid){throw '-AdminPid 必须是另一个 QQ 进程，不能和 -BotPid 相同'}
$selected=@($BotPid);if($AdminPid){$selected+=$AdminPid}
foreach($id in $selected){if((Get-Process -Id $id -ErrorAction Stop).Path -ne $policy.qqExecutable){throw ('进程 '+$id+' 不是部署配置里的 QQ 程序（'+$policy.qqExecutable+'）')}}

# Check the package files and the selected Native build before anything is written
# or started. This command never touches QQ or its data files.
& (Join-Path $PSScriptRoot 'Test-NeroNet.ps1') -NodePath $NodePath -NativeDirectory $NativeDirectory | Out-Null
New-Item -ItemType Directory -Path $h -Force | Out-Null
$activeFile=Join-Path $h 'active-supervisor.json'
if(Test-Path -LiteralPath $activeFile){
 $active=Get-Content -LiteralPath $activeFile -Raw -Encoding UTF8|ConvertFrom-Json
 $running=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$active.pid)
 if($running -and $running.CommandLine -like '*index.mjs* supervisor *' -and $running.CommandLine.Contains($h)){throw 'NeroNet 已经在运行，不需要再次启动。要重新启动，请先运行 stop.bat（或 scripts\Stop-NeroNet.ps1）'}
}
if(Test-Path -LiteralPath (Join-Path $h 'STOP')){Move-Item -LiteralPath (Join-Path $h 'STOP') -Destination (Join-Path $h ('STOP-completed-'+[guid]::NewGuid().ToString()))}
$env:NERONET_NATIVE_DIR=[IO.Path]::GetFullPath($NativeDirectory)
$env:NERONET_DEPLOYMENT_PROFILE=$DeploymentProfile
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
 $rows | Where-Object {$_.waiting -or $_.startupRejected -or $_.supervisorFailed -or $_.startupGuardBlocked -or $_.gatewayEnded} | Select-Object -Last 1
}
$state='starting';$deadline=(Get-Date).AddSeconds([Math]::Max(0,$WaitSeconds))
while((Get-Date) -lt $deadline){
 Start-Sleep -Milliseconds 1500
 if(!(Get-Process -Id $process.Id -ErrorAction SilentlyContinue)){$state='ended';break}
 $ready=Get-Readiness
 if($ready -and $ready.ready){$state='ready';break}
}
$last=Get-LastRecord
if($state -eq 'ended'){
 $detail=if(Test-Path -LiteralPath $errorLog){((Get-Content -LiteralPath $errorLog -Tail 6 -Encoding UTF8) -join ' ').Trim()}else{''}
 $reason=if($last.startupRejected){'接入 QQ 被拒绝：'+$last.reason}elseif($last.startupGuardBlocked){'上一次启动的结果没有确认，请先正常退出并重新登录机器人 QQ'}else{$detail}
 throw ('NeroNet 没有启动成功。'+$reason+'（记录在 '+$h+'）')
}
$status=switch($state){
 'ready'{'已就绪'}
 default{
  if($last.waiting -eq 'account-login'){'正在启动：等待 QQ 完成登录'}
  elseif($last.startupRejected -and $last.reason -eq 'account-mismatch'){'等待中：这个 QQ 登录的不是数据目录绑定的机器人账号，已跳过它。请登录机器人账号'}
  elseif($last.waiting -eq 'waiting-for-bot'){'等待中：没有找到机器人 QQ，请登录机器人账号'}
  elseif($last.waiting -eq 'ambiguous-bot-process'){'等待中：有多个 QQ，无法确定哪个是机器人，请停止后用 -BotPid 重新启动'}
  elseif($last.startupRejected){'接入 QQ 被拒绝：'+$last.reason+'（这个版本的 QQ 可能不在支持范围内，见 docs\KNOWN_LIMITS.md）'}
  elseif($last.waiting){'正在启动：'+$last.waiting}
  else{'正在启动，还没有就绪'}
 }
}
$passwordFile=Join-Path $h 'webui-initial-password.txt'
Write-Host ''
Write-Host ('NeroNet 已启动。状态：'+$status)
Write-Host ('  机器人 QQ 进程：'+$BotPid+'（'+$botSelection+'）')
Write-Host  '  管理界面：http://127.0.0.1:5099'
if(Test-Path -LiteralPath $passwordFile){Write-Host ('  初始密码：'+$passwordFile+'（首次登录后请修改）')}
Write-Host ('  数据目录：'+$h)
Write-Host  '  停止：运行 stop.bat'
if($state -ne 'ready'){Write-Host '  NeroNet 在后台继续运行，就绪后即可使用；状态也可以在管理界面查看。'}
if($PassThru){[pscustomobject]@{startedPid=$process.Id;botPid=$BotPid;botSelection=$botSelection;state=$state;home=$h;deploymentProfile=$DeploymentProfile;webui='http://127.0.0.1:5099';readiness='http://127.0.0.1:5100'}}
}
if($env:NERONET_LAUNCHER -eq '1'){
 try{& $main}catch{Write-Host '';Write-Host ('启动失败：'+$_.Exception.Message) -ForegroundColor Red;exit 1}
}else{& $main}
