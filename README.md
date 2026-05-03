# SATRIA — Sistem Akuntabilitas Internal Audit
### PT Transportasi Jakarta (TransJakarta)

> **S**istem **A**kuntabilitas for **T**ransJakarta **I**nternal **A**udit

Aplikasi manajemen audit internal berbasis web yang mengelola seluruh siklus pengawasan SPI (Satuan Pengawas Internal) PT Transportasi Jakarta — mulai dari perencanaan tahunan, pelaksanaan audit, pelaporan temuan, hingga pemantauan tindak lanjut.

---

## Daftar Isi

- [Arsitektur Sistem](#arsitektur-sistem)
- [Tech Stack](#tech-stack)
- [Struktur Direktori](#struktur-direktori)
- [Fitur Aplikasi](#fitur-aplikasi)
- [Manajemen Pengguna & Akses](#manajemen-pengguna--akses)
- [Database](#database)
- [Authentication & Security](#authentication--security)
- [Logging](#logging)
- [API Reference](#api-reference)
- [Instalasi & Menjalankan Aplikasi](#instalasi--menjalankan-aplikasi)
- [Environment Variables](#environment-variables)
- [Konvensi & Best Practices](#konvensi--best-practices)

---

## Arsitektur Sistem

```
┌────────────────────────────────────────────┐
│             Browser (React SPA)            │
│  Vite + React 18 + TypeScript + Tailwind   │
└─────────────────────┬──────────────────────┘
                      │ HTTPS / REST API
                      │ httpOnly Cookie (JWT)
┌─────────────────────▼──────────────────────┐
│          Backend (Express API)             │
│  Node.js + Express + TypeScript            │
│  Auth → Rate Limit → Route → Controller    │
└─────────────────────┬──────────────────────┘
                      │ pg (node-postgres)
┌─────────────────────▼──────────────────────┐
│        Database (PostgreSQL 15+)           │
│  1 Database — 6 Schema terpisah per modul  │
│  master | auth | pkpt | penugasan          │
│  audit  | pelaporan                        │
└────────────────────────────────────────────┘
```

**Pola komunikasi:**
- Frontend memanggil REST API melalui `axios` dengan `withCredentials: true`
- Token JWT dikirim via **httpOnly Cookie** (tidak bisa diakses JavaScript → aman dari XSS)
- Backend mem-validasi setiap request menggunakan middleware `authenticate` + `requireRole`

---

## Tech Stack

### Backend

| Teknologi | Versi | Kegunaan |
|-----------|-------|----------|
| Node.js | 20+ | Runtime |
| Express | 4.19 | HTTP framework |
| TypeScript | 5.4 | Type safety |
| `pg` (node-postgres) | 8.12 | Driver PostgreSQL |
| `jsonwebtoken` | 9.0 | JWT generation & verification |
| `bcryptjs` | 2.4 | Password hashing |
| `winston` | 3.13 | Structured logging |
| `winston-daily-rotate-file` | 4.7 | Log rotation harian |
| `morgan` | 1.10 | HTTP request logging |
| `multer` | 1.4 | File upload (Excel, PDF) |
| `xlsx` | 0.18 | Import/export data risiko |
| `express-validator` | 7.1 | Input validation |
| `uuid` | 10.0 | UUID generation |
| `dotenv` | 16.4 | Environment configuration |

### Frontend

| Teknologi | Versi | Kegunaan |
|-----------|-------|----------|
| React | 18.3 | UI framework |
| TypeScript | 5.4 | Type safety |
| Vite | 5.3 | Build tool & dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| React Router DOM | 6.24 | Client-side routing |
| TanStack Query | 5.45 | Server state management & caching |
| Zustand | 4.5 | Client state (auth store) |
| Axios | 1.7 | HTTP client |
| Lucide React | 0.395 | Icon library |
| `react-hot-toast` | 2.4 | Toast notifications |
| `date-fns` | 3.6 | Date manipulation |

### Database

| Teknologi | Versi | Kegunaan |
|-----------|-------|----------|
| PostgreSQL | 15+ | Database utama |
| `uuid-ossp` | built-in | UUID v4 generation |
| `pg_trgm` | built-in | Full-text search (ILIKE) |
| `pgcrypto` | built-in | bcrypt password hashing di DB |

---

## Struktur Direktori

```
satria_app/
├── backend/
│   ├── src/
│   │   ├── app.ts                   # Entry point — CORS, middleware, scheduler
│   │   ├── config/
│   │   │   └── database.ts          # Pool koneksi + withTransaction helper
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts   # Login, logout, me, change-password
│   │   │   ├── users.controller.ts  # CRUD user + module access
│   │   │   ├── activity-log.controller.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── settings.controller.ts
│   │   │   ├── organisasi.controller.ts
│   │   │   ├── module1/             # Modul 1: PKPT
│   │   │   │   ├── annual-plans.controller.ts
│   │   │   │   ├── risk.controller.ts
│   │   │   │   ├── auditors.controller.ts
│   │   │   │   ├── workload.controller.ts
│   │   │   │   ├── evaluation.controller.ts
│   │   │   │   ├── kalender-kerja.controller.ts
│   │   │   │   └── ceo-letter.controller.ts
│   │   │   └── module2/             # Modul 2: Penugasan Individual
│   │   │       └── penugasan.controller.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts   # authenticate, requireRole, JWT cookie
│   │   │   ├── morgan.middleware.ts # HTTP request logging
│   │   │   ├── rate-limit.middleware.ts  # In-memory rate limiter
│   │   │   └── upload.middleware.ts # Multer config (PDF upload)
│   │   ├── routes/
│   │   │   ├── index.ts             # Route aggregator
│   │   │   ├── auth.routes.ts
│   │   │   ├── admin.routes.ts
│   │   │   ├── module1.routes.ts
│   │   │   ├── penugasan.routes.ts  # Modul 2
│   │   │   ├── notifications.routes.ts
│   │   │   ├── organisasi.routes.ts
│   │   │   └── settings.routes.ts
│   │   ├── types/
│   │   │   └── index.ts             # Shared TypeScript types
│   │   └── utils/
│   │       ├── logger.ts            # Winston logger instance
│   │       ├── notifications.ts     # Helper createNotification + scheduler
│   │       └── validation.ts        # Parsing & sanitasi input
│   ├── logs/                        # Log files (auto-generated)
│   │   ├── error-YYYY-MM-DD.log
│   │   └── combined-YYYY-MM-DD.log
│   └── uploads/                     # File upload (CEO Letter PDF, dll)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Router + Route Guards
│   │   ├── main.tsx                 # React entry point
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Home dashboard
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── auth/Login.tsx
│   │   │   ├── admin/
│   │   │   │   ├── UserManagementPage.tsx
│   │   │   │   └── ActivityLogPage.tsx
│   │   │   ├── module1/PKPTPage.tsx          # Perencanaan Tahunan
│   │   │   ├── module2/PengawasanIndividualPage.tsx
│   │   │   ├── module3/PelaksanaanPage.tsx   # Coming Soon
│   │   │   ├── module4/PelaporanPage.tsx     # Coming Soon
│   │   │   ├── module5/SintesisPage.tsx      # Coming Soon
│   │   │   ├── module6/PemantauanPage.tsx
│   │   │   ├── module7/CACMPage.tsx
│   │   │   └── settings/PengaturanSistemPage.tsx
│   │   ├── services/
│   │   │   └── api.ts               # Axios instance + semua API calls
│   │   ├── store/
│   │   │   └── auth.store.ts        # Zustand auth store
│   │   ├── types/
│   │   │   └── index.ts             # Shared TypeScript types (frontend)
│   │   └── components/
│   │       ├── layout/              # Layout, Sidebar, Header, Breadcrumb
│   │       ├── shared/              # Komponen reusable (Table, Modal, dll)
│   │       ├── ui/                  # Atom UI (Button, Badge, Input, dll)
│   │       └── notifications/       # Notification panel & bell
│   └── index.html
│
└── database/
    ├── schema/                      # DDL scripts (urut 00–05)
    │   ├── 00_setup.sql             # Buat database, schema, extensions
    │   ├── 01_master.sql            # Direktorat, divisi, departemen
    │   ├── 02_auth.sql              # Users, roles, permissions, activity_log
    │   ├── 03_pkpt.sql              # Modul 1: PKPT
    │   ├── 04_operasional.sql       # Modul 2: Penugasan
    │   └── 05_pelaporan.sql         # Notifikasi, temuan
    ├── migrations/                  # Patch migration scripts
    ├── seeds/                       # Data awal
    └── erd_description.md
```

---

## Fitur Aplikasi

### Dashboard Utama
- Greeting real-time dengan jam WIB
- Statistik eksekutif (total program, selesai, risiko, auditor) — khusus `kepala_spi` dan `admin_spi`
- Grid modul navigasi dengan akses control berbasis role dan module_access
- Status sistem aktif

---

### Modul 1 — Perencanaan Pengawasan Tahunan (PKPT)

**Lokasi:** `/perencanaan/pkpt`

| Sub-fitur | Deskripsi |
|-----------|-----------|
| **Data Risiko (RCSA)** | CRUD risiko manual, import dari Excel template, tampil level inherent/target/realisasi |
| **Program Kerja Tahunan** | Buat, edit, finalisasi, dan hapus (soft-delete + trash recovery) program PKPT |
| **Status PKPT** | Flow `Open → On Progress → Closed` |
| **Workload Auditor** | Kalkulasi beban kerja + simulasi redistribusi tim |
| **Kalender Kerja** | Pengaturan hari kerja efektif per periode (lock/unlock) |
| **Surat Arahan Direksi** | Upload PDF Surat CEO, multi-target area pengawasan |
| **Penilaian Auditor** | Evaluasi kinerja anggota tim setelah penugasan |
| **Notifikasi Deadline** | Scheduler otomatis (setiap 6 jam) kirim notifikasi jika deadline program mendekat |

---

### Modul 2 — Perencanaan Pengawasan Individual

**Lokasi:** `/perencanaan/individual`

Program kerja audit per penugasan, terhubung ke PKPT yang sudah dibuat.

| Sub-fitur | Deskripsi |
|-----------|-----------|
| **Daftar Program** | List semua program individual yang terasosiasi dengan PKPT |
| **Tab Perencanaan** | Kegiatan fase perencanaan (tambah/edit/hapus via modal) |
| **Tab Pelaksanaan** | Kegiatan fase pelaksanaan — Tujuan → Risiko → Prosedur → Rincian (tree hierarchy) |
| **Tab Pelaporan** | Kegiatan fase pelaporan |
| **Tim & Auditee** | Tim audit dan auditee diambil otomatis dari data PKPT Modul 1 |
| **Tracking MD** | Estimasi hari, Man-Days, dan deadline per kegiatan; auto-sum di footer |

Hierarki data Tab Pelaksanaan:
```
Program
└── Tujuan Audit
    └── Risiko yang Diidentifikasi
        └── Prosedur Pengujian
            └── Rincian Langkah Kerja
```

---

### Modul 3 — Pelaksanaan Audit & Kertas Kerja *(Coming Soon)*
**Lokasi:** `/pelaksanaan`

Mengelola Kertas Kerja Audit (KKA) langsung di sistem tanpa dokumen terpisah.

---

### Modul 4 — Pelaporan & Komunikasi Hasil *(Coming Soon)*
**Lokasi:** `/pelaporan`

Penyusunan laporan hasil audit dan komunikasi digital ke auditee.

---

### Modul 5 — Sintesis Hasil Pengawasan *(Coming Soon)*
**Lokasi:** `/sintesis`

Konsolidasi seluruh hasil audit lintas unit dan periode.

---

### Modul 6 — Pemantauan Tindak Lanjut Temuan
**Lokasi:** `/pemantauan`

Monitoring status tindak lanjut temuan audit hingga selesai dengan bukti tervalidasi.

---

### Modul 7 — Dashboard CA-CM
**Lokasi:** `/ca-cm`

Dashboard Continuous Auditing – Continuous Monitoring untuk memantau siklus operasional swakelola.

---

### Admin Panel

| Fitur | Akses |
|-------|-------|
| **User Management** | `admin_spi`, `it_admin` |
| **Activity Log** | `admin_spi`, `it_admin`, `kepala_spi` |
| **Pengaturan Sistem** | `kepala_spi`, `admin_spi` |

---

### Notifikasi
- Bell icon di header dengan badge counter unread
- Notifikasi tipe: `Risk`, `Program`, `System`, `Evaluation`
- Notifikasi otomatis saat: user baru dibuat, deadline mendekat, evaluasi pending

---

## Manajemen Pengguna & Akses

### Role yang Tersedia

| Role | Nama | Akses Utama |
|------|------|-------------|
| `kepala_spi` | Kepala SPI | Full akses semua modul audit, approve, finalisasi |
| `admin_spi` | Administrator SPI | Full akses + kelola user + activity log |
| `pengendali_teknis` | Pengendali Teknis | PKPT, penugasan, KKA, pelaporan |
| `anggota_tim` | Anggota Tim Audit | View + isi KKA, lihat penugasan |
| `auditee` | Auditee | Lihat & balas temuan |
| `it_admin` | Admin IT | Hanya user management + activity log (tidak bisa akses modul audit) |

### Module Access Control

Selain role, setiap user memiliki `module_access: string[]` yang menentukan modul mana yang dapat diakses:

```
'pkpt' | 'individual' | 'pelaksanaan' | 'pelaporan' | 'sintesis' | 'pemantauan' | 'ca-cm'
```

- `kepala_spi` dan `admin_spi` selalu bisa melihat semua modul aktif (bypass module_access)
- Role lain (pengendali_teknis, anggota_tim) hanya bisa akses modul yang ada di `module_access`-nya
- `it_admin` tidak bisa akses modul audit sama sekali

### Default Password

Format: `{3 digit terakhir NIP}_{nama belakang lowercase}`

Contoh: NIP `123456`, nama `Budi Santoso` → password: `456_santoso`

Fungsi PostgreSQL: `auth.default_password(p_nik, p_nama_lengkap)`

---

## Database

### Arsitektur: 1 Database + 6 Schema

```
DATABASE: satria
├── schema: master      → direktorat, divisi, departemen, konfigurasi aplikasi
├── schema: auth        → users, permissions, role_permissions, activity_log
├── schema: pkpt        → risk_data, annual_audit_plans, anggota tim, anggaran
├── schema: penugasan   → audit_programs, fase_items, tujuan, risiko, prosedur, rincian
├── schema: audit       → KKA, evidence (Modul 3 — in development)
└── schema: pelaporan   → notifications, temuan, tindak lanjut (Modul 4+)
```

**Keuntungan multi-schema:**
- JOIN lintas modul tetap bisa (satu connection pool)
- Transaksi ACID lintas modul
- Backup satu perintah: `pg_dump satria`
- Isolasi logik per modul terjaga
- Permission granular per schema

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID v4
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- ILIKE / fulltext search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- bcrypt hashing
```

### Tabel Utama

```
auth.users                   — Akun pengguna + role + module_access
auth.permissions             — Daftar permission granular
auth.role_permissions        — Mapping role → permission
auth.activity_log            — Audit trail semua aksi penting

master.direktorat            — Struktur organisasi level 1
master.divisi                — Struktur organisasi level 2
master.departemen            — Struktur organisasi level 3

pkpt.risk_data               — Data risiko (RCSA)
pkpt.annual_audit_plans      — Program Kerja Pengawasan Tahunan
pkpt.annual_plan_members     — Anggota tim per PKPT

penugasan.audit_programs     — Program individual (terhubung ke PKPT)
penugasan.fase_items         — Kegiatan per fase (perencanaan/pelaksanaan/pelaporan)
penugasan.audit_tujuan       — Tujuan audit
penugasan.audit_risiko       — Risiko yang diidentifikasi
penugasan.audit_prosedur     — Prosedur pengujian
penugasan.audit_rincian      — Rincian langkah kerja

pelaporan.notifications      — Notifikasi sistem
```

### Soft Delete Pattern

Semua tabel kritikal menggunakan soft-delete via kolom `deleted_at TIMESTAMPTZ`:

```sql
-- Record "dihapus" hanya dengan mengisi deleted_at
UPDATE tabel SET deleted_at = NOW() WHERE id = $1;

-- Query aktif selalu filter: WHERE deleted_at IS NULL
SELECT * FROM tabel WHERE deleted_at IS NULL;

-- Partial unique index (bukan UNIQUE constraint biasa)
-- Memastikan uniqueness hanya di antara record aktif
CREATE UNIQUE INDEX uq_users_nik_active
    ON auth.users(nik)
    WHERE deleted_at IS NULL;
```

> **Penting:** Jangan gunakan `UNIQUE constraint` biasa pada kolom yang tabelnya pakai soft-delete. Gunakan `partial unique index WHERE deleted_at IS NULL` agar row yang sudah di-soft-delete tidak menghambat pembuatan ulang record baru dengan nilai yang sama.

### Migrasi Database

Schema awal (berurutan):
```bash
psql -d satria -f database/schema/00_setup.sql   # Setup + extensions
psql -d satria -f database/schema/01_master.sql  # Master data
psql -d satria -f database/schema/02_auth.sql    # Auth + default users
psql -d satria -f database/schema/03_pkpt.sql    # Modul 1
psql -d satria -f database/schema/04_operasional.sql  # Modul 2
psql -d satria -f database/schema/05_pelaporan.sql    # Notifikasi
```

Patch migration (incremental):
```bash
psql -d satria -f database/migrations/2026-XX-XX_nama_patch.sql
```

### Slow Query Monitoring

Query yang memakan waktu > 500ms akan tercatat otomatis:
```
[DB SLOW] 523ms — SELECT * FROM pkpt.risk_data WHERE ...
```

---

## Authentication & Security

### Alur Autentikasi

```
1. User POST /api/auth/login (NIK + password)
2. Backend verifikasi bcrypt hash
3. Jika valid → generate JWT → set httpOnly Cookie satria_session
4. Frontend simpan user profile di sessionStorage (bukan localStorage)
5. Setiap request selanjutnya → browser kirim cookie otomatis
6. Backend middleware authenticate() verifikasi JWT dari cookie
7. Logout → clearCookie() di server + hapus sessionStorage
```

### JWT Cookie

```typescript
res.cookie('satria_session', token, {
  httpOnly: true,    // Tidak bisa diakses JavaScript → aman dari XSS
  secure:   true,    // HTTPS only di production
  sameSite: 'lax',   // Proteksi CSRF
  maxAge:   86400000 // 24 jam (default)
});
```

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/login` | 5 request | 15 menit per IP |
| Semua `/api/*` | 200 request | 1 menit per IP |

Response saat limit tercapai:
```json
{ "success": false, "message": "Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit." }
```
Header: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### CORS

```
Allowed origins: dari env CORS_ORIGIN (pisah koma untuk multi-origin)
Default dev:     http://localhost:5173
Production:      wajib set CORS_ORIGIN
null origin:     ditolak di production, diizinkan di development
```

### Role-Based Access Control (RBAC)

```typescript
// Di route: cukup satu baris
router.post('/risks', authenticate, requireRole('kepala_spi', 'admin_spi'), createRisk);

// Di middleware requireRole:
if (!roles.includes(req.user.role)) {
  return res.status(403).json({ message: 'Akses ditolak.' });
}
```

### Upload Security

File upload dibatasi:
- Excel (import risiko): maksimal **5 MB**, hanya `.xlsx` / `.xls`
- PDF (CEO Letter): maksimal **10 MB**, hanya `application/pdf`
- Double validation: ekstensi file + MIME type

### Request Body Limit

```typescript
app.use(express.json({ limit: '1mb' }));         // Cegah JSON DoS
app.use(express.urlencoded({ limit: '1mb' }));
```

### Activity Log

Setiap aksi penting tercatat di `auth.activity_log`:
```
user_id | action | modul | entity_id | ip_address | user_agent | payload | created_at
```

---

## Logging

Sistem menggunakan **Winston** dengan **daily log rotation**.

### Level Log

| Level | Kode | Digunakan untuk |
|-------|------|-----------------|
| `error` | 0 | Error tak tertangani, DB failure, startup error |
| `warn` | 1 | Slow query, konfigurasi mencurigakan |
| `info` | 2 | Server start, DB connect, scheduler tick |
| `http` | 3 | HTTP request log (via Morgan) |
| `debug` | 4 | Detail query, development only |

Level aktif dikontrol via env: `LOG_LEVEL=debug` (default)

### Output Log

| Transport | Lokasi | Isi |
|-----------|--------|-----|
| Console | Terminal | Semua level, colorized |
| File error | `backend/logs/error-YYYY-MM-DD.log` | Hanya `error` level, JSON |
| File combined | `backend/logs/combined-YYYY-MM-DD.log` | Semua level, JSON |

### Format Log File (JSON)

```json
{
  "timestamp": "2026-05-03 09:15:32:123",
  "level": "error",
  "message": "[DB] Connection failed",
  "stack": "Error: connect ECONNREFUSED..."
}
```

### Rotasi Log

- Pola nama file: `error-YYYY-MM-DD.log`
- Ukuran maksimal per file: **10 MB** (auto split)
- Retensi: sesuai konfigurasi server (tidak ada auto-delete default)

### HTTP Request Logging (Morgan)

Setiap HTTP request tercatat via Morgan middleware:
```
2026-05-03 09:15:32 | http | POST /api/auth/login 200 45ms
```

### Contoh Penggunaan Logger di Code

```typescript
import logger from '../utils/logger';

// Info
logger.info('✅ Database connected successfully');

// Error dengan metadata
logger.error('[SCHEDULER] scan failed', { message: err.message });

// Debug (hanya tampil di development)
logger.debug(`Environment: ${process.env.NODE_ENV}`);

// Slow query warning (otomatis dari database.ts)
// [DB SLOW] 523ms — SELECT * FROM pkpt.risk_data ...
```

---

## API Reference

Base URL: `http://localhost:5000/api`

### Auth

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| `POST` | `/auth/login` | ❌ | Login dengan NIK + password |
| `POST` | `/auth/logout` | ❌ | Hapus session cookie |
| `GET` | `/auth/me` | ✅ | Ambil data user yang sedang login |
| `PUT` | `/auth/change-password` | ✅ | Ganti password |
| `POST` | `/auth/reset-password` | ✅ | Reset ke password default |

### User Management

| Method | Endpoint | Role | Deskripsi |
|--------|----------|------|-----------|
| `GET` | `/users` | admin | List semua user |
| `POST` | `/users` | admin | Buat user baru |
| `PUT` | `/users/:id` | admin | Update user |
| `DELETE` | `/users/:id` | admin | Hapus user |
| `PATCH` | `/users/:id/module-access` | admin | Update akses modul |

### Modul 1 — PKPT

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/risks` | List data risiko |
| `POST` | `/risks` | Tambah risiko manual |
| `PATCH` | `/risks/:id` | Update risiko |
| `DELETE` | `/risks/:id` | Hapus risiko |
| `GET` | `/risks/template` | Download template Excel |
| `POST` | `/risks/import` | Import risiko dari Excel |
| `GET` | `/annual-plans` | List program PKPT |
| `POST` | `/annual-plans` | Buat program PKPT |
| `PATCH` | `/annual-plans/:id` | Edit program |
| `DELETE` | `/annual-plans/:id` | Soft-delete program |
| `PATCH` | `/annual-plans/:id/restore` | Pulihkan dari trash |
| `PATCH` | `/annual-plans/:id/finalize` | Finalisasi PKPT |
| `GET` | `/workload` | Data beban kerja auditor |
| `GET` | `/kalender-kerja` | Data kalender kerja |
| `GET` | `/ceo-letter` | Data surat CEO |
| `GET` | `/evaluations/summary` | Rekap evaluasi auditor |
| `GET` | `/dashboard/stats` | Statistik dashboard |

### Modul 2 — Penugasan Individual

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/penugasan` | List program individual |
| `POST` | `/penugasan` | Buat program individual |
| `GET` | `/penugasan/:id` | Detail program |
| `PATCH` | `/penugasan/:id` | Edit program |
| `DELETE` | `/penugasan/:id` | Soft-delete program |
| `POST` | `/penugasan/:id/fase-items` | Tambah kegiatan fase |
| `PATCH` | `/penugasan/fase-items/:itemId` | Edit kegiatan |
| `DELETE` | `/penugasan/fase-items/:itemId` | Hapus kegiatan |
| `POST` | `/penugasan/:id/tujuan` | Tambah tujuan |
| `POST` | `/penugasan/tujuan/:id/risiko` | Tambah risiko |
| `POST` | `/penugasan/risiko/:id/prosedur` | Tambah prosedur |
| `POST` | `/penugasan/prosedur/:id/rincian` | Tambah rincian |

### Notifikasi

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/notifications` | List notifikasi user |
| `PATCH` | `/notifications/:id/read` | Tandai sudah dibaca |
| `PATCH` | `/notifications/read-all` | Tandai semua dibaca |

### Health Check

```
GET /health
→ { "status": "ok", "app": "SATRIA API", "time": "..." }
```

### Format Response API

Semua response mengikuti format:
```json
{
  "success": true,
  "message": "Deskripsi hasil operasi",
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

## Instalasi & Menjalankan Aplikasi

### Prasyarat

- Node.js 20+
- PostgreSQL 15+
- npm / yarn

### 1. Setup Database

```bash
# Buat database
psql -U postgres -c "CREATE DATABASE satria ENCODING 'UTF8' TEMPLATE template0;"

# Jalankan schema berurutan
psql -U postgres -d satria -f database/schema/00_setup.sql
psql -U postgres -d satria -f database/schema/01_master.sql
psql -U postgres -d satria -f database/schema/02_auth.sql
psql -U postgres -d satria -f database/schema/03_pkpt.sql
psql -U postgres -d satria -f database/schema/04_operasional.sql
psql -U postgres -d satria -f database/schema/05_pelaporan.sql
```

### 2. Backend

```bash
cd backend

# Install dependencies
npm install

# Buat file .env (lihat bagian Environment Variables)
cp .env.example .env

# Jalankan development server
npm run dev

# Build untuk production
npm run build
npm start
```

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Jalankan dev server
npm run dev

# Build production
npm run build
npm run preview
```

### 4. Akun Default

Setelah menjalankan schema, akun berikut sudah tersedia:

| NIK | Email | Role | Password Default |
|-----|-------|------|-----------------|
| `000001` | it.admin@satria.app | `it_admin` | `001_it` |
| `000002` | admin.spi@satria.app | `admin_spi` | `002_spi` |

---

## Environment Variables

### Backend (`.env`)

```env
# ── Server ───────────────────────────────────────────────────────
NODE_ENV=development          # development | production
PORT=5000

# ── Database ─────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=satria
DB_USER=postgres
DB_PASSWORD=your_password

# ── Auth ─────────────────────────────────────────────────────────
JWT_SECRET=ganti_dengan_secret_yang_kuat_min_32_karakter
JWT_EXPIRES_IN=24h            # Format: 1h | 24h | 7d

# ── CORS ─────────────────────────────────────────────────────────
CORS_ORIGIN=http://localhost:5173  # Pisah koma untuk multi-origin

# ── Logging ──────────────────────────────────────────────────────
LOG_LEVEL=debug               # error | warn | info | http | debug
```

> ⚠️ **Production:** Pastikan `JWT_SECRET` diganti — aplikasi akan **crash** jika menggunakan nilai default di mode production.

> ⚠️ **Production:** Variabel `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, dan `CORS_ORIGIN` **wajib** di-set — aplikasi akan exit jika salah satu kosong.

---

## Konvensi & Best Practices

### Struktur Controller

```typescript
// Pattern: validate → query → respond
export async function createThing(req: Request, res: Response) {
  try {
    const { nama } = req.body;
    if (!nama?.trim()) {
      return res.status(400).json({ success: false, message: 'Nama wajib diisi.' });
    }

    const result = await query(
      'INSERT INTO schema.table (nama) VALUES ($1) RETURNING *',
      [nama.trim()]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error(`[createThing] ${(err as Error).message}`);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan data.' });
  }
}
```

### Transaksi Database

Gunakan `withTransaction` untuk operasi multi-tabel yang harus atomic:

```typescript
import { withTransaction } from '../../config/database';

const result = await withTransaction(async (client) => {
  const program = await client.query('INSERT INTO ... RETURNING id');
  await client.query('INSERT INTO ... VALUES ($1)', [program.rows[0].id]);
  return program.rows[0];
});
// Jika salah satu query gagal → otomatis ROLLBACK
```

### Soft Delete

```typescript
// Hapus: set deleted_at, jangan DELETE FROM
await query('UPDATE table SET deleted_at = NOW() WHERE id = $1', [id]);

// Query aktif: selalu tambahkan WHERE deleted_at IS NULL
await query('SELECT * FROM table WHERE deleted_at IS NULL');

// Index: gunakan partial unique index (bukan UNIQUE constraint)
// CREATE UNIQUE INDEX ... WHERE (deleted_at IS NULL);
```

### Frontend — State Management

| State | Storage | Alasan |
|-------|---------|--------|
| JWT Token | httpOnly Cookie | XSS-safe, otomatis dikirim browser |
| User profile | `sessionStorage` | Dibersihkan saat tab tutup, tidak di-share antar tab |
| Server data | TanStack Query | Auto-refetch, caching, loading/error state |
| UI state lokal | `useState` | Modal open/close, form values |

### Frontend — Data Fetching Pattern

```typescript
// Gunakan TanStack Query untuk server state
const { data, isLoading, refetch } = useQuery({
  queryKey: ['programs', programId],
  queryFn: () => api.getProgram(programId),
  staleTime: 30_000,   // Cache 30 detik
});

// Mutasi
const { mutate, isPending } = useMutation({
  mutationFn: api.createFaseItem,
  onSuccess: () => { toast.success('Berhasil!'); refetch(); },
  onError:   (err) => toast.error(err.message),
});
```

### Penomoran Migrasi

File migrasi menggunakan format tanggal:
```
YYYY-MM-DD_deskripsi_singkat.sql
```
Contoh: `2026-05-01_risk_level_guideline.sql`

Setiap file migrasi harus **idempoten** (bisa dijalankan ulang tanpa error):
```sql
ALTER TABLE pkpt.risk_data
    ADD COLUMN IF NOT EXISTS level_inherent VARCHAR(5);
```

---

## Troubleshooting

### Backend tidak bisa start
```
[STARTUP] Missing required env vars: JWT_SECRET
```
→ Buat file `.env` dan isi `JWT_SECRET`

### Database connection refused
```
❌ Database connection failed: connect ECONNREFUSED 127.0.0.1:5432
```
→ Pastikan PostgreSQL service berjalan dan kredensial DB benar

### CORS error di browser
```
CORS: origin http://localhost:3000 tidak diizinkan
```
→ Tambahkan origin ke `CORS_ORIGIN` di `.env`: `CORS_ORIGIN=http://localhost:5173,http://localhost:3000`

### Token expired saat request
```json
{ "code": "TOKEN_EXPIRED", "message": "Sesi telah kedaluwarsa." }
```
→ Frontend harus redirect ke `/login` — sudah ditangani di Axios interceptor `api.ts`

### Unique constraint saat re-create setelah soft-delete
→ Pastikan constraint menggunakan **partial unique index** `WHERE deleted_at IS NULL`, bukan `UNIQUE constraint` biasa. Lihat bagian [Soft Delete Pattern](#soft-delete-pattern).

---

*SATRIA Internal Audit System — PT Transportasi Jakarta*
*Dikembangkan oleh Tim IT SPI TransJakarta*
