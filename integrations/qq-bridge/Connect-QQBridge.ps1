# Connect a NeroNet installation to an adapted qq-bridge (OneBot v11 forward WebSocket + HTTP) in one step.
#   .\Connect-QQBridge.ps1 -BridgeDirectory <qq-bridge> -Check
#   .\Connect-QQBridge.ps1 -BridgeDirectory <qq-bridge>
# -NodePath and -HomeDirectory default to the NeroNet folder's node.exe (else Node on PATH) and data folder.
# The qq-bridge directory must first be adapted with
#   node adapter\apply-adapter.mjs <qq-bridge>
# Add -Stickers to also allow the optional sticker-collection actions (they change the bot account's saved stickers).
# Nothing is started or restarted; restart NeroNet and qq-bridge afterwards. See README.md in this directory.
param(
 [string]$HomeDirectory,
 [Parameter(Mandatory=$true)][string]$BridgeDirectory,
 [string]$NodePath,
 [string]$Uin,
 [switch]$Stickers,
 [switch]$Check,
 [switch]$ShowToken
)
$ErrorActionPreference='Stop'
$package=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
# Defaults for a NeroNet folder used as it is: its own node.exe (else Node on PATH) and its data folder.
if(!$NodePath){$local=Join-Path $package 'node.exe';$NodePath=if(Test-Path -LiteralPath $local -PathType Leaf){$local}else{'node.exe'}}
if(!$HomeDirectory){$HomeDirectory=Join-Path $package 'data'}
if(!(Test-Path -LiteralPath (Join-Path $HomeDirectory 'config'))){throw ('没有找到 NeroNet 的数据目录：'+$HomeDirectory+'。请先用 start.bat 启动一次 NeroNet，或用 -HomeDirectory 指定数据目录')}
$command=Get-Command $NodePath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$command){throw '找不到 Node.js。请使用带 Node 的 NeroNet 下载包，或安装 Node.js 24，或用 -NodePath 指定 node.exe'}
$NodePath=$command.Source
$arguments=@((Join-Path $PSScriptRoot 'connect-qqbridge.mjs'),'--home',$HomeDirectory,'--bridge',$BridgeDirectory)
if($Uin){$arguments+=@('--uin',$Uin)}
if($Stickers){$arguments+='--stickers'}
if($Check){$arguments+='--check'}
if($ShowToken){$arguments+='--show-token'}
# The tool words its hints for this script: -ShowToken here, --show-token when it is run with node.
$env:NERONET_TOOL_ENTRY='powershell'
& $NodePath @arguments
if($LASTEXITCODE){throw '配置没有完成（原因见上面一行）。没有启动或重启任何程序'}
