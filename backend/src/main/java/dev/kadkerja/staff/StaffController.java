package dev.kadkerja.staff;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The workshop's staff, for the service advisor (SecurityConfig allows advisors only). */
@RestController
@RequestMapping("/api/staff")
public class StaffController {
  private final StaffUserRepository users;
  private final StaffService service;

  public StaffController(StaffUserRepository users, StaffService service) {
    this.users = users;
    this.service = service;
  }

  /** No password hashes, ever. */
  public record StaffView(long id, String username, String name, Role role, boolean active) {
    static StaffView of(StaffUser u) {
      return new StaffView(u.getId(), u.getUsername(), u.getDisplayName(), u.getRole(), u.isActive());
    }
  }

  public record CreateStaffRequest(
      @NotBlank
          @Pattern(
              regexp = "^\\s*[A-Za-z0-9._-]{3,40}\\s*$",
              message = "3-40 letters, digits, dots, dashes or underscores")
          String username,
      @NotBlank @Size(max = 100) String name,
      @NotNull Role role,
      @NotNull @Size(max = 200) String password) {}

  public record PasswordRequest(@NotNull @Size(max = 200) String password) {}

  /** Active people first, then by name. */
  @GetMapping
  @Transactional(readOnly = true)
  public List<StaffView> list() {
    return users.findAll().stream()
        .sorted(
            Comparator.comparing((StaffUser u) -> !u.isActive())
                .thenComparing(u -> u.getDisplayName().toLowerCase(Locale.ROOT)))
        .map(StaffView::of)
        .toList();
  }

  @PostMapping
  public ResponseEntity<StaffView> create(@Valid @RequestBody CreateStaffRequest r) {
    StaffView v = StaffView.of(service.create(r.username(), r.name(), r.role(), r.password()));
    return ResponseEntity.created(URI.create("/api/staff/" + v.id())).body(v);
  }

  @PostMapping("/{id}/deactivate")
  public StaffView deactivate(@PathVariable long id, Authentication who) {
    return StaffView.of(service.deactivate(who.getName(), id));
  }

  @PostMapping("/{id}/activate")
  public StaffView activate(@PathVariable long id) {
    return StaffView.of(service.activate(id));
  }

  @PostMapping("/{id}/password")
  public StaffView setPassword(
      @PathVariable long id, @Valid @RequestBody PasswordRequest r, Authentication who) {
    return StaffView.of(service.setPassword(who.getName(), id, r.password()));
  }
}
