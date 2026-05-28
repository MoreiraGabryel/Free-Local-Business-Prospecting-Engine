from __future__ import annotations


def compute_opportunity_score(has_website: bool, has_phone: bool, has_email: bool) -> str:
    if has_website and has_phone and has_email:
        return "Alta"

    if has_website and (has_phone or has_email):
        return "Média"

    return "Baixa"
