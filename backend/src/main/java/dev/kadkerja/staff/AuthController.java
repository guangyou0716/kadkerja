package dev.kadkerja.staff;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthenticationManager auth;
  private final SecurityContextRepository contexts;
  private final CookieCsrfTokenRepository csrf;
  private final StaffUserRepository users;
  private final LoginThrottle throttle;

  public AuthController(
      AuthenticationManager auth,
      SecurityContextRepository contexts,
      CookieCsrfTokenRepository csrf,
      StaffUserRepository users,
      LoginThrottle throttle) {
    this.auth = auth;
    this.contexts = contexts;
    this.csrf = csrf;
    this.users = users;
    this.throttle = throttle;
  }

  public record LoginRequest(
      @NotBlank @Size(max = 40) String username, @NotBlank @Size(max = 200) String password) {}

  public record Me(String username, String name, Role role) {}

  public record Csrf(String headerName, String token) {}

  /** Sets the XSRF-TOKEN cookie (and returns the token) before the first change, e.g. signing in. */
  @GetMapping("/csrf")
  public Csrf csrf(CsrfToken token) {
    return new Csrf(token.getHeaderName(), token.getToken());
  }

  @PostMapping("/login")
  public ResponseEntity<?> login(
      @Valid @RequestBody LoginRequest r, HttpServletRequest req, HttpServletResponse res) {
    String username = r.username().trim().toLowerCase(Locale.ROOT);
    String address = req.getRemoteAddr();
    if (throttle.blocked(username, address)) {
      return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many tries", "Too many failed sign-ins. Wait 15 minutes and try again.");
    }
    Authentication result;
    try {
      result = auth.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(username, r.password()));
    } catch (AuthenticationException e) {
      throttle.failed(username, address);
      // Same answer for unknown user, wrong password and disabled account.
      return problem(HttpStatus.UNAUTHORIZED, "Sign-in failed", "Wrong username or password.");
    }
    throttle.succeeded(username, address);
    // New session id (no session fixation) and a new CSRF token for the signed-in session.
    if (req.getSession(false) != null) {
      req.changeSessionId();
    }
    csrf.saveToken(null, req, res);
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(result);
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, req, res);
    return ResponseEntity.ok(me(result));
  }

  @GetMapping("/me")
  public Me current(Authentication a) {
    return me(a);
  }

  private Me me(Authentication a) {
    StaffUser u = users.findByUsername(a.getName()).orElseThrow();
    return new Me(u.getUsername(), u.getDisplayName(), u.getRole());
  }

  private static ResponseEntity<org.springframework.http.ProblemDetail> problem(
      HttpStatus status, String title, String detail) {
    var p = org.springframework.http.ProblemDetail.forStatusAndDetail(status, detail);
    p.setTitle(title);
    return ResponseEntity.status(status).body(p);
  }
}
