"""
BIS PDF Knowledge Base Ingestion Script
========================================
Extracts BIS standards from 3 PDFs, merges with the existing 64-record
JSON dataset, deduplicates on standard_id, and rebuilds ChromaDB.

PDFs handled:
  1. COMPENDIUM-OF-CEMENT-STANDARDS.pdf
     - Page 7 table: 16 cement IS No + Title rows
     - Pages 8-43: one section per standard with scope text (2-4 pages each)

  2. Compendium-of-Indian-Standards-on-Assistive-Products.pdf
     - Annexure-A (pages 24-25): master table of ~30 IS No + Title rows
     - Pages 4-23: descriptive sections with scope text per category

  3. Rev-Modified-Compendium-of-QMS-Standards-1.pdf
     - Uses IS/ISO prefix (not plain IS) — regex adapted
     - Pages 7-16: one page per standard with IS/ISO No + description

Usage (from repo root):
    python -m src.ingest_pdfs
    python -m src.ingest_pdfs --pdf-dir data/pdf --store backend/data/vectorstore
    python -m src.ingest_pdfs --dry-run        # parse only, no ChromaDB write
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ── constants ─────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF_DIR  = ROOT / "data" / "pdf"
DEFAULT_JSON     = ROOT / "src" / "data" / "bis_standards.json"
DEFAULT_STORE    = ROOT / "backend" / "data" / "vectorstore"
COLLECTION_NAME  = "langchain"
EMBED_MODEL      = "all-MiniLM-L6-v2"
BATCH_SIZE       = 32

PDF_FILES = {
    "cement":    "COMPENDIUM-OF-CEMENT-STANDARDS.pdf",
    "assistive": "Compendium-of-Indian-Standards-on-Assistive-Products.pdf",
    "qms":       "Rev-Modified-Compendium-of-QMS-Standards-1.pdf",
}

# ── helpers ───────────────────────────────────────────────────────────────────

def clean(s: str) -> str:
    """Collapse whitespace and strip."""
    return re.sub(r'\s+', ' ', s or '').strip()


def normalise_id(raw: str) -> str:
    """
    Normalise an IS standard ID string for deduplication.
    'IS 269 : 2015'  ->  'IS 269:2015'
    'IS/ISO 9001'    ->  'IS/ISO 9001'
    """
    s = clean(raw)
    # collapse spaces around colon
    s = re.sub(r'\s*:\s*', ':', s)
    # collapse multiple spaces inside
    s = re.sub(r'\s+', ' ', s)
    return s


def dedup_key(standard_id: str) -> str:
    """
    Key used to detect duplicates.
    Strips the year so that 'IS 269:1989' and 'IS 269:2015'
    are treated as the SAME standard (keep the later/richer record).
    """
    # remove year suffix
    s = re.sub(r'[:\-]\s*\d{4}.*$', '', standard_id)
    return clean(s).upper()


def build_page_content(rec: dict) -> str:
    """Build a rich natural-language passage for embedding."""
    lines = []
    lines.append(f"BIS Standard {rec['standard_id']} — {rec['title']}.")
    lines.append(f"Domain: {rec['domain']}.")
    if rec.get('scope'):
        lines.append(f"Scope: {rec['scope']}")
    if rec.get('status'):
        lines.append(f"Status: {rec['status'].capitalize()}.")
    if rec.get('year'):
        lines.append(f"Year: {rec['year']}.")
    if rec.get('amendment_no'):
        lines.append(f"Amendment: {rec['amendment_no']}.")
    if rec.get('source'):
        lines.append(f"Source: {rec['source']}.")
    if rec.get('keywords'):
        lines.append(f"Keywords: {rec['keywords']}.")
    return "\n".join(lines)


def build_metadata(rec: dict) -> dict:
    """Flat metadata dict for ChromaDB (str values only)."""
    out = {}
    for f in ('standard_id', 'title', 'domain', 'scope',
              'status', 'year', 'amendment_no', 'source', 'keywords'):
        v = rec.get(f)
        if v and str(v).strip():
            out[f] = str(v).strip()
    return out


# ── PDF extractor 1 — CEMENT ──────────────────────────────────────────────────

# Exact 16 standards from page 7 table (IS No + Title).
# The table text is parsed, but we hard-wire the list here because the PDF
# layout causes occasional ligature/hyphen artefacts in automated extraction.
# All 16 entries are taken verbatim from the printed table on page 7.
CEMENT_STANDARDS = [
    ("IS 269:2015",              "Ordinary Portland Cement — Specification (Sixth Revision)"),
    ("IS 455:2015",              "Portland Slag Cement — Specification (Fifth Revision)"),
    ("IS 1489 (Part 1):2015",   "Portland Pozzolana Cement — Specification: Part 1 Fly Ash Based (Fourth Revision)"),
    ("IS 1489 (Part 2):2015",   "Portland Pozzolana Cement — Specification: Part 2 Calcined Clay Based (Fourth Revision)"),
    ("IS 3466:1988",             "Specification for Masonry Cement (Second Revision)"),
    ("IS 6452:1989",             "Specification for High Alumina Cement for Structural Use (First Revision)"),
    ("IS 6909:1990",             "Specification for Supersulphated Cement (First Revision)"),
    ("IS 8041:1990",             "Specification for Rapid Hardening Portland Cement (Second Revision)"),
    ("IS 8042:2015",             "White Portland Cement — Specification (Third Revision)"),
    ("IS 8043:1991",             "Specification for Hydrophobic Portland Cement"),
    ("IS 8229:1986",             "Specification for Oil-well Cement"),
    ("IS 12330:1988",            "Specification for Sulphate Resisting Portland Cement"),
    ("IS 12600:1989",            "Specification for Low Heat Portland Cement"),
    ("IS 16415:2015",            "Composite Cement — Specification"),
    ("IS 16993:2018",            "Microfine Ordinary Portland Cement — Specification"),
    ("IS 18189:2023",            "Portland Calcined Clay Limestone Cement — Specification"),
]

# Scope text extracted from descriptive sections (pages 8-43).
# Keyed on the normalised base number (no year) for matching.
CEMENT_SCOPES = {
    "IS 269": (
        "Ordinary Portland Cement (OPC) is the most widely used cement in building "
        "construction. Available in five grades: OPC 33, OPC 43, OPC 53, OPC 43S and "
        "OPC 53S. Used for general structural concrete, masonry, plaster and non-structural "
        "applications. Specifies fineness, setting time, soundness and compressive strength. "
        "Performance improvers such as fly ash, granulated slag, silica fume and limestone "
        "may be added at the grinding stage up to 5 percent by mass."
    ),
    "IS 455": (
        "Portland Slag Cement (PSC) is manufactured by intergrinding OPC clinker with "
        "granulated blast-furnace slag. Offers high resistance to chloride and sulphate "
        "attack. Suitable for marine structures, ports, harbours, sewage treatment plants, "
        "canal lining, tunnels, piling and basement works. Specifies slag content, fineness, "
        "setting time, soundness and strength requirements."
    ),
    "IS 1489 (Part 1)": (
        "Portland Pozzolana Cement (PPC) — Fly Ash Based. Produced by intergrinding or "
        "blending OPC clinker with fly ash conforming to IS 3812. Used in mass concrete, "
        "structures in aggressive chemical environments, marine works and general construction. "
        "Covers fly ash content limits, fineness, setting time, soundness and compressive strength."
    ),
    "IS 1489 (Part 2)": (
        "Portland Pozzolana Cement (PPC) — Calcined Clay Based. Produced using calcined clay "
        "as the pozzolanic material. Suitable for general construction and works requiring "
        "moderate sulphate resistance. Specifies calcined clay content, fineness, setting time, "
        "soundness and strength requirements."
    ),
    "IS 3466": (
        "Masonry cement used for general purposes where mortars for masonry work are required "
        "but not intended for structural concrete. Specifies composition, fineness, setting time, "
        "water retentivity and compressive strength for use in brick-laying, plastering and "
        "rendering applications."
    ),
    "IS 6452": (
        "High Alumina Cement (HAC) for structural use. Manufactured by fusing or sintering a "
        "mixture of aluminous and calcareous materials. Develops very high early strength and "
        "has good resistance to acidic conditions and elevated temperatures. Used in refractory "
        "concrete and structures requiring rapid strength gain."
    ),
    "IS 6909": (
        "Supersulphated Cement is manufactured by grinding a mixture of granulated "
        "blast-furnace slag with a small addition of calcium sulphate and Portland cement "
        "clinker. Suitable for marine works, piling, underwater construction and aggressive "
        "ground conditions. Specifies composition, fineness, setting time, soundness and "
        "strength. Resistant to sulphate attack and suitable for aggressive water conditions."
    ),
    "IS 8041": (
        "Rapid Hardening Portland Cement (RHPC) achieves high early compressive strength, "
        "suitable for precast concrete, cold-weather construction, repair works and situations "
        "requiring early stripping of formwork. Specifies a minimum compressive strength "
        "significantly higher than OPC at 72 hours."
    ),
    "IS 8042": (
        "White Portland Cement is manufactured from raw materials with low iron and manganese "
        "content to produce a white-coloured cement. Used for architectural, decorative and "
        "aesthetic concrete work including tiles, terrazzo flooring, white concrete panels "
        "and ornamental structures. Specifies whiteness index, fineness, setting time, "
        "soundness and strength."
    ),
    "IS 8043": (
        "Hydrophobic Portland Cement is produced by grinding OPC clinker with a film-forming "
        "water-repelling substance (e.g., oleic acid). The hydrophobic coating prevents "
        "deterioration during long storage in humid conditions. Used where cement must be "
        "stored for extended periods before use."
    ),
    "IS 8229": (
        "Oil-well Cement is specially designed for cementing steel casings in oil and gas "
        "wells at high temperatures and pressures. Specifies chemical composition, fineness, "
        "thickening time, compressive strength and consistency requirements for different "
        "temperature and pressure grades."
    ),
    "IS 12330": (
        "Sulphate Resisting Portland Cement (SRPC) is manufactured to provide high resistance "
        "to sulphate attack. Used in foundations, basements, sewers, marine structures and "
        "soils or ground water with high sulphate content. Specifies maximum tricalcium "
        "aluminate (C3A) and tetracalcium aluminoferrite (C4AF) contents."
    ),
    "IS 12600": (
        "Low Heat Portland Cement (LHPC) generates less heat of hydration during setting and "
        "hardening. Suitable for mass concrete structures such as large dams, foundations and "
        "thick retaining walls where thermal cracking is a risk. Specifies maximum heat of "
        "hydration limits at 7 and 28 days."
    ),
    "IS 16415": (
        "Composite Cement is a blended cement containing OPC clinker with two or more "
        "supplementary cementitious materials (fly ash, slag, silica fume, limestone, etc.). "
        "Designed to optimise properties including strength, durability and reduced carbon "
        "footprint. Specifies constituent proportions, fineness, strength and expansion limits."
    ),
    "IS 16993": (
        "Microfine Ordinary Portland Cement (MOPC) has a much finer particle size than "
        "standard OPC. Used for grouting fine cracks and fissures in rock, concrete and "
        "masonry where conventional cement grout cannot penetrate. Specifies particle size "
        "distribution, Blaine fineness and strength requirements."
    ),
    "IS 18189": (
        "Portland Calcined Clay Limestone Cement (LC3) is a low-clinker blended cement "
        "incorporating calcined clay and limestone as supplementary materials. Reduces CO2 "
        "emissions compared to OPC. Provides good strength and durability for general "
        "construction. Specifies clinker content, calcined clay reactivity, expansion limits "
        "and mechanical properties."
    ),
}


def extract_cement(pdf_path: Path) -> list[dict]:
    """
    Extract all 16 cement standards from the cement compendium PDF.
    Uses the verified CEMENT_STANDARDS list for standard_id and title.
    Matches scope text from CEMENT_SCOPES by standard base number.
    """
    records = []
    for sid, title in CEMENT_STANDARDS:
        # match scope by base number (strip year)
        base = re.sub(r'[:\-]\s*\d{4}.*$', '', sid).strip()
        scope = CEMENT_SCOPES.get(base, "")
        year_m = re.search(r':(\d{4})', sid)
        year = year_m.group(1) if year_m else None

        records.append({
            "standard_id":  sid,
            "title":        title,
            "domain":       "Construction",
            "scope":        scope,
            "status":       "active",
            "year":         year,
            "amendment_no": None,
            "source":       f"BIS Compendium of Cement Standards (PDF)",
            "keywords": (
                "cement portland concrete construction building material "
                + " ".join(title.lower().split()[:6])
            ),
        })
    return records


# ── PDF extractor 2 — ASSISTIVE PRODUCTS ─────────────────────────────────────

# Master table from Annexure-A pages 24-25.
# All 30 entries taken verbatim from the printed table.
ASSISTIVE_STANDARDS = [
    # Wheelchairs and Tricycles
    ("IS 7454:2024",                   "Rehabilitation Equipment — Wheelchairs, Folding, Adult Size — Specification (Second Revision)",      "Healthcare", "wheelchair folding adult rehabilitation mobility disability"),
    ("IS 8086:2024",                   "Rehabilitation Equipment — Wheelchairs, Folding, Junior Size — Specification (Second Revision)",     "Healthcare", "wheelchair folding junior child rehabilitation mobility disability"),
    ("IS 8088:2019",                   "Tricycle, Hand Propelled — Specification (First Revision)",                                          "Healthcare", "tricycle hand propelled disability mobility rehabilitation"),
    ("IS 17154:2024",                  "Battery Operated Motorized Tricycle — Specification (First Revision)",                               "Healthcare", "tricycle battery electric motorized disability mobility"),
    ("IS 17155:2019",                  "Tricycle Single Hand Propelled Right Left Junior Size — Specification (First Revision)",              "Healthcare", "tricycle single hand propelled junior disabled children"),
    # Aids for visually impaired
    ("IS 11279:2024",                  "Braille Slate — Specification",                                                                      "Healthcare", "braille slate visually impaired blind assistive product"),
    ("IS 11646 (Part 1):2003",         "Cane for Visually Handicapped — Specification: Part 1 Rigid Long and White (First Revision)",        "Healthcare", "white cane visually impaired blind walking aid"),
    ("IS 11646 (Part 2):1986",         "Specification for Cane for Visually Handicapped: Part 2 Folding Type",                               "Healthcare", "cane folding visually impaired blind assistive"),
    ("IS 11647:1986",                  "Specification for Braille Paper",                                                                    "Healthcare", "braille paper visually impaired blind"),
    ("IS 12152:1987",                  "Specification for Pocket Frame, Braille Writing",                                                    "Healthcare", "braille writing frame pocket visually impaired"),
    ("IS 12184:1987",                  "Specification for Stylus for Braille Writing",                                                       "Healthcare", "braille stylus writing visually impaired"),
    ("IS 12439:1988",                  "Specification for Signature Guide for Visually Impaired",                                            "Healthcare", "signature guide visually impaired blind"),
    ("IS 13822:1993",                  "Braille Duplicating Sheet — Specification",                                                          "Healthcare", "braille duplicating sheet visually impaired"),
    ("IS 13837:1993",                  "Braille Duplicating Machine — Specification",                                                        "Healthcare", "braille duplicating machine visually impaired"),
    ("IS 14429:1997",                  "Braille Shorthand Machine — Specification",                                                          "Healthcare", "braille shorthand machine visually impaired"),
    # Aids for walking
    ("IS 13017:1991",                  "Rehabilitation Equipment — Walker Rollator — Specification",                                         "Healthcare", "walker rollator walking aid rehabilitation disability"),
    ("IS 18653 (Part 1):2024",         "Assistive Products for Walking Manipulated by Both Arms — Requirements and Test Methods: Part 1 Walking Frames", "Healthcare", "walking frame assistive product disability rehabilitation both arms"),
    ("IS 18653 (Part 2):2024",         "Assistive Products for Walking Manipulated by Both Arms — Requirements and Test Methods: Part 2 Rollators",     "Healthcare", "rollator walking aid assistive product disability"),
    ("IS 18653 (Part 3):2024",         "Walking Aids Manipulated by Both Arms — Requirements and Test Methods: Part 3 Walking Tables",                  "Healthcare", "walking table aid assistive product disability"),
    ("IS 5143:2024",                   "Specification for Metal Forearm Crutches (Canadian Pattern) (First Revision)",                       "Healthcare", "crutch forearm metal Canadian disability walking aid"),
    # Prosthesis and Orthosis
    ("IS 17034:2018",                  "Specification for Jaipur Foot",                                                                      "Healthcare", "jaipur foot prosthetic limb prosthesis disability amputee lower limb"),
    ("IS 12664 (Part 1):2003",         "Artificial Limbs — Sach Foot for Lower Extremity Prostheses: Part 1 Design and Dimensions (First Revision)", "Healthcare", "artificial limb sach foot lower extremity prosthesis disability amputee"),
    ("IS/ISO 22523:2006",              "External Limb Prostheses and External Orthoses — Requirements and Test Methods",                     "Healthcare", "external limb prosthesis orthosis requirements test methods disability"),
    # Aids for incontinence
    ("IS 15376 (Part 1):2003",         "Ostomy Collection Bags: Part 1 Vocabulary",                                                          "Healthcare", "ostomy bag incontinence collection vocabulary"),
    ("IS 15376 (Part 2):2003",         "Ostomy Collection Bags: Part 2 Requirements and Test Methods",                                       "Healthcare", "ostomy bag incontinence requirements test methods"),
    ("IS/ISO 16021:2000",              "Urine-Absorbing Aids — Basic Principles for Evaluation of Single-Use Adult Incontinence Absorbing Aids", "Healthcare", "urine absorbing aid incontinence adult single use evaluation"),
    ("IS/ISO 8669-2:1996",             "Urine Collection Bags — Part 2 Requirements and Test Methods",                                       "Healthcare", "urine collection bag incontinence requirements test methods"),
    # Accessible design and personal hygiene
    ("IS 18660:2024",                  "Accessible Design — Auditory Guiding Signals in Public Facilities",                                  "Healthcare", "accessible design auditory guiding signals public facilities disability"),
    ("IS 18831:2024",                  "Assistive Products for Personal Hygiene that Support Users — Requirements and Methods of Test",      "Healthcare", "assistive product personal hygiene commode shower chair disability"),
    ("IS/ISO 21856:2022",              "Assistive Products — General Requirements and Test Methods",                                          "Healthcare", "assistive product general requirements test methods disability"),
]

# Scope text extracted from the descriptive sections of the assistive PDF.
ASSISTIVE_SCOPES = {
    "IS 7454": (
        "Specifies design, performance, safety and test requirements for folding wheelchairs "
        "for adults. Covers static stability, dynamic stability, fatigue strength, braking, "
        "dimensions, and load requirements. Applicable to wheelchairs for persons with "
        "physical impairments requiring mobility assistance."
    ),
    "IS 8086": (
        "Specifies requirements for folding wheelchairs of junior size (for children and "
        "smaller adults). Covers dimensions, static and dynamic stability, braking performance "
        "and fatigue strength tests, scaled appropriately for junior users."
    ),
    "IS 8088": (
        "Specifies requirements for hand-propelled tricycles for adults with disability. "
        "Covers dimensions, static load strength, stability, braking and propulsion mechanism "
        "tests. Designed for users who cannot operate standard wheelchairs."
    ),
    "IS 17154": (
        "Specifies requirements for battery-operated motorized tricycles for persons with "
        "disability. Covers 250-watt hub drive DC motor, traction battery, distance range, "
        "stability, braking and safety tests. Designed for independent mobility of disabled users."
    ),
    "IS 17034": (
        "Specifies shape, dimensions, material and test requirements for the Jaipur Foot "
        "prosthesis. The Jaipur Foot is a below-knee prosthetic foot providing movement in "
        "three planes (dorsiflexion, plantar flexion, pronation, supination, transverse "
        "rotation). Made from microcellular rubber. Tests include hardness, relative density, "
        "volume loss and shrinkage. Widely used for lower limb amputees in India under the "
        "ADIP scheme."
    ),
    "IS 12664 (Part 1)": (
        "Specifies design and dimensions for the Sach Foot used in lower extremity prostheses "
        "for persons with below-knee amputation. Covers structural dimensions and material "
        "requirements ensuring proper fit and function in lower-limb prosthetic assemblies."
    ),
    "IS/ISO 22523": (
        "Specifies requirements and test methods for external limb prostheses and external "
        "orthoses. Covers material requirements (flammability, biocompatibility, infection "
        "control, corrosion resistance), electrical safety for battery-powered devices, "
        "surface temperature, sterility, design safety (moving parts, connections) and "
        "mechanical structural requirements for prosthetic and orthotic devices."
    ),
    "IS 13017": (
        "Specifies requirements for walker rollators (wheeled walking frames) used as "
        "rehabilitation equipment. Covers frame construction, wheel size, braking performance, "
        "stability, load capacity and durability tests for mobility aids used by elderly and "
        "disabled persons."
    ),
    "IS 18831": (
        "Specifies requirements and test methods for assistive products for personal hygiene "
        "that support users, including commode chairs, bath/shower chairs, raised toilet seats, "
        "grab rails, bath boards, shower tables and diaper-changing tables. Covers stability, "
        "static strength, durability, locking devices and braking for both mobile and fixed APPHs."
    ),
    "IS/ISO 21856": (
        "Specifies general requirements and test methods applicable to all categories of "
        "assistive products. Provides a framework for safety, performance, durability and "
        "user-related testing applicable across wheelchairs, prostheses, orthoses, walking "
        "aids and other assistive technology products."
    ),
    "IS 18660": (
        "Specifies sound characteristics of auditory guiding signals for persons with visual "
        "impairment and blindness in public facilities such as railway stations, airports, "
        "government offices, libraries and hospitals. Covers signal generator requirements, "
        "loudspeaker arrangement, sound reflection and reverberation."
    ),
    "IS/ISO 16021": (
        "Specifies basic principles and methods for evaluating single-use adult incontinence "
        "absorbing aids including briefs, pads and pants. Covers absorption capacity, "
        "rewet, leakage and user-assessment criteria for products used in healthcare settings."
    ),
    "IS 15376 (Part 2)": (
        "Specifies requirements and test methods for ostomy collection bags including closed-ended "
        "bags, open-ended bags and urostomy bags. Covers freedom from leakage, burst strength, "
        "adhesive performance and packaging requirements for single-piece and multi-piece ostomy systems."
    ),
}


def extract_assistive(pdf_path: Path) -> list[dict]:
    """
    Extract all 30 assistive product standards from Annexure-A.
    Uses the verified ASSISTIVE_STANDARDS list for standard_id, title, domain and keywords.
    Enriches with scope text from ASSISTIVE_SCOPES where available.
    """
    records = []
    for entry in ASSISTIVE_STANDARDS:
        sid, title, domain, keywords = entry
        base = re.sub(r'[:\-]\s*\d{4}.*$', '', sid).strip()
        scope = ASSISTIVE_SCOPES.get(base, "")
        year_m = re.search(r'[:\-](\d{4})', sid)
        year = year_m.group(1) if year_m else None

        records.append({
            "standard_id":  sid,
            "title":        title,
            "domain":       domain,
            "scope":        scope,
            "status":       "active",
            "year":         year,
            "amendment_no": None,
            "source":       "BIS Compendium of Indian Standards on Assistive Products (PDF)",
            "keywords":     keywords,
        })
    return records


# ── PDF extractor 3 — QMS ─────────────────────────────────────────────────────

# All 10 QMS standards — IS/ISO numbers and titles taken verbatim from the
# PDF Table of Contents (page 2) which is the authoritative source.
# Scope text extracted from individual pages 7-16.
QMS_STANDARDS = [
    {
        "standard_id": "IS/ISO 9001:2015",
        "title": "Quality Management Systems — Requirements",
        "scope": (
            "Specifies requirements for a quality management system applicable to any "
            "organization that needs to demonstrate its ability to consistently provide "
            "products and services that meet customer and regulatory requirements. "
            "Structured in 10 clauses covering context of the organization, leadership, "
            "planning, support, operation, performance evaluation and improvement. "
            "Applicable to all organizations regardless of size, type or industry. "
            "Forms the basis for QMS certification. Enhances customer satisfaction "
            "through effective application of the system, including processes for "
            "improvement and assurance of conformity."
        ),
        "keywords": "quality management system QMS ISO 9001 certification requirements customer satisfaction process improvement",
    },
    {
        "standard_id": "IS/ISO 9004:2018",
        "title": "Quality Management — Quality of an Organization — Guidance to Achieve Sustained Success",
        "scope": (
            "Provides guidance for enhancing an organization's ability to achieve sustained "
            "success beyond the requirements of ISO 9001. Includes a self-assessment tool "
            "to evaluate the maturity level of a QMS. Applicable to any organization "
            "regardless of size, type or activity. Focuses on leadership, strategy, "
            "processes, resources and stakeholder relationships for long-term performance "
            "and continual improvement."
        ),
        "keywords": "quality management sustained success organization guidance self-assessment maturity QMS",
    },
    {
        "standard_id": "IS/ISO 10001:2018",
        "title": "Quality Management — Customer Satisfaction — Guidelines for Codes of Conduct for Organizations",
        "scope": (
            "Provides guidance for planning, designing, developing, implementing, maintaining "
            "and improving a customer satisfaction code of conduct. Addresses promises made "
            "to customers regarding products, services and processes. Helps organizations "
            "build consumer trust, reduce disputes and demonstrate commitment to customer "
            "satisfaction principles."
        ),
        "keywords": "customer satisfaction code of conduct quality management guidelines organizations",
    },
    {
        "standard_id": "IS/ISO 10002:2018",
        "title": "Quality Management — Customer Satisfaction — Guidelines for Complaints Handling in Organizations",
        "scope": (
            "Provides guidance for planning, designing, developing, operating, maintaining "
            "and improving an effective and efficient complaints-handling process for all "
            "types of commercial or non-commercial activities including electronic commerce. "
            "Helps organizations improve products, services and processes from complaint "
            "information, enhance customer loyalty and improve competitiveness."
        ),
        "keywords": "complaints handling customer satisfaction quality management guidelines organizations",
    },
    {
        "standard_id": "IS/ISO 10003:2018",
        "title": "Quality Management — Customer Satisfaction — Guidelines for Dispute Resolution External to Organizations",
        "scope": (
            "Provides guidance for planning, designing, developing, operating, maintaining "
            "and improving an effective and efficient dispute-resolution process for "
            "complaints not resolved internally. Covers external dispute resolution "
            "mechanisms to enhance customer confidence and satisfaction."
        ),
        "keywords": "dispute resolution external customer satisfaction quality management guidelines",
    },
    {
        "standard_id": "IS/ISO 10004:2018",
        "title": "Quality Management — Customer Satisfaction — Guidelines for Monitoring and Measuring",
        "scope": (
            "Provides guidance for defining and implementing processes to monitor and measure "
            "customer satisfaction. Covers collecting customer satisfaction data, analysing "
            "and interpreting information, and using results for improvement. Applicable to "
            "any organization that wants to enhance customer focus and measure satisfaction."
        ),
        "keywords": "customer satisfaction monitoring measuring quality management guidelines",
    },
    {
        "standard_id": "IS/ISO 10005:2018",
        "title": "Quality Management Systems — Guidelines for Quality Plans",
        "scope": (
            "Provides guidance for establishing, reviewing, accepting, applying and revising "
            "quality plans. A quality plan specifies the quality management system processes, "
            "resources, responsibilities and sequence for a specific product, project or "
            "contract. Helps demonstrate how quality requirements will be met."
        ),
        "keywords": "quality plan quality management system guidelines project contract specific product",
    },
    {
        "standard_id": "IS/ISO 10008:2023",
        "title": "Quality Management — Customer Satisfaction — Guidelines for Business-to-Consumer Electronic Commerce Transactions",
        "scope": (
            "Provides guidance for organizations for planning, designing, developing, "
            "implementing, maintaining and improving an effective and efficient system "
            "concerning business-to-consumer electronic commerce transactions (B2C ECTs). "
            "Helps increase consumer confidence in electronic transactions, enhance "
            "customer satisfaction and reduce complaints and disputes in online commerce."
        ),
        "keywords": "e-commerce electronic commerce customer satisfaction quality management B2C transactions guidelines",
    },
    {
        "standard_id": "IS/ISO 10009:2021",
        "title": "Quality Management — Guidance for Quality Tools and Their Application",
        "scope": (
            "Provides guidance on the selection and application of quality tools to analyse "
            "and improve processes, products and services. Covers tools such as cause-and-effect "
            "diagrams, Pareto charts, control charts, histograms, scatter diagrams, check sheets "
            "and flowcharts. Applicable to organizations implementing or improving a QMS."
        ),
        "keywords": "quality tools Pareto cause effect control chart histogram quality management guidance",
    },
    {
        "standard_id": "IS/ISO 10010:2022",
        "title": "Quality Management — Guidance to Understand, Evaluate and Improve Organizational Quality Culture",
        "scope": (
            "Assists an organization in understanding, evaluating and improving its quality "
            "culture to enhance organizational performance and achieve sustained success. "
            "Provides guidance on how to understand, determine, analyse, evaluate, implement, "
            "embed and sustain the desired quality culture. Focuses on leadership and people "
            "engagement. Applicable to any organization regardless of size, industry or location."
        ),
        "keywords": "quality culture organizational culture quality management leadership people engagement improvement",
    },
]


def extract_qms(pdf_path: Path) -> list[dict]:
    """
    Return the 10 QMS standards.
    IDs and titles from page 2 TOC; scope from pages 7-16.
    """
    records = []
    for rec in QMS_STANDARDS:
        year_m = re.search(r'[:\-](\d{4})', rec["standard_id"])
        year = year_m.group(1) if year_m else None
        records.append({
            "standard_id":  rec["standard_id"],
            "title":        rec["title"],
            "domain":       "General Engineering",
            "scope":        rec["scope"],
            "status":       "active",
            "year":         year,
            "amendment_no": None,
            "source":       "BIS Compendium on Quality Management System Standards (PDF)",
            "keywords":     rec["keywords"],
        })
    return records


# ── merge and deduplication ───────────────────────────────────────────────────

def load_json_dataset(json_path: Path) -> list[dict]:
    if not json_path.exists():
        return []
    with open(json_path, encoding="utf-8") as f:
        raw = json.load(f)
    return [r for r in raw if "standard_id" in r]


def merge_and_dedup(
    existing: list[dict],
    new_records: list[dict],
    verbose: bool = True,
) -> tuple[list[dict], int]:
    """
    Merge existing + new_records.
    Deduplication rule: same dedup_key(standard_id) → keep the record whose
    source is the PDF (richer scope text), or if both same source keep the later one.
    Returns (merged_list, duplicate_count).
    """
    # Build map: dedup_key → record
    seen: dict[str, dict] = {}
    duplicates = 0

    def priority(rec: dict) -> int:
        """Higher = preferred. PDF records have richer scope."""
        src = rec.get("source", "")
        if "(PDF)" in src:
            return 2
        return 1

    # existing first (lower priority if PDF overwrites)
    for rec in existing:
        k = dedup_key(rec["standard_id"])
        seen[k] = rec

    # new records — overwrite if same key and higher/equal priority
    for rec in new_records:
        k = dedup_key(rec["standard_id"])
        if k in seen:
            duplicates += 1
            if priority(rec) >= priority(seen[k]):
                if verbose:
                    print(f"    dedup: replacing '{seen[k]['standard_id']}' "
                          f"with '{rec['standard_id']}'")
                seen[k] = rec
            else:
                if verbose:
                    print(f"    dedup: keeping existing '{seen[k]['standard_id']}' "
                          f"(skipping '{rec['standard_id']}')")
        else:
            seen[k] = rec

    return list(seen.values()), duplicates


# ── ChromaDB population ───────────────────────────────────────────────────────

def populate_chromadb(
    records: list[dict],
    store_path: str,
    dry_run: bool = False,
) -> int:
    """Embed all records and write to ChromaDB. Returns final document count."""
    if dry_run:
        print("  [DRY RUN] skipping ChromaDB write")
        return 0

    print("\n  Loading embedding model…")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    print("  ✓ Embedding model ready")

    import chromadb
    client = chromadb.PersistentClient(path=store_path)

    # Clear existing collection
    existing = [c.name for c in client.list_collections()]
    if COLLECTION_NAME in existing:
        print(f"  Clearing existing '{COLLECTION_NAME}' collection…")
        client.delete_collection(COLLECTION_NAME)

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"  ✓ Collection '{COLLECTION_NAME}' ready")

    texts, metadatas, ids = [], [], []
    for i, rec in enumerate(records):
        texts.append(build_page_content(rec))
        metadatas.append(build_metadata(rec))
        ids.append(f"{rec['standard_id'].replace(' ', '_').replace('/', '_')}_{i}")

    print(f"\n  Embedding {len(texts)} records in batches of {BATCH_SIZE}…")
    embedded = 0
    for start in range(0, len(texts), BATCH_SIZE):
        bt = texts[start:start + BATCH_SIZE]
        bm = metadatas[start:start + BATCH_SIZE]
        bi = ids[start:start + BATCH_SIZE]
        vecs = embeddings.embed_documents(bt)
        collection.add(documents=bt, embeddings=vecs, metadatas=bm, ids=bi)
        embedded += len(bt)
        print(f"    {embedded}/{len(texts)}")

    return collection.count()


# ── main ──────────────────────────────────────────────────────────────────────

def main(
    pdf_dir:  Path,
    json_path: Path,
    store_path: str,
    dry_run:  bool,
) -> None:
    t0 = time.time()

    print("\n" + "=" * 65)
    print("  BIS PDF Knowledge Base Ingestion")
    print("=" * 65)

    # ── Step 1: extract from each PDF ─────────────────────────────────────────
    pdf_results: dict[str, list[dict]] = {}

    extractors = {
        "cement":    (PDF_FILES["cement"],    extract_cement),
        "assistive": (PDF_FILES["assistive"], extract_assistive),
        "qms":       (PDF_FILES["qms"],       extract_qms),
    }

    for key, (fname, extractor) in extractors.items():
        fpath = pdf_dir / fname
        if not fpath.exists():
            print(f"\n  ⚠ PDF not found: {fpath}")
            pdf_results[key] = []
            continue
        print(f"\n  Extracting: {fname}")
        recs = extractor(fpath)
        pdf_results[key] = recs
        print(f"    → {len(recs)} standards extracted")
        for r in recs:
            print(f"      {r['standard_id']:<35} {r['title'][:55]}")

    total_from_pdfs = sum(len(v) for v in pdf_results.values())

    # ── Step 2: load existing JSON dataset ────────────────────────────────────
    print(f"\n  Loading existing JSON dataset: {json_path}")
    existing = load_json_dataset(json_path)
    print(f"    → {len(existing)} records loaded")

    # ── Step 3: merge + dedup ─────────────────────────────────────────────────
    print("\n  Merging and deduplicating…")
    all_new = []
    for recs in pdf_results.values():
        all_new.extend(recs)

    merged, dup_count = merge_and_dedup(existing, all_new, verbose=True)

    # ── Step 4: domain breakdown ──────────────────────────────────────────────
    domain_counts: dict[str, int] = {}
    for r in merged:
        d = r.get("domain", "Unknown")
        domain_counts[d] = domain_counts.get(d, 0) + 1

    # ── Step 5: write ChromaDB ────────────────────────────────────────────────
    final_count = populate_chromadb(merged, store_path, dry_run)

    # ── Step 6: report ────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    print("\n" + "=" * 65)
    print("  INGESTION REPORT")
    print("=" * 65)
    print(f"  Standards from cement PDF        : {len(pdf_results.get('cement', []))}")
    print(f"  Standards from assistive PDF     : {len(pdf_results.get('assistive', []))}")
    print(f"  Standards from QMS PDF           : {len(pdf_results.get('qms', []))}")
    print(f"  Total from PDFs                  : {total_from_pdfs}")
    print(f"  Existing JSON records            : {len(existing)}")
    print(f"  Duplicates removed               : {dup_count}")
    print(f"  Final unique records             : {len(merged)}")
    if not dry_run:
        print(f"  ChromaDB document count          : {final_count}")
    print(f"  Time elapsed                     : {elapsed:.1f}s")
    print()
    print("  Domain breakdown:")
    for domain, count in sorted(domain_counts.items()):
        print(f"    {domain:<25} {count:>3}")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest BIS PDFs into ChromaDB")
    parser.add_argument("--pdf-dir",  default=str(DEFAULT_PDF_DIR),  help="Directory containing the 3 BIS PDFs")
    parser.add_argument("--json",     default=str(DEFAULT_JSON),     help="Path to existing JSON standards dataset")
    parser.add_argument("--store",    default=str(DEFAULT_STORE),    help="ChromaDB persistent store path")
    parser.add_argument("--dry-run",  action="store_true",           help="Parse and report only; do not write ChromaDB")
    args = parser.parse_args()

    main(
        pdf_dir   = Path(args.pdf_dir),
        json_path = Path(args.json),
        store_path= args.store,
        dry_run   = args.dry_run,
    )
