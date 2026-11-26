package dev.kadkerja.staff;

import java.util.Comparator;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The workshop's staff, for the service advisor (SecurityConfig allows advisors only). */
@RestController
@RequestMapping("/api/staff")
public class StaffController {
  private final StaffUserRepository users;

  public StaffController(StaffUserRepository users) {
    this.users = users;
  }

  /** No password hashes, ever. */
  public record StaffView(long id, String username, String name, Role role, boolean active) {
    static StaffView of(StaffUser u) {
      return new StaffView(u.getId(), u.getUsername(), u.getDisplayName(), u.getRole(), u.isActive());
    }
  }

  /** Active people first, then by name. */
  @GetMapping
  @Transactional(readOnly = true)
  public List<StaffView> list() {
    return users.findAll().stream()
        .sorted(
            Comparator.comparing((StaffUser u) -> !u.isActive())
                .thenComparing(u -> u.getDisplayName().toLowerCase(java.util.Locale.ROOT)))
        .map(StaffView::of)
        .toList();
  }
}
