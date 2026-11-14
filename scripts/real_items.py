"""The real decks and pitches shown in the library, with their verified outcomes (see docs/agent-reports/g.md).

Outcomes were recorded from the written sources below BEFORE any score was computed; the score formula
(claimmap/score.py) does not read them.
"""

SF17 = "https://techcrunch.com/2017/09/20/pi-wins-startup-battlefield-at-disrupt-sf-2017/"
LDN16 = "https://techcrunch.com/2016/12/06/seenit-wins-startup-battlefield-disrupt-london-2016/"


def _yt(slug, company, vid, event, won, src, note=""):
    outcome = (f"Won {event} Startup Battlefield" if won else
               f"Finalist{note}, did not win {event} Startup Battlefield")
    return {"slug": slug, "deck_id": f"yt_{slug}", "title": f"{company} ({event.replace('TechCrunch ', '')} final)",
            "company": company, "source_url": f"https://www.youtube.com/watch?v={vid}", "outcome": outcome,
            "outcome_won": won, "outcome_source": src}


PITCHES = [
    _yt("pi", "Pi", "UFvbygXm1Hc", "TechCrunch Disrupt SF 2017", True, SF17),
    _yt("oneva", "Oneva", "ZC3xl_UHhWY", "TechCrunch Disrupt SF 2017", False, SF17, " (runner-up)"),
    _yt("augmedics", "Augmedics", "hFi61rb1Lz8", "TechCrunch Disrupt SF 2017", False, SF17),
    _yt("futurefamily", "Future Family", "FVHxe7vKlR8", "TechCrunch Disrupt SF 2017", False, SF17),
    _yt("matic", "Matic", "A-3u0hGZjmA", "TechCrunch Disrupt SF 2017", False, SF17),
    _yt("seenit", "Seenit", "HhIbSFmIY8A", "TechCrunch Disrupt London 2016", True, LDN16),
    _yt("liftigniter", "LiftIgniter", "VPKgRJMOKFA", "TechCrunch Disrupt London 2016", False, LDN16),
    _yt("oxehealth", "Oxehealth", "fH91MqFlbl0", "TechCrunch Disrupt London 2016", False, LDN16),
]

DECKS = [
    {"slug": "equals_seed", "deck_id": "real_equals_seed", "title": "Equals seed deck (2021)",
     "pdf": "data/real_decks/equals_seed.pdf",
     "source_url": "https://equals-marketing-resources.s3.us-west-2.amazonaws.com/equals-seed.pdf",
     "outcome": "Raised a $6.6M seed round with this deck (founders' post)", "outcome_won": True,
     "outcome_source": "https://wraptext.equals.com/equals-seed-deck/"},
    {"slug": "crowdsec_preseed", "deck_id": "real_crowdsec_preseed", "title": "CrowdSec pre-seed deck (2020)",
     "pdf": "data/real_decks/crowdsec_preseed.pdf",
     "source_url": "https://docs.google.com/presentation/d/1H-Gwa8K4UIHeqcLsPaAGNbKHD04k8GHI1ffB5NImNZU",
     "outcome": "Raised a 680 K EUR smart-money round from 18 business angels (2020)", "outcome_won": True,
     "outcome_source": "https://github.com/crowdsecurity/fundraising-decks"},
    {"slug": "crowdsec_series_a", "deck_id": "real_crowdsec_series_a", "title": "CrowdSec Series A deck (2022)",
     "pdf": "data/real_decks/crowdsec_series_a.pdf",
     "source_url": "https://docs.google.com/presentation/d/1akI0F7CYqff7xJuPklrQiYE4xymv6bU1FHHjvP9lBLY",
     "outcome": "Raised a 14.1 M EUR Series A led by Supernova (2022)", "outcome_won": True,
     "outcome_source": "https://github.com/crowdsecurity/fundraising-decks"},
]
