# IE Line Balance System

Sistem manajemen lini produksi sepatu berbasis web — upload standar IE, Yamazumi chart, monitoring aktual per jam, dan AI analisis bottleneck.

---

## Prerequisites

- Node.js 18+ (sudah diinstall ✓)
- PostgreSQL 14+ — install dari https://postgresql.org/download

---

## Setup (ikuti urutan ini)

### 1. Install PostgreSQL

**Windows:** Download installer dari https://postgresql.org/download/windows  
**Mac:** `brew install postgresql@16 && brew services start postgresql@16`  
**Ubuntu/Linux:** `sudo apt install postgresql && sudo systemctl start postgresql`

### 2. Buat database

Buka terminal PostgreSQL (psql) lalu:
```sql
CREATE DATABASE ie_line_balance;
CREATE USER ieuser WITH PASSWORD 'password123';
GRANT ALL PRIVILEGES ON DATABASE ie_line_balance TO ieuser;
```

### 3. Clone & install dependencies

```bash
# Extract folder ie-line-balance ke lokasi yang diinginkan
cd ie-line-balance

# Install semua dependencies
npm install
```

### 4. Setup environment

```bash
# Copy template environment
cp .env.example .env
```

Edit file `.env` dan sesuaikan:
```
DATABASE_URL="postgresql://ieuser:password123@localhost:5432/ie_line_balance"
NEXTAUTH_SECRET="isi-dengan-random-string-panjang"  # bisa generate: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."  # dari https://console.anthropic.com
```

### 5. Setup database schema

```bash
# Push schema ke database
npm run db:push

# Isi data awal (users, lines, model contoh U740)
npm run db:seed
```

### 6. Jalankan sistem

```bash
npm run dev
```

Buka browser: **http://localhost:3000**

---

## Default Login

| Role | Email | Password |
|------|-------|----------|
| IE Admin | ie.admin@factory.com | password123 |
| IE Operator | ie.operator@factory.com | password123 |
| Supervisor | prod.supervisor@factory.com | password123 |
| Operator | prod.operator@factory.com | password123 |
| Manager | manager@factory.com | password123 |

---

## Fitur Utama

- **Dashboard** — overview semua 34 line di 7 gedung dengan status real-time
- **Model library** — upload NB Standard Excel (.xlsx) langsung parse otomatis
- **Yamazumi chart** — visualisasi CT per operasi vs Takt Time per section
- **Input aktual** — output, MP hadir, downtime, defect per jam
- **Monitor** — LBR, LLER, PPH aktual vs standar
- **AI analisis** — rekomendasi bottleneck & redistribusi MP via Claude AI
- **Alert otomatis** — output rendah, downtime tinggi, defect rate tinggi

---

## Struktur Project

```
ie-line-balance/
├── app/
│   ├── (auth)/login/        # Halaman login
│   ├── (dashboard)/         # Semua halaman setelah login
│   │   ├── dashboard/       # Overview semua line
│   │   ├── models/          # Model library + upload Excel
│   │   ├── lines/[b]/[l]/   # Detail per line (Yamazumi, input, monitor, AI)
│   │   ├── input/           # Input aktual cepat
│   │   └── monitor/         # Monitor semua line
│   └── api/                 # Backend API routes
│       ├── auth/            # NextAuth
│       ├── models/          # CRUD model
│       ├── lines/           # Line management + assign
│       ├── actuals/         # Input data aktual
│       └── analytics/       # AI analisis
├── components/
│   └── layout/Sidebar.tsx   # Navigasi sidebar
├── lib/
│   ├── db.ts                # Prisma client
│   ├── auth.ts              # NextAuth config
│   └── utils.ts             # Helper functions
└── prisma/
    ├── schema.prisma        # Database schema
    └── seed.ts              # Data awal
```

---

## Perintah Berguna

```bash
npm run dev          # Jalankan development server
npm run build        # Build untuk production
npm run db:push      # Update schema ke database
npm run db:seed      # Isi ulang data awal
npm run db:studio    # Buka Prisma Studio (GUI database)
```

---

## Deployment (Production)

Untuk deploy ke server/VPS:

```bash
npm run build
npm start
```

Gunakan PM2 untuk process management:
```bash
npm install -g pm2
pm2 start npm --name "ie-lb" -- start
pm2 startup
pm2 save
```

---

## Tech Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, Recharts
- **Backend:** Next.js API Routes (Node.js)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (JWT)
- **AI:** Anthropic Claude API
- **Excel:** SheetJS (xlsx)
