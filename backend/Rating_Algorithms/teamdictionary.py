# MAP HISTORICAL TEAM ABBREVIATIONS TO CURRENT ONES
_abbrev_to_current = {
    # Hawks lineage
    "AND": "ATL",  # Anderson Packers - no successor, fold into Hawks lineage if needed
    "TCB": "ATL",  # Tri-Cities Blackhawks - Hawks
    "MIH": "ATL",  # Milwaukee Hawks - Hawks
    "STL": "ATL",  # St. Louis Hawks - Hawks
    "ATL": "ATL",

    # Celtics
    "BOS": "BOS",

    # Nets lineage
    "NYN": "BKN",  # New York Nets - Brooklyn Nets
    "NJN": "BKN",  # New Jersey Nets - Brooklyn Nets
    "BKN": "BKN",

    # Hornets / Pelicans
    "CHH": "CHA",  # Original Hornets - Charlotte Hornets
    "CHA": "CHA",
    "CHP": "WAS",  # Chicago Packers/Zephyrs lineage (Wizards)
    "CHZ": "WAS",
    "CAP": "WAS",  # Capital Bullets - Wizards
    "BAL": "WAS",  # Baltimore Bullets
    "BLT": "WAS",
    "WAS": "WAS",
    "NOH": "NOP",  # New Orleans Hornets - Pelicans
    "NOK": "NOP",  # temporary OKC Hornets - Pelicans
    "NOP": "NOP",

    # Bulls
    "CHI": "CHI",

    # Cavs
    "CLE": "CLE",
    "CLR": "CLE",  # Cleveland Rebels (folded, but map to Cavs for consistency)

    # Mavericks
    "DAL": "DAL",

    # Nuggets lineage
    "DEN": "DEN",
    "DN": "DEN",  # old Denver Nuggets (folded), map to current DEN

    # Pistons lineage
    "FTW": "DET",  # Fort Wayne Pistons - Detroit Pistons
    "DET": "DET",

    # Warriors lineage
    "PHW": "GSW",  # Philadelphia Warriors
    "PHL": "GSW",
    "SFW": "GSW",  # San Francisco Warriors
    "GOS": "GSW",  # Golden State
    "GSW": "GSW",

    # Rockets lineage
    "SDR": "HOU",  # San Diego Rockets
    "SAN": "HOU",  # San Diego Rockets (alt)
    "HOU": "HOU",

    # Pacers
    "IND": "IND",
    "INO": "IND",  # Indianapolis Olympians (map to Pacers for continuity)

    # Clippers lineage
    "BUF": "LAC",  # Buffalo Braves
    "SDC": "LAC",  # San Diego Clippers
    "LAC": "LAC",

    # Lakers lineage
    "MNL": "LAL",  # Minneapolis Lakers
    "LAL": "LAL",

    # Grizzlies lineage
    "VAN": "MEM",  # Vancouver Grizzlies
    "MEM": "MEM",

    # Heat
    "MIA": "MIA",

    # Bucks
    "MIL": "MIL",

    # Timberwolves
    "MIN": "MIN",

    # Knicks
    "NYK": "NYK",

    # Thunder lineage
    "SEA": "OKC",  # Seattle SuperSonics
    "OKC": "OKC",

    # Magic
    "ORL": "ORL",

    # 76ers lineage
    "SYR": "PHI",  # Syracuse Nationals
    "PHI": "PHI",

    # Suns
    "PHX": "PHX",

    # Blazers
    "POR": "POR",

    # Kings lineage
    "ROC": "SAC",  # Rochester Royals
    "CIN": "SAC",  # Cincinnati Royals
    "KCK": "SAC",  # Kansas City Kings
    "SAC": "SAC",

    # Spurs
    "SAS": "SAS",

    # Raptors
    "TOR": "TOR",
    "HUS": "TOR",  # Toronto Huskies - map into Raptors

    # Jazz lineage
    "NOJ": "UTA",  # New Orleans Jazz
    "UTH": "UTA",
    "UTA": "UTA",

    # Wizards / Bullets already covered above
}

defunct = {"BOM","CHS","DEF","PIT","PRO","JET","SHE","WAT"}


code_to_team = {
    "ATL": "Atlanta Hawks",
    "BOS": "Boston Celtics",
    "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets",
    "CHI": "Chicago Bulls",
    "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks",
    "DEN": "Denver Nuggets",
    "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors",
    "HOU": "Houston Rockets",
    "IND": "Indiana Pacers",
    "LAC": "Los Angeles Clippers",
    "LAL": "Los Angeles Lakers",
    "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat",
    "MIL": "Milwaukee Bucks",
    "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans",
    "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic",
    "PHI": "Philadelphia 76ers",
    "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers",
    "SAC": "Sacramento Kings",
    "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors",
    "UTA": "Utah Jazz",
    "WAS": "Washington Wizards",
    "BOM": "Old Denver Nuggets (1949-1950)",
    "CHS": "Chicago Stags (1946-1950)",
    "DEF": "Detroit Falcons (1946-1947)",
    "PIT": "Pittsburgh Ironmen (1946-1947)",
    "PRO": "Providence Steamrollers (1946-1949)",
    "JET": "Indianapolis Jets (1948-1949)",
    "SHE": "Sheboygan Red Skins (1949-1950)",
    "WAT": "Waterloo Hawks (1949-1950)"
}


def normalize_team_abbrev(abbrev: str) -> str:
    """
    Map any historical team abbreviation to the current franchise abbreviation.
    Example: 'CIN' -> 'SAC', 'SEA' -> 'OKC', 'MNL' -> 'LAL'.
    If not found, returns the input unchanged.
    """
    if not abbrev:
        return abbrev
    ab = abbrev.strip().upper()
    return _abbrev_to_current.get(ab, ab)

def get_team_name(abbrev: str) -> str:
    """
    Get the full team name from the current team abbreviation.
    Example: 'LAL' -> 'Los Angeles Lakers'.
    If not found, returns the input unchanged.
    """
    ab = abbrev.strip().upper()
    return code_to_team.get(ab, ab)