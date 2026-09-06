package com.ibrhalil.forgesys.service;

import com.ibrhalil.forgesys.entity.SavedView;
import com.ibrhalil.forgesys.entity.User;
import com.ibrhalil.forgesys.exception.AuthException;
import com.ibrhalil.forgesys.exception.ErrorCode;
import com.ibrhalil.forgesys.exception.ResourceNotFoundException;
import com.ibrhalil.forgesys.persistence.repository.SavedViewRepository;
import com.ibrhalil.forgesys.persistence.repository.UserRepository;
import com.ibrhalil.forgesys.security.CustomUserDetails;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Saved-view semantics (K-56 F3): user-scoped list/delete (foreign id = 404),
 * case-insensitive replace-on-save (v1 semantics) and the auth guard.
 */
@ExtendWith(MockitoExtension.class)
class SavedViewServiceTest {

    private static final String STORAGE_KEY = "request-logs";

    private UUID userId;

    @Mock private SavedViewRepository savedViewRepository;
    @Mock private UserRepository userRepository;

    private SavedViewService service;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        CustomUserDetails principal = new CustomUserDetails(
                userId, "admin@example.com", "pw", true, true, true, true, Set.of(), "tenant_test", null);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, Set.of()));
        service = new SavedViewService(savedViewRepository, userRepository);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // --- list -------------------------------------------------------------

    @Test
    void list_isScopedToCurrentUserAndStorageKey() {
        when(savedViewRepository.findByUserIdAndStorageKeyOrderByCreatedDateAsc(userId, STORAGE_KEY))
                .thenReturn(List.of(view("Prod")));

        List<SavedView> views = service.list(STORAGE_KEY);

        assertThat(views).hasSize(1);
        verify(savedViewRepository).findByUserIdAndStorageKeyOrderByCreatedDateAsc(userId, STORAGE_KEY);
    }

    // --- save -------------------------------------------------------------

    @Test
    void save_newNamePersistsUserScopedView() {
        User reference = new User();
        when(savedViewRepository.findByUserIdAndStorageKeyAndNameIgnoreCase(userId, STORAGE_KEY, "Prod"))
                .thenReturn(Optional.empty());
        when(userRepository.getReferenceById(userId)).thenReturn(reference);
        when(savedViewRepository.save(any(SavedView.class))).thenAnswer(inv -> inv.getArgument(0));

        SavedView saved = service.save(STORAGE_KEY, "Prod", "{\"v\":2}");

        ArgumentCaptor<SavedView> captor = ArgumentCaptor.forClass(SavedView.class);
        verify(savedViewRepository).save(captor.capture());
        SavedView persisted = captor.getValue();
        assertThat(persisted).isSameAs(saved);
        assertThat(persisted.getUser()).isSameAs(reference);
        assertThat(persisted.getStorageKey()).isEqualTo(STORAGE_KEY);
        assertThat(persisted.getName()).isEqualTo("Prod");
        assertThat(persisted.getState()).isEqualTo("{\"v\":2}");
    }

    @Test
    void save_existingNameReplacesStateWithoutANewRow() {
        SavedView existing = view("prod");
        when(savedViewRepository.findByUserIdAndStorageKeyAndNameIgnoreCase(userId, STORAGE_KEY, "Prod"))
                .thenReturn(Optional.of(existing));
        when(savedViewRepository.save(any(SavedView.class))).thenAnswer(inv -> inv.getArgument(0));

        SavedView saved = service.save(STORAGE_KEY, "Prod", "{\"v\":2,\"prefs\":{}}");

        assertThat(saved).isSameAs(existing);
        assertThat(existing.getState()).isEqualTo("{\"v\":2,\"prefs\":{}}");
        verify(savedViewRepository).save(existing);
        verify(userRepository, never()).getReferenceById(any(UUID.class));
    }

    // --- delete -----------------------------------------------------------

    @Test
    void delete_ownViewRemovesTheRow() {
        SavedView existing = view("Prod");
        when(savedViewRepository.findByIdAndUserId(existing.getId(), userId)).thenReturn(Optional.of(existing));

        service.delete(existing.getId());

        verify(savedViewRepository).delete(existing);
    }

    @Test
    void delete_unknownOrForeignIdThrowsNotFound() {
        UUID foreignId = UUID.randomUUID();
        when(savedViewRepository.findByIdAndUserId(foreignId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(foreignId))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(savedViewRepository, never()).delete(any(SavedView.class));
    }

    // --- auth guard ---------------------------------------------------------

    @Test
    void withoutAnAuthenticatedPrincipalCallsFailClosed() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(() -> service.list(STORAGE_KEY))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AUTH_UNAUTHENTICATED);
    }

    // --- helpers -----------------------------------------------------------

    private SavedView view(String name) {
        SavedView view = new SavedView();
        view.setId(UUID.randomUUID());
        view.setStorageKey(STORAGE_KEY);
        view.setName(name);
        view.setState("{\"v\":1}");
        return view;
    }
}
