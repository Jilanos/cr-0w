# Install an APK on a USB phone from WSL

WSL does not see USB devices: the Linux `adb` always lists nothing. Use the Windows adb binary instead.

1. Kill any Linux adb server first (`<sdk>/platform-tools/adb kill-server`): the two servers fight over tcp:5037 and the Windows one fails with "protocol fault".
2. `adb.exe devices -l` (Windows platform-tools path in `local/context.md` or the usage log). If the phone does not show up, check that Windows sees it: `powershell.exe -NoProfile -Command "Get-PnpDevice -PresentOnly | ? FriendlyName -match 'Pixel|Android'"`.
3. adb.exe cannot read `/home/...` paths: copy the APK to a Windows folder, then `adb.exe install -r 'C:\...\app.apk'`.
4. Check: `adb.exe shell dumpsys package <pkg> | grep lastUpdateTime` and, for accessibility apps, `adb.exe shell settings get secure enabled_accessibility_services`.
