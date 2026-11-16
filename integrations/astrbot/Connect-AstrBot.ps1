# Connect a NeroNet installation to AstrBot (aiocqhttp, reverse WebSocket) in one step.
#   Same machine:   .\Connect-AstrBot.ps1 -AstrBotData <AstrBot\data>
#   Remote/Docker:  .\Connect-AstrBot.ps1 -Url ws://<AstrBot host>:6199/ws -ShowToken
# -NodePath and -HomeDirectory default to the NeroNet folder's node.exe (else Node on PATH) and data folder.
# Add -Check to see what would change without writing. Restart NeroNet afterwards
# (and AstrBot when its configuration was changed). See README.md in this directory.
param(
 [string]$HomeDirectory,
 [string]$NodePath,
 [string]$AstrBotData,
 [string]$Url='ws://127.0.0.1:6199/ws',
 [string]$Token,
 [string]$Uin,
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
$arguments=@((Join-Path $PSScriptRoot 'connect-astrbot.mjs'),'--home',$HomeDirectory,'--url',$Url)
if($AstrBotData){$arguments+=@('--astrbot-data',$AstrBotData)}
if($Token){$arguments+=@('--token',$Token)}
if($Uin){$arguments+=@('--uin',$Uin)}
if($Check){$arguments+='--check'}
if($ShowToken){$arguments+='--show-token'}
& $NodePath @arguments
if($LASTEXITCODE){throw 'connect-astrbot failed; nothing was started or restarted'}
