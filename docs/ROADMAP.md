# Yol Haritası (Roadmap)

> **Kalan işler** planı. Tamamlanan epiklerin özeti aşağıdaki tabloda; karar/kayıt detayları [DECISIONS.md](DECISIONS.md)'de, güncel sistem [ARCHITECTURE.md](ARCHITECTURE.md)'de. Ticket numarası tablosu YOK — geliştirici kendi `SF-NN` tag'ini verir (branch/commit), bu dosyaya bağımlı değil.

## Mevcut Durum

Platform çekirdeği kullanımda: schema-per-tenant multi-tenancy, iki fazlı tenant signup, auth (RS256 JWT cookie + Redis refresh rotasyon/reuse detection), tam RBAC (rol kalıtımı + `all_permissions` + last-admin guard + privilege-change session revoke), audit/login/request log (append-only + `@AuditLog` AOP + delta), modül & plan sistemi (registry kodda), üç modül aktif ve **tipli proje konteynerine** çapalı (**pm** TASKS, **apps** APPS koleksiyonu, **notes** NOTES — K-45), admin console (permission-gated), Prometheus metrics (prod ayrı management portu), CI (backend + frontend + gated gerçek PG/Redis IT) + GHCR publish (deploy manuel), kullanıcı lifecycle: SMTP mail kanalı + opsiyonel email doğrulama + self-service password reset (K-48; tokenlar hash-at-rest — RISK-30 kapandı).

## Tamamlanan Epikler (özet)

| Alan | Kapsam | Kayıt |
|---|---|---|
| Faz 1-2 — altyapı + auth/RBAC | multi-tenancy + Flyway, security, JWT, RBAC CRUD, platform namespace, iki fazlı signup, self-service | K-21..K-26 |
| IAM hardening | privilege-change revoke, max-sessions, append-only audit + delta, app-level rate limit, rol kalıtımı, `all_permissions`, last-admin guard, user directory read model + scoped görünürlük, RbacSeeder escalation fix | RISK-35, RISK-36 |
| Faz 3.0 — module system + app builder backend | plan/modül registry + aktivasyon, JSONB EAV, plan limitleri, structured view DSL | K-15, K-16 |
| pm modülü | project-scoped tasks + Kanban board UI | — |
| notes modülü | markdown notes + kategoriler (default-aktif; K-45 ile proje-scoped) | K-44 (+K-45) |
| **K-45 — tipli proje konteyneri (Faz 1)** | `Project` typed container (TASKS/NOTES/APPS; katalog aktif modüllerden), notes/apps proje-scoping migration'ları + nested API'ler, tip-değişim/döngü/default guard'ları, "Genel" default konteynerler, üç yönlü proje detay UI'ı | K-45 |
| Faz 4 — frontend | admin console + Custom App Builder UI (TABLE/BOARD/CALENDAR/LIST/GALLERY renderer'ları, filtre/sort DSL, picker'lar, plan göstergeleri) | K-20, K-42 |
| Kalite/sadeleştirme seti | ölü kod kaldırma, API tutarlılık geçişi, migration squash, strict TS + Vitest/RTL, startup projection, springdoc-openapi | K-36..K-41 |
| Observability + CI/CD | Prometheus expose, CI 3-job + gated IT'ler + GHCR publish | K-43 |
| Audit genişletme | `@AuditLog` AOP, delta kaydı, `t_request_logs` + endpoint + UI, high-risk body masking | K-19, K-27 |
| **K-48 — user lifecycle + mail** | SMTP kanalı (`MailSender` port + Smtp/Log/InMemory sender'lar, TR/EN şablonlar), `t_auth_tokens` (digest-at-rest + supersede-on-reissue + atomic claim), opsiyonel email doğrulama (verify-email/resend), self-service password reset (forgot/reset, uniform-200 no-enumeration, session kill), `TokenPurgeJob` (ilk `@EnableScheduling`) | K-48 (+RISK-30) |
| **K-50 — platform süperadmin + servis hesapları** | Global platform kimliği (`public` şeması: `t_platform_users`/`t_platform_api_keys`/`t_platform_audit_logs`), ayrı platform auth yüzeyi (`scope=platform` JWT + `sf_platform_*` cookie'leri), tenant lifecycle + abonelik/modül/rapor endpoint'leri, servis hesapları (`X-API-Key`, scope'lu), tenant'a giriş (switch code → impersonation JWT `act` claim'li, API mirroring yok), RISK-18 kapanışı + K-24 kaldırma, frontend `/platform/*` konsolu + tenant shell impersonation banner | K-50 (+RISK-18) |
| **K-56 — advanced table features** | Dev-only `QueryInspector` (QueryClient cache event'leri), DataTable sanallaştırma (sıfır-bağımlılık `useVirtualList` + dahili scroll container + sticky header), saved views DB v2 (tenant V6 `t_saved_views`, JSONB snapshot + prefs bloğu, sessiz localStorage migrasyonu, `iam:saved-view:*`; K-55 açık takibi kapandı) | K-56 |
| **K-57 — E2E Playwright** | Prod-like jar topolojisi (`:8080` gömülü SPA) + SPA fallback/permitAll fix (`SpaFallbackTest`), 4 core spec (signup/session/password-reset/module-crud; Mailpit REST ile mail doğrulama, spec başına tenant provisioning), CI `e2e` required gate (backend‖frontend) | K-57 |

## Kalan İşler

### Faz 3 kalanı — built-in modüller
- [ ] **Warehouse:** ürün/depo/stok kalemi/stok hareketi (IN/OUT/TRANSFER) + minimum stok uyarısı
- [ ] **Logistics:** sevkiyat/araç/sürücü/route + sevkiyat durum makinesi (CREATED→IN_TRANSIT→DELIVERED)

### Faz 5 kalanı — hardening & operasyon
- [ ] K-29 notification subsystem (in-app kanalı bağımsız yapılabilir; mail SMTP'ye bağlı)
- [ ] K-30 activity feed (audit log üstünden türetme + i18n template map)
- [ ] K-27 artıkları (LOW): approval workflow (`t_pending_actions`), anomaly detection
- [ ] OpenTelemetry tracing (K-33 gateway ile birlikte değerlendirilecek)
- [ ] Nginx gateway + wildcard TLS (K-33 — proje %90 sonrası; eski Faz 1.5 epikleri bu kapsamda uygulanır)
- [ ] Pepper rotasyon runbook (docs)
- [ ] Deploy otomasyonu (GHCR publish var; sunucuya rollout manuel)

### K-45 sonraki artışlar (taahhütsüz yön — K-45'te tanımlı)
- [ ] Faz 2 — proje görünüm sekmeleri (CustomAppView'in DSL konsepti Task/Note listelerine genişletilir; tablo soyutlaması genelleştirilmez)
- [ ] Faz 3 (talep-kapılı) — `t_links` polymorphic bağlantı katmanı (dondurulmuş anti-şişme kuralları K-45'te)

### Faz 6 — Billing (K-16 finansal taraf)
- [ ] Ödeme sağlayıcı spike (Stripe vs iyzico — Türkiye pazarı) + entegrasyon + webhook
- [ ] Plan upgrade/downgrade akışı (soft-block limit yönetimi) + invoice + 14 gün PRO trial
- [ ] Platform admin dashboard (MRR, churn, tenant istatistikleri) + tenant lifecycle (K-22 arşiv katmanı)

### Ürün kararları bekliyor
- [ ] Password complexity policy (tüm test/bootstrap şifrelerini değiştirir)

> Çözülen ürün kararı: tenant içi email doğrulama OPSİYONEL (login engellenmez; rozet + admin resend) — [K-48](DECISIONS.md#k-48).

### Bilinçli ertelenmiş / iptal (tekrar tartışılmaz)
MapStruct (iptal — manuel `toResponse`) · `t_sessions_log` (iptal — K-28) · `PermissionCacheService` (düşük değer — yetkiler JWT'de gömülü) · `PasswordEncodingListener` · TaskDecorator (RISK-10 — ilk `@Async` tüketiciyle) · OAuth2 sosyal giriş / WebSocket-SSE / S3-MinIO / LDAP-SSO / microservice (Faz 5 değerlendirme listesi) · FORMULA property tipi (K-15) · drag-drop + expression editor (K-42) · ABAC görünürlük + WYSIWYG + tsvector search (K-44) · OTel (K-43 notu)

## İlgili Dokümanlar

- [Karar kayıtları](DECISIONS.md) — K-XX/RISK-XX/DEBT-XX + dondurulmuş kararlar
- [Mimari](ARCHITECTURE.md) — bileşen diyagramı, request lifecycle, schema-per-tenant, config profilleri
- [README](../README.md) — kurulum, çalıştırma, API
- [AGENTS.md](../AGENTS.md) (kök + modül bazlı) — güncel kurallar
