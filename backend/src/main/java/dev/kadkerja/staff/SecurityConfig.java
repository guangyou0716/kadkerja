package dev.kadkerja.staff;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Staff sign in with a username and password and get a session cookie (HttpOnly, SameSite=Lax).
 * Changes need the CSRF token from the XSRF-TOKEN cookie sent back as the X-XSRF-TOKEN header.
 * The customer link (/api/public/**) stays open: its token is its key, and it has no session.
 */
@Configuration
public class SecurityConfig {

  @Bean
  PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }

  @Bean
  UserDetailsService userDetailsService(StaffUserRepository users) {
    return username ->
        users
            .findByUsername(username.trim().toLowerCase(java.util.Locale.ROOT))
            .map(
                u ->
                    User.withUsername(u.getUsername())
                        .password(u.getPasswordHash())
                        .roles(u.getRole().name())
                        .disabled(!u.isActive())
                        .build())
            .orElseThrow(() -> new UsernameNotFoundException("unknown"));
  }

  /** Unknown users still cost a password hash, so timing does not tell which usernames exist. */
  @Bean
  AuthenticationManager authenticationManager(UserDetailsService uds, PasswordEncoder encoder) {
    DaoAuthenticationProvider provider = new DaoAuthenticationProvider(uds);
    provider.setPasswordEncoder(encoder);
    return new ProviderManager(provider);
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  CookieCsrfTokenRepository csrfTokenRepository() {
    CookieCsrfTokenRepository repo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    repo.setCookieCustomizer(c -> c.sameSite("Lax"));
    return repo;
  }

  @Bean
  SecurityFilterChain filterChain(
      HttpSecurity http,
      CookieCsrfTokenRepository csrfRepo,
      SecurityContextRepository contextRepo)
      throws Exception {
    // Plain (not masked) token: the SPA reads it from the cookie; it is never put into HTML.
    CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
    csrfHandler.setCsrfRequestAttributeName(null);
    http.authorizeHttpRequests(
            a ->
                a.requestMatchers("/api/public/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/auth/login")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/csrf")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/jobs", "/api/jobs/*/link")
                    .hasRole(Role.ADVISOR.name())
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .permitAll())
        .csrf(
            c ->
                c.csrfTokenRepository(csrfRepo)
                    .csrfTokenRequestHandler(csrfHandler)
                    .ignoringRequestMatchers("/api/public/**"))
        .securityContext(s -> s.securityContextRepository(contextRepo))
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(
            l ->
                l.logoutUrl("/api/auth/logout")
                    .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (req, res, ex) ->
                            problem(res, 401, "Sign in first", "Please sign in to continue."))
                    .accessDeniedHandler(
                        (req, res, ex) ->
                            problem(
                                res,
                                403,
                                "Not allowed",
                                "Your role cannot do this, or the page is out of date (reload and try again).")));
    return http.build();
  }

  /** Fixed texts only (no user input), so plain string building is safe here. */
  static void problem(HttpServletResponse res, int status, String title, String detail)
      throws IOException {
    res.setStatus(status);
    res.setContentType("application/problem+json");
    res.setCharacterEncoding("UTF-8");
    res.getWriter()
        .write(
            "{\"type\":\"about:blank\",\"title\":\""
                + title
                + "\",\"status\":"
                + status
                + ",\"detail\":\""
                + detail
                + "\"}");
  }
}
