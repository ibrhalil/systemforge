package com.ibrhalil.forgesys.service;

import com.ibrhalil.forgesys.entity.SavedView;
import com.ibrhalil.forgesys.exception.AuthException;
import com.ibrhalil.forgesys.exception.ErrorCode;
import com.ibrhalil.forgesys.exception.ResourceNotFoundException;
import com.ibrhalil.forgesys.persistence.repository.SavedViewRepository;
import com.ibrhalil.forgesys.persistence.repository.UserRepository;
import com.ibrhalil.forgesys.security.CustomUserDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Per-user saved views (K-56 F3). Every operation is scoped to the authenticated
 * user — a foreign view id behaves exactly like an unknown one (404, no leakage).
 * Saving under an existing name (case-insensitive per user+table) replaces the
 * stored state — the localStorage v1 semantics, now under the tenant V6 unique index.
 */
@Service
@RequiredArgsConstructor
public class SavedViewService {

    private final SavedViewRepository savedViewRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<SavedView> list(String storageKey) {
        return savedViewRepository.findByUserIdAndStorageKeyOrderByCreatedDateAsc(currentUserId(), storageKey);
    }

    @Transactional
    public SavedView save(String storageKey, String name, String state) {
        UUID userId = currentUserId();
        return savedViewRepository.findByUserIdAndStorageKeyAndNameIgnoreCase(userId, storageKey, name)
                .map(existing -> {
                    existing.setState(state);
                    return savedViewRepository.save(existing);
                })
                .orElseGet(() -> {
                    SavedView view = new SavedView();
                    view.setUser(userRepository.getReferenceById(userId));
                    view.setStorageKey(storageKey);
                    view.setName(name);
                    view.setState(state);
                    return savedViewRepository.save(view);
                });
    }

    @Transactional
    public void delete(UUID id) {
        SavedView view = savedViewRepository.findByIdAndUserId(id, currentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Saved view not found: " + id));
        savedViewRepository.delete(view);
    }

    /** Authenticated principal's user id — endpoints are authenticated-only by configuration. */
    private UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CustomUserDetails details) {
            return details.getUserId();
        }
        throw new AuthException(ErrorCode.AUTH_UNAUTHENTICATED);
    }
}
