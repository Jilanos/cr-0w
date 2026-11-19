"""Stand-in for `crow mission` in tests (CROW_CORE_CMD): logs each call to
$CROW_HOME/core-calls.jsonl and answers `ensure` with a fixed-shape id. FAKE_CORE_FAIL
makes it fail like a core that refuses."""
import itertools
import json
import os
import sys

args = sys.argv[1:]
with open(os.path.join(os.environ["CROW_HOME"], "core-calls.jsonl"), "a") as f:
    f.write(json.dumps(args) + "\n")
if os.environ.get("FAKE_CORE_FAIL"):
    sys.exit("crow-core: " + os.environ["FAKE_CORE_FAIL"])
opt = {k: v for k, v in itertools.pairwise(args) if k.startswith("--") and not v.startswith("--")}
ref = opt.get("--logics", "es").split("_")[:2]
print(json.dumps({"id": "20261113-build-" + opt["--project"] + "-" + "-".join(ref), "created": True}))
