"""baseline_2026.py — Idempotent one-time 2026 (Jan-Oct) financial baseline seed."""
from datetime import date, datetime
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from backend import models
except ImportError:
    import models

MONTHS = [date(2026, m, 1) for m in range(1, 11)]
OPENING = [6442017, 6352776, 6378113, 6773555, 6315612, 6123658, 6144998, 4260214, 4261433, 3876581]
CLOSING = [6352776, 6378113, 6773555, 6315612, 6123658, 6144998, 4260214, 4261433, 3876581, 3703200]

FUNDS_IN_HAND = {
    "Danish":  [2923241] * 10,
    "Ali":     [930000, 930000, 930000, 930000, 282700, 282700, 0, 0, 0, 0],
    "Dilshad": [857518, 883823, 1332583, 1115300, 1488120, 1524310, 934470, 927980, 579710, 431316],
    "Asif":    [1381000, 1381000, 1381000, 1131000, 1131000, 1131000, 131000, 131000, 131000, 131000],
    "Naveed":  [261017, 260049, 206731, 216071, 298597, 283747, 271503, 279212, 242630, 217643],
}

INFLOW_SUMMARY = {
    "Maintenance": [262500, 241500, 171500, 281000, 268000, 247000, 220000, 244500, 211500, 198500],
    "Maintenance Shop A": [0, 0, 0, 0, 60000, 0, 0, 0, 0, 0],
    "Rent Community Hall": [0, 0, 0, 0, 8000, 8000, 0, 0, 0, 0],
    "Advertisment": [500000, 700000, 1200000, 300000, 733500, 900000, 1280000, 1115500, 1065000, 950000],
    "Advertisement Utility Bill Collection": [50000, 0, 0, 0, -50000, 0, 0, 0, 0, 0],
    "Scrap Sale": [27500, 0, 0, 0, 5000, 4000, 0, 0, 0, 0],
}

OUTFLOW_SUMMARY = {
    "Water Tanker": [0, 15000, 0, 80000, 60000, 37000, 18000, 0, 0, 0],
    "Salaries + Security Guards": [265000, 225800, 276000, 229800, 255000, 236000, 236000, 249000, 260000, 248500],
    "Lift Work + Monthly Maintenance": [21300, 16500, 33000, 15000, 209300, 12000, 56700, 12000, 29400, 23800],
    "Petty Cash Expenses": [15740, 12560, 18170, 27298, 27530, 19520, 14360, 13090, 19240, 18050],
    "Utilities - Kelectric": [226381, 242468, 224818, 241660, 253474, 269850, 232244, 236791, 248082, 223487],
    "Electrical Work Expenses": [34580, 3640, 50110, 7060, 27560, 121760, 480, 0, 0, 2000],
    "Generator & Diesel Exp": [11500, 53600, 92270, 0, 29700, 120200, 81500, 14000, 31100, 36080],
    "Building Colour": [0, 169450, 0, 0, 38000, 0, 0, 0, 0, 0],
    "Building Maintenance - Others": [18500, 6600, 6970, 45300, 85000, 36700, 2000, 11500, 28240, 80000],
    "Play Area Expense": [0, 0, 15000, 0, 0, 0, 0, 0, 0, 0],
    "Entertainment Expense": [0, 0, 0, 9825, 16150, 83200, 0, 0, 0, 0],
    "Water - Machine and Plumbering Work": [273740, 83600, 5990, 53000, 32160, 183330, 98000, 22100, 8290, 154394],
    "Qurbani Expenses": [0, 0, 0, 0, 157580, 0, 0, 0, 0, 0],
    "Mosque/Ramzan Expenses": [0, 58445, 200230, 0, 0, 0, 0, 0, 0, 0],
    "Gym Expense": [0, 0, 0, 300000, 0, 5600, 383000, 2000, 2000, 23070],
    "Building Assets": [50000, 16000, 41000, 30000, 0, 0, 2250000, 798300, 1010000, 500000],
    "Camera, Intercom and Internet Expenses": [12500, 12500, 12500, 0, 25000, 12500, 12500, 0, 25000, 12500],
}

RESIDENT_RECEIPTS = {
    "101": [(0, 28500, "229", "2026-01-06"), (7, 75000, "442", "2026-08-12")],
    "102": [(0, 14000, "239", "2026-01-08"), (1, 7000, "263", "2026-02-05"), (2, 7000, "287", "2026-03-04"), (3, 7000, "327", "2026-04-15"), (4, 5500, "364", "2026-05-16"), (5, 5500, "380", "2026-06-08"), (6, 5500, "416", "2026-07-18"), (7, 5500, "457", "2026-08-25"), (8, 5500, "102", "2026-09-23"), (9, 5500, "512", "2026-10-30")],
    "103": [(1, 5000, "265", "2026-02-06"), (4, 7500, "359", "2026-05-17"), (5, 2500, "396", "2026-06-26"), (7, 5000, "453", "2026-08-16")],
    "104": [(0, 7000, "237", "2026-01-07"), (1, 7000, "254", "2026-02-02"), (2, 7000, "285", "2026-03-02"), (3, 7000, "311", "2026-04-04"), (4, 3500, "347", "2026-05-11"), (5, 6000, "374", "2026-06-04"), (6, 5500, "406", "2026-07-03"), (7, 5500, "437", "2026-08-07"), (8, 5500, "468", "2026-09-06"), (9, 5500, "493", "2026-10-03")],
    "201": [(0, 5500, "235", "2026-01-06"), (1, 5500, "255", "2026-02-02"), (2, 5500, "284", "2026-03-01"), (3, 5500, "308", "2026-04-02"), (4, 5500, "349", "2026-05-11"), (5, 5500, "373", "2026-06-01"), (6, 5500, "405", "2026-07-03"), (7, 5500, "436", "2026-08-06"), (8, 5500, "465", "2026-09-05"), (9, 5500, "506", "2026-10-12")],
    "202": [(0, 21000, "245", "2026-01-12"), (3, 18000, "334", "2026-04-22"), (6, 24000, "409", "2026-07-07")],
    "203": [(0, 7000, "241", "2026-01-08"), (3, 21000, "314", "2026-04-05"), (4, 4000, "367", "2026-05-24"), (6, 11000, "407", "2026-07-03"), (7, 11000, "458", "2026-08-25"), (9, 5500, "490", "2026-10-01")],
    "204": [(0, 7500, "251", "2026-01-30"), (1, 7500, "281", "2026-02-26"), (2, 7500, "302", "2026-03-20"), (3, 7500, "329", "2026-04-26"), (4, 7500, "365", "2026-05-23"), (5, 7500, "388", "2026-06-25"), (6, 7500, "429", "2026-07-28"), (7, 7500, "459", "2026-08-24"), (8, 7500, "481", "2026-09-21")],
    "301": [(0, 5500, "233", "2026-01-05"), (1, 5500, "264", "2026-02-06"), (2, 5500, "294", "2026-03-07"), (3, 5500, "315", "2026-04-06"), (4, 5500, "342", "2026-05-07"), (5, 5500, "381", "2026-06-08"), (6, 5500, "430", "2026-07-19"), (7, 5500, "434", "2026-08-05"), (8, 5500, "463", "2026-09-03"), (9, 5500, "495", "2026-10-01")],
    "302": [(1, 33000, "279", "2026-02-26")],
    "303": [(0, 9000, "236", "2026-01-06"), (1, 9000, "269", "2026-02-09"), (2, 9000, "288", "2026-03-04"), (3, 9000, "312", "2026-04-04"), (4, 7500, "346", "2026-05-10"), (5, 5500, "383", "2026-06-11"), (6, 7500, "412", "2026-07-09"), (7, 7500, "440", "2026-08-09"), (8, 7500, "467", "2026-09-05"), (9, 7500, "507", "2026-10-12")],
    "304": [(0, 5500, "234", "2026-01-06"), (1, 5500, "261", "2026-02-05"), (2, 5500, "293", "2026-03-07"), (3, 5500, "319", "2026-04-09"), (4, 5500, "344", "2026-05-07"), (5, 5500, "387", "2026-06-14"), (6, 5500, "413", "2026-07-10"), (7, 5500, "446", "2026-08-14"), (8, 5500, "482", "2026-09-21")],
    "401": [(0, 9500, "230", "2026-01-04"), (1, 9500, "257", "2026-02-05"), (2, 9500, "289", "2026-03-04"), (3, 9500, "318", "2026-04-04"), (4, 9500, "343", "2026-05-07"), (5, 9500, "372", "2026-06-03"), (6, 9500, "423", "2026-07-11"), (7, 9500, "433", "2026-08-01"), (8, 9500, "464", "2026-09-03"), (9, 9500, "489", "2026-10-01")],
    "402": [(0, 33000, "227", "2026-01-01"), (6, 33000, "418", "2026-07-02")],
    "403": [(5, 44500, "379", "2026-06-07")],
    "404": [(3, 50000, "325", "2026-04-11")],
    "501": [(4, 45000, "353", "2026-05-15")],
    "502": [(2, 16500, "266", "2026-03-31"), (5, 33000, "398", "2026-06-30"), (8, 16500, "486", "2026-09-30")],
    "503": [(4, 33500, "351", "2026-05-13")],
    "504": [(0, 5500, "228", "2026-01-05"), (1, 5500, "259", "2026-02-05"), (2, 5500, "290", "2026-03-06"), (3, 5500, "322", "2026-04-03"), (4, 5500, "360", "2026-05-08"), (5, 5500, "390", "2026-06-07"), (6, 5500, "419", "2026-07-10"), (7, 5500, "450", "2026-08-09"), (8, 5500, "471", "2026-09-07"), (9, 5500, "501", "2026-10-06")],
    "601": [(0, 5500, "258", "2026-01-26"), (1, 5500, "280", "2026-02-27"), (2, 5500, "304", "2026-03-28"), (3, 5500, "335", "2026-04-27"), (4, 5500, "366", "2026-05-26"), (5, 5500, "397", "2026-06-27"), (6, 5500, "428", "2026-07-21"), (7, 5500, "443", "2026-08-12"), (8, 5500, "479", "2026-09-12"), (9, 5500, "508", "2026-10-12")],
    "602": [(0, 5500, "243", "2026-01-15"), (1, 5500, "273", "2026-02-07"), (2, 5500, "298", "2026-03-11"), (3, 5500, "323", "2026-04-11"), (4, 5500, "362", "2026-05-13"), (5, 5500, "394", "2026-06-18"), (6, 5500, "420", "2026-07-02"), (7, 5500, "449", "2026-08-05"), (8, 5500, "470", "2026-09-05"), (9, 5500, "498", "2026-10-03")],
    "603": [(1, 18000, "267", "2026-02-08"), (9, 36000, "513", "2026-10-20")],
    "604": [(0, 5500, "260", "2026-01-29"), (1, 5500, "292", "2026-02-28"), (3, 5500, "317", "2026-04-08"), (4, 11000, "338/369", "2026-05-31"), (5, 5500, "399", "2026-06-30"), (7, 5500, "456", "2026-08-23"), (8, 5500, "484", "2026-09-28"), (9, 5500, "491", "2026-10-01")],
    "701": [(0, 5500, "244", "2026-01-11"), (2, 11000, "286", "2026-03-04"), (3, 5500, "313", "2026-04-06"), (5, 11000, "377", "2026-06-05"), (6, 5500, "400", "2026-06-30"), (8, 16500, "485", "2026-09-28")],
    "702": [(1, 21500, "268", "2026-02-08"), (2, 5500, "303", "2026-03-16"), (3, 5500, "324", "2026-04-12"), (4, 5500, "361", "2026-05-09"), (5, 5500, "395", "2026-06-20"), (6, 5500, "424", "2026-07-14"), (7, 5500, "451", "2026-08-13"), (8, 5500, "474", "2026-09-13"), (9, 5500, "503", "2026-10-24")],
    "703": [(0, 11000, "247", "2026-01-13"), (1, 11000, "271", "2026-02-12"), (2, 11000, "295", "2026-03-08"), (3, 11000, "320", "2026-04-10"), (4, 8000, "352", "2026-05-13"), (5, 9000, "376", "2026-06-05"), (6, 10000, "403", "2026-07-02"), (7, 9500, "441", "2026-08-10"), (8, 9500, "461", "2026-09-01"), (9, 9500, "492", "2026-10-03")],
    "704": [(0, 13000, "248/242", "2026-01-13"), (1, 5500, "275", "2026-02-16"), (2, 5500, "299", "2026-03-15"), (3, 5500, "332", "2026-04-14"), (4, 13000, "339/363", "2026-05-15"), (5, 5500, "393", "2026-06-14"), (6, 5500, "425", "2026-07-15"), (7, 5500, "452", "2026-08-16"), (8, 5500, "475", "2026-09-15"), (9, 5500, "502", "2026-10-06")],
    "801": [(1, 11000, "274", "2026-02-15"), (2, 5500, "296", "2026-03-07"), (3, 5500, "333", "2026-04-15"), (4, 5500, "356", "2026-05-16"), (5, 5500, "385", "2026-06-13"), (6, 5500, "427", "2026-07-19"), (7, 5500, "455", "2026-08-24"), (9, 11000, "497 & 509", "2026-10-17")],
    "802": [(0, 7500, "232", "2026-01-04"), (1, 7500, "270", "2026-02-12"), (2, 5500, "305", "2026-03-30"), (3, 5500, "326", "2026-04-14"), (4, 5500, "350", "2026-05-12"), (5, 5500, "382", "2026-06-11"), (6, 5500, "415", "2026-07-18"), (7, 5500, "438", "2026-08-09"), (8, 5500, "469", "2026-09-06"), (9, 5500, "496", "2026-10-09")],
    "803": [(0, 7000, "231", "2026-01-04"), (1, 7000, "256", "2026-02-04"), (2, 7000, "301", "2026-03-17"), (3, 7000, "310", "2026-04-04"), (4, 4000, "341", "2026-05-05"), (5, 5500, "371", "2026-06-01"), (6, 5500, "408", "2026-07-07"), (7, 5500, "439", "2026-08-09"), (9, 11000, "504", "2026-10-10")],
    "804": [(0, 5500, "224", "2026-01-01"), (1, 5500, "252", "2026-02-01"), (2, 5500, "283", "2026-03-01"), (3, 5500, "307", "2026-04-01"), (4, 5500, "337", "2026-05-01"), (5, 5500, "370", "2026-06-01"), (6, 5500, "404", "2026-07-02"), (7, 5500, "432", "2026-08-01"), (8, 5500, "460", "2026-09-01"), (9, 5500, "488", "2026-10-01")],
    "901": [(4, 28000, "358", "2026-05-17")],
    "902": [(0, 5500, "250", "2026-01-17"), (1, 5500, "278", "2026-02-26"), (3, 11000, "331", "2026-04-14"), (5, 11000, "391", "2026-06-09"), (6, 5500, "421", "2026-07-08"), (7, 5500, "447", "2026-08-03"), (8, 5500, "472", "2026-09-12"), (9, 5500, "500", "2026-10-06")],
    "903": [(0, 7000, "249", "2026-01-17"), (1, 7000, "277", "2026-02-26"), (3, 14000, "330", "2026-04-14"), (5, 9500, "392", "2026-06-09"), (6, 5500, "422", "2026-07-08"), (7, 5500, "448", "2026-08-03"), (8, 5500, "473", "2026-09-12"), (9, 5500, "499", "2026-10-06")],
    "904": [(0, 5500, "246", "2026-01-12"), (1, 5500, "276", "2026-02-17"), (2, 5500, "300", "2026-03-15"), (3, 5500, "328", "2026-04-16"), (4, 5500, "357", "2026-05-15"), (5, 5500, "384", "2026-06-12"), (6, 5500, "417", "2026-07-18"), (7, 5500, "454", "2026-08-17"), (8, 5500, "480", "2026-09-15"), (9, 5500, "511", "2026-10-20")],
    "1001": [(3, 12000, "309", "2026-04-04"), (8, 36000, "476, 477", "2026-09-27"), (9, 5500, "505", "2026-10-12")],
    "1002": [(0, 5500, "223", "2026-01-01"), (1, 5500, "253", "2026-02-01"), (2, 5500, "282", "2026-03-01"), (3, 5500, "306", "2026-04-01"), (4, 5500, "336", "2026-05-01"), (5, 5500, "386", "2026-06-09"), (6, 5500, "402", "2026-07-01"), (7, 5500, "431", "2026-08-01"), (8, 5500, "462", "2026-09-01"), (9, 5500, "487", "2026-10-01")],
    "1003": [(0, 9000, "238", "2026-01-08"), (1, 9000, "262", "2026-02-05"), (2, 9000, "291", "2026-03-06"), (3, 9000, "316", "2026-04-06"), (4, 9000, "340", "2026-05-05"), (5, 4500, "389", "2026-06-25"), (6, 7500, "426", "2026-07-19"), (7, 9500, "445", "2026-08-14"), (8, 9500, "466", "2026-09-05"), (9, 9500, "494", "2026-10-05")],
    "1004": [(0, 5500, "240", "2026-01-08"), (1, 5500, "272", "2026-02-12"), (2, 5500, "297", "2026-03-09"), (3, 5500, "321", "2026-04-11"), (4, 5500, "345", "2026-05-07"), (5, 5500, "378", "2026-06-07"), (6, 5500, "414", "2026-07-18"), (7, 5500, "444", "2026-08-13"), (8, 5500, "478", "2026-09-12"), (9, 5500, "510", "2026-10-17")],
}

OTHER_INFLOWS = [
    ("2026-01-20", 500000, "ad_revenue", "Dilshad", "advert_1", "Jan 2026", None, "Advertisement - Asif (A)"),
    ("2026-01-15", 50000, "other", "Dilshad", None, "Jan 2026", None, "Advertisement Utility Bill Collection"),
    ("2026-01-31", 27500, "other", "Dilshad", None, "Jan 2026", None, "Scrap Sale / AC"),
    ("2026-02-17", 500000, "ad_revenue", "Dilshad", "advert_1", "Feb 2026", None, "Advertisement - Asif (A)"),
    ("2026-02-16", 200000, "ad_revenue", "Dilshad", None, "Feb 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-03-16", 1000000, "ad_revenue", "Dilshad", "advert_1", "Mar 2026", None, "Advertisement - Asif (A)"),
    ("2026-03-16", 200000, "ad_revenue", "Dilshad", None, "Mar 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-04-09", 300000, "ad_revenue", "Dilshad", None, "Apr 2026", None, "Advertisement - Raza (B)"),
    ("2026-05-15", 60000, "maintenance", "Naveed", None, "May 2026", "355", "Maintenance Shop A"),
    ("2026-05-28", 8000, "other", "Naveed", "community_hall", "May 2026", "368", "Rent Community Hall"),
    ("2026-05-19", 600000, "ad_revenue", "Dilshad", "advert_1", "May 2026", None, "Advertisement - Asif (A)"),
    ("2026-05-20", 133500, "ad_revenue", "Dilshad", None, "May 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-05-20", 5000, "other", "Dilshad", None, "May 2026", None, "Scrap Sale / AC"),
    ("2026-05-20", -50000, "other", "Dilshad", None, "May 2026", None, "Advertisement Utility Bill Collection Adjustment"),
    ("2026-06-26", 8000, "other", "Naveed", "community_hall", "Jun 2026", "401", "Rent Community Hall"),
    ("2026-06-10", 700000, "ad_revenue", "Dilshad", "advert_1", "Jun 2026", None, "Advertisement - Asif (A)"),
    ("2026-06-18", 200000, "ad_revenue", "Dilshad", None, "Jun 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-06-18", 4000, "other", "Dilshad", None, "Jun 2026", None, "Scrap Sale / AC"),
    ("2026-07-28", 1100000, "ad_revenue", "Dilshad", "advert_1", "Jul 2026", None, "Advertisement - Asif (A)"),
    ("2026-07-31", 180000, "ad_revenue", "Dilshad", None, "Jul 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-08-25", 982000, "ad_revenue", "Dilshad", "advert_1", "Aug 2026", None, "Advertisement - Asif (A)"),
    ("2026-08-26", 133500, "ad_revenue", "Dilshad", None, "Aug 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-09-23", 600000, "ad_revenue", "Dilshad", "advert_1", "Sep 2026", None, "Advertisement - Asif (A)"),
    ("2026-09-24", 330000, "ad_revenue", "Dilshad", None, "Sep 2026", None, "Advertisement - Raza (B)"),
    ("2026-09-17", 135000, "ad_revenue", "Dilshad", None, "Sep 2026", None, "Advertisement - Shehryar (C)"),
    ("2026-10-20", 500000, "ad_revenue", "Dilshad", "advert_1", "Oct 2026", None, "Advertisement - Asif (A)"),
    ("2026-10-21", 250000, "ad_revenue", "Dilshad", None, "Oct 2026", None, "Advertisement - Raza (B)"),
    ("2026-10-16", 200000, "ad_revenue", "Dilshad", None, "Oct 2026", None, "Advertisement - Shehryar (C)"),
]


def seed_2026_baseline(db: Session) -> None:
    db.execute(text("CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR PRIMARY KEY, value VARCHAR)"))
    done = db.execute(text("SELECT value FROM app_settings WHERE key = 'baseline_2026_imported_v1'")).first()
    if done and done[0] == "true":
        return

    unit_to_occ = {
        u.unit_no: o.id
        for o, u in db.query(models.Occupant, models.Unit).join(models.Unit, models.Occupant.unit_id == models.Unit.id).all()
    }
    if not unit_to_occ:
        return  # Units/occupants not seeded yet

    naveed = db.query(models.User).filter(models.User.username == "naveed").first()
    naveed_id = naveed.id if naveed else None
    ec_sources = {s.code: (s.id, s.name) for s in db.query(models.ExtraCurricularSource).all()}

    db.query(models.Transaction).delete()
    db.query(models.FundsPositionEntry).delete()
    db.query(models.FundsInHandEntry).delete()
    db.query(models.OutstandingMaintenanceSnapshot).delete()

    fp_objs = []
    fih_objs = []
    for i, pdate in enumerate(MONTHS):
        fp_objs.append(models.FundsPositionEntry(period=pdate, section="opening_balance", label="Cash in Hand - Opening Balance", amount=OPENING[i]))
        fp_objs.append(models.FundsPositionEntry(period=pdate, section="closing_balance", label="Cash in Hand - Closing Balance", amount=CLOSING[i]))
        for label, vals in INFLOW_SUMMARY.items():
            fp_objs.append(models.FundsPositionEntry(period=pdate, section="inflow", label=label, amount=vals[i]))
        for label, vals in OUTFLOW_SUMMARY.items():
            fp_objs.append(models.FundsPositionEntry(period=pdate, section="outflow", label=label, amount=vals[i]))
        for holder, vals in FUNDS_IN_HAND.items():
            fih_objs.append(models.FundsInHandEntry(period=pdate, person=holder, amount=vals[i]))
    db.add_all(fp_objs)
    db.add_all(fih_objs)

    txn_objs = []
    for unit_no, recs in RESIDENT_RECEIPTS.items():
        occ_id = unit_to_occ.get(unit_no)
        if not occ_id:
            continue
        for m_idx, amt, rcpt_no, d_str in recs:
            dt = datetime.strptime(d_str, "%Y-%m-%d")
            txn_objs.append(models.Transaction(
                occupant_id=occ_id, date=dt, amount=amt,
                type=models.TransactionType.INFLOW, category=models.TransactionCategory.maintenance,
                receipt_no=rcpt_no, notes=f"Maintenance Apt {unit_no} ({MONTHS[m_idx].strftime('%b %Y')})",
                generated_by="naveed", created_at=dt, status=models.TransactionStatus.approved,
                submitted_by_user_id=naveed_id, approved_by_user_id=naveed_id, approved_at=dt,
                credited_to="Naveed", payment_mode="cash",
            ))

    for d_str, amt, cat, cred, src_code, plabel, rcpt, notes in OTHER_INFLOWS:
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        src_id, src_name = ec_sources[src_code] if src_code and src_code in ec_sources else (None, None)
        txn_objs.append(models.Transaction(
            date=dt, amount=amt, type=models.TransactionType.INFLOW,
            category=models.TransactionCategory(cat), receipt_no=rcpt, notes=notes,
            generated_by="naveed", created_at=dt, status=models.TransactionStatus.approved,
            submitted_by_user_id=naveed_id, approved_by_user_id=naveed_id, approved_at=dt,
            credited_to=cred, payment_mode="bank_transfer",
            extra_source_id=src_id, extra_source_name=src_name, period_label=plabel,
        ))

    for m_idx, pdate in enumerate(MONTHS):
        dt = datetime(pdate.year, pdate.month, 15)
        for cat_label, vals in OUTFLOW_SUMMARY.items():
            amt = vals[m_idx]
            if amt == 0:
                continue
            splits = []
            if cat_label == "Utilities - Kelectric":
                splits.append(("Naveed", amt, "KESC / Kelectric Bill"))
            elif cat_label == "Building Assets" and m_idx == 3:
                splits.append(("Naveed", amt, "Old equipments - Treadmill & Vacuum Cleaner"))
            elif cat_label == "Lift Work + Monthly Maintenance" and m_idx == 4:
                splits.append(("Dilshad", 12000, "Monthly Maintenance"))
                splits.append(("Ali", 197300, "Lift Rope/Button - Ali Expenses"))
            elif cat_label == "Lift Work + Monthly Maintenance" and m_idx == 6:
                splits.append(("Dilshad", 24000, "Lift Maintenance"))
                splits.append(("Ali", 32700, "Lift Maintenance - Ali"))
            elif cat_label == "Gym Expense" and m_idx == 6:
                splits.append(("Dilshad", 133000, "Gym Maintenance & Equipment"))
                splits.append(("Ali", 250000, "Gym Equipment - Ali"))
            else:
                splits.append(("Dilshad", amt, cat_label))
            for paid_by, s_amt, details in splits:
                txn_objs.append(models.Transaction(
                    date=dt, amount=s_amt, type=models.TransactionType.OUTFLOW,
                    category=models.TransactionCategory.expense,
                    expense_description=cat_label, expense_details=details,
                    notes=f"{cat_label} ({pdate.strftime('%b %Y')})",
                    generated_by="naveed", created_at=dt, status=models.TransactionStatus.approved,
                    submitted_by_user_id=naveed_id, approved_by_user_id=naveed_id, approved_at=dt,
                    credited_to=paid_by, payment_mode="cash",
                ))

    for d_str, amt, tfrom, tto, notes in [
        ("2026-04-15", 250000, "Asif", "Dilshad", "Funds Transfer between Union Members (Apr 2026)"),
        ("2026-05-15", 450000, "Ali", "Dilshad", "Funds Transfer between Union Members (May 2026)"),
        ("2026-07-15", 1000000, "Asif", "Dilshad", "Funds Transfer between Union Members (Jul 2026)"),
    ]:
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        txn_objs.append(models.Transaction(
            date=dt, amount=amt, type=models.TransactionType.TRANSFER,
            category=models.TransactionCategory.other, notes=notes,
            generated_by="naveed", created_at=dt, status=models.TransactionStatus.approved,
            submitted_by_user_id=naveed_id, approved_by_user_id=naveed_id, approved_at=dt,
            transfer_from=tfrom, credited_to=tto, payment_mode="bank_transfer",
        ))

    db.add_all(txn_objs)
    if done:
        db.execute(text("UPDATE app_settings SET value = 'true' WHERE key = 'baseline_2026_imported_v1'"))
    else:
        db.execute(text("INSERT INTO app_settings (key, value) VALUES ('baseline_2026_imported_v1', 'true')"))
    db.commit()
