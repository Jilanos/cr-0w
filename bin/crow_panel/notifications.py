"""Silent Windows toasts, with durable deduplication and one aggregate per interval."""
import base64
import datetime as dt
import json
import subprocess
import xml.etree.ElementTree as ET

from .core import now


TERMINAL = {"succeeded", "failed", "partial", "cancelled", "completed"}


class WindowsToast:
    def __init__(self, cfg):
        self.cfg = cfg

    def argv(self, text):
        toast = ET.Element("toast", duration="short")
        binding = ET.SubElement(ET.SubElement(toast, "visual"), "binding", template="ToastGeneric")
        ET.SubElement(binding, "text").text = "crow"
        ET.SubElement(binding, "text").text = text
        ET.SubElement(toast, "audio", silent="true")
        payload = base64.b64encode(json.dumps({"xml": ET.tostring(toast, encoding="unicode"),
                                              "app_id": self.cfg["notifications"]["app_id"]}).encode()).decode()
        # All variable content crosses as base64 JSON, never as PowerShell source.
        script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.UI.Notifications.ToastNotifier, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.UI.Notifications.NotificationSetting, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$data = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('PAYLOAD')))
$appId = $data.app_id
if (-not $appId) {
    $appId = 'Crow.Panel'
    $appKey = 'HKCU:\Software\Classes\AppUserModelId\Crow.Panel'
    if (-not (Test-Path -LiteralPath $appKey)) {
        New-Item -Path $appKey -Force > $null
        New-ItemProperty -LiteralPath $appKey -Name DisplayName -Value 'crow' -PropertyType String > $null
        New-ItemProperty -LiteralPath $appKey -Name ShowInSettings -Value 1 -PropertyType DWord > $null
    }
}
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
$setting = $null
try { $setting = $notifier.get_Setting() }
catch {
    $native = $_.Exception
    while ($native.InnerException) { $native = $native.InnerException }
    # A new application's setting appears only after its first accepted toast.
    if ($native.HResult -ne -2147023728) { throw }
}
if ($null -ne $setting -and $setting -ne [Windows.UI.Notifications.NotificationSetting]::Enabled) { throw 'Windows notifications are disabled' }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($data.xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Group = 'crow-panel'
$toast.Tag = 'activity'
$toast.ExpirationTime = [DateTimeOffset]::Now.AddDays(1)
$notifier.Show($toast)
Write-Output 'accepted'
""".replace("PAYLOAD", payload)
        encoded = base64.b64encode(script.encode("utf-16-le")).decode()
        return [self.cfg["notifications"]["powershell_exe"], "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]

    def send(self, text):
        result = subprocess.run(self.argv(text), capture_output=True, text=True, encoding="utf-8", errors="replace", env=self.cfg.env, timeout=15)
        if result.returncode or result.stdout.strip() != "accepted":
            raise OSError("Windows notification was not accepted")


class Notifications:
    def __init__(self, app, send=None):
        self.app, self.cfg, self.store = app, app.cfg, app.store
        self.send = send or WindowsToast(self.cfg).send
        self.polled_at = None
        state = self.store.get("meta", "notifications")
        if state and state["last_status"] == "attempting":
            state.update(last_status="unknown", last_error="Résultat Windows incertain. Aucune nouvelle tentative.")
            self.store.put("meta", "notifications", state)

    def state(self):
        return self.store.get("meta", "notifications", {
            "started_at": None, "runs_ready": False, "pending_ready": False, "runs": {}, "overdue": [],
            "queued": {"runs": 0, "overdue": 0}, "last_attempt_at": None, "last_status": "idle", "last_error": None,
            "source_error": None})

    def status(self):
        state = self.state()
        return {"generated_at": now(), **{key: self.cfg["notifications"][key] for key in (
            "enabled", "run_finished", "pending_overdue", "poll_seconds", "min_interval_seconds")},
            **{key: state[key] for key in ("last_attempt_at", "last_status", "last_error", "source_error", "queued")}}

    @staticmethod
    def stamp(value):
        try:
            stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            return stamp if stamp.tzinfo else None
        except (ValueError, TypeError, AttributeError):
            return None

    def tick(self, at=None):
        if not self.cfg["notifications"]["enabled"]:
            return
        at = at or dt.datetime.now().astimezone()
        if self.polled_at and (at - self.polled_at).total_seconds() < self.cfg["notifications"]["poll_seconds"]:
            return
        self.polled_at = at
        # Optional desktop delivery must never stop the operation queue.
        try:
            self.collect(at)
        except Exception:
            state = self.state()
            state["source_error"] = "Lecture des notifications indisponible."
            self.store.put("meta", "notifications", state)

    def collect(self, at):
        state = self.state()
        state["started_at"] = state["started_at"] or at.isoformat()
        state["source_error"] = None
        result = None
        if self.cfg["notifications"]["run_finished"]:
            try:
                result = self.app.readers.runs(24 * 365)
            except Exception:
                state["source_error"] = "Lecture des runs indisponible."
        if result is not None:
            if result["source_status"]["cdx_runs"] != "ok":
                state["source_error"] = "Runs cdx indisponibles. Registre local conservé."
            for row in result["runs"]:
                key = row["run_id"]
                finished = row["status"] in TERMINAL or bool(row.get("ended_at"))
                previous = state["runs"].get(key)
                if previous is True:
                    continue
                if finished:
                    ended = self.stamp(row.get("ended_at"))
                    recent = ended is not None and ended >= self.stamp(state["started_at"])
                    if state["runs_ready"] and (previous is False or recent):
                        state["queued"]["runs"] += 1
                    state["runs"][key] = True
                elif row["status"] in ("running", "queued", "starting", "cancel_requested"):
                    state["runs"][key] = False
            state["runs_ready"] = True
        document = None
        if self.cfg["notifications"]["pending_overdue"]:
            try:
                document = self.app.pending.view()
            except Exception:
                state["source_error"] = "Lecture des échéances indisponible."
        if document is not None:
            seen = set(state["overdue"])
            for section in document["sections"]:
                if section["kind"] == "done":
                    continue
                for row in section["items"]:
                    if row.get("due") and row["due"] < at.date().isoformat():
                        key = row["id"] + ":" + row["due"]
                        if key not in seen:
                            if state["pending_ready"]:
                                state["queued"]["overdue"] += 1
                            seen.add(key)
            state["overdue"] = sorted(seen)
            state["pending_ready"] = True
        last = self.stamp(state["last_attempt_at"])
        ready = last is None or (at - last).total_seconds() >= self.cfg["notifications"]["min_interval_seconds"]
        if ready and any(state["queued"].values()):
            counts = state["queued"]
            text = []
            if counts["runs"]:
                n = counts["runs"]
                text.append(f"{n} run{'s' if n > 1 else ''} terminé{'s' if n > 1 else ''}.")
            if counts["overdue"]:
                n = counts["overdue"]
                text.append(f"{n} échéance{'s' if n > 1 else ''} dépassée{'s' if n > 1 else ''}.")
            # Persist consumption before delivery. A crash or uncertain native result is never retried.
            state.update(queued={"runs": 0, "overdue": 0}, last_attempt_at=at.isoformat(), last_status="attempting", last_error=None)
            self.store.put("meta", "notifications", state)
            try:
                self.send(" ".join(text) + " Ouvre le panneau local.")
                state["last_status"] = "accepted"
            except Exception:
                state.update(last_status="failed", last_error="Notification Windows indisponible. Vérifie PowerShell et les réglages Windows.")
        self.store.put("meta", "notifications", state)
