import pandas as pd
from datetime import datetime, date
import os
from decimal import Decimal

# Import DB and models
try:
    from backend.database import engine, SessionLocal, Base
    from backend import models
    from backend.auth import hash_password
except ImportError:
    from database import engine, SessionLocal, Base
    import models
    from auth import hash_password

def clean_value(val):
    if pd.isna(val) or val == ' ' or str(val).strip() == '':
        return None
    return val

def clean_amount(val):
    if pd.isna(val) or val == ' ' or str(val).strip() == '':
        return Decimal('0')
    try:
        val_str = str(val).replace(',', '').strip()
        return Decimal(val_str)
    except Exception:
        return Decimal('0')

def parse_date_safe(val, fallback):
    if pd.isna(val) or not val:
        return fallback
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.to_pydatetime() if hasattr(val, 'to_pydatetime') else val
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day)
    try:
        dt = pd.to_datetime(val)
        return dt.to_pydatetime() if hasattr(dt, 'to_pydatetime') else dt
    except Exception:
        return fallback

def run_migration():
    print("Starting extended migration process from avfin.xlsx...")
    print("Dropping and recreating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    excel_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "avfin.xlsx"))
    if not os.path.exists(excel_path):
        print(f"Error: {excel_path} not found.")
        return

    db = SessionLocal()
    try:
        # 1. Seed Users
        users = [
            {"username": "admin", "email": "admin@anumvista.com", "password": "admin123", "role": models.UserRole.admin},
            {"username": "superadmin", "email": "superadmin@anumvista.com", "password": "superadmin123", "role": models.UserRole.super_admin},
            {"username": "anumvista", "email": None, "password": "anumvista123", "role": models.UserRole.super_admin},
        ]
        for u in users:
            db.add(models.User(
                username=u["username"],
                email=u["email"],
                hashed_password=hash_password(u["password"]),
                role=u["role"]
            ))
        db.commit()
        print("Seeded default users.")

        # 2. Ingest Funds Position (FP 2026, FP 2025)
        def _ingest_fp(sheet_name: str) -> None:
            df_fp = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            header_row_idx = None
            for i in range(min(25, len(df_fp))):
                if any(isinstance(x, (datetime, pd.Timestamp)) for x in df_fp.iloc[i].tolist()):
                    header_row_idx = i
                    break
            if header_row_idx is None:
                return

            header_row = df_fp.iloc[header_row_idx].tolist()
            month_cols: list[tuple[int, date]] = []
            for col_idx, val in enumerate(header_row):
                if isinstance(val, (datetime, pd.Timestamp)):
                    month_cols.append((col_idx, val.date().replace(day=1)))

            seen = set()
            filtered_month_cols: list[tuple[int, date]] = []
            for col_idx, period in month_cols:
                key = (period.year, period.month)
                if key not in seen:
                    seen.add(key)
                    filtered_month_cols.append((col_idx, period))

            section = None
            for r in range(header_row_idx + 1, len(df_fp)):
                row = df_fp.iloc[r]
                label = None
                for c in range(min(3, len(row))):
                    v = clean_value(row.iloc[c])
                    if v is not None:
                        s = str(v).strip()
                        if s and s.lower() not in {'nan', 'total'}:
                            label = s
                            break
                if not label:
                    continue

                lower = label.lower()
                if "cash in hand - opening balance" in lower:
                    section = "opening_balance"
                    entry_label = "Cash in Hand - Opening Balance"
                elif lower == "inflow":
                    section = "inflow"
                    continue
                elif lower == "outflow":
                    section = "outflow"
                    continue
                elif "cash in hand - closing balance" in lower:
                    section = "closing_balance"
                    entry_label = "Cash in Hand - Closing Balance"
                elif lower == "funds in hand":
                    section = "funds_in_hand"
                    continue
                else:
                    entry_label = label

                if section is None:
                    continue

                if section == "funds_in_hand":
                    person = label
                    for col_idx, period in filtered_month_cols:
                        v_col = col_idx + 2
                        amount = clean_amount(row.iloc[v_col]) if v_col < len(row) else Decimal("0")
                        db.add(
                            models.FundsInHandEntry(
                                period=period,
                                person=person,
                                amount=amount.quantize(Decimal("0.01")),
                            )
                        )
                else:
                    v_offset = 0 if section in ("inflow", "outflow") else 2
                    for col_idx, period in filtered_month_cols:
                        v_col = col_idx + v_offset
                        amount = clean_amount(row.iloc[v_col]) if v_col < len(row) else Decimal("0")
                        db.add(
                            models.FundsPositionEntry(
                                period=period,
                                section=section,
                                label=entry_label,
                                amount=amount.quantize(Decimal("0.01")),
                            )
                        )

        for fp_sheet in ["FP 2026", "FP 2025"]:
            try:
                _ingest_fp(fp_sheet)
                print(f"Ingested {fp_sheet}")
            except Exception as e:
                print(f"Error in {fp_sheet}: {e}")
        db.commit()

        # 3. Funds Breakup
        print("Parsing Funds Breakup...")
        df_funds = pd.read_excel(excel_path, sheet_name='Funds Breakup', nrows=20) 
        for index, row in df_funds.iterrows():
            particulars = clean_value(row.iloc[1]) 
            amount = clean_amount(row.iloc[2]) 
            if particulars and 'Opening' in str(particulars) and amount > 0:
                db.add(models.Transaction(
                    date=datetime(2024, 1, 1), 
                    amount=amount,
                    type=models.TransactionType.INFLOW,
                    category=models.TransactionCategory.other,
                    notes=str(particulars)
                ))
            elif particulars and 'Maintenance amount received' in str(particulars) and amount > 0:
                db.add(models.Transaction(
                    date=datetime(2024, 1, 1),
                    amount=amount,
                    type=models.TransactionType.INFLOW,
                    category=models.TransactionCategory.other,
                    notes=str(particulars)
                ))
        db.commit()

        # 4. Advertisement
        print("Parsing Advertisment...")
        df_adv = pd.read_excel(excel_path, sheet_name='Advertisment', skiprows=2)
        for index, row in df_adv.iterrows():
            duration = clean_value(row.iloc[1]) 
            name = clean_value(row.iloc[2]) 
            amount = clean_amount(row.iloc[3]) 
            if name and str(name).lower() != 'name' and str(name) != 'nan' and amount > 0:
                adv = db.query(models.Advertisement).filter(models.Advertisement.advertiser_name == str(name)).first()
                if not adv:
                    adv = models.Advertisement(advertiser_name=str(name), annual_fee=amount)
                    db.add(adv)
                    db.flush()
                db.add(models.Transaction(
                    date=datetime(2021, 6, 1), 
                    amount=amount,
                    type=models.TransactionType.INFLOW,
                    category=models.TransactionCategory.ad_revenue,
                    notes=f"{name} - {duration}" if duration else str(name)
                ))
        db.commit()

        # 5. Parse Recpt 2026
        print("Parsing Recpt 2026...")
        df_recpt = pd.read_excel(excel_path, sheet_name='Recpt 2026', skiprows=4, header=None)

        # Right side: Consolidated Outstanding Maintenance Position
        as_of_snapshot = date(2026, 1, 31)
        for _, row in df_recpt.iterrows():
            if len(row) <= 40:
                continue
            unit_raw = clean_value(row.iloc[34])
            if unit_raw is None:
                continue
            unit_str = str(unit_raw).strip()
            if not unit_str or unit_str.lower() in {"appartment no.", "appartment", "apartment"}:
                continue

            resident = clean_value(row.iloc[35])
            annual_raw = clean_value(row.iloc[36])
            dues_dec = clean_value(row.iloc[37])
            maint_till = clean_value(row.iloc[38])
            received_yr = clean_value(row.iloc[39])
            dues_till = clean_value(row.iloc[40]) if len(row) > 40 else None

            if resident is None or annual_raw is None:
                continue

            db.add(
                models.OutstandingMaintenanceSnapshot(
                    as_of=as_of_snapshot,
                    unit_no=unit_str,
                    resident_name=str(resident).strip(),
                    annual_maintenance=clean_amount(annual_raw).quantize(Decimal("0.01")),
                    dues_till_dec_31=clean_amount(dues_dec).quantize(Decimal("0.01")),
                    maintenance_till_period=clean_amount(maint_till).quantize(Decimal("0.01")),
                    received_during_year=clean_amount(received_yr).quantize(Decimal("0.01")),
                    dues_till_period=clean_amount(dues_till).quantize(Decimal("0.01")),
                )
            )

        # Left side: Receipts across all 10 month blocks
        month_group_cols = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]

        for index, row in df_recpt.iterrows():
            name = str(row.iloc[1]).strip() if clean_value(row.iloc[1]) else None
            unit_no = str(row.iloc[2]).strip() if clean_value(row.iloc[2]) else None
            if not name or name in {'nan', 'Particulars', 'Residents Name'} or not unit_no or unit_no in {'nan', 'Appartment No.', 'Appartment No'}:
                continue

            unit = db.query(models.Unit).filter(models.Unit.unit_no == unit_no).first()
            if not unit:
                unit = models.Unit(unit_no=unit_no, type=models.UnitType.residential)
                db.add(unit)
                db.flush()

            # Rule: unit 901 and 1001 are vacant (4000), others occupied (5500)
            is_vacant = unit_no in ('901', '1001')
            base_fee = Decimal("4000.00") if is_vacant else Decimal("5500.00")
            st = "vacant" if is_vacant else "occupied"

            occupant = db.query(models.Occupant).filter(
                models.Occupant.name == name, 
                models.Occupant.unit_id == unit.id
            ).first()
            if not occupant:
                occupant = models.Occupant(
                    name=name,
                    unit_id=unit.id,
                    monthly_maintenance_fee=base_fee,
                    status=st,
                    car_count=0 if is_vacant else 1,
                    extra_car_maintenance_fee=Decimal("2000.00")
                )
                db.add(occupant)
                db.flush()
            else:
                occupant.monthly_maintenance_fee = base_fee
                occupant.status = st
                db.add(occupant)

            for month_idx, start_col in enumerate(month_group_cols):
                if start_col >= len(row):
                    continue
                amount = clean_amount(row.iloc[start_col])
                receipt_no = clean_value(row.iloc[start_col+1]) if start_col + 1 < len(row) else None
                date_val = clean_value(row.iloc[start_col+2]) if start_col + 2 < len(row) else None

                if amount > 0:
                    fallback_dt = datetime(2026, month_idx + 1, 1)
                    parsed_date = parse_date_safe(date_val, fallback_dt)

                    txn = models.Transaction(
                        occupant_id=occupant.id,
                        receipt_no=str(receipt_no) if receipt_no else None,
                        date=parsed_date,
                        amount=amount,
                        type=models.TransactionType.INFLOW,
                        category=models.TransactionCategory.maintenance
                    )
                    db.add(txn)
                    
                    if not occupant.last_paid_month or parsed_date > occupant.last_paid_month:
                        occupant.last_paid_month = parsed_date
        db.commit()

        # 6. Historical Receipts (Recpt 2025)
        print("Parsing Recpt 2025...")
        try:
            df_2025 = pd.read_excel(excel_path, sheet_name="Recpt 2025", skiprows=4, header=None)
            start_cols = list(range(3, df_2025.shape[1], 3))

            for _, row in df_2025.iterrows():
                name = str(row.iloc[1]).strip() if clean_value(row.iloc[1]) else None
                unit_no = str(row.iloc[2]).strip() if clean_value(row.iloc[2]) else None
                if not name or name in {'nan', 'Particulars', 'Residents Name'} or not unit_no or unit_no in {'nan', 'Appartment No.', 'Appartment No'}:
                    continue

                unit = db.query(models.Unit).filter(models.Unit.unit_no == unit_no).first()
                if not unit:
                    unit = models.Unit(unit_no=unit_no, type=models.UnitType.residential)
                    db.add(unit)
                    db.flush()

                occupant = db.query(models.Occupant).filter(
                    models.Occupant.unit_id == unit.id
                ).first()
                if not occupant:
                    is_vacant = unit_no in ('901', '1001')
                    occupant = models.Occupant(
                        name=name,
                        unit_id=unit.id,
                        monthly_maintenance_fee=Decimal("4000.00") if is_vacant else Decimal("5500.00"),
                        status="vacant" if is_vacant else "occupied",
                        car_count=0 if is_vacant else 1,
                        extra_car_maintenance_fee=Decimal("2000.00")
                    )
                    db.add(occupant)
                    db.flush()

                for start_col in start_cols:
                    if start_col + 2 >= len(row):
                        continue
                    amount = clean_amount(row.iloc[start_col])
                    receipt_no = clean_value(row.iloc[start_col + 1])
                    date_val = clean_value(row.iloc[start_col + 2])
                    if amount <= 0:
                        continue
                    parsed_date = parse_date_safe(date_val, datetime(2025, 1, 1))

                    txn = models.Transaction(
                        occupant_id=occupant.id,
                        receipt_no=str(receipt_no) if receipt_no else None,
                        date=parsed_date,
                        amount=amount,
                        type=models.TransactionType.INFLOW,
                        category=models.TransactionCategory.maintenance
                    )
                    db.add(txn)
                    if not occupant.last_paid_month or parsed_date > occupant.last_paid_month:
                        occupant.last_paid_month = parsed_date
            db.commit()
        except Exception as e:
            print(f"Error in Recpt 2025: {e}")

        # 7. Parse Exp 2026 across ALL months (Jan to Sep)
        print("Parsing Exp 2026...")
        df_exp = pd.read_excel(excel_path, sheet_name='Exp 2026', skiprows=3, header=None)

        seen_desc: set[str] = set()
        for _, row in df_exp.iterrows():
            desc = clean_value(row.iloc[1])
            if desc:
                desc_str = str(desc).strip()
                if desc_str and desc_str.lower() not in {"discription", "description", "nan"}:
                    if desc_str not in seen_desc:
                        seen_desc.add(desc_str)
                        db.add(models.ExpenseDescription(description=desc_str))
        db.flush()

        exp_month_cols_0based = [
            (3, 4, datetime(2026, 1, 1)),
            (5, 6, datetime(2026, 2, 1)),
            (7, 8, datetime(2026, 3, 1)),
            (9, 10, datetime(2026, 4, 1)),
            (11, 12, datetime(2026, 5, 1)),
            (13, 14, datetime(2026, 6, 1)),
            (15, 16, datetime(2026, 7, 1)),
            (17, 18, datetime(2026, 8, 1)),
            (19, 20, datetime(2026, 9, 1)),
        ]

        for index, row in df_exp.iterrows():
            if index < 2:
                continue
            desc = clean_value(row.iloc[1])
            sub_name = clean_value(row.iloc[2]) if len(row) > 2 else None
            
            if desc and str(desc).lower() not in {'discription', 'description', 'nan', 'total', 'particulars'}:
                full_notes = f"{desc} - {sub_name}" if sub_name and str(sub_name).lower() != 'nan' else str(desc)
                
                for amt_col, dt_col, fallback_m in exp_month_cols_0based:
                    if amt_col >= len(row):
                        continue
                    amount = clean_amount(row.iloc[amt_col])
                    date_val = clean_value(row.iloc[dt_col]) if dt_col < len(row) else None
                    if amount > 0:
                        parsed_dt = parse_date_safe(date_val, fallback_m)
                        db.add(models.Transaction(
                            date=parsed_dt,
                            amount=amount,
                            type=models.TransactionType.OUTFLOW,
                            category=models.TransactionCategory.expense,
                            notes=full_notes,
                            expense_description=str(desc),
                        ))

            # Petty cash on right side (cols 23: part, 24: dt, 25: amt)
            if len(row) > 25:
                petty_desc = clean_value(row.iloc[23])
                petty_date_val = clean_value(row.iloc[24])
                petty_amount = clean_amount(row.iloc[25])
                if petty_desc and str(petty_desc).lower() not in {'particulors', 'particulars', 'nan'} and petty_amount > 0:
                    parsed_p_date = parse_date_safe(petty_date_val, datetime(2026, 1, 1))
                    db.add(models.Transaction(
                        date=parsed_p_date,
                        amount=petty_amount,
                        type=models.TransactionType.OUTFLOW,
                        category=models.TransactionCategory.expense,
                        notes=f"Petty: {petty_desc}",
                        expense_description=str(petty_desc),
                    ))
        db.commit()

        # 8. Historical Exp 2024 / Exp 2025
        for exp_sheet in ['Exp 2025', 'Exp 2024']:
            try:
                df_old_exp = pd.read_excel(excel_path, sheet_name=exp_sheet, skiprows=3)
                for _, row in df_old_exp.iterrows():
                    desc = clean_value(row.iloc[1])
                    if not desc or str(desc).lower() in {'discription', 'nan', 'total'}:
                        continue
                    amt = clean_amount(row.iloc[4])
                    dt_val = clean_value(row.iloc[5])
                    if amt > 0:
                        dt = parse_date_safe(dt_val, datetime(2025 if '2025' in exp_sheet else 2024, 1, 1))
                        db.add(models.Transaction(
                            date=dt,
                            amount=amt,
                            type=models.TransactionType.OUTFLOW,
                            category=models.TransactionCategory.expense,
                            notes=str(desc),
                            expense_description=str(desc),
                        ))
                db.commit()
                print(f"Ingested {exp_sheet}")
            except Exception as e:
                print(f"Note for {exp_sheet}: {e}")

        print("--- EXTENDED MIGRATION COMPLETED SUCCESSFULLY ---")
        print("Users:", db.query(models.User).count())
        print("Units:", db.query(models.Unit).count())
        print("Occupants:", db.query(models.Occupant).count())
        print("Transactions:", db.query(models.Transaction).count())
        print("FundsPosition:", db.query(models.FundsPositionEntry).count())
        print("FundsInHand:", db.query(models.FundsInHandEntry).count())
        print("Snapshots:", db.query(models.OutstandingMaintenanceSnapshot).count())

    except Exception as e:
        db.rollback()
        print(f"Migration Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
