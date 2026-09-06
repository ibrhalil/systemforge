package com.ibrhalil.forgesys.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * Per-user named list snapshot (K-56 F3) — the DB replacement of the localStorage
 * v1 saved-views layer. {@code state} carries the full view payload (paging/sort/
 * filter/search + optional column prefs) as JSON — opaque to the backend, owned by
 * the frontend. Soft-delete-less: a replaced or deleted view is a row delete.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
@ToString(exclude = {"user"})
@Table(name = "t_saved_views")
public class SavedView extends GeneratedIdAuditEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false,
            foreignKey = @ForeignKey(name = "fk_saved_views_user"))
    private User user;

    /** The table's frontend storageKey — the scope this view belongs to (e.g. "request-logs"). */
    @Column(name = "storage_key", nullable = false, length = 100)
    private String storageKey;

    /** Case-insensitively unique per (user, storageKey) — tenant V6 unique index. */
    @Column(nullable = false, length = 100)
    private String name;

    /** Frontend view snapshot JSON (ListQuerySnapshot v2) — jsonb, read back verbatim. */
    @Column(nullable = false, columnDefinition = "jsonb")
    private String state;
}
