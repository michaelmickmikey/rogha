import json
import random
from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List

app = FastAPI()

DATA_PATH = Path(__file__).parent / "data" / "teams.json"

with open(DATA_PATH) as f:
    WINNING_TEAMS = json.load(f)

POSITION_GROUPS = {
    "GK":  ["GK"],
    "RFB": ["RFB","FB","LFB"], "FB": ["RFB","FB","LFB"], "LFB": ["RFB","FB","LFB"],
    "RHB": ["RHB","CHB","LHB"], "CHB": ["RHB","CHB","LHB"], "LHB": ["RHB","CHB","LHB"],
    "MF":  ["MF"],
    "RHF": ["RHF","CHF","LHF"], "CHF": ["RHF","CHF","LHF"], "LHF": ["RHF","CHF","LHF"],
    "RFF": ["RFF","FF","LFF"], "FF": ["RFF","FF","LFF"], "LFF": ["RFF","FF","LFF"],
}

def position_fit(player_pos: str, slot_pos: str) -> float:
    if player_pos == slot_pos:
        return 1.0
    if slot_pos in POSITION_GROUPS.get(player_pos, []):
        return 0.9
    defense = ["RFB","FB","LFB","RHB","CHB","LHB"]
    forward = ["RHF","CHF","LHF","RFF","FF","LFF"]
    for zone in [defense, ["MF"], forward]:
        if player_pos in zone and slot_pos in zone:
            return 0.75
    return 0.6


@app.get("/api/spin")
def spin(
    used_keys: str = Query(default=""),
    county: str = Query(default=""),
    year: int = Query(default=0),
):
    used = set(k for k in used_keys.split(",") if k.strip())
    available = [t for t in WINNING_TEAMS if f"{t['year']}-{t['county']}" not in used]
    if county:
        available = [t for t in available if t["county"] == county]
    if year:
        available = [t for t in available if t["year"] == year]
    if not available:
        return {"done": True}
    team = random.choice(available)
    return {"done": False, "team": team}


@app.get("/api/teams")
def all_teams():
    return {"teams": WINNING_TEAMS}


class RateRequest(BaseModel):
    players: List[dict]

class SimRequest(BaseModel):
    players: List[dict]


def team_strength(players: list) -> float:
    return sum(p["rating"] for p in players) / max(len(players), 1)


def gen_gaa_score(strength: float, is_winner: bool) -> dict:
    quality = (strength - 75) / 5
    if is_winner:
        base = random.randint(14, 21) + round(quality)
    else:
        base = random.randint(7, 15) + round(quality)
    total = max(5, min(28, base))
    goals = random.choices([0, 1, 2, 3], weights=[38, 35, 20, 7])[0]
    points = max(0, total - goals * 3)
    return {"goals": goals, "points": points, "total": goals * 3 + points}


def gen_timeline(user_players: list, opp_players: list, user_score: dict, opp_score: dict) -> list:
    forward_pos = {"RFF", "FF", "LFF", "RHF", "CHF", "LHF", "MF"}

    def scorer_pool(players):
        pool = []
        for p in players:
            w = 4 if p["position"] in forward_pos else 1
            pool.extend([p["name"]] * w)
        return pool or ["Unknown"]

    def assign_events(score: dict, pool: list, team: str) -> list:
        g, p = score["goals"], score["points"]
        total = min(g + p, 11)
        minutes = sorted(random.randint(1, 70) for _ in range(total))
        events = []
        for minute in minutes:
            if g > 0 and random.random() < g / max(g + p, 1):
                events.append({"minute": minute, "team": team, "name": random.choice(pool), "type": "goal"})
                g -= 1
            elif p > 0:
                events.append({"minute": minute, "team": team, "name": random.choice(pool), "type": "point"})
                p -= 1
        return events

    user_events = assign_events(user_score, scorer_pool(user_players), "user")
    opp_events  = assign_events(opp_score,  scorer_pool(opp_players),  "opp")
    return sorted(user_events + opp_events, key=lambda x: x["minute"])


@app.post("/api/simulate")
def simulate(req: SimRequest):
    players = req.players[:15]
    user_str = team_strength(players)
    rounds = ["Quarter Final", "Semi Final", "All-Ireland Final"]
    used_opp = set()
    results = []

    for rnd in rounds:
        available = [t for t in WINNING_TEAMS if f"{t['year']}-{t['county']}" not in used_opp]
        if not available:
            break
        opp = random.choice(available)
        used_opp.add(f"{opp['year']}-{opp['county']}")
        opp_str = team_strength(opp["players"])

        diff = user_str - opp_str
        win_prob = max(0.12, min(0.88, 0.5 + diff / 35))
        user_wins = random.random() < win_prob

        user_score = gen_gaa_score(user_str, user_wins)
        opp_score  = gen_gaa_score(opp_str, not user_wins)

        if user_score["total"] == opp_score["total"]:
            if user_wins: user_score["points"] += 1; user_score["total"] += 1
            else:         opp_score["points"]  += 1; opp_score["total"]  += 1

        results.append({
            "round": rnd,
            "opponent": {"county": opp["county"], "year": opp["year"]},
            "user_score": user_score,
            "opp_score":  opp_score,
            "won": user_wins,
            "timeline": gen_timeline(players, opp["players"], user_score, opp_score),
        })

        if not user_wins:
            break

    return {"results": results}


@app.post("/api/rate")
def rate_team(req: RateRequest):
    SLOTS = ["GK","RFB","FB","LFB","RHB","CHB","LHB","MF","MF","RHF","CHF","LHF","RFF","FF","LFF"]
    players = req.players[:15]

    # greedy best-fit assignment
    assigned = {}
    used_slots = set()

    for slot in SLOTS:
        best_player = None
        best_score = -1
        for p in players:
            if p["name"] in assigned:
                continue
            fit = position_fit(p["position"], slot)
            score = p["rating"] * fit
            if score > best_score:
                best_score = score
                best_player = p
        if best_player:
            assigned[best_player["name"]] = {"slot": slot, "fit": position_fit(best_player["position"], slot), **best_player}

    total = sum(v["rating"] * v["fit"] for v in assigned.values())
    overall = round(total / max(len(assigned), 1))
    return {"overall": overall, "breakdown": list(assigned.values())}


app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True), name="static")
