package com.ibrhalil.forgesys.config;

import com.ibrhalil.forgesys.web.filter.SearchQueryArgumentResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.util.List;

/** Registers the K-55 {@code ?sq=} argument resolver for GET list endpoints. */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final SearchQueryArgumentResolver searchQueryArgumentResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(searchQueryArgumentResolver);
    }

    /**
     * K-57 SPA fallback: serves the embedded frontend (classpath:/static/) and
     * resolves client-side routes to index.html. API/docs paths MUST return null
     * so {@code NoResourceFoundException} keeps the JSON 404 semantics.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        boolean directoryStyle = resourcePath.isEmpty() || resourcePath.endsWith("/");
                        Resource requested = location.createRelative(resourcePath);
                        if (!directoryStyle && requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        if (isServerOwnedPath(resourcePath)) {
                            return null;
                        }
                        Resource index = location.createRelative("index.html");
                        return index.exists() && index.isReadable() ? index : null;
                    }
                });
    }

    private static boolean isServerOwnedPath(String resourcePath) {
        return resourcePath.startsWith("api/") || resourcePath.equals("api")
                || resourcePath.startsWith("actuator/") || resourcePath.equals("actuator")
                || resourcePath.startsWith("v3/")
                || resourcePath.startsWith("swagger-ui") || resourcePath.equals("swagger");
    }
}
