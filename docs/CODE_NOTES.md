# CODE_NOTES — "why" notları indeksi

> Kod içinden taşınan uzun "neden böyle" anlatılarının adresi. Kural (kök `AGENTS.md`):
> koddaki yorum 1-3 satırlık sözleşme/kritik uyarı taşır; uzun anlatılar `docs/notes/`
> altındaki konu dosyalarında yaşar. Karar tarihçesi `docs/DECISIONS.md`'de (K-XX/RISK-XX/DEBT-XX).
> Bu dosyalar **istendiğinde okunur** — otomatik bağlam yüklemezler; sadece ilgili
> konu dosyasını aç, tamamını değil.

## Nasıl kullanılır

- Kodda bir davranışın gerekçesi gerekirse: 1-3 satırlık yorum + ilgili konu dosyasına giriş.
- Yeni giriş eklerken doğru konu dosyasına, dosya/sınıf başlığı altına ekle.
- Taşınan bilgi tek kaynak olarak burada yaşar; koddaki kopyası silinir.

## Konu dosyaları

| Dosya | Kapsam | Başlıca sınıflar |
|---|---|---|
| [`notes/backend-services.md`](notes/backend-services.md) | `backend/service` + `exception` | UserService, TenantProvisioningService, AuthService, RBAC services (Role/Group/Permission), Project/Task/Note/CustomApp services, audit services, mail/*, list query executors |
| [`notes/backend-security-config.md`](notes/backend-security-config.md) | `backend/security` + `config` | SessionRevocationService, JwtAuthenticationFilter, SecurityConfig, refresh/blacklist stores, LastAdminGuard, PepperingPasswordEncoder, rate limiters, RbacSeeder/runners, PermissionCatalog |
| [`notes/backend-web.md`](notes/backend-web.md) | `backend/web`, audit, controller, DTO | FilterFieldSet/FilterSpecifications (K-49 engine), SortGuard, ProjectionListQuery, request filters (-102..-94), AuditLogAspect, TenantFilter/TenantContextExecutor, DTO wire contracts |
| [`notes/persistence.md`](notes/persistence.md) | repository sorguları | UserRepository (yetki çözümleme, oturum iptali, görünürlük kapsamı) |
| [`notes/frontend.md`](notes/frontend.md) | `frontend/src` | lib/api (refresh-on-401), useListPageState, DataTable/ColumnFilterButton, ReferencePicker, custom-apps types/cellValue, UserDetailPage |
