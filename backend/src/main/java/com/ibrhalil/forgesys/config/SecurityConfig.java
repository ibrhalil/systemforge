package com.ibrhalil.forgesys.config;

import com.ibrhalil.forgesys.security.PepperingPasswordEncoder;
import com.ibrhalil.forgesys.security.RestAccessDeniedHandler;
import com.ibrhalil.forgesys.security.RestAuthenticationEntryPoint;
import com.ibrhalil.forgesys.security.apikey.PlatformApiKeyAuthenticationFilter;
import com.ibrhalil.forgesys.security.jwt.JwtAuthenticationFilter;
import com.ibrhalil.forgesys.security.ratelimit.RateLimitFilter;
import com.ibrhalil.forgesys.tenant.TenantFilter;
import com.ibrhalil.forgesys.web.RequestBodyCaptureFilter;
import com.ibrhalil.forgesys.web.RequestLogFilter;
import com.ibrhalil.forgesys.web.RequestMetadataFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.util.StringUtils;


/**
 * Spring Security core: stateless, CSRF-less chain with cookie JWT auth and JSON 401/403
 * handlers. Password encoder is a {@link PepperingPasswordEncoder} (BCrypt 12 + HMAC-SHA256
 * pepper, K-23 — legacy hashes migrate lazily on login); a blank pepper fails startup.
 * rationale: docs/CODE_NOTES.md (backend/config → SecurityConfig)
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthenticationFilter jwtAuthenticationFilter,
                                                   RateLimitFilter rateLimitFilter,
                                                   PlatformApiKeyAuthenticationFilter platformApiKeyAuthenticationFilter,
                                                   RestAuthenticationEntryPoint authenticationEntryPoint,
                                                   RestAccessDeniedHandler accessDeniedHandler) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/company/**",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/verify-email",
                                "/api/v1/auth/forgot-password",
                                "/api/v1/auth/reset-password",
                                "/api/v1/auth/platform-switch",
                                "/api/v1/platform/auth/login",
                                "/api/v1/platform/auth/refresh").permitAll()
                        // K-41: safe unconditionally — prod disables springdoc outright (404); dev/test stay open.
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        // K-43: dev/test same-port scrape (numerical metrics only). In prod the
                        // management port runs outside this chain, so this matcher is a no-op there.
                        .requestMatchers("/actuator/prometheus").permitAll()
                        // K-57: embedded SPA — non-API GET (HEAD) requests (index.html,
                        // hashed assets, client-side routes) are public; API/docs paths
                        // above stay on their own matchers and anyRequest default.
                        .requestMatchers(SecurityConfig::isSpaRequest).permitAll()
                        .anyRequest().authenticated())
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(Customizer.withDefaults())
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'self'; img-src 'self' data: https:; "
                                + "style-src 'self' 'unsafe-inline'; script-src 'self'; "
                                + "connect-src 'self'; frame-ancestors 'none'")))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                // Faz 3: rate-limit before JWT decode — a blocked request short-circuits 429 and never pays the BCrypt cost.
                .addFilterBefore(rateLimitFilter, JwtAuthenticationFilter.class)
                // K-50 F5: X-API-Key auth before the JWT filter (chain order: rate-limit → api-key → jwt);
                // the JWT filter skips requests already authenticated by the key.
                .addFilterBefore(platformApiKeyAuthenticationFilter, JwtAuthenticationFilter.class)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler));
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder(
            @Value("${forgesys.security.password-pepper:}") String pepper) {
        if (!StringUtils.hasText(pepper)) {
            throw new IllegalStateException(
                    "forgesys.security.password-pepper is not set. " +
                    "Provide a non-blank secret via the PASSWORD_PEPPER env var " +
                    "(prod) or the forgesys.security.password-pepper property " +
                    "(the test/dev profiles ship a default).");
        }
        return new PepperingPasswordEncoder(pepper, 12);
    }

    /**
     * TenantFilter before the security chain (-100) so the tenant schema is resolved
     * before authentication; the registration also suppresses the {@code @Component}
     * auto-registration.
     */
    @Bean
    public FilterRegistrationBean<TenantFilter> tenantFilterRegistration(TenantFilter tenantFilter) {
        FilterRegistrationBean<TenantFilter> registration = new FilterRegistrationBean<>(tenantFilter);
        registration.setOrder(SECURITY_FILTER_ORDER - 1);
        return registration;
    }

    /** RequestMetadataFilter before tenant + security (-102) so traceId/IP reach every downstream filter. */
    @Bean
    public FilterRegistrationBean<RequestMetadataFilter> requestMetadataFilterRegistration(
            RequestMetadataFilter requestMetadataFilter) {
        FilterRegistrationBean<RequestMetadataFilter> registration = new FilterRegistrationBean<>(requestMetadataFilter);
        registration.setOrder(SECURITY_FILTER_ORDER - 2);
        return registration;
    }

    /**
     * RequestLogFilter INSIDE the security chain (-95): its finally-write must unwind
     * before the outer filters clear their ThreadLocals — registered outside the chain,
     * the write landed in the public schema with null user/trace and failed silently.
     * 401s rejected before -95 are not logged (failed logins go to t_login_history).
     */
    @Bean
    public FilterRegistrationBean<RequestLogFilter> requestLogFilterRegistration(RequestLogFilter requestLogFilter) {
        FilterRegistrationBean<RequestLogFilter> registration = new FilterRegistrationBean<>(requestLogFilter);
        registration.setOrder(REQUEST_LOG_FILTER_ORDER);
        return registration;
    }

    /** BodyCaptureFilter inside RequestLogFilter (-94): publishes the masked body to AuditRequestContext before delegating. */
    @Bean
    public FilterRegistrationBean<RequestBodyCaptureFilter> requestBodyCaptureFilterRegistration(
            RequestBodyCaptureFilter requestBodyCaptureFilter) {
        FilterRegistrationBean<RequestBodyCaptureFilter> registration =
                new FilterRegistrationBean<>(requestBodyCaptureFilter);
        registration.setOrder(REQUEST_LOG_FILTER_ORDER + 1);
        return registration;
    }

    /** The Spring Security filter chain (DelegatingFilterProxy) order. */
    private static final int SECURITY_FILTER_ORDER = -100;

    /** {@link RequestLogFilter} order — inside the security chain (see its registration). */
    private static final int REQUEST_LOG_FILTER_ORDER = -95;

    /** K-57: public GET/HEAD on non-API paths (SPA shell, assets, client routes). */
    private static boolean isSpaRequest(jakarta.servlet.http.HttpServletRequest request) {
        String method = request.getMethod();
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            return false;
        }
        String path = request.getRequestURI();
        return !path.startsWith("/api/") && !path.startsWith("/actuator/")
                && !path.startsWith("/v3/") && !path.startsWith("/swagger");
    }
}
