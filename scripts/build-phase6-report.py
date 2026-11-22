"""Build the Phase 6 Word report with bundled Python, python-docx and Pillow.

Run from any directory. Content is maintained in implementation-report.md.
Rendering and visual inspection are separate acceptance steps.
"""

from pathlib import Path
import re
from urllib.parse import urljoin

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/phase-6"
EVIDENCE = BASE / "evidence/submission"
REPO_URL = "https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6/blob/main/"
OUTPUT = BASE / "COSC336_Group6_Phase6_Implementation_Report_v1.0.docx"


def inline(paragraph, text):
    pattern = r"(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)"
    for piece in re.split(pattern, text):
        match = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", piece)
        if match:
            label, target = match.groups()
            if not target.startswith("https://"):
                target = urljoin(REPO_URL + "docs/phase-6/", target)
            link = OxmlElement("w:hyperlink")
            link.set(qn("r:id"), paragraph.part.relate_to(
                target,
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                is_external=True,
            ))
            run = OxmlElement("w:r")
            props = OxmlElement("w:rPr")
            color = OxmlElement("w:color")
            color.set(qn("w:val"), "24577A")
            props.append(color)
            run.append(props)
            value = OxmlElement("w:t")
            value.text = label
            run.append(value)
            link.append(run)
            paragraph._p.append(link)
        elif piece.startswith("**"):
            paragraph.add_run(piece[2:-2]).bold = True
        elif piece.startswith("`"):
            paragraph.add_run(piece[1:-1]).font.name = "Consolas"
        else:
            paragraph.add_run(piece)


def table(document, rows):
    count = len(rows[0])
    widths = [0.55, 6.35] if rows[0][0] == "ID" else [1.55, 5.35]
    if rows[0][0] == "Team member":
        widths = [1.45, 5.45]
    grid = document.add_table(rows=0, cols=count)
    grid.autofit = False
    for col, width in zip(grid.columns, widths):
        col.width = Inches(width)
    for index, values in enumerate(rows):
        row = grid.add_row()
        trpr = row._tr.get_or_add_trPr()
        trpr.append(OxmlElement("w:cantSplit"))
        if index == 0:
            trpr.append(OxmlElement("w:tblHeader"))
        for cell, value, width in zip(row.cells, values, widths):
            cell.width = Inches(width)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            props = cell._tc.get_or_add_tcPr()
            shade = OxmlElement("w:shd")
            shade.set(qn("w:fill"), "244C63" if index == 0 else ("F2F5F6" if index % 2 else "FFFFFF"))
            props.append(shade)
            margins = OxmlElement("w:tcMar")
            for side in ("top", "left", "bottom", "right"):
                el = OxmlElement("w:" + side)
                el.set(qn("w:w"), "90")
                el.set(qn("w:type"), "dxa")
                margins.append(el)
            props.append(margins)
            borders = OxmlElement("w:tcBorders")
            for side in ("top", "left", "bottom", "right"):
                el = OxmlElement("w:" + side)
                el.set(qn("w:val"), "single")
                el.set(qn("w:sz"), "4")
                el.set(qn("w:color"), "D9D9D9")
                borders.append(el)
            props.append(borders)
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.02
            if widths[0] < 1 and cell == row.cells[0]:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            inline(paragraph, value)
            for run in paragraph.runs:
                run.font.size = Pt(10)
                if index == 0:
                    run.bold = True
                    run.font.color.rgb = RGBColor.from_string("FFFFFF")
    document.add_paragraph().paragraph_format.space_after = Pt(0)


def build():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    source = BASE / "reviews/2026-11-20/hosted-evidence"
    crops = [
        ("08-request-and-ai-matching.jpg", (300, 8280, 1220, 8715), "01-matching.png"),
        ("12-completed-custody.jpg", (300, 4710, 1220, 5145), "02-completed-receipt.png"),
        ("19-published-reader-view.jpg", (32, 545, 719, 1200), "03-published-report.png"),
    ]
    for filename, box, output in crops:
        with Image.open(source / filename) as picture:
            picture.crop(box).save(EVIDENCE / output)
    document = Document()
    section = document.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = section.bottom_margin = Inches(0.65)
    section.left_margin = section.right_margin = Inches(0.8)
    section.header_distance = section.footer_distance = Inches(0.28)
    styles = document.styles
    for name in ("Normal", "Body Text"):
        styles[name].font.name = "Aptos"
        styles[name].font.size = Pt(11)
        styles[name].paragraph_format.space_after = Pt(7)
        styles[name].paragraph_format.line_spacing = 1.05
    for name, size, color in [("Title", 23, "000000"), ("Heading 1", 14, "173D32"),
                              ("Heading 2", 12, "173D32"), ("Heading 3", 11, "173D32")]:
        styles[name].font.name = "Aptos Display"
        styles[name].font.size = Pt(size)
        styles[name].font.color.rgb = RGBColor.from_string(color)
        styles[name].paragraph_format.space_before = Pt(10)
        styles[name].paragraph_format.space_after = Pt(7)
    styles["Title"].paragraph_format.space_before = Pt(0)
    for border in list(styles["Title"]._element.iter(qn("w:pBdr"))):
        border.getparent().remove(border)
    styles["Subtitle"].font.name = "Aptos"
    styles["Subtitle"].font.size = Pt(12)
    styles["Subtitle"].font.italic = False
    styles["Subtitle"].font.color.rgb = RGBColor.from_string("444444")
    styles["Caption"].font.size = Pt(9)
    styles["Caption"].font.italic = False
    styles["Caption"].font.color.rgb = RGBColor.from_string("444444")
    header = section.header.paragraphs[0]
    header.text = "COSC 336  /  GROUP 6                                           PHASE 6"
    header.runs[0].font.size = Pt(8)
    header.runs[0].font.color.rgb = RGBColor.from_string("666666")
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run("22 November 2026   |   ").font.size = Pt(8)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    lines = (BASE / "implementation-report.md").read_text(encoding="utf-8").splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line:
            continue
        if line == "<!-- pagebreak -->":
            document.add_page_break()
        elif line.startswith("|"):
            rows = [line]
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(lines[index].strip())
                index += 1
            values = [[v.strip() for v in row.strip("|").split("|")] for row in rows]
            table(document, [values[0]] + values[2:])
        elif line.startswith("!["):
            match = re.fullmatch(r"!\[([^]]+)\]\(([^)]+)\)", line)
            alt, image = match.groups()
            para = document.add_paragraph()
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            para.paragraph_format.keep_with_next = True
            shape = para.add_run().add_picture(str(BASE / image), width=Inches(4.65 if "03-" in image else 6.55))
            shape._inline.docPr.set("descr", alt)
        elif line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            text = line[level:].strip()
            style = {1: "Title", 2: "Subtitle", 3: "Heading 1", 4: "Heading 2"}[level]
            document.add_paragraph(text, style)
        else:
            style = "Caption" if line.startswith("Figure ") else "Normal"
            para = document.add_paragraph(style=style)
            if "100066" in line:
                para.paragraph_format.space_after = Pt(2)
            inline(para, line)
    document.core_properties.title = "Phase 6 Implementation Report"
    document.core_properties.subject = "Environment selected features and verification"
    document.core_properties.author = "COSC 336 Group 6"
    document.core_properties.comments = "Generated from implementation-report.md; human team review required."
    document.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
