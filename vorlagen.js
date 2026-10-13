// Startvorlagen, generiert aus den Excel-Dateien in ../quelle
const START_VORLAGEN = [
 {
  "id": "v-moe3",
  "titel": "Eintrittstest MOE 3. Lehrjahr",
  "teile": [
   {
    "id": "t1",
    "titel": "Schema",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k1",
      "text": "FI / LS vorhanden",
      "max": 3
     },
     {
      "id": "k2",
      "text": "Symbole korrekt",
      "max": 4
     },
     {
      "id": "k3",
      "text": "Drehschalter korrekt auf Lampe B",
      "max": 4
     },
     {
      "id": "k4",
      "text": "Funktion Licht B",
      "max": 4
     },
     {
      "id": "k5",
      "text": "Taster 1 korrekt und funktion B",
      "max": 4
     },
     {
      "id": "k6",
      "text": "Steckdose richtig angeschlossen",
      "max": 3
     },
     {
      "id": "k7",
      "text": "Funktion Licht A",
      "max": 4
     },
     {
      "id": "k8",
      "text": "Sauberkeit",
      "max": 5
     },
     {
      "id": "k9",
      "text": "Wahlschalter korrekt",
      "max": 5
     },
     {
      "id": "k10",
      "text": "PE, N gekennzeichnet",
      "max": 2
     },
     {
      "id": "k11",
      "text": "Legende vorhanden",
      "max": 4
     },
     {
      "id": "k12",
      "text": "Schemakopf vorhanden und korrekt",
      "max": 4
     }
    ]
   },
   {
    "id": "t2",
    "titel": "Praktisch",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k13",
      "text": "Licht B: Lampe Funktion",
      "max": 4
     },
     {
      "id": "k14",
      "text": "Licht B Drehschalter",
      "max": 4
     },
     {
      "id": "k15",
      "text": "Licht A: Dose (Verdrahtung)",
      "max": 4
     },
     {
      "id": "k16",
      "text": "Licht A: Lampe Funktion",
      "max": 4
     },
     {
      "id": "k17",
      "text": "Licht A: Steckdose",
      "max": 4
     },
     {
      "id": "k18",
      "text": "Licht B: Bewegungsmelder",
      "max": 4
     },
     {
      "id": "k19",
      "text": "Licht A: Drehschalter",
      "max": 2
     },
     {
      "id": "k20",
      "text": "UV Eingangsverdrahtung",
      "max": 8
     },
     {
      "id": "k21",
      "text": "UV Ausgangsverdrahtung",
      "max": 8
     },
     {
      "id": "k22",
      "text": "Anschlusskabel",
      "max": 2
     },
     {
      "id": "k23",
      "text": "Abdeckungen Basisschutz",
      "max": 4
     },
     {
      "id": "k24",
      "text": "Typenschild , Legende",
      "max": 4
     },
     {
      "id": "k25",
      "text": "Anschlusskabel eingesteckt",
      "max": 2
     },
     {
      "id": "k26",
      "text": "Zeit eingehalten",
      "max": 18
     }
    ]
   },
   {
    "id": "t3",
    "titel": "Funktion / Erstprüfung",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k27",
      "text": "Anlage läuft auf anhieb",
      "max": 5
     },
     {
      "id": "k28",
      "text": "Anlage läuft nach Nachbesserung innerhalb der Zeit",
      "max": 5
     },
     {
      "id": "k29",
      "text": "M+P vorhanden",
      "max": 5
     }
    ]
   },
   {
    "id": "t4",
    "titel": "Schriftlicher Test",
    "gewicht": 1,
    "modus": "total",
    "kriterien": [],
    "max": 63
   }
  ]
 },
 {
  "id": "v-eli4",
  "titel": "Eintrittstest ELI 4. Lehrjahr",
  "teile": [
   {
    "id": "t1",
    "titel": "Schema",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k1",
      "text": "Prinzip: alle FI / LS vorhanden",
      "max": 7
     },
     {
      "id": "k2",
      "text": "Prinzip: Symbole korrekt",
      "max": 4
     },
     {
      "id": "k3",
      "text": "Prinzip: Eingangsverdrahtung Verdr 4P PE 2P",
      "max": 6
     },
     {
      "id": "k4",
      "text": "Prinzip: Funktionen vorhanden pro Schütz 2P Abgangsv. 4P",
      "max": 10
     },
     {
      "id": "k5",
      "text": "Licht St: FI/LS vorhanden",
      "max": 3
     },
     {
      "id": "k6",
      "text": "Licht St: Symbole korrekt",
      "max": 4
     },
     {
      "id": "k7",
      "text": "Licht St: Drehschalter korrekt",
      "max": 4
     },
     {
      "id": "k8",
      "text": "Licht St: Uhr / Dämms. Korrekt",
      "max": 4
     },
     {
      "id": "k9",
      "text": "Licht St: THA, Taster (kontroll)",
      "max": 6
     },
     {
      "id": "k10",
      "text": "Licht St: PE, N gekennzeichnet",
      "max": 4
     },
     {
      "id": "k11",
      "text": "Legende vorhanden je Schema 4P",
      "max": 8
     },
     {
      "id": "k12",
      "text": "Schemakopf vorhanden und korrekt je Schema 4P",
      "max": 8
     }
    ]
   },
   {
    "id": "t2",
    "titel": "Praktisch",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k13",
      "text": "Typenschild, Legende",
      "max": 5
     },
     {
      "id": "k14",
      "text": "Basisschutz",
      "max": 5
     },
     {
      "id": "k15",
      "text": "UV: Einspeisung, Zählerverdrahtung, PE auf Abgabgssch.",
      "max": 8
     },
     {
      "id": "k16",
      "text": "UV: TRE",
      "max": 8
     },
     {
      "id": "k17",
      "text": "UV: Apparate korrekt, Anordnung",
      "max": 8
     },
     {
      "id": "k18",
      "text": "UV: Eingangsverdrahtung",
      "max": 8
     },
     {
      "id": "k19",
      "text": "UV: Abgangsverdrahtung",
      "max": 8
     },
     {
      "id": "k20",
      "text": "Licht Inst: Installation",
      "max": 4
     },
     {
      "id": "k21",
      "text": "Licht Inst: Funktion, Einstellungen",
      "max": 8
     },
     {
      "id": "k22",
      "text": "WP Anschluss",
      "max": 8
     },
     {
      "id": "k23",
      "text": "Anlage eingesteckt",
      "max": 2
     },
     {
      "id": "k24",
      "text": "Zeit eingehalten",
      "max": 12
     }
    ]
   },
   {
    "id": "t3",
    "titel": "Funktion / Erstprüfung",
    "gewicht": 1,
    "modus": "kriterien",
    "kriterien": [
     {
      "id": "k25",
      "text": "Anlage läuft auf anhieb",
      "max": 10
     },
     {
      "id": "k26",
      "text": "Anlage läuft nach Nachbesserung innerhalb der Zeit",
      "max": 5
     },
     {
      "id": "k27",
      "text": "M+P vorhanden",
      "max": 5
     }
    ]
   },
   {
    "id": "t4",
    "titel": "Schriftlicher Test",
    "gewicht": 1,
    "modus": "total",
    "kriterien": [],
    "max": 76.5
   }
  ]
 }
];
