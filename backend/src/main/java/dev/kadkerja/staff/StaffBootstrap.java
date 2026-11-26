package dev.kadkerja.staff;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * First start of a real install: with no staff yet and KADKERJA_ADMIN_PASSWORD set (at least 12
 * characters), creates the advisor "admin". Nothing is created without it, and no default password exists.
 */
@Component
@Order(0)
public class StaffBootstrap implements CommandLineRunner {
  private static final Logger log = LoggerFactory.getLogger(StaffBootstrap.class);
  private final StaffUserRepository users;
  private final PasswordEncoder encoder;
  private final String adminPassword;

  public StaffBootstrap(
      StaffUserRepository users,
      PasswordEncoder encoder,
      @Value("${kadkerja.admin-password:}") String adminPassword) {
    this.users = users;
    this.encoder = encoder;
    this.adminPassword = adminPassword;
  }

  @Override
  public void run(String... args) {
    if (users.count() > 0 || adminPassword.isEmpty()) {
      return;
    }
    if (adminPassword.length() < 12) {
      throw new IllegalStateException("KADKERJA_ADMIN_PASSWORD must be at least 12 characters.");
    }
    users.save(new StaffUser("admin", "Admin", encoder.encode(adminPassword), Role.ADVISOR));
    log.info("Created the first staff account \"admin\" (advisor).");
  }
}
