# forgesys

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://openjdk.org/projects/jdk/21/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1.0-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org)
[![Version](https://img.shields.io/badge/version-0.2.1-lightgrey.svg)]()

**Modüler çok-kiracılı (multi-tenant) SaaS platformu.** Şirketler (tenant) kayıt olur, kendi ekiplerini yönetir ve ihtiyaç duydukları **modülleri** açar (Tasks, Notes, Warehouse, Logistics) ya da kendi **custom app'lerini** (Notion-style database builder) yaratır. Hibrit model: built-in modüller (Odoo/ERPNext mantığı) + tenant custom app'leri (Notion/Airtable mantığı). Modül aktivasyonu **plan bazlıdır** (Free/Pro/Enterprise). Kullanıcılar rol-bazlı erişim kontrolü (RBAC) ile giriş yapar.

> **Vizyon:** Tek sabit ürün değil — esnek bir iş platformu. Bir şirket lojistiğini yönetir, bir diğeri deposunu, bir diğeri task/notlarını. Tenant ayrıca kendi ihtiyacına özel mini uygulama yaratabilir.

## Özellikler

**Mevcut (IAM + admin console — DONE):**
- Multi-module Maven yapısı (`common` <- `persistence` <- `backend` + `frontend`)
- Schema-per-tenant multi-tenancy: subdomain çözümleme + Hibernate `SCHEMA` stratejisi
- Flyway per-schema migration (public auto-config + tenant programmatik + mevcut tenant'lar için startup runner)
- **Kimlik doğrulurma:** Spring Security + JWT (RS256, httpOnly cookie) + BCrypt(12) pepper'lı (K-23); opak refresh token (Redis, hash-at-rest, rotasyon + reuse detection, K-34); per-session logout + jti blacklist + `tokenInvalidBefore` iki katmanlı revoke; brute-force lockout; public auth endpoint'lerinde rate limiting
- **Oturum yönetimi:** aktif session listesi (self + admin remote revoke, token anında düşer), max concurrent session limiti
- **RBAC:** User/Role/Permission/Group CRUD + `@PreAuthorize` (K-26); rol kalıtımı (parent roles); `all_permissions` bayrağı (Admin implicit süper-kullanıcı); effective-permissions çözümlemesi; last-admin koruması (son aktif admin kaybedilemez)
- **Kullanıcı yönetimi:** DB-side user directory read model (rol/grup sayıları, N+1'siz), grup-üyesi scoped görünürlük (`iam:group-member:read`), hesap aktivite geçmişi, admin unlock
- **Audit & log:** 3 katman (`@AuditLog` AOP audit + login history + request log); append-only DB trigger; yetki değişim delta kaydı ("kim kime ne verdi/aldı"); high-risk endpoint'lerde maskeli request body; arama
- **Projects & Tasks modülü:** tip-bazlı proje yapısı + TASKS tipinde görev yönetimi (Kanban board UI dahil)
- **Notes modülü (K-44):** markdown notlar + kategoriler (raw HTML render kapalı)
- **Modül & plan sistemi (K-16):** FREE/PRO/ENTERPRISE planları; plan bazlı modül aktivasyonu (plan gate → modül Flyway → permission seed); modül/plan registry'leri kodda
- **Custom App Builder (K-15 + K-42):** tenant'ların kendi mini-uygulamalarını yaratması — JSONB EAV modeli (app/property/view/record CRUD, native PG JSONB search, plan limitleri) + tam UI (property/view/record editörleri, TABLE/BOARD/CALENDAR/LIST/GALLERY görünüm renderer'ları, satır bazlı filtre/sort DSL UI'ı, User/Relation picker'ları, plan kullanım göstergeleri)
- **Admin console (frontend):** login/register/tenant-verify; users/roles/groups/permissions/sessions/audit/login-history/request-logs/projects/modules/notes/apps (Custom App Builder) sayfaları; permission-gated lazy navigation
- **Self-service:** `/users/me/**` (profil + şifre değiştirme) — her authenticated user kendi hesabını yönetir
- **Platform süperadmin + servis hesapları (K-50):** ayrı platform auth yüzeyi (`/platform/login` — bare host) + `sf_platform_*` cookie'leri; global kimlikler `public` şemasında (`t_platform_users`/`t_platform_api_keys`/`t_platform_audit_logs`). Süperadmin: tenant yaşam döngüsü (plan/modül/status), cross-tenant rapor, **tenant'a giriş** (impersonation — tek kullanımlık kod + `act` claim'li JWT, API mirroring yok). Servis hesapları: `X-API-Key` stateless auth, scope'lu agent erişimi, raw key yalnız bir kez gösterilir. (K-24 `system` tenant bootstrap kaldırıldı; RISK-18 `platform:*` tenant seed'i kapanış.)
- **İki fazlı tenant signup (K-21):** `POST /api/v1/auth/company/register` → 202 + PROVISIONING + doğrulama maili → `POST /verify` → şema + Flyway + admin user → ACTIVE
- Entity hiyerarşisi: UUID, soft delete, optimistic locking, Spring Data auditing
- Merkezi hata yönetimi (`ApiErrorResponse` + `ErrorCode` — stable wire codes)
- **Observability & docs:** Prometheus metrics expose (K-43; prod'da ayrı management portu 8081) + Swagger UI (dev — K-41); CI (GitHub Actions: backend + frontend + gerçek PG/Redis integration testleri) + GHCR publish (deploy manuel)
- Docker: PostgreSQL + Redis + app (non-root), layered jars, actuator health

**Planlanan (kararlar kilitlendi — yol haritası [`docs/ROADMAP.md`](docs/ROADMAP.md)):**
- **Built-in modüller:** Warehouse, Logistics (plan bazlı aktivasyon)
- Kullanıcı lifecycle: SMTP mail + tenant içi email doğrulama + password reset
- Notification subsystem (K-29), activity feed (K-30), E2E testler (Playwright)
- Billing (Stripe/iyzico — Faz 6), Nginx gateway + TLS (K-33), LDAP/SSO

> Süreç/kalite kararları (dondurulmuş kararlar listesi dahil): [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Teknoloji Stack'i

**Backend:** Java 21, Spring Boot 4.1, Spring Data JPA (Hibernate), PostgreSQL 16 (dev + prod), Redis 7.4 (cache + token blacklist), Flyway (per-schema migration), spring-security-crypto (BCrypt), JUnit 5, Lombok.

**Frontend:** React 19, TypeScript 6, Vite 8, oxlint (lint).

**DevOps:** Docker multi-stage (layered jars), Docker Compose v2, runtime `eclipse-temurin:21-jre-alpine` (non-root, JVM container awareness).

## Kurulum

### Ön Koşullar

| Araç | Minimum Sürüm | Zorunluluk |
|------|---------------|------------|
| JDK | 21 | Zorunlu |
| Maven | 3.9+ (veya bundled `mvnw`) | Zorunlu |
| Node.js | 24.19.0 (`.nvmrc` ile kilit, `nvm use`/`fnm use` gerekli) | Frontend için |
| npm | 11.x (Node 24 ile gelir) | Frontend için |
| Docker | 24+ | Tam stack için |
| Docker Compose | v2+ | Tam stack için |

### Hızlı Başlangıç (lokal dev — önerilen)

Backend IDE'de (debug), frontend Vite HMR'de (:3000); sadece bağımlılıklar Docker'da. Vite `/api` proxy backend'e.

```bash
# 1. Tüm modülleri build et (testler H2 "test" profilinde çalışır — Docker gerektirmez)
mvn clean install            # veya: mvn clean install -DskipTests

# 2. PostgreSQL + Redis'i başlat (yeni checkout'ta .env gerekmez)
docker compose up -d

# 3a. Backend — ForgeSysApplication'ı IntelliJ IDEA'dan run/debug et
#     (varsayılan "dev" profili -> localhost:5432 / localhost:6379)

# 3b. Frontend — Vite dev server http://localhost:3000
cd frontend
nvm use                              # Node 24.19.0 (.nvmrc'den) — ilk sefer zorunlu
npm install --include=optional       # lock dosyası üretmeden lokal kurulum
npm run dev                          # /api -> http://localhost:8080 proxy
```

> Proje `package-lock.json` kullanmaz (`.npmrc`: `package-lock=false`). Doğrudan bağımlılık sürümleri `package.json` içinde tam sürüm olarak sabittir; Maven ve Docker da `npm install --include=optional --no-package-lock` çalıştırır. Böylece native optional paketler kurulumu yapan işletim sistemine göre seçilir.

- Uygulama: http://localhost:8080 · Frontend: http://localhost:3000
- **Platform konsolu:** http://localhost:3000/platform/login (dev: `platform-admin@forgesys.dev` / `change-me-platform-admin`) — bare host, subdomain yok
- Veritabanı: `localhost:5432` (default: `forgesys` / `forgeadmin` / `forgepassword`) · Redis: `localhost:6379`

> **Build Docker gerektirmez.** Testler `test` profilinde (H2 in-memory) çalışır. Docker yalnızca dev infra'sı (db+redis), prod deploy ve **opsiyonel** gerçek-PG isolation testi (`CrossTenantIsolationTest`, `-Dforgesys.pg.it=true` gate'i ile) için gerekli.

## Konfigürasyon

Konfigürasyon **profile-based** çalışır. Aktif profil `SPRING_PROFILES_ACTIVE` ile seçilir (varsayılan: `dev`). Profil detayları (DB, ddl-auto, flyway, H2 ayarları) tek source: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#konfigürasyon-profilleri).

| Profil | DB | Kullanım | `.env` gerekir mi? |
|--------|----|---------|----|
| `dev` (varsayılan) | PostgreSQL (`localhost:5432` default'ları gömülü) | IDE debug | Hayır |
| `prod` | PostgreSQL (credential'lar `.env`'den) | `docker-compose-prod.yml` | **Evet** |
| `test` | H2 in-memory (`MODE=PostgreSQL`) | `@SpringBootTest` `@ActiveProfiles("test")` | Hayır |

**Önemli ortam değişkenleri (prod):**

| Değişken | Açıklama |
|----------|----------|
| `SPRING_PROFILES_ACTIVE` | Aktif Spring profili (`prod`) |
| `SPRING_DATASOURCE_URL` | DB bağlantı URL'i |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | DB credential'ları |
| `SPRING_DATA_REDIS_HOST` / `SPRING_DATA_REDIS_PORT` | Redis |
| `FORGESYS_BOOTSTRAP_PLATFORM_ADMIN_ENABLED` | Platform süperadmin bootstrap (default `false`) |
| `FORGESYS_BOOTSTRAP_PLATFORM_ADMIN_EMAIL` | Bootstrap süperadmin e-postası |
| `FORGESYS_BOOTSTRAP_PLATFORM_ADMIN_PASSWORD` | Bootstrap süperadmin şifresi |
| `FORGESYS_BOOTSTRAP_PLATFORM_ADMIN_DISPLAY_NAME` | Bootstrap süperadmin görünen adı |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USERNAME` / `MAIL_PASSWORD` | Giden SMTP (K-53). `MAIL_HOST` boş → prod **fail-fast** açılmaz |
| `MAIL_FROM` | RFC 822 gönderen (`ForgeSys <no-reply@mg.example.com>`) — SPF/DKIM domain'iyle uyumlu olmalı |
| `MAIL_SMTP_AUTH` / `MAIL_SMTP_STARTTLS` | SMTP auth / STARTTLS (default `true`) |

> Dev profili: `platform-admin@forgesys.dev` / `change-me-platform-admin` (placeholder) — `.env` gerektirmez.

> `PASSWORD_PEPPER` (K-23 — `.env.example`'te tanımlı) compose `environment:` listesinde **iletilmez**; `infra/config/application-prod.yaml` overlay'i üzerinden konteynere ulaşır (`SPRING_CONFIG_ADDITIONAL_LOCATION`). Pepper'ı overlay ile set etmeden prod ayağa kalkmaz (fail-fast).
>
> `.env` yalnızca **prod** Docker Compose içindir; `dev` profilinde gerekmez. `.env` `.gitignore`'dadır, asla commit edilmez. Şablon: `.env.example`.

#### Giden mail (K-53)

| Ortam | Sender | Nasıl |
|-------|--------|-------|
| `dev` (varsayılan) | `LogMailSender` | Mail konsola loglanır (linkler dahil) — Docker gerekmez |
| `dev,smtp` (opt-in) | `SmtpMailSender` | Gerçek SMTP: `docker compose up -d` → Mailpit arayüzü **http://localhost:8025** (catch-all, :1025). Kendi relay'inize göndermek için `MAIL_HOST` vb. env ile override |
| `prod` | `SmtpMailSender` | `.env`'deki `MAIL_*` değerleri; boş `MAIL_HOST` fail-fast |

- `dev,smtp` kombinasyonu dışında hiçbir davranış değişmez; `smtp` profili `test`/`prod` ile stack **edilmez**.
- Şablonlar `infra/templates/mail/` (TR/EN, tek git kaynağı — K-51); önizleme platform konsolunda `/platform/mail`.
- Test aşamasında kendi VPS'inizde mail kurulumu (domain, SPF/DKIM/PTR, app-as-subdomain env'leri): [`docs/MAIL_RUNBOOK.md`](docs/MAIL_RUNBOOK.md).

## Çalıştırma

### Production deployment (server — Debian/Ubuntu)

```bash
# 0. (One-time on the host) Install Docker Engine + Compose v2 plugin:
#    https://docs.docker.com/engine/install/debian/
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER   # re-login afterwards
docker --version && docker compose version

# 1. .env oluştur (gerçek secret'larla — .env.example şablonu)
cp .env.example .env
#   ...edit POSTGRES_PASSWORD, SPRING_DATASOURCE_PASSWORD, vb.

# 2. Bind-mount izinleri otomatik: data-init one-shot servisi (compose içinde)
#    postgres (UID 70) ve redis (UID 999) sahipliğini her up'ta düzeltir —
#    manuel chown gerekmez (Linux native Docker dahil).

# 3. (Opsiyonel) test gate — Dockerfile kendi build'ini yapar, bu sadece testleri doğrular
mvn clean install

# 4. Tam stack'i build & başlat
docker compose -f docker-compose-prod.yml up -d --build
#   Kod değişikliği sonrası her yeniden deploy'da --build şart.
```

- CustomApp: http://localhost:8080 · Health: http://localhost:8080/actuator/health
- Swagger UI (yalnız dev): http://localhost:8080/swagger-ui.html · OpenAPI spec: `/v3/api-docs` — prod profilinde kapalıdır (K-41).
- DB: `localhost:5432` (credential'lar `.env`'den) · Redis: `localhost:6379`

### Sadece Frontend (Backend yokken)

Frontend mock veriye düşer, backend çevrimdışı modda simülasyon çalıştırır:

```bash
cd frontend && npm install --include=optional && npm run dev
```

## Build Komutları

Hızlı başlangıç yukarıda. Bu bölüm **geliştirme/referans** için tüm yaygın komutları listeler.

### Maven (backend)

```bash
# Full build — tüm modüller (common, persistence, backend, frontend) + testler.
# frontend-maven-plugin npm install/build çalıştırır, çıktıyı backend jar'a gömer.
./mvnw clean install

# Sadece backend + upstream (frontend build yok — hızlı). CI bunu kullanır.
./mvnw clean install -pl backend -am

# Testleri atla (sadece derle + package)
./mvnw clean install -DskipTests

# Tek test sınıfı / tek metod
./mvnw -pl backend test -Dtest=AuditingTest
./mvnw -pl backend test -Dtest=AuditingTest#shouldAudit

# Gerçek PostgreSQL cross-tenant isolation testi (Testcontainers — Docker GEREKLİ).
# Varsayılan build Docker'SIZ kalır (gate: -Dforgesys.pg.it=true). Schema-per-tenant
# SET search_path izolasyonunu + RISK-26 (mid-tx context switch) gerçek PG'de doğrular.
./mvnw -pl backend -am test -Dtest=CrossTenantIsolationTest -Dforgesys.pg.it=true -Dsurefire.failIfNoSpecifiedTests=false

# Backend'i terminalden çalıştır (IDE yerine)
./mvnw -pl backend spring-boot:run

# Debug çıktısı (bağımlılık/plugin sorunlarını araştırma — çok detaylı)
./mvnw clean install -X

# Error stack trace (build başarısızlığında detaylı hata)
./mvnw clean install -e

# Offline mode (bağımlılıklar önceden indirilmiş olmalı)
./mvnw -o clean install
```

### Frontend (npm)

```bash
cd frontend
npm install --include=optional   # lock dosyası yok (.npmrc: package-lock=false)
npm run lint                     # oxlint
npm test                         # vitest run (jsdom + React Testing Library)
npm run build                    # tsc -b && vite build -> dist/
npm run dev                      # http://localhost:3000 (/api -> :8080 proxy)
```

### E2E (Playwright — prod-like jar, K-57)

Kritik kullanıcı yolları (signup→verify→login, session, password reset, modül CRUD) gerçek tek-jar topolojisinde doğrulanır — backend + gömülü frontend `:8080`, mail akışları Mailpit üzerinden.

```bash
# Önkoşullar (sırayla):
docker compose up -d db redis mailpit   # altyapı (mail UI: http://localhost:8025)
./mvnw clean package -DskipTests        # FULL reactor build (jar'a SPA gömülür; -pl backend -am YETMEZ)
cd frontend
npx playwright install chromium         # bir kez (tarayıcı indirimi)

npm run e2e          # testleri koşturur; jar yoksa webServer olarak ayağa kaldırır (dev,smtp + APP_BASE_URL)
npm run e2e:headed   # görsel koşum
```

Spec başına unique tenant provision edilir (`e2e-*` subdomain) — tekrar koşum çakışmaz, paralel güvenlidir. CI'da `e2e` job'ı required gate'tir (backend VEYA frontend değişince koşar). Rapor: `frontend/playwright-report/`.

### Yaygın Maven flag'leri

| Flag | Açıklama |
|------|----------|
| `-pl <modül>` | Sadece belirtilen modülü build et (`backend`, `persistence`...) |
| `-am` | Also-make: belirtilen modülün upstream bağımlılıkları da build edilir |
| `-DskipTests` | Testleri çalıştırmadan derle/package et |
| `-Dtest=Class#method` | Belirli test(ler)i çalıştır (`*` wildcard destekler) |
| `-X` | Debug log (en detaylı) |
| `-e` | Error stack trace |
| `-o` | Offline mode (indirme yapma) |
| `--no-transfer-progress` | Bağımlılık indirme ilerlemesini gizle (CI-friendly) |
| `-T <n>` | Paralel build (`-T 4` = 4 thread) |

> Testler `test` profilinde H2 (MODE=PostgreSQL) ile çalışır -> build **Docker gerektirmez**. Dev/prod PostgreSQL kullanır. Detay: [`AGENTS.md`](AGENTS.md).

## API Endpoint'leri

Tüm endpoint'ler `/api/v1/*` prefix'i altında. Hata yanıtları tek tip `ApiErrorResponse` formatındadır (`code` + `traceId` + `fields[]`, `GlobalExceptionHandler`). Tam endpoint kataloğu için bkz. [`backend/AGENTS.md`](backend/AGENTS.md).

**Public (auth yok):**

| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/api/v1/auth/company/register` | K-21 faz 1 — `PROVISIONING` Company + doğrulama token'ı yaratır, linki mail ile gönderir (202 Accepted) |
| `POST` | `/api/v1/auth/company/verify` | K-21 faz 2 — token'ı consume eder, senkron şema + Flyway + admin user → `ACTIVE` (200 OK) |
| `POST` | `/api/v1/auth/company/suggest-subdomain` | K-21 — org adından slug önerileri (Türkçe karakter normalize) |
| `POST` | `/api/v1/auth/login` | Email+şifre → JWT (cookie + body) — tenant login |
| `POST` | `/api/v1/platform/auth/login` | K-50 platform login — bare host, `sf_platform_*` cookie'leri |
| `POST` | `/api/v1/platform/auth/refresh` | K-50 platform refresh rotasyonu |
| `POST` | `/api/v1/auth/platform-switch` | K-50 impersonation exchange — tenant-scoped (hedef subdomain), permitAll |

**Platform (süperadmin, `scope=platform` + `platform:*`):**

| Method | Path | Açıklama |
|--------|------|----------|
| `GET` | `/api/v1/platform/me` | Platform kimliği self view |
| `GET` | `/api/v1/platform/companies` · `GET /{id}` | Company liste/detay |
| `PATCH` | `/api/v1/platform/companies/{id}/status` | Status lifecycle (ACTIVE ↔ SUSPENDED/TERMINATED) |
| `GET`/`PUT` | `/api/v1/platform/companies/{id}/subscription` | Plan görüntüle/değiştir |
| `GET`/`PUT` | `/api/v1/platform/companies/{id}/modules` | Modül aktivasyon seti |
| `GET` | `/api/v1/platform/companies/{id}/report` | Kullanım raporu (users/projects/apps/notes) |
| `POST` | `/api/v1/platform/companies/{id}/switch` | Tenant'a giriş — tek kullanımlık kod (30 sn) + targetUrl |
| `POST`/`GET`/`DELETE` | `/api/v1/platform/service-accounts` | Servis hesabı oluştur (raw key 1 kez) / liste / revoke |
| `GET` | `/api/v1/platform/audit-logs` | Platform audit trail (filtreli sayfalama) |

> `/api/v1/platform/**` `TenantFilter`'dan muaf (`shouldNotFilter` — platform API tenant-agnostiktir). `/api/v1/auth/platform-switch` izin verilir ama NORMAL tenant akışında kalır (hedef tenant subdomain'inde koşur). Tenant login tenant'a özgü (subdomain çözümleme).

**Tenant signup örneği (K-21 iki fazlı):**

```bash
# Faz 1 — PROVISIONING Company + doğrulama maili
curl -X POST http://localhost:8080/api/v1/auth/company/register \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Gebze Klübü",
    "subdomain": "geba-klubu",
    "adminEmail": "ali@gmail.com",
    "adminPassword": "secure-password-123",
    "adminFirstName": "Ali",
    "adminLastName": "Yılmaz"
  }'

# 202 Accepted
# { "companyId": "...", "status": "PROVISIONING", "message": "Doğrulama bağlantısı admin e-postasına gönderildi." }

# Faz 2 — admin mailindeki linki tıklar (frontend /verify-tenant sayfası → POST)
curl -X POST http://localhost:8080/api/v1/auth/company/verify \
  -H "Content-Type: application/json" \
  -d '{ "token": "token-from-email-link" }'

# 200 OK
# { "status": "ACTIVE", "message": "Organizasyon etkinleştirildi. Giriş yapabilirsiniz." }
```

> `/register` ve `/verify` `TenantFilter`'dan muaf (`shouldNotFilter` — `/api/v1/auth/company/**`). Login tenant'a özgü (subdomain çözümleme).

> **Tipli proje konteyneri (K-45):** projeler türsüz var edilemez (`TASKS | NOTES | APPS`); yaratılabilir tür kataloğu tenant'ın AKTİF modüllerinden türer (`GET /api/v1/projects/types`). Notlar ve özel uygulamalar kendi türlerinin konteynerine çapalıdır (`/api/v1/projects/{id}/notes`, `/projects/{id}/custom-apps` — TaskController deseni); üst `/notes` `/custom-apps` yüzeyleri `?projectId=` filtreli çapraz-konteyner görünümleri olarak yaşar, hedef verilmeden yazmalar tipin "Genel" default konteynerine düşer.

## Proje Yapısı

> Mimari diyagram, HTTP request yaşam döngüsü, şema-per-tenant modeli ve entity hiyerarşisi için bkz. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
forgesys/
├── pom.xml                  # Root POM — aggregator + version management (BOM import)
├── common/                  # Paylaşılan çekirdek — minimal bağımlılık (Spring/JPA YOK)
├── persistence/             # JPA entity'ler + çok-kiracılı altyapı + Flyway migration
├── backend/                 # Spring Boot uygulaması (executable jar üretir)
├── frontend/                # React + Vite SPA
├── infra/                   # Runtime altyapısı (config, data, logs, ssl, init-sql, templates)
├── docker-compose.yml       # Dev infra: PostgreSQL + Redis (app YOK, IDE'den çalışır)
├── docker-compose-prod.yml  # Prod stack: app + db + redis (.env'den okur)
├── Dockerfile               # Multi-stage: backend build -> runtime
├── AGENTS.md                # AI asistanları için kurallar (modül bazlı AGENTS.md'lerle)
└── docs/
    ├── ARCHITECTURE.md      # Mimari diyagram, request lifecycle, config profilleri
    ├── ROADMAP.md           # Faz/epik yol haritası (ticket numarasız)
    └── DECISIONS.md         # Karar kayıtları (K-XX/RISK-XX/DEBT-XX)
```

**`infra/` dizini** — kaynak kodu değil, runtime/operasyonel altyapıyı tutar (bkz. [`infra/README.md`](infra/README.md)):

| Alt dizin          | Amaç                                                            | Commit?                         |
|--------------------|----------------------------------------------------------------|---------------------------------|
| `config/`          | Prod için externalized Spring override'ları                     | Sadece `.gitkeep`               |
| `data/postgres/`   | PostgreSQL bind-mount volume (dev + prod)                       | Hayır (runtime veri)            |
| `data/redis/`      | Redis AOF bind-mount volume (prod; dev named volume kullanır)  | Hayır (runtime veri)            |
| `init-sql/`        | Docker `/docker-entrypoint-initdb.d/` script'leri (ilk kurulum) | Evet                            |
| `logs/`            | Spring Boot + container log bind-mount                          | Hayır (runtime veri)            |
| `ssl/`             | TLS sertifikaları (Nginx / app HTTPS)                           | **Hayır** — secret, asla commit |
| `templates/`       | Externalize runtime template'leri (mail HTML/CSS vb.)           | Evet                            |

**Modül bağımlılık grafiği (döngüsüz):** `common` <- `persistence` <- `backend` · `frontend` bağımsız. Sadece `backend` executable jar üretir; `common` ve `persistence` kütüphane jar'ıdır.

## Katkı Sağlama

### Dal Stratejisi (Branching)

- `main` — Production dalı. Her zaman deploy edilebilir.
- `develop` — Aktif geliştirme dalı.
- `feat/SF-NN-kisa-aciklama` — Yeni özellik (geliştirici kendi `SF-NN` numarasını verir, yol haritasına bağımlı değil).
- `fix/SF-NN-kisa-aciklama` — Hata düzeltme.
- Tüm PR'lar `develop`'a karşı. Squash merge. Merge sonrası branch silinir.

### Commit Convention

Conventional Commits kullanılır: `<type>(<scope>): <subject>`

- `feat` — Yeni özellik (`feat(tenant): add subdomain resolver`)
- `fix` — Hata düzeltme (`fix(auth): handle expired token`)
- `refactor` — Yeniden yapılandırma (`refactor(tenant): split filter into resolver`)
- `test` · `docs` · `chore(deps)` · `ci`

Kurallar: Subject <72 karakter, küçük harfle başlasın, nokta ile bitmesin, imperative mood ("add" değil "added").

### Code Review

- Build + test + lint geçmek zorunlu: PR öncesi `./mvnw test` + `npm run lint` + `npm test` (CI de aynı üçünü + gated IT'leri koşar — Testcontainers PG/Redis; develop/main push'ta ayrıca Docker build + GHCR publish).
- Tenant izolasyonu içeren değişikliklerde ekstra dikkat (data leak kontrolü) — tenant verisi sızdıran en kritik bug sınıfıdır.
- Yeni endpoint'ler için en az bir test eklenmeli.

### Troubleshooting

- **`mvnw: Permission denied`** -> `chmod +x mvnw`
- **Port 8080 / 3000 / 5432 kullanımda** -> `lsof -i :8080` ile bul, durdur.
- **Docker container DB'ye bağlanamıyor** -> önce `docker compose up db` ile DB'yi ayrı kaldır, `pg_isready` kontrol et.
- **PostgreSQL/Redis data dizini izin sorunu (Linux native Docker)** -> manuel `chown` gerekmez; `data-init` one-shot servisi her `up`'ta sahipliği düzeltir (postgres UID 70, redis UID 999). Sorun sürüyorsa `docker compose up -d --force-recreate` ile data-init'i yeniden koştur.
- **DB verisini sıfırlamak / `infra/data` silindikten sonra toparlanmak** -> `data-init` servisi sahipliği otomatik düzeltir; tek komut yeter (silme container'lar açıkken ya da kapalıyken yapılmış olmasına bakmaz — eski veri gider, şema Flyway ile baştan kurulur):
  ```bash
  docker compose up -d --force-recreate db
  ```
- **DB "healthy" ama uygulama bağlantı hatası veriyor** -> eski `pg_isready` healthcheck'i authentication'a kadar gitmediği için bozuk data dizinini "healthy" gösterebiliyordu; artık gerçek `SELECT 1` sorgusu kullanılıyor. "unhealthy" görüyorsan yukarıdaki reset komutunu çalıştır.
- **Flyway validation hatası (checksum mismatch / applied migration not resolved) startup'ta** -> migration geçmişi pre-1.0.0 squash'ı ile alan-bazlı `V1.x` baseline ailesine indirildi ([K-36](docs/DECISIONS.md#k-36), 2026-08-22); 2026-08-27 consolidation'da `V1.x` ailesi location başına tek `V1__baseline.sql`'e indirildi (public `V1`+`V1.1`+`V3`, tenant `V1`..`V1.3`) ve `public/V4` → `public/V3` olarak yeniden numaralandı. Bu tarihten önce kurulan **tüm** local DB'ler sıfırlanmalı: `docker compose down && rm -rf infra/data/postgres && docker compose up -d` — taze DB'de baseline'lar baştan koşar.
- **Backend ayağa kalkıyor ama frontend static servis etmiyor** -> `./mvnw clean install` (tüm modülleri yeniden build).
- **Frontend "Backend DOWN" gösteriyor** -> Backend çalışmıyor; başlat veya mock veriyle devam et (normal davranış).
- **Vite/Rolldown/Lightning CSS native binding bulunamıyor** -> Node 20.20.2'yi (`nvm use`) kullanıp `node_modules` dizinini temizleyerek `npm install --include=optional` çalıştır.
- **Metrics/Prometheus erişimi** -> Dev: `curl localhost:8080/actuator/prometheus` (aynı port, auth'suz). Prod: `curl localhost:8081/actuator/prometheus` (management port 8081, internal network — Prometheus scraper aynı Docker network'ünde olmalı). `/actuator/metrics` dev/test'te açık; prod'da kapalı. Dev/test'te `/actuator/metrics` auth gerektirir (cookie'li tarayıcıda çalışır).

## Dahası

- **Mimari:** `docs/ARCHITECTURE.md` (bileşen diyagramı, request lifecycle, şema-per-tenant modeli, entity hiyerarşisi, config profilleri).
- **Yol haritası:** `docs/ROADMAP.md` (Faz/epik, ticket numarasız). **Karar kayıtları:** `docs/DECISIONS.md` (K-XX/RISK-XX/DEBT-XX).
- **AI asistanı kuralları:** `AGENTS.md` (kök) + her modülün kendi `AGENTS.md`'si (`common/`, `persistence/`, `backend/`, `frontend/`).

## License

[Apache License 2.0](LICENSE).
