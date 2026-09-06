# Persistence notes ("why" stories)

> Moved out of source comments. Index: [docs/CODE_NOTES.md](../CODE_NOTES.md) · rules: [persistence/AGENTS.md](../../persistence/AGENTS.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md)

## persistence

### `UserRepository` — yetki çözümleme & oturum iptal sorguları

- **Neden JPQL id/name projeksiyonları** (`findDirectRoleIds` → `findActiveGroupRoleIds` →
  `findParentRoleIds` → `findPermissionNamesByRoleIds`): `CustomUserDetailsService` bu zinciri
  iteratif yürütür (parent kapanışı BFS + visited set). Tam grafik
  (`groups.roles.permissions` + `roles.parentRoles`) TEK `@EntityGraph`'te çekilemez —
  Hibernate **multiple-bags** limiti; lazy N+1 da istenmez. İd/name projeksiyonları iki
  kısıtı da aşar.
- **`findAll`/`findById` `@EntityGraph` override'ları**: liste ve detay okumaları
  `UserResponse` kurarken profile/account/roles/groups'e dokunur — graphsız her erişim
  tenant şemasında ekstra SELECT üretir. `roles`/`groups` `Set` (bag değil) olduğundan
  iki koleksiyon + iki `@OneToOne` aynı grafta güvenli (yine multiple-bags).
- **`findTokenInvalidBefore` tek-kolon projeksiyonu**: `UserAccount` kullanıcının PK'sını
  `@MapsId` ile paylaşır → JOIN'siz, lazy `@OneToOne` proxy'siz tek satır/kolon. Kullanıcı
  veya hesap satırı yoksa boş döner (silinmiş hesap / bilinmeyen subject) — filtre boş
  JWT'yi reddetmez, "iptal kaydı yok" kabul eder.
- **`findUsersByRole` neden entity döner**: rol soft-delete'ten ÖNCE join satırlarının
  yönetilen `User.roles` koleksiyonlarından koparılması gerekir; satırlar yerinde
  kalırsa flush `TransientPropertyValueException` ile patlar.
- **`bulkSetTokenInvalidBefore` `flushAutomatically = true`**: iptali tetikleyen bekleyen
  entity değişiklikleri (rol/grup/şifre mutasyonu) UPDATE'ten ÖNCE flush edilir; `a.id in
  :userIds` doğrudan kullanıcı PK'sıdır (`@MapsId`). "Etkilenen herkes" kümesi: rolü
  direkt tutanlar + AKTİF grup üzerinden tutanlar (pasif grup anında yetim bırakır).
- **`existsEnabledByRoleIds`**: "en az bir aktif admin kalsın" (LastAdminGuard) —
  soft-delete'liler soft-delete filter ile gizli, disabled hesap admin sayılmaz.
- **Görünürlük kapsamı** (`findGroupIdsByUserId` + `findUserIdsByGroupIds`):
  `iam:group-member:read` — çağıran, kendi gruplarının üyelerini + kendisini görür;
  grubu olmayan kullanıcı da kendini görsün diye kendi id'sini çağıran ekler.

