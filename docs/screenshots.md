# Regenerating the README screenshots

The shots use the sample fixtures, so they contain no real data.

```sh
S=$(mktemp -d)
(cd tools/crow-watch && SHOTS=$S go test -run TestShots .)
for v in agents usage; do
  bin/ansi-shot $S/$v-laptop.ans $S/$v.png
  magick $S/$v.png -colors 128 PNG8:docs/img/watch-$v.png
done
```

Colours and font come from your kitty theme. See `runbooks/tui-render.md`.
