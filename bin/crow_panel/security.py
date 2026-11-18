"""Text-only rich segments, opaque file handles and tool policy."""
import hashlib
import hmac
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import secrets
from urllib.parse import urlsplit

from .core import Problem, atomic, canonical

CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
SECRET_KEYS = {"csrf_token", "access_token", "refresh_token", "api_key", "authorization", "proxy-authorization", "x-crow-token", "cookie", "set-cookie"}


def redact(text):
    text = re.sub(r'(?i)(bearer\s+)[a-z0-9._~+/=-]+', r'\1[masqué]', text)
    text = re.sub(r'(?i)((?:authorization|proxy-authorization)\s*[:=]\s*basic\s+)[^\s"<>]+', r'\1[masqué]', text)
    text = re.sub(r'(?im)((?:x-crow-token|cookie|set-cookie)\s*:\s*)[^\r\n]+', r'\1[masqué]', text)
    text = re.sub(r'(?i)([?&](?:sig|token|access_token|key|code|x-amz-signature)=)[^\s&"<>]+', r'\1[masqué]', text)
    text = re.sub(r'(?i)("(?:csrf_token|access_token|refresh_token|api_key|authorization)"\s*:\s*")[^"]*', r'\1[masqué]', text)
    return text


def redact_data(value):
    if isinstance(value, dict):
        return {k: "[masqué]" if k.lower() in SECRET_KEYS else redact_data(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_data(v) for v in value]
    return redact(value) if isinstance(value, str) else value


class TextHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("br", "p", "div", "tr") and not self.skip:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def clean_text(value):
    if not isinstance(value, str):
        return ""
    parser = TextHTML()
    parser.feed(value)
    return html.unescape("".join(parser.parts))


def https(value):
    if isinstance(value, str):
        parsed = urlsplit(value)
        if parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password:
            return value
    return None


def mail_link(value):
    if isinstance(value, str) and re.fullmatch(r"outlook:[0-9a-fA-F]{16,8192}", value):
        return value
    return https(value)


class Files:
    def __init__(self, cfg, store):
        self.cfg, self.store = cfg, store
        self.key = secrets.token_bytes(32)
        self.roots = [Path(p).resolve() for p in cfg["files"].get("roots", [])]

    def allowed(self, path):
        resolved = Path(path).resolve()
        return resolved if any(resolved == r or resolved.is_relative_to(r) for r in self.roots) else None

    def register(self, path):
        path = self.allowed(path)
        if path is None or not path.exists():
            return None
        key = "f_" + hmac.new(self.key, str(path).encode(), hashlib.sha256).hexdigest()[:24]
        self.store.put("files", key, {"path": str(path)})
        return key

    def resolve(self, key):
        value = self.store.get("files", key, {})
        path = self.allowed(value["path"]) if value else None
        if path is None or not path.exists():
            raise Problem(404, "not_found", "Fichier introuvable.")
        return path

    def mapped(self, value):
        for mapping in self.cfg["pending"].get("root_map", []):
            source, target = mapping.split("=", 1)
            if value.startswith(source):
                return self.register(Path(target) / value[len(source):])
        if Path(value).is_absolute():
            return self.register(value)
        return None

    def segments(self, text):
        result, start = [], 0
        pattern = r'\[([^\]]+)\]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*'
        for match in re.finditer(pattern, text):
            if match.start() > start:
                result.append({"t": "text", "v": text[start:match.start()].replace(r"\|", "|")})
            label, href, code, strong = match.groups()
            file_id = self.mapped(href or code or "")
            if file_id:
                result.append({"t": "file", "v": label or code, "file_id": file_id})
            elif href and https(href):
                result.append({"t": "link", "v": label, "href": href})
            else:
                result.append({"t": "strong" if strong else "code" if code else "text", "v": strong or code or label})
            start = match.end()
        if start < len(text):
            result.append({"t": "text", "v": text[start:].replace(r"\|", "|")})
        return result or [{"t": "text", "v": ""}]


# Unknown tools fail closed in the hook. This also covers dynamically named MCP servers.
READ_SUFFIXES = ("outlook_email_search", "outlook_email_get", "outlook_get_email", "outlook_get_message",
                 "outlook_get_thread", "outlook_list_folders", "outlook_get_folders", "outlook_search_emails",
                 "outlook_get_draft", "outlook_search", "outlook_get_email_content", "outlook_get_mail_folders",
                 "search", "fetch", "get_email", "list_mail_folders")


CALENDAR_READ = ("outlook_calendar_search",)


def tool_allowed(profile, name, args, manifest=None):
    short = name.rsplit("__", 1)[-1]
    if profile == "calendar":
        # The calendar profile reads events only: no mail, no event writes.
        if name in ("Read", "Grep", "Glob", "ToolSearch", "ListMcpResourcesTool", "Write") or short == "search_tools":
            return True
        if short == "read_resource":
            uri = args.get("uri", "")
            return isinstance(uri, str) and uri.startswith(("calendar:///", "event:///", "events:///"))
        return short in CALENDAR_READ
    if any(x in short.lower() for x in ("send", "forward", "delete", "thread_labels", "calendar", "sharepoint", "teams")):
        return False
    if name in ("Read", "Grep", "Glob", "ToolSearch", "ListMcpResourcesTool") or short == "search_tools":
        return profile != "triage"
    if name in ("Write", "Edit"):
        return profile in ("read", "skeleton", "style")  # file paths checked by the hook
    if profile == "triage":
        if short not in ("outlook_modify_labels", "outlook_batch_modify_labels") or not manifest:
            return False
        allowed = {i["message_id"]: i["folder_id"] for i in manifest["items"]}
        if short == "outlook_batch_modify_labels" and set(args) not in ({"modifications"}, {"messages"}):
            return False
        entries = args.get("modifications", args.get("messages")) if short == "outlook_batch_modify_labels" else [args]
        if not isinstance(entries, list) or not 1 <= len(entries) <= 5:
            return False
        return all(isinstance(i, dict) and set(i) == {"messageId", "moveToFolderId"}
                   and isinstance(i["messageId"], str) and i["messageId"] in allowed
                   and isinstance(i["moveToFolderId"], str) and bool(i["moveToFolderId"])
                   and allowed[i["messageId"]] == i["moveToFolderId"] for i in entries)
    if short == "read_resource":
        uri = args.get("uri", "")
        return isinstance(uri, str) and (uri == "mail:///folders" or uri.startswith(("mail:///folders/", "mail:///messages/")))
    if short in READ_SUFFIXES or any(short.startswith(prefix) for prefix in ("outlook_email_search_", "outlook_email_get_")):
        return True
    if profile == "skeleton" and short in ("outlook_create_reply_all_draft", "outlook_update_draft"):
        return (short == "outlook_create_reply_all_draft" and isinstance(manifest, dict)
                and isinstance(manifest.get("reply_message_id"), str) and bool(manifest["reply_message_id"])
                and set(args) == {"messageId"} and args["messageId"] == manifest["reply_message_id"])
    return False


def hook_input(policy, payload):
    name, args = payload.get("tool_name", ""), payload.get("tool_input", {})
    if name in policy.get("deny_tools", []) or name.rsplit("__", 1)[-1] in policy.get("deny_tools", []):
        return False
    if name in ("Write", "Edit"):
        path = Path(args.get("file_path", "")).resolve()
        return str(path) in policy.get("write_paths", [])
    if name in ("Read", "Grep", "Glob"):
        if policy.get("profile") == "triage":
            return False
        value = args.get("file_path") if name == "Read" else args.get("path", policy.get("cwd"))
        if not isinstance(value, str) or not value:
            return False
        path = Path(value)
        if not path.is_absolute():
            path = Path(policy["cwd"]) / path
        path = path.resolve()
        roots = [Path(p) for p in policy.get("read_roots", [])]
        if not (str(path) in policy.get("write_paths", []) or any(path == p or path.is_relative_to(p) for p in roots)):
            return False
        if name == "Glob":
            pattern = args.get("pattern", "")
            if not isinstance(pattern, str) or Path(pattern).is_absolute() or ".." in Path(pattern).parts:
                return False
        return True
    return tool_allowed(policy["profile"], name, args, policy.get("manifest"))


def write_policy(cfg, op_id, profile="read", output=None, manifest=None, deny_tools=None, cwd=None):
    directory = cfg.state / "ops" / op_id
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    roots = [cfg.home, *cfg["files"].get("roots", []), *(p["path"] for p in cfg["projects"].values() if p.get("path"))]
    policy = {"profile": profile, "manifest": manifest, "deny_tools": deny_tools or [], "write_paths": [str(output.resolve())] if output else [],
              "cwd": str(Path(cwd or cfg.home).resolve()), "read_roots": [str(Path(p).resolve()) for p in roots]}
    atomic(directory / "policy.json", canonical(policy))
    import shlex
    command = shlex.join([str(Path(__file__).resolve().parents[1] / "crow-panel"), "tool-guard", str(directory / "policy.json")])
    settings = {"hooks": {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": command}]}]},
                "permissions": {"deny": ["Bash", "WebFetch", "WebSearch", "Task", "Agent"]}}
    atomic(directory / "settings.json", canonical(settings))
    return "--settings " + shlex.quote(str(directory / "settings.json"))
