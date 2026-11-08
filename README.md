# Anum Vista — Finance & Operations Portal
### Complete System Process Flow & User Guide

Anum Vista is an enterprise-grade financial management and residential operations portal engineered for building management, maintenance fee collections, parking allocations, treasury accounting, and multi-tier approval workflows.

---

## 1. System Architecture & Overview

- **Frontend:** Next.js (App Router, React 19, TypeScript, Tailwind CSS, TanStack React Query, Lucide Icons).
- **Backend:** Python FastAPI (REST API, Pydantic v2 schemas, JWT authentication, CORS middleware).
- **Database:** SQLAlchemy ORM with dual-engine support:
  - Local: SQLite (`backend/anum_vista.db`)
  - Production: Turso Cloud / libSQL (Serverless distributed database)
- **Deployment:** Vercel (Frontend) & Render (Backend).

---

## 2. User Roles & Permission Matrix

The system enforces strict role-based access control (RBAC):

| Feature / Action | Admin | Super Admin / Treasurer |
| :--- | :---: | :---: |
| **Login & Dashboard Overview** | Yes | Yes |
| **View Residents & Flat Directory** | Yes | Yes |
| **Log Maintenance Inflow (Collection)** | Submits as **Pending** | Direct **Auto-Approved** |
| **Log Outflow (Expense)** | Submits as **Pending** | Direct **Auto-Approved** |
| **Change Apartment Vacancy Status** | **No** (Read-only badge) | **Yes** (Interactive dropdown) |
| **Change Number of Cars** | **No** (Read-only view) | **Yes** (`+`/`–` Stepper & Save) |
| **Edit Resident Name & Identity** | **No** | **Yes** (Edit Modal) |
| **Add / Edit Tenant Details (Rental)** | **No** | **Yes** (Edit Modal) |
| **Approve / Reject Transactions** | **No** | **Yes** |
| **Cancel Approved Transactions** | **No** | **Yes** (With automatic balance rollback) |
| **Reports & Ledger Navigation** | **Hidden** | **Visible** |
| **Pending Dues Report** | **Blocked** (403 Forbidden) | **Yes** |
| **Advance Payments Report** | **Blocked** (403 Forbidden) | **Yes** |
| **Expenses Breakdown Report** | **Blocked** (403 Forbidden) | **Yes** |
| **Cash Reconciliation Report** | **Blocked** (403 Forbidden) | **Yes** |
| **Resident Ledger (Full History)** | **Blocked** (403 Forbidden) | **Yes** |
| **Treasury Cash Transfers** | **No** | **Yes** |
| **Audit Logs Viewing** | **No** | **Yes** |

---

## 3. End-to-End Process Flows & Use Cases

### Use Case 1: Resident & Tenant Management (`/tenants`)

Every flat has an owner/resident, and optionally tenant details if the apartment is rented.

1. **Viewing the Directory:**
   - Navigate to **Residents**.
   - Search by flat number (e.g. `101`), owner name, tenant name, or contact number.
   - Filter by status: `All`, `Overdue`, or `Settled`.
2. **Owner vs Tenant Representation:**
   - **Primary Name:** The Owner/Resident name is displayed in bold text.
   - **Secondary Tenant Details:** If marked as rented, a dedicated `Tenant` badge is displayed directly below in the same table cell showing the tenant's full name, phone number, and CNIC.
3. **Editing Resident & Tenant (Super Admin Only):**
   - Click the pencil icon next to the resident's name.
   - Update **Resident Name**, **Contact**, or **CNIC**.
   - Check **Rented to Tenant** if the unit is rented out.
   - Enter **Tenant Name**, **Tenant Phone / WhatsApp**, and **Tenant CNIC**.
   - Click **Save Changes**. The directory and database update immediately.
4. **Setting Vacancy Status:**
   - **Super Admin:** Select `Occupied` or `Vacant` from the dropdown in the table.
     - `Occupied`: Maintenance base fee is **₨ 5,500**.
     - `Vacant`: Maintenance base fee is **₨ 4,000**.
   - **Admin:** View-only badge (`Occupied` or `Vacant`). Cannot modify.

---

### Use Case 2: Maintenance Collection & Receipt Generation (`/tenants`)

Collecting monthly maintenance from a resident:

1. Click **Collect** next to the resident's row.
2. Choose the collection method:
   - **Sequential Month Selection:**
     - The modal automatically displays past unpaid months sequentially starting from the oldest overdue month.
     - Click months to select them in chronological order.
     - The total amount updates automatically based on the flat's monthly fee.
   - **Auto-Allocate Lump Sum:**
     - Switch to **Auto-Allocate Lump Sum** mode.
     - Enter the lump sum amount (e.g. `₨ 15,000`).
     - Click **Preview** to see how many months are covered and any remainder.
3. Select **Credited To** (the Treasurer in physical custody of the cash: *Naveed, Asif, Dilshad, Ali, Danish*).
4. Select **Payment Mode** (*Cash, Bank Transfer, Online*).
5. Add any optional notes and click **Confirm & Generate Receipt**.
6. **Execution Path:**
   - **Admin Submitting:** Receipt is generated with status `Pending Approval`. Notification is immediately sent to the designated Treasurer and Super Admins.
   - **Super Admin Submitting:** Receipt is `Approved` immediately. Treasury balance is credited, and occupant's `last_paid_month` advances.
7. **Receipt Printing:**
   - Click **Print Receipt** to open the standardized A5 voucher / thermal format with accurate generation timestamps, resident flat info, months covered, and QR/receipt validation.

---

### Use Case 3: Cars & Parking Management (`/car-maintenance`)

Manages parking bay allocations and extra car maintenance charges:

1. **Pricing Rule:**
   - **1st Car:** Included with base fee (₨ 5,500 occupied / ₨ 4,000 vacant).
   - **Additional Cars:** **₨ 2,000** per additional car per month.
   - Example: 2 cars in an occupied flat = `₨ 5,500 + ₨ 2,000 = ₨ 7,500/month`.
2. **Super Admin Controls:**
   - Use the `–` and `+` buttons to increment or decrement the vehicle count for any flat.
   - Click **Save** on the row to apply.
   - The occupant's total monthly maintenance fee is updated instantly across the entire portal.
3. **Admin View:**
   - Admin sees the exact vehicle count and breakdown in read-only mode without edit buttons.

---

### Use Case 4: Outflow & Expense Logging (`/transactions`)

Recording building expenses (utilities, janitorial, maintenance, security):

1. Navigate to **Transactions** (or Outflow tab).
2. Click **Record Expense**.
3. Select an existing **Expense Category** or enter a new custom description.
4. Enter the **Amount (PKR)** and **Date**.
5. Select **Paid From** (which treasurer disbursed the cash).
6. Upload bill voucher or receipt if applicable.
7. Click **Submit Expense**.
   - Admin submission creates a pending outflow requiring Super Admin approval.
   - Super Admin submission immediately deducts the amount from the treasurer's physical balance.

---

### Use Case 5: The Admin-to-Superadmin Approval Workflow

```
[ Admin User ]
      │
      ▼
Logs Maintenance Inflow OR Expense Outflow
      │
      ▼
System creates Transaction (status = "pending")
      │
      ├──────────────────────────────────────────────┐
      ▼                                              ▼
Bell Notification sent to                     Transaction appears in
Designated Treasurer & Super Admins           Transactions list ("Pending")
      │
      ▼
[ Super Admin / Treasurer Logs In ]
      │
      ├─── Options ───┐
      ▼               ▼
 [ APPROVE ]      [ REJECT ]
      │               │
      │               ├── Enter rejection reason
      │               ├── Status -> "rejected"
      │               └── Admin notified of rejection
      ▼
 Status -> "approved"
      ├── 1. Apply Treasury Effect (mutates FundsInHand balance)
      ├── 2. Advance Resident's last_paid_month (for maintenance)
      ├── 3. Create Audit Log entry
      └── 4. Mark notifications as read and notify submitter
```

#### Key Safeguards Built In:
- **Master Admin Override:** The master system administrators (`superadmin` and `anumvista`) can approve, reject, or cancel any transaction, even if credited to a specific treasurer name.
- **Atomic Balance Integrity:** Treasury balances are never touched while a transaction is in `pending` status.
- **Rollback Protection:** If an approved transaction is cancelled:
  1. The funds are reversed from the treasurer's custody balance.
  2. The occupant's `last_paid_month` rolls back to the previous approved payment.
  3. A full audit record is preserved with the cancellation reason.

---

### Use Case 6: Treasury & Cash Custody (`/treasury`)

Tracks physical cash custody across individual committee members:

1. **Funds in Hand Breakdown:**
   - Displays real-time cash balances held by each treasurer (*Naveed, Asif, Dilshad, Ali, Danish*).
2. **Inter-Treasurer Cash Transfers:**
   - Click **Transfer Funds**.
   - Select **From Treasurer** and **To Treasurer**.
   - Enter **Amount** and **Notes**.
   - The source treasurer's balance is debited and the recipient treasurer's balance is credited atomically.
3. **Balance Reconciliation:**
   - Displays total building cash in hand, bank balances, and total treasury reserves.

---

### Use Case 7: Reports & Resident Ledgers (Super Admin Only)

1. **Pending Dues Report (`/reports/pending-dues`):**
   - Ranks all apartments with overdue maintenance fees.
   - Shows monthly fee, months overdue, total outstanding amount, and last paid month.
2. **Advance Payments Report (`/reports/advance-payments`):**
   - Lists residents who have paid in advance for upcoming months.
   - Displays months ahead and covered period.
3. **Expense Breakdown Report (`/reports/expenses`):**
   - Categorized summary of all approved expenses for any selected month and year.
4. **Cash Reconciliation Report (`/reports/cash-reconciliation`):**
   - Audits physical custody against opening balance, collections, and disbursements for the month.
5. **Resident Ledger (`/ledger`):**
   - Comprehensive 12-month statement for any selected apartment.
   - Shows monthly expected fee, payment date, receipt number, mode, received by, and status (`Paid`, `Pending`, `Partial`, `Advance`).

---

## 4. Default Login Credentials

| Role | Username | Default Password | Notes |
| :--- | :--- | :--- | :--- |
| **Master Super Admin** | `superadmin` | `superadmin123` | Full portal access |
| **System Super Admin** | `anumvista` | `anumvista123` | Direct system authentication |
| **Treasurer / Super Admin** | `Naveed` | `naveed123` | Cash custody holder & approval authority |
| **Treasurer / Super Admin** | `Asif` | `asif123` | Cash custody holder & approval authority |
| **Treasurer / Super Admin** | `Dilshad` | `dilshad123` | Cash custody holder & approval authority |
| **Treasurer / Super Admin** | `Ali` | `ali123` | Cash custody holder & approval authority |
| **Treasurer / Super Admin** | `Danish` | `danish123` | Cash custody holder & approval authority |
| **Admin (Data Entry)** | `admin` | `admin123` | Restricted data entry operator |

*Note: Passwords can be updated at any time from user profile settings.*

---

## 5. Running the Application Locally

### Quick Start (Windows)
Double-click:
```bat
START_ANUM_VISTA.bat
```
This starts both the FastAPI backend (port `8000`) and the Next.js frontend (port `3000`).

To stop all servers:
```bat
STOP_ANUM_VISTA.bat
```

### Manual CLI Start
1. **Backend:**
   ```bash
   cd Anum-Vista-backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Frontend:**
   ```bash
   cd Anum-Vista-frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 6. Environment Variables Reference

### Backend (`Anum-Vista-backend/.env`):
```env
# Database (leave blank or sqlite for local, or provide Turso URL)
DATABASE_URL=sqlite:///./anum_vista.db
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<your-token>

# Security
SECRET_KEY=anum_vista_super_secret_jwt_key_2026
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

### Frontend (`Anum-Vista-frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```
*(In production, set to your Render backend URL, e.g. `https://anum-vista-backend.onrender.com/api`)*
