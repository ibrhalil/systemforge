package com.ibrhalil.forgesys.controller;

import com.ibrhalil.forgesys.entity.SavedView;
import com.ibrhalil.forgesys.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Saved-view endpoint contract (K-56 F3): permission gates, per-user scoping
 * (a foreign id is 404, the list shows only the caller's views) and the
 * create-or-replace semantics over the REST surface.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SavedViewControllerTest extends AbstractRbacWebTest {

    private static final String STORAGE_KEY = "request-logs";

    @Test
    void list_requiresTheReadPermission() throws Exception {
        User user = seedRbacUser("u1@tenant.test", "u1");

        mockMvc.perform(get("/api/v1/saved-views").param("storageKey", STORAGE_KEY)
                        .cookie(auth(user.getId(), "u1@tenant.test")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/saved-views").param("storageKey", STORAGE_KEY)
                        .cookie(auth(user.getId(), "u1@tenant.test", "iam:saved-view:read")))
                .andExpect(status().isOk());
    }

    @Test
    void unauthenticatedRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/v1/saved-views").param("storageKey", STORAGE_KEY))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void save_persistsAndReturnsTheView() throws Exception {
        User user = seedRbacUser("u2@tenant.test", "u2");

        mockMvc.perform(post("/api/v1/saved-views")
                        .cookie(auth(user.getId(), "u2@tenant.test", "iam:saved-view:write"))
                        .contentType("application/json")
                        .content("""
                                {"storageKey":"%s","name":"Errors only","state":"{\\"v\\":2,\\"filters\\":[]}"}
                                """.formatted(STORAGE_KEY)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.storageKey").value(STORAGE_KEY))
                .andExpect(jsonPath("$.name").value("Errors only"))
                .andExpect(jsonPath("$.state").value("{\"v\":2,\"filters\":[]}"));

        assertThat(countViews(user.getId())).isEqualTo(1);
    }

    @Test
    void list_showsOnlyTheCallersOwnViews() throws Exception {
        User owner = seedRbacUser("owner@tenant.test", "owner");
        User other = seedRbacUser("other@tenant.test", "other");
        seedView(owner, STORAGE_KEY, "Owner view", "{\"v\":2}");
        seedView(other, STORAGE_KEY, "Other view", "{\"v\":2}");

        mockMvc.perform(get("/api/v1/saved-views").param("storageKey", STORAGE_KEY)
                        .cookie(auth(owner.getId(), "owner@tenant.test", "iam:saved-view:read")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Owner view"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void delete_removesAnOwnViewButAForeignIdIs404() throws Exception {
        User owner = seedRbacUser("del-owner@tenant.test", "delowner");
        User intruder = seedRbacUser("del-intruder@tenant.test", "delintruder");
        SavedView view = seedView(owner, STORAGE_KEY, "Prod", "{\"v\":2}");

        mockMvc.perform(delete("/api/v1/saved-views/{id}", view.getId())
                        .cookie(auth(intruder.getId(), "del-intruder@tenant.test", "iam:saved-view:write")))
                .andExpect(status().isNotFound());
        assertThat(countViews(owner.getId())).isEqualTo(1);

        mockMvc.perform(delete("/api/v1/saved-views/{id}", view.getId())
                        .cookie(auth(owner.getId(), "del-owner@tenant.test", "iam:saved-view:write")))
                .andExpect(status().isNoContent());
        assertThat(countViews(owner.getId())).isEqualTo(0);
    }

    // --- helpers -----------------------------------------------------------

    private SavedView seedView(User user, String storageKey, String name, String state) {
        SavedView view = new SavedView();
        view.setUser(user);
        view.setStorageKey(storageKey);
        view.setName(name);
        view.setState(state);
        entityManager.persist(view);
        return view;
    }

    private long countViews(UUID userId) {
        return entityManager.createQuery(
                        "SELECT COUNT(v) FROM SavedView v WHERE v.user.id = :userId", Long.class)
                .setParameter("userId", userId)
                .getSingleResult();
    }
}
