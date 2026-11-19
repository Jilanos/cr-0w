"""simpledoc: one- or two-page A4 DOCX (title, headings, paragraphs, bullets, tables).

Run under `uv run -q --with python-docx python3`. `Doc(accent="RRGGBB")` sets the colour of
the title, headings and table header text; `header_fill` sets the table header shading.
Both default to neutral greys.
"""
import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

DEFAULT_ACCENT = "333333"
DEFAULT_HEADER_FILL = "E6E6E6"
class Doc:
    def __init__(self, accent=DEFAULT_ACCENT, header_fill=DEFAULT_HEADER_FILL):
        self.accent = RGBColor.from_string(accent.lstrip("#").upper())
        self.header_fill = header_fill.lstrip("#").upper()
        self.d = docx.Document()
        s = self.d.sections[0]
        s.page_width, s.page_height = Cm(21), Cm(29.7)
        for m in ('left_margin','right_margin','top_margin','bottom_margin'): setattr(s, m, Cm(2))
        st = self.d.styles['Normal']; st.font.name = 'Arial'; st.element.rPr.rFonts.set(qn('w:ascii'),'Arial'); st.element.rPr.rFonts.set(qn('w:hAnsi'),'Arial')
        for sn in ('List Bullet',):
            self.d.styles[sn].font.name='Arial'; st.font.size = Pt(10.5)
        st.paragraph_format.space_after = Pt(4)
    def title(self, t, sub):
        p = self.d.add_paragraph(); r = p.add_run(t); r.bold = True; r.font.size = Pt(17); r.font.color.rgb = self.accent
        p.paragraph_format.space_after = Pt(2)
        p = self.d.add_paragraph(); r = p.add_run(sub); r.font.size = Pt(10); r.font.color.rgb = RGBColor(0x55,0x55,0x55)
        p.paragraph_format.space_after = Pt(10)
    def h(self, t):
        p = self.d.add_paragraph(); r = p.add_run(t); r.bold = True; r.font.size = Pt(12); r.font.color.rgb = self.accent
        p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(4); p.paragraph_format.keep_with_next = True
    def p(self, t, bold_lead=None, size=None, italic=False):
        p = self.d.add_paragraph()
        if bold_lead: r = p.add_run(bold_lead); r.bold = True
        r = p.add_run(t); r.italic = italic
        if size:
            for r in p.runs: r.font.size = Pt(size)
        return p
    def bullet(self, t, bold_lead=None):
        p = self.d.add_paragraph(style='List Bullet')
        if bold_lead: r = p.add_run(bold_lead); r.bold = True
        p.add_run(t); p.paragraph_format.space_after = Pt(2)
    def table(self, rows, widths, header=True, bold_rows=(), shade_rows=(), align_right=(), merge_rows=()):
        t = self.d.add_table(rows=len(rows), cols=len(rows[0])); t.style = 'Table Grid'; t.autofit = False
        for j,w in enumerate(widths): t.columns[j].width = Cm(w)
        for i, row in enumerate(rows):
            for j, val in enumerate(row):
                c = t.cell(i, j); c.width = Cm(widths[j]); c.text = ''
                para = c.paragraphs[0]; para.paragraph_format.space_after = Pt(0)
                r = para.add_run(str(val)); r.font.size = Pt(9.5)
                if j in align_right and i > 0: para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                if (header and i == 0) or i in bold_rows: r.bold = True
                fill = self.header_fill if (header and i == 0) else ('F2F2F2' if i in shade_rows else None)
                if header and i == 0: r.font.color.rgb = self.accent
                if fill:
                    tcPr = c._tc.get_or_add_tcPr(); sh = OxmlElement('w:shd')
                    sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), fill); tcPr.append(sh)
        for i in merge_rows:
            a=t.cell(i,0); m=a.merge(t.cell(i,len(rows[0])-1))
            for extra in m.paragraphs[1:]: extra._p.getparent().remove(extra._p)
        self.d.add_paragraph().paragraph_format.space_after = Pt(2)
    def page_break(self):
        from docx.enum.text import WD_BREAK
        self.d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    def save(self, path): self.d.save(path)
