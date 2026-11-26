package dev.kadkerja.staff;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.NotFoundException;
import dev.kadkerja.job.RuleException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The service advisor runs the staff list: adds people, deactivates and reactivates them, and sets
 * a new password when someone forgets theirs. Nobody is ever deleted (their name stays on old jobs).
 */
@Service
@Transactional
public class StaffService {
  static final int MIN_PASSWORD = 12;
  /** bcrypt reads only the first 72 bytes; a longer password would be silently cut. */
  static final int MAX_PASSWORD_BYTES = 72;

  private final StaffUserRepository users;
  private final PasswordEncoder encoder;
  private final JobCardService jobs;

  public StaffService(StaffUserRepository users, PasswordEncoder encoder, JobCardService jobs) {
    this.users = users;
    this.encoder = encoder;
    this.jobs = jobs;
  }

  public StaffUser create(String username, String name, Role role, String password) {
    String u = username.trim().toLowerCase(Locale.ROOT);
    checkPassword("password", password);
    if (users.existsByUsername(u)) {
      throw new FieldException(HttpStatus.CONFLICT, "username", "this username is taken");
    }
    return users.save(new StaffUser(u, name.trim(), encoder.encode(password), role));
  }

  /**
   * Stops [id] signing in and ends their sessions. Not yourself, and never the last active
   * advisor (nobody could manage staff any more). Their open jobs go back to "nobody" so another
   * technician can pick them up.
   */
  public StaffUser deactivate(String byUsername, long id) {
    StaffUser u = find(id);
    if (u.getUsername().equals(byUsername)) {
      throw new RuleException("You cannot deactivate your own account.");
    }
    if (!u.isActive()) {
      return u;
    }
    if (u.getRole() == Role.ADVISOR
        && users.findByRoleAndActiveTrueOrderById(Role.ADVISOR).size() <= 1) {
      throw new RuleException("Keep at least one active service advisor.");
    }
    u.deactivate();
    jobs.unassignOpenJobs(u.getId());
    return u;
  }

  public StaffUser activate(long id) {
    StaffUser u = find(id);
    u.activate();
    return u;
  }

  /** The advisor sets a new password for someone else (they use it to sign in, then change it). */
  public StaffUser setPassword(String byUsername, long id, String password) {
    StaffUser u = find(id);
    if (u.getUsername().equals(byUsername)) {
      throw new RuleException("Use \"Change my password\" for your own account.");
    }
    checkPassword("password", password);
    u.changePassword(encoder.encode(password));
    return u;
  }

  /**
   * Anyone changes their own password, giving the current one. Returns the new session epoch so
   * the caller's own session stays signed in while every other one ends.
   */
  public int changeOwnPassword(String username, String current, String password) {
    StaffUser u = users.findByUsername(username).orElseThrow(() -> new NotFoundException("No such account."));
    if (!encoder.matches(current, u.getPasswordHash())) {
      throw new FieldException(HttpStatus.BAD_REQUEST, "currentPassword", "this is not your current password");
    }
    checkPassword("newPassword", password);
    if (encoder.matches(password, u.getPasswordHash())) {
      throw new FieldException(HttpStatus.BAD_REQUEST, "newPassword", "choose a password different from the current one");
    }
    u.changePassword(encoder.encode(password));
    return u.getSessionEpoch();
  }

  private StaffUser find(long id) {
    return users.findById(id).orElseThrow(() -> new NotFoundException("There is no staff member " + id + "."));
  }

  static void checkPassword(String field, String password) {
    if (password.length() < MIN_PASSWORD) {
      throw new FieldException(HttpStatus.BAD_REQUEST, field, "use at least " + MIN_PASSWORD + " characters");
    }
    if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      throw new FieldException(HttpStatus.BAD_REQUEST, field, "use at most " + MAX_PASSWORD_BYTES + " bytes (about 72 letters)");
    }
  }
}
