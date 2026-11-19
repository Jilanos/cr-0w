# Office documents (DOCX) from the hub

- The `office` brick needs `uv` on PATH. python-docx is not installed system-wide: `crow-docx-redline` runs itself under `uv run -q --with python-docx python3`; run `simpledoc.py` scripts the same way.
- Mail text: `bin/crow-mailtxt <saved read_resource result> [--full] [--max N]` prints the headers and the body without the quoted history.
- PDF: `soffice --headless --convert-to pdf file.docx` works from a Claude hub session (it fails inside the Codex sandbox, which blocks its socket).
- Check layout by rendering pages: `pdftoppm -r 60 -png file.pdf <scratch>/p` and read the PNGs.
- Tracked changes between two versions: `bin/crow-docx-redline old.docx new.docx out.docx <author>`. LibreOffice `.uno:CompareDocuments` crashes headless. Verify that accept-all equals the new text and reject-all equals the old text.
- Editing a paragraph without losing formatting: set the text of the first run (or the run after a bold lead-in) and remove the other runs.
- Word numbering continues across separate `List Number` blocks: use bullets or manual numbers for a second list.
- `pkill -f <name>` / `pgrep -f <name>` inside a Bash call also matches the calling shell when the name appears in the command: avoid it.
- Simple one- or two-page PDF (note, proposal, use case): `bin/simpledoc.py` (`Doc().title/h/p/bullet/table/page_break/save`), Arial (Liberation Sans metrics), fixed column widths, merged group rows. `Doc(accent="RRGGBB", header_fill="RRGGBB")` sets the colours. Calibri is not installed: LibreOffice falls back to a serif font.
- Long tables split across pages badly: put a `page_break()` before the section instead of letting the header row orphan.

## Filling a supplier xlsx form (10/11/2026)
- openpyxl drops pictures and drawings it does not load (a 600 KB form came back at 10 KB). Check the zip parts (`xl/media/`, `xl/drawings/`) before and after.
- When the form holds pictures, edit `xl/worksheets/sheet1.xml` directly: replace the empty `<c r="D3" s="38" />` cells with `t="str"` cells, add new `cellXfs` entries (wrap, optional fill) in `styles.xml`, raise row heights, and copy every other part unchanged. Watch for prefixed namespaces (`x:`).
- LibreOffice headless may fail to load some xlsx ("source file could not be loaded"); validate with a zip/XML parse and openpyxl read instead.
