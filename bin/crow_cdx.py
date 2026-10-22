"""crow_cdx: the one boundary between crow and cdx, and crow's account policy.

Crow talks to cdx only through its public JSON commands (`cdx <cmd> --json`), as an
argv array with a timeout, and checks every envelope (schema_version, ok, error code).
It never imports cdx internals and never assumes the cdx executable is a Python script.

Providers are the claude / codex enum. cdx may list other providers: they are shown
but crow refuses them as targets.

Account policy lives in local/accounts.yaml:

  default: main
  accounts:
    - {name: main,  policy: use,       memory: permanent}
    - {name: codex, policy: use,       provider: codex}    # provider is optional and checked
    - {name: mate,  policy: never}

Resolution (resolve()):
  explicit account (argument, then CROW_ACCOUNT) wins over the default;
  --provider alone picks the default when it matches, else the first `use` account of that
  provider in file order (an ask-first account is never picked implicitly);
  --provider with an account only checks that the account has that provider.
The target must be listed, allowed (use / ask-first), known to cdx, enabled, and on
claude or codex. An ask-first target needs consent for that exact account and action.
"""
import fcntl, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

PROVIDERS = ("claude", "codex")
POLICIES = ("use", "ask-first", "never")
SCHEMA_VERSION = 1
# The oldest cdx whose public contracts crow was tested against (docs/cdx-compatibility.md).
MIN_VERSION = (0, 21, 4)
TESTED_VERSIONS = ("0.21.4", "0.21.5")
TIMEOUT = float(os.environ.get("CROW_CDX_TIMEOUT", "60"))
# Commands crow needs; schema --json lists the enums it validates against.
REQUIRED_COMMANDS = ("run", "runs", "run-status", "run-report", "status", "config", "can-resume", "handoff", "stats")

HOME = os.environ.get("CROW_HOME") or os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


class CdxError(Exception):
    """A failure crow reports before or instead of a launch. code is stable for tests and widgets."""

    def __init__(self, code, message, payload=None):
        super().__init__(message)
        self.code, self.message, self.payload = code, message, payload or {}

    def __str__(self):
        return f"{self.message} [{self.code}]"


def cdx_bin():
    return os.environ.get("CROW_CDX") or "cdx"


def _bounded(text, n=300):
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def call(*args, timeout=None, cwd=None, json_flag=True, allow_fail=False):
    """Run `cdx <args> --json` and return its checked envelope.

    allow_fail returns an ok=false envelope instead of raising (callers that read error codes)."""
    argv = [cdx_bin(), *args, *(["--json"] if json_flag else [])]
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout or TIMEOUT, cwd=cwd,
                           stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        raise CdxError("cdx_missing", "cdx is not installed or not on PATH (install cdx-manager, then `cdx --version`)")
    except subprocess.TimeoutExpired:
        raise CdxError("cdx_timeout", f"`cdx {' '.join(args)}` did not answer within {timeout or TIMEOUT:.0f}s")
    try:
        env = json.loads(r.stdout)
    except ValueError:
        raise CdxError("cdx_not_json", f"`cdx {' '.join(args)}` gave no JSON (exit {r.returncode}): "
                       f"{_bounded(r.stderr or r.stdout)}")
    if not isinstance(env, dict):
        raise CdxError("cdx_not_json", f"`cdx {' '.join(args)}` gave a JSON {type(env).__name__}, not an object")
    if env.get("schema_version") != SCHEMA_VERSION:
        raise CdxError("cdx_schema_unsupported",
                       f"`cdx {' '.join(args)}` answered schema_version {env.get('schema_version')!r}; "
                       f"crow supports {SCHEMA_VERSION} (tested cdx {', '.join(TESTED_VERSIONS)})")
    if env.get("ok") is not True and not allow_fail:
        err = env.get("error")
        code = (err or {}).get("code") if isinstance(err, dict) else env.get("code")
        msg = (err or {}).get("message") if isinstance(err, dict) else (err or env.get("message"))
        raise CdxError(code or "cdx_failed", f"`cdx {' '.join(args)}` failed: {_bounded(str(msg or 'no message'))}", env)
    return env


def parse_version(text):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(x) for x in m.groups()) if m else None


_caps = {}


def capabilities():
    """cdx version and the enums of `cdx schema --json`, checked once per process."""
    if _caps:
        return _caps
    try:
        r = subprocess.run([cdx_bin(), "--version"], capture_output=True, text=True, timeout=TIMEOUT,
                           stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        raise CdxError("cdx_missing", "cdx is not installed or not on PATH (install cdx-manager, then `cdx --version`)")
    except subprocess.TimeoutExpired:
        raise CdxError("cdx_timeout", "`cdx --version` did not answer")
    version = parse_version(r.stdout)
    if not version:
        raise CdxError("cdx_version_unknown", f"`cdx --version` printed no version: {_bounded(r.stdout or r.stderr)}")
    if version < MIN_VERSION:
        raise CdxError("cdx_too_old", f"cdx {'.'.join(map(str, version))} is older than "
                       f"{'.'.join(map(str, MIN_VERSION))}; run `cdx update`")
    schema = call("schema")
    enums = schema.get("enums") or {}
    providers = set((enums.get("provider") or {}).get("accepted") or [])
    missing = [p for p in PROVIDERS if p not in providers]
    if missing:
        raise CdxError("cdx_provider_unsupported", f"cdx {'.'.join(map(str, version))} does not accept provider(s) "
                       f"{', '.join(missing)}")
    _caps.update(version=".".join(map(str, version)), providers=sorted(providers),
                 permissions=list((enums.get("permission") or {}).get("accepted") or []),
                 power=list((enums.get("power") or {}).get("accepted") or []),
                 error_codes=schema.get("error_codes") or {},
                 mutually_exclusive=schema.get("mutually_exclusive") or [])
    return _caps


def inventory():
    """Every cdx session from cached status (no login, no refresh): name -> row."""
    rows = call("status", "--cached").get("rows") or []
    return {r["session_name"]: r for r in rows if isinstance(r, dict) and r.get("session_name")}


# ---------- account policy ----------

def accounts_path(home=None):
    return os.path.join(home or HOME, "local", "accounts.yaml")


def load_policy(home=None):
    import yaml
    path = accounts_path(home)
    try:
        cfg = yaml.safe_load(open(path)) or {}
    except FileNotFoundError:
        raise CdxError("accounts_missing", f"{path} is missing (copy docs/accounts.example.yaml there)")
    out = []
    for a in cfg.get("accounts") or []:
        pol = a.get("policy")
        prov = a.get("provider")
        out.append({"name": a["name"], "policy": pol if pol in POLICIES else "never",
                    "memory": a.get("memory", "none"), "provider": prov})
    return {"default": cfg.get("default"), "accounts": out}


def find(cfg, name):
    return next((a for a in cfg["accounts"] if a["name"] == name), None)


def check_provider(name):
    if name is not None and name not in PROVIDERS:
        raise CdxError("provider_unknown", f"provider '{name}' is not one crow drives (choose {' or '.join(PROVIDERS)})")
    return name


def resolve(account=None, provider=None, cfg=None, inv=None, env=None):
    """The target account as {name, provider, policy, memory}, or CdxError before any launch."""
    env = os.environ if env is None else env
    check_provider(provider)
    cfg = cfg or load_policy()
    inv = inventory() if inv is None else inv
    explicit = account or env.get("CROW_ACCOUNT")
    if explicit:
        name = explicit
    elif provider:
        name = _pick_for_provider(cfg, inv, provider)
    else:
        name = cfg.get("default")
        if not name:
            raise CdxError("account_unset", "no account given and no default in local/accounts.yaml")
    return check_target(name, provider, cfg, inv)


def _pick_for_provider(cfg, inv, provider):
    default = cfg.get("default")
    cands = [default] if default else []
    cands += [a["name"] for a in cfg["accounts"] if a["policy"] == "use" and a["name"] != default]
    for name in cands:
        a, row = find(cfg, name), inv.get(name)
        if a and a["policy"] == "use" and row and row.get("provider") == provider and row.get("enabled") is not False:
            return name
    raise CdxError("no_allowed_account", f"no enabled `use` account with provider {provider} in local/accounts.yaml "
                   "(ask-first accounts are only used when named)")


def check_target(name, provider, cfg, inv):
    a = find(cfg, name)
    if not a:
        raise CdxError("account_unknown", f"account '{name}' is not in local/accounts.yaml; crow never targets it")
    if a["policy"] == "never":
        raise CdxError("account_never", f"account '{name}' is not allowed (policy never, see local/accounts.yaml)")
    row = inv.get(name)
    if not row:
        raise CdxError("account_not_in_cdx", f"account '{name}' is not a cdx session (see `cdx`)")
    real = row.get("provider")
    if real not in PROVIDERS:
        raise CdxError("provider_unsupported", f"account '{name}' runs provider {real!r}; crow drives only "
                       f"{' and '.join(PROVIDERS)}")
    if a.get("provider") and a["provider"] != real:
        raise CdxError("provider_mismatch", f"local/accounts.yaml declares '{name}' as {a['provider']} but cdx has it "
                       f"as {real}; fix the file")
    if provider and provider != real:
        raise CdxError("provider_mismatch", f"account '{name}' is a {real} account, not {provider}")
    if row.get("enabled") is False:
        raise CdxError("account_disabled", f"account '{name}' is disabled in cdx (`cdx enable {name}`)")
    return {"name": name, "provider": real, "policy": a["policy"], "memory": a["memory"]}


# ---------- consent for ask-first accounts ----------

def consent(target, action, assume=None, ask=None, state=None):
    """Consent for one launch. use: granted. ask-first: assume must name this exact account
    (--confirm-account), or the owner types yes on a terminal. Each grant is logged with its
    account and action; nothing is cached, so a grant never covers another account or launch."""
    if target["policy"] == "use":
        return True
    if target["policy"] != "ask-first":
        raise CdxError("account_never", f"account '{target['name']}' is not allowed")
    how = None
    if assume is not None:
        if assume != target["name"]:
            raise CdxError("consent_mismatch", f"consent was given for '{assume}', not for '{target['name']}'")
        how = "flag"
    else:
        ask = ask or _tty_ask
        answer = ask(f"'{target['name']}' is an ask-first account ({target['provider']}). "
                     f"Type \"yes\" to {action} on it: ")
        if answer is None:
            raise CdxError("consent_required", f"'{target['name']}' is ask-first: confirm on a terminal or pass "
                           f"--confirm-account {target['name']}")
        if answer.strip() != "yes":
            raise CdxError("consent_refused", "cancelled")
        how = "typed"
    _log_consent(target, action, how, state)
    return True


def _tty_ask(prompt):
    try:
        with open("/dev/tty", "r+") as tty:
            tty.write(prompt)
            tty.flush()
            return tty.readline()
    except OSError:
        return None


def state_dir(home=None):
    home = home or HOME
    try:
        import yaml
        reg = yaml.safe_load(open(os.path.join(home, "local", "projects.yaml"))) or {}
    except (OSError, ValueError):
        reg = {}
    return (reg.get("vault") or {}).get("crow_dir") or os.path.join(home, "local", "state")


def append_jsonl(path, rec):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.write(json.dumps(rec) + "\n")


def _log_consent(target, action, how, state):
    append_jsonl(os.path.join(state or state_dir(), "consents.jsonl"),
                 {"account": target["name"], "provider": target["provider"], "action": action, "how": how,
                  "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})


# ---------- provider-specific launch settings ----------

# Permission a crow job gets when the caller names none. Claude keeps crow's historical `auto`;
# Codex gets `default` (cdx: workspace-write sandbox), never full access implicitly.
DEFAULT_PERMISSION = {"claude": "auto", "codex": "default"}
# Read-only helper jobs (titles, retro digests, briefs on Codex).
READ_ONLY_PERMISSION = "review"
CLAUDE_MODEL = re.compile(r"^(claude-|opus|sonnet|haiku|fable)", re.I)
CODEX_MODEL = re.compile(r"^(gpt-|o\d|codex)", re.I)


def check_model(provider, model):
    """A model name written for the other provider is refused instead of passed through."""
    if not model:
        return None
    other = CODEX_MODEL if provider == "claude" else CLAUDE_MODEL
    if other.match(model):
        raise CdxError("model_provider_mismatch", f"model '{model}' is not a {provider} model")
    return model


def check_permission(provider, permission):
    if permission is None:
        return DEFAULT_PERMISSION[provider]
    caps = capabilities()
    if caps.get("permissions") and permission not in caps["permissions"]:
        raise CdxError("permission_unknown", f"permission '{permission}' is not one cdx accepts "
                       f"({', '.join(caps['permissions'])})")
    return permission


# ---------- guard capabilities ----------

# What each provider can enforce, as crow has tested it (docs/cdx-compatibility.md).
#   hub_hooks           .claude/settings.json hooks (crow-hub-guard) run before every tool call
#   sandbox_workspace   writes confined to the run's cwd, no network (cdx permission default)
#   sandbox_read_only   no writes at all (cdx permission review)
ENFORCEMENT = {
    "claude": {"hub_hooks"},
    "codex": {"sandbox_workspace", "sandbox_read_only"},
}
# Operation -> capabilities, any one of which satisfies the hub guard's rule
# (ask before commit/push/rebase/MR in a registered repo from the hub).
GUARD_NEEDS = {
    "hub-session": ({"hub_hooks"}, None),                   # interactive, the owner can bypass a sandbox
    "hub-oneshot": ({"hub_hooks", "sandbox_workspace"}, "default"),
    "helper-readonly": ({"hub_hooks", "sandbox_read_only"}, "review"),
    "project-session": (None, None),                        # the repo's own rules apply
    "project-run": (None, None),
}


def guard(provider, operation):
    """The cdx permission an operation must run at on this provider (None = caller's choice),
    or CdxError when the provider cannot enforce the hub guard for it."""
    needs, sandbox = GUARD_NEEDS[operation]
    if needs is None:
        return None
    have = ENFORCEMENT[provider]
    if "hub_hooks" in have and "hub_hooks" in needs:
        return None
    if have & needs:
        return sandbox
    raise CdxError("guard_unenforceable",
                   f"{operation} on {provider} is unavailable: crow cannot enforce the hub guard there "
                   f"(needs one of {', '.join(sorted(needs))}; {provider} has {', '.join(sorted(have)) or 'none'})")


# ---------- context references ----------

INSTRUCTION_FILES = ("AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "LOGICS.md")


def context_refs(target, cwd, required=(), home=None):
    """Files a launch should read first: repo instructions in cwd, owner preferences, and the
    account's shared memory folder. Never for a never account. Required refs must exist."""
    if target["policy"] == "never":
        return []
    home = home or HOME
    refs = [os.path.join(cwd, f) for f in INSTRUCTION_FILES if os.path.isfile(os.path.join(cwd, f))]
    prefs = os.path.join(home, "local", "owner-prefs.md")
    if os.path.isfile(prefs):
        refs.append(prefs)
    if target.get("memory") in ("permanent", "session"):
        mem = os.path.join(home, "local", "memory", re.sub(r"[^A-Za-z0-9]", "-", os.path.realpath(cwd)))
        if os.path.isdir(mem):
            refs.append(mem)
    missing = [r for r in required if not os.path.exists(r)]
    if missing:
        raise CdxError("context_missing", f"required reference(s) missing: {', '.join(missing)}")
    refs += [os.path.abspath(r) for r in required]
    seen = set()
    return [r for r in refs if not (r in seen or seen.add(r))]


def context_preamble(refs, task=None):
    """A bounded first message for providers that do not load crow's instructions natively."""
    lines = ["Before any work, read these files (crow context; paths only, read them yourself):"]
    lines += [f"- {r}" for r in refs]
    lines.append(task if task else "Then wait for the user's instructions.")
    return "\n".join(lines)


# ---------- run envelopes ----------

def run_identity(env):
    """Provider, account and native conversation of a run envelope / runs row."""
    fp = env.get("final_payload") or {}
    return {"run_id": env.get("run_id") or fp.get("run_id"),
            "provider": env.get("provider") or fp.get("provider"),
            "account": env.get("session") or fp.get("session"),
            "native_id": env.get("provider_session_id") or fp.get("provider_session_id")}


def run_outcome(row):
    """succeeded / failed / timeout / cancelled / running / unknown, from a runs row."""
    st = (row or {}).get("status")
    if st in ("succeeded", "failed", "running", "cancelled", "timeout"):
        return st
    if (row or {}).get("exit_code") == 0:
        return "succeeded"
    if (row or {}).get("exit_code") is not None:
        return "failed"
    return "unknown"


def final_text(stdout_path, provider):
    """The run's final message from its stdout artifact: Claude's result envelope, or Codex's
    last agent_message (exec --json events). None when the artifact has neither."""
    try:
        raw = open(stdout_path, errors="replace").read()
    except (OSError, TypeError):
        return None
    last = None
    for line in raw.splitlines() or [raw]:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if not isinstance(e, dict):
            continue
        if e.get("type") == "result" and isinstance(e.get("result"), str):
            last = e["result"]
        item = e.get("item") or {}
        if e.get("type") == "item.completed" and item.get("type") == "agent_message" and item.get("text"):
            last = item["text"]
    if last is None:
        try:
            whole = json.loads(raw)
            if isinstance(whole, dict) and isinstance(whole.get("result"), str):
                last = whole["result"]
        except ValueError:
            pass
    return last


# ---------- global background slots ----------

class Slots:
    """One budget of background runs across providers, held in <state>/slots.json under a lock.
    A slot is held by a run id (or a pending claim) and freed when cdx reports the run ended."""

    def __init__(self, state, limit):
        self.path = os.path.join(state, "slots.json")
        self.limit = limit
        os.makedirs(state, exist_ok=True)

    def __enter__(self):
        self.fh = open(self.path + ".lock", "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        try:
            self.data = json.load(open(self.path))
        except (OSError, ValueError):
            self.data = {"held": {}}
        return self

    def __exit__(self, *exc):
        tmp = self.path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(self.data, fh, indent=1)
        os.replace(tmp, self.path)
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()

    def prune(self, alive):
        """Drop holders that are no longer running (alive(key, rec) -> bool)."""
        self.data["held"] = {k: v for k, v in self.data["held"].items() if alive(k, v)}

    def busy(self):
        return len(self.data["held"])

    def cwd_writer(self, cwd):
        return next((k for k, v in self.data["held"].items() if v.get("cwd") == cwd and v.get("writes", True)), None)

    def claim(self, key, rec):
        self.data["held"][key] = {**rec, "claimed_at": time.time()}

    def rename(self, old, new, **extra):
        rec = self.data["held"].pop(old, None)
        if rec is not None:
            self.data["held"][new] = {**rec, **extra}

    def release(self, key):
        self.data["held"].pop(key, None)


def fail(err, prog="crow"):
    """Exit with a one-line diagnostic for a CdxError (scripts' common error path)."""
    sys.exit(f"{prog}: {err.message}")
