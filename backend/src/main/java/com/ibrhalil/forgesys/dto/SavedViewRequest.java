package com.ibrhalil.forgesys.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Save (create or replace) a named view for the calling user. {@code state} is the
 * frontend's view snapshot JSON (ListQuerySnapshot v2) — opaque to the backend.
 */
public record SavedViewRequest(
        @NotBlank(message = "Storage key is required")
        @Size(max = 100, message = "Storage key must be at most 100 characters")
        String storageKey,

        @NotBlank(message = "Saved view name is required")
        @Size(max = 100, message = "Saved view name must be at most 100 characters")
        String name,

        @NotBlank(message = "Saved view state is required")
        @Size(max = 8192, message = "Saved view state must be at most 8192 characters")
        String state
) {
}
