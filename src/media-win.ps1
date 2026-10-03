# Tejbot Assistent: reads what is playing right now from the Windows media controls.
# Prints one JSON line every 2 seconds. Sends nothing to the internet. (ASCII only on purpose.)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(5000) | Out-Null
  $task.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$browsers = 'chrome', 'msedge', 'firefox', 'opera', 'brave', 'vivaldi'
while ($true) {
  $list = @()
  try {
    foreach ($s in $mgr.GetSessions()) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $list += @{ app = [string]$s.SourceAppUserModelId; title = [string]$p.Title; artist = [string]$p.Artist; status = [string]$s.GetPlaybackInfo().PlaybackStatus }
    }
  } catch { }
  # browser window titles: used to tell YouTube from SoundCloud
  $windows = @(Get-Process -Name $browsers | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.MainWindowTitle })
  @{ sessions = @($list); windows = $windows } | ConvertTo-Json -Compress -Depth 4
  Start-Sleep -Seconds 2
}
