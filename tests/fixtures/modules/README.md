# crow.yaml loader fixtures

Shared by the Python loader (`tests/test_crow_modules.py`) and the Go loader
(`tools/crow-core/internal/config/modules_test.go`). Both must return the same result.

Each case is a CROW_HOME directory (`home/`) read against the engine manifests in
`modules/`, plus `want.json`:

- `on`: the bricks that are on, sorted
- `config`: the config of every brick that is on
- `errors`: the error keys, sorted (`""` is the whole file)
