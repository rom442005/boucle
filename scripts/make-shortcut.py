#!/usr/bin/env python3
"""Fabrique le raccourci « Boucle Sante » : public/sante/Boucle Sante.shortcut (signé, importable par tous).

Pourquoi : sur iPhone, le site installé sur l'écran d'accueil ne peut pas lire Apple Santé (Apple le réserve
aux apps). Ce raccourci de l'app Raccourcis le fait à sa place : il lit, jour par jour, les 28 derniers jours
de six mesures (totaux et moyennes calculés par Santé, sans doublon iPhone + montre), puis les envoie au
serveur de Boucle avec la clé personnelle du membre (demandée à l'import, copiée par l'app). Le profil les
affiche ensuite partout, Mac compris.

Lignes envoyées (champ « d ») : mesure<TAB>AAAA-MM-JJ<TAB>valeur<TAB>unité, lues par la fonction SQL
public.health_push (supabase/schema.sql).

Format des actions : non documenté par Apple ; repris d'exports réels (projet danielhopkins/apple-tools,
lu dans le binaire ActionKit d'iOS 27, et la référence de Federico Viticci pour « Obtenir le contenu de
l'URL »). Les noms des mesures sont les libellés internes d'ActionKit, valables quelle que soit la langue.

    python3 scripts/make-shortcut.py          # écrit puis signe (il faut iCloud sur le Mac)
"""
import os
import plistlib
import subprocess
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "sante")
NAME = "Boucle Sante"
DAYS = 28
METRICS = [
    ("Steps", "steps"),
    ("Walking + Running Distance", "walk"),
    ("Active Calories", "kcal"),
    ("Exercise Time", "exercise"),
    ("Resting Heart Rate", "rest"),
    ("VO2 Max", "vo2"),
]
OBJ = "￼"  # place d'une variable dans un texte


def env():
    vals = {}
    for name in (".env.native.local", ".env.local", ".env"):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        for line in open(path, encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                vals.setdefault(k, v.strip().strip('"'))
    url, key = vals.get("VITE_SUPABASE_URL"), vals.get("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY introuvables (.env.native.local)")
    return url.rstrip("/"), key


def uid():
    return str(uuid.uuid4()).upper()


def act(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def puid(a):
    return a["WFWorkflowActionParameters"]["UUID"]


def ref(u, name):
    return {"OutputUUID": u, "Type": "ActionOutput", "OutputName": name}


def text(parts):
    """Texte fait de morceaux fixes et de sorties d'actions (uuid, nom)."""
    string, ranges = "", {}
    for p in parts:
        if isinstance(p, str):
            string += p
        else:
            ranges["{%d, 1}" % len(string)] = ref(*p)
            string += OBJ
    value = {"string": string}
    if ranges:
        value["attachmentsByRange"] = ranges
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def attachment(u, name, aggr=None):
    v = ref(u, name)
    if aggr:
        v["Aggrandizements"] = aggr
    return {"Value": v, "WFSerializationType": "WFTextTokenAttachment"}


def repeat_item():
    return {"Value": {"Type": "Variable", "VariableName": "Repeat Item"}, "WFSerializationType": "WFTextTokenAttachment"}


def fields(items):
    """Dictionnaire de champs texte (en-têtes, corps JSON)."""
    return {
        "Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": text([k]), "WFValue": v if isinstance(v, dict) else text([v])} for k, v in items]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def find(label):
    return act("is.workflow.actions.filter.health.quantity", {
        "UUID": uid(),
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Bounded": True, "Operator": 4, "Property": "Type", "Removable": False,
                     "Values": {"Enumeration": {"Value": label, "WFSerializationType": "WFStringSubstitutableState"}}},
                    {"Bounded": True, "Operator": 1001, "Property": "Start Date", "Removable": False,
                     "Values": {"Number": DAYS, "Unit": 16}},
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Oldest First",
        "WFContentItemLimitEnabled": False,
        "WFContentItemLimitNumber": 40,
        # Totaux (pas, distance, énergie, exercice) et moyennes (repos, VO2 max) du jour, comme l'app Santé.
        "WFHKSampleFilteringGroupBy": "Day",
        "WFHKSampleFilteringFillMissing": False,
    })


def detail(prop, name):
    return act("is.workflow.actions.properties.health.quantity", {
        "UUID": uid(), "WFContentItemPropertyName": prop, "WFInput": repeat_item(), "CustomOutputName": name,
    })


def block(label, kind):
    """Une mesure : une ligne par jour. Rend (actions, uuid du texte combiné)."""
    f = find(label)
    group = uid()
    start = detail("Start Date", "Début")
    day = act("is.workflow.actions.format.date", {
        "UUID": uid(), "WFDate": text([(puid(start), "Début")]),
        "WFDateFormatStyle": "Custom", "WFDateFormat": "yyyy-MM-dd", "WFTimeFormatStyle": "Short",
    })
    value = detail("Value", "Valeur")
    unit = detail("Unit", "Unité")
    line = act("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": text([
        kind, "\t", (puid(day), "Formatted Date"), "\t", (puid(value), "Valeur"), "\t", (puid(unit), "Unité"),
    ])})
    end = uid()
    combined = act("is.workflow.actions.text.combine", {
        "UUID": uid(), "WFTextSeparator": "New Lines", "text": attachment(end, "Repeat Results"),
    })
    return [
        f,
        act("is.workflow.actions.repeat.each", {
            "GroupingIdentifier": group, "WFControlFlowMode": 0,
            "WFInput": attachment(puid(f), "Health Samples", [{"CoercionItemClass": "WFHKSampleContentItem", "Type": "WFCoercionVariableAggrandizement"}]),
        }),
        start, day, value, unit, line,
        act("is.workflow.actions.repeat.each", {"GroupingIdentifier": group, "WFControlFlowMode": 2, "UUID": end}),
        combined,
    ], puid(combined)


def build(url, key):
    # 1re action : la clé du membre, demandée à l'import (question ci-dessous).
    secret = act("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": text([""])})
    actions = [secret]
    parts = []
    for label, kind in METRICS:
        acts, res = block(label, kind)
        actions += acts
        parts += [(res, "Combined Text"), "\n"]
    body = act("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": text(parts)})
    send = act("is.workflow.actions.downloadurl", {
        "UUID": uid(),
        "WFURL": text([url + "/rest/v1/rpc/health_push"]),
        "WFHTTPMethod": "POST",
        "ShowHeaders": True,
        "WFHTTPHeaders": fields([("apikey", key), ("Content-Type", "application/json")]),
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": fields([("k", text([(puid(secret), "Text")])), ("d", text([(puid(body), "Text")]))]),
    })
    done = act("is.workflow.actions.notification", {
        "UUID": uid(),
        "WFNotificationActionTitle": text(["Boucle Santé"]),
        "WFNotificationActionBody": text(["Valeurs reçues par Boucle : ", (puid(send), "Contents of URL")]),
        "WFNotificationActionSound": False,
    })
    actions += [body, send, done]
    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "3100.0.4.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59843},
        "WFWorkflowImportQuestions": [{
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": "Colle ta clé Boucle (l’app vient de la copier).",
        }],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowNoInputBehavior": {"Name": "WFWorkflowNoInputBehaviorShowError", "Parameters": {}},
    }


def main():
    url, key = env()
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, ".unsigned.shortcut")
    # Le nom du fichier devient celui du raccourci une fois importé (et l'app le lance par ce nom). Sans accent :
    # un « é » enregistré décomposé par macOS ne serait plus trouvé par GitHub Pages.
    out = os.path.join(OUT_DIR, NAME + ".shortcut")
    data = build(url, key)
    with open(tmp, "wb") as f:
        plistlib.dump(data, f)
    print("écrit (%d actions)" % len(data["WFWorkflowActions"]))
    # « anyone » : un iPhone qui n'a jamais vu ce Mac peut l'importer.
    p = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", tmp, "--output", out], capture_output=True, text=True)
    os.remove(tmp)
    if p.returncode != 0:
        sys.exit("signature impossible : " + (p.stderr.strip() or p.stdout.strip()))
    print("signé :", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
