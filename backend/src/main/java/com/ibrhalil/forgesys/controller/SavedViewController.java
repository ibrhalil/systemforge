package com.ibrhalil.forgesys.controller;

import com.ibrhalil.forgesys.dto.SavedViewRequest;
import com.ibrhalil.forgesys.dto.SavedViewResponse;
import com.ibrhalil.forgesys.entity.SavedView;
import com.ibrhalil.forgesys.service.SavedViewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Per-user saved list views (K-56 F3). All operations are scoped to the calling
 * user — a foreign view id is a 404. The list is a documented {@code List<T>}
 * exception (design-bounded: one user's views for one table, no paging value).
 */
@RestController
@RequestMapping("/api/v1/saved-views")
@RequiredArgsConstructor
public class SavedViewController {

    private final SavedViewService savedViewService;

    @GetMapping
    @PreAuthorize("hasAuthority('iam:saved-view:read')")
    public ResponseEntity<List<SavedViewResponse>> list(@RequestParam String storageKey) {
        return ResponseEntity.ok(
                savedViewService.list(storageKey).stream().map(SavedViewResponse::toResponse).toList());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('iam:saved-view:write')")
    public ResponseEntity<SavedViewResponse> save(@Valid @RequestBody SavedViewRequest request) {
        SavedView saved = savedViewService.save(request.storageKey(), request.name(), request.state());
        return ResponseEntity.status(HttpStatus.CREATED).body(SavedViewResponse.toResponse(saved));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('iam:saved-view:write')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        savedViewService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
