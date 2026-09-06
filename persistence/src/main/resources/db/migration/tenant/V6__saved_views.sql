-- DB-backed saved views (K-56 F3): per-user named list snapshots replacing the
-- localStorage v1 layer (K-55 F7). `state` carries the full view payload —
-- ListQuerySnapshot v2 (paging/sort/filter/search + optional column prefs).
-- Row-delete on replace — no soft delete (UserAuthToken pattern).
CREATE TABLE t_saved_views (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    storage_key VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_saved_views_user FOREIGN KEY (user_id) REFERENCES t_users(id) ON DELETE CASCADE
);
-- Case-insensitive per (user, table) name uniqueness — the v1 "replace on save"
-- semantics. An expression unique needs an INDEX, not a table constraint; its
-- (user_id, storage_key) prefix also serves the list lookup.
CREATE UNIQUE INDEX uk_saved_views_user_key_name ON t_saved_views(user_id, storage_key, LOWER(name));
