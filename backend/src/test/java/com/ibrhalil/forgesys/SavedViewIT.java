package com.ibrhalil.forgesys;

import com.ibrhalil.forgesys.common.tenant.TenantContext;
import com.ibrhalil.forgesys.config.PlanDefinition;
import com.ibrhalil.forgesys.dto.CompanyRegisterRequest;
import com.ibrhalil.forgesys.entity.Company;
import com.ibrhalil.forgesys.entity.Plan;
import com.ibrhalil.forgesys.entity.User;
import com.ibrhalil.forgesys.entity.UserAccount;
import com.ibrhalil.forgesys.entity.UserProfile;
import com.ibrhalil.forgesys.exception.ResourceNotFoundException;
import com.ibrhalil.forgesys.persistence.repository.CompanyRepository;
import com.ibrhalil.forgesys.persistence.repository.PlanRepository;
import com.ibrhalil.forgesys.persistence.repository.UserRepository;
import com.ibrhalil.forgesys.security.CustomUserDetails;
import com.ibrhalil.forgesys.service.SavedViewService;
import com.ibrhalil.forgesys.service.TenantProvisioningService;
import com.ibrhalil.forgesys.service.mail.InMemoryMailSender;
import org.hibernate.dialect.PostgreSQLDialect;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DB-backed saved views against a real PostgreSQL (K-56 F3, gated like
 * {@code CustomAppIT}). Validates the provisioned-schema V6 migration (table +
 * expression unique index), the JSONB state lifecycle with replace-on-save
 * semantics, per-USER isolation inside a tenant and schema-per-TENANT isolation.
 *
 * <p><strong>Gated:</strong> skipped unless {@code -Dforgesys.pg.it=true} is set. Run with:
 * <pre>{@code
 * ./mvnw -pl backend -am test -Dtest=SavedViewIT -Dforgesys.pg.it=true
 * }</pre>
 */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@EnabledIfSystemProperty(named = "forgesys.pg.it", matches = "true")
@Import(SavedViewIT.ContainerConfig.class)
class SavedViewIT {

    private static final String SUBDOMAIN = "svit";
    private static final String SUBDOMAIN_2 = "svit2";

    @TestConfiguration(proxyBeanMethods = false)
    static class ContainerConfig {
        @Bean
        @ServiceConnection
        PostgreSQLContainer<?> postgres() {
            return new PostgreSQLContainer<>("postgres:16-alpine");
        }
    }

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.jpa.properties.hibernate.dialect", () -> PostgreSQLDialect.class.getName());
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.flyway.schemas", () -> "public");
        registry.add("spring.flyway.locations", () -> "classpath:db/migration/public");
        // Mirror of the dev/prod JDBC URLs: binds Strings as unspecified so PG casts
        // them into the jsonb state column.
        registry.add("spring.datasource.hikari.data-source-properties.stringtype", () -> "unspecified");
    }

    @Autowired private CompanyRepository companyRepository;
    @Autowired private PlanRepository planRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private TenantProvisioningService provisioningService;
    @Autowired private InMemoryMailSender mailSender;
    @Autowired private SavedViewService savedViewService;
    @Autowired private DataSource dataSource;

    private Company companyA;
    private Company companyB;
    private UUID adminAId;
    private UUID userA2Id;
    private UUID adminBId;

    @BeforeAll
    void provisionTenants() {
        // PlanSyncRunner is absent in the test profile — seed the plan registry manually.
        for (PlanDefinition definition : PlanDefinition.values()) {
            Plan plan = planRepository.findByKey(definition.key()).orElseGet(Plan::new);
            plan.setKey(definition.key());
            plan.setName(definition.displayName());
            plan.setRank(definition.rank());
            plan.setActive(true);
            planRepository.save(plan);
        }
        TenantProvisioningTestSupport.provisionViaTwoPhaseFlow(provisioningService, mailSender,
                new CompanyRegisterRequest("SavedView IT", SUBDOMAIN, "admin@svit.test", "Secret123!", "Admin", "IT"));
        TenantProvisioningTestSupport.provisionViaTwoPhaseFlow(provisioningService, mailSender,
                new CompanyRegisterRequest("SavedView IT 2", SUBDOMAIN_2, "admin@svit2.test", "Secret123!", "Admin", "IT"));
        companyA = companyRepository.findBySubdomain(SUBDOMAIN).orElseThrow();
        companyB = companyRepository.findBySubdomain(SUBDOMAIN_2).orElseThrow();
        adminAId = inTenantOf(companyA, () -> userRepository.findByEmail("admin@svit.test").orElseThrow().getId());
        adminBId = inTenantOf(companyB, () -> userRepository.findByEmail("admin@svit2.test").orElseThrow().getId());
        userA2Id = inTenantOf(companyA, () -> {
            User second = new User();
            second.setUsername("second");
            second.setEmail("second@svit.test");
            second.setPassword("$2a$12$dummyHashForTestingOnly00000000000000000000000000000");
            second.setEmailVerified(true);
            UserAccount account = new UserAccount();
            account.setUser(second);
            second.setUserAccount(account);
            UserProfile profile = new UserProfile();
            profile.setUser(second);
            profile.setFirstName("Second");
            profile.setLastName("User");
            second.setUserProfile(profile);
            return userRepository.save(second).getId();
        });
    }

    @AfterAll
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void v6CreatesSavedViewsTableAndUniqueIndexInProvisionedSchemas() throws Exception {
        for (String schema : List.of(companyA.getSchemaName(), companyB.getSchemaName())) {
            assertThat(regclassExists(schema + ".t_saved_views")).as("t_saved_views in " + schema).isTrue();
            assertThat(regclassExists(schema + ".uk_saved_views_user_key_name"))
                    .as("expression unique index in " + schema).isTrue();
        }
    }

    @Test
    void saveReplacesStateForTheSameNameIgnoringCase() {
        authenticateAs(adminAId, "admin@svit.test");
        inTenantOf(companyA, () -> {
            savedViewService.save("replace-it", "Prod", "{\"v\":2,\"q\":\"errors\"}");
            var replaced = savedViewService.save("replace-it", "prod", "{\"v\":2,\"q\":\"fatal\",\"prefs\":{}}");
            assertThat(replaced.getState()).isEqualTo("{\"v\":2,\"q\":\"fatal\",\"prefs\":{}}");
            var views = savedViewService.list("replace-it");
            assertThat(views).hasSize(1); // replaced, not duplicated — the V6 unique index backs the semantics
            assertThat(views.getFirst().getName()).isEqualTo("Prod"); // first casing kept
            savedViewService.delete(views.getFirst().getId());
            assertThat(savedViewService.list("replace-it")).isEmpty();
            return null;
        });
    }

    @Test
    void viewsArePrivateToTheirUserWithinTheTenant() {
        authenticateAs(adminAId, "admin@svit.test");
        UUID adminViewId = inTenantOf(companyA, () ->
                savedViewService.save("user-iso-it", "Admin view", "{\"v\":2}").getId());

        authenticateAs(userA2Id, "second@svit.test");
        inTenantOf(companyA, () -> {
            assertThat(savedViewService.list("user-iso-it")).isEmpty();
            assertThatThrownBy(() -> savedViewService.delete(adminViewId))
                    .isInstanceOf(ResourceNotFoundException.class);
            savedViewService.save("user-iso-it", "Second view", "{\"v\":2}");
            return null;
        });

        authenticateAs(adminAId, "admin@svit.test");
        inTenantOf(companyA, () -> {
            var names = savedViewService.list("user-iso-it").stream().map(v -> v.getName()).toList();
            assertThat(names).containsExactly("Admin view"); // second user's view stays invisible
            return null;
        });
    }

    @Test
    void tenantIsolationRowsStayInTheirOwnSchema() throws Exception {
        authenticateAs(adminAId, "admin@svit.test");
        inTenantOf(companyA, () -> {
            savedViewService.save("tenant-iso-it", "Tenant A view", "{\"v\":2}");
            return null;
        });
        authenticateAs(adminBId, "admin@svit2.test");
        inTenantOf(companyB, () -> {
            savedViewService.save("tenant-iso-it", "Tenant B view", "{\"v\":2}");
            assertThat(savedViewService.list("tenant-iso-it"))
                    .allSatisfy(v -> assertThat(v.getName()).isEqualTo("Tenant B view"));
            return null;
        });
        authenticateAs(adminAId, "admin@svit.test");
        inTenantOf(companyA, () -> {
            assertThat(savedViewService.list("tenant-iso-it"))
                    .allSatisfy(v -> assertThat(v.getName()).isEqualTo("Tenant A view"));
            return null;
        });
        // Raw per-schema row counts — each tenant's table holds exactly its own rows.
        assertThat(countRows(companyA.getSchemaName(), "tenant-iso-it")).isEqualTo(1);
        assertThat(countRows(companyB.getSchemaName(), "tenant-iso-it")).isEqualTo(1);
    }

    // --- helpers ---------------------------------------------------------

    /** The service resolves the calling user from the SecurityContext principal. */
    private void authenticateAs(UUID userId, String email) {
        SecurityContextHolder.clearContext();
        CustomUserDetails principal = new CustomUserDetails(
                userId, email, "pw", true, true, true, true, Set.of(), "it-schema", null);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, Set.of()));
    }

    private <T> T inTenantOf(Company target, Supplier<T> work) {
        TenantContext.setCurrentTenant(target.getSchemaName());
        try {
            return work.get();
        } finally {
            TenantContext.clear();
        }
    }

    private boolean regclassExists(String qualifiedName) throws SQLException {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT to_regclass('" + qualifiedName + "') IS NOT NULL")) {
            rs.next();
            return rs.getBoolean(1);
        }
    }

    private int countRows(String schema, String storageKey) throws SQLException {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT count(*) FROM " + schema + ".t_saved_views WHERE storage_key = '" + storageKey + "'")) {
            rs.next();
            return rs.getInt(1);
        }
    }
}
