package com.ibrhalil.forgesys;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * K-57 SPA fallback proof (prod-like jar topology): client-side routes
 * ({@code /login}, {@code /}) serve {@code index.html} publicly, while unknown
 * API paths keep the JSON {@code resource_not_found} 404 — the resolver must
 * never shadow API semantics. The test index.html is a classpath marker
 * ({@code src/test/resources/static/}); the real one is jar build output.
 */
@SpringBootTest
@ActiveProfiles("test")
class SpaFallbackTest {

    @Autowired
    private WebApplicationContext context;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        Filter securityFilter = (Filter) context.getBean("springSecurityFilterChain");
        mockMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityFilter).build();
    }

    @Test
    void clientRouteServesIndexHtmlWithoutAuth() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("forgesys-spa-test-marker")));
    }

    @Test
    void rootServesIndexHtml() throws Exception {
        // Boot's welcome page forwards to index.html (MockMvc does not re-dispatch
        // forwards; the servlet container serves it via the resolver above).
        mockMvc.perform(get("/").accept(MediaType.TEXT_HTML))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("index.html"));
    }

    @Test
    void deepClientRouteServesIndexHtml() throws Exception {
        mockMvc.perform(get("/verify-tenant"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("forgesys-spa-test-marker")));
    }

    @Test
    void unknownApiPathKeepsJson404() throws Exception {
        // /api/v1/auth/company/** is permitAll (signup) so this reaches the
        // dispatcher: must be a JSON 404, never the SPA index.html.
        mockMvc.perform(get("/api/v1/auth/company/nonexistent"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("resource_not_found"));
    }

    @Test
    void apiDocsPathIsNotShadowedBySpaFallback() throws Exception {
        mockMvc.perform(get("/v3/api-docs/nonexistent"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("resource_not_found"));
    }
}
