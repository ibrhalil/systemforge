package com.ibrhalil.forgesys.dto;

import com.ibrhalil.forgesys.entity.SavedView;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SavedViewResponse(
        UUID id,
        String storageKey,
        String name,
        String state,
        OffsetDateTime createdDate,
        OffsetDateTime updatedDate
) {

    public static SavedViewResponse toResponse(SavedView view) {
        return new SavedViewResponse(
                view.getId(),
                view.getStorageKey(),
                view.getName(),
                view.getState(),
                view.getCreatedDate(),
                view.getUpdatedAt()
        );
    }
}
