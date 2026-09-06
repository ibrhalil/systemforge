package com.ibrhalil.forgesys.persistence.repository;

import com.ibrhalil.forgesys.entity.SavedView;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SavedViewRepository extends JpaRepository<SavedView, UUID> {

    /** The user's views for one table, oldest first (stable menu order). */
    List<SavedView> findByUserIdAndStorageKeyOrderByCreatedDateAsc(UUID userId, String storageKey);

    /** Ownership-scoped lookup — a foreign id behaves exactly like an unknown one. */
    Optional<SavedView> findByIdAndUserId(UUID id, UUID userId);

    /** v1 replace-on-save semantics: same (user, table, name) ignoring case. */
    Optional<SavedView> findByUserIdAndStorageKeyAndNameIgnoreCase(UUID userId, String storageKey, String name);
}
