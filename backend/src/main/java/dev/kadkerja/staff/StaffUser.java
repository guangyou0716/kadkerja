package dev.kadkerja.staff;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "staff_user")
public class StaffUser {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true, length = 40)
  private String username;

  @Column(name = "display_name", nullable = false, length = 100)
  private String displayName;

  @Column(name = "password_hash", nullable = false, length = 100)
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private Role role;

  @Column(nullable = false)
  private boolean active = true;

  /** Sessions remember this at sign-in; a higher number here means they have ended. */
  @Column(name = "session_epoch", nullable = false)
  private int sessionEpoch;

  protected StaffUser() {}

  public StaffUser(String username, String displayName, String passwordHash, Role role) {
    this.username = username.trim().toLowerCase(java.util.Locale.ROOT);
    this.displayName = displayName;
    this.passwordHash = passwordHash;
    this.role = role;
  }

  /** Can no longer sign in, and sessions already signed in end at their next request. */
  public void deactivate() {
    active = false;
    sessionEpoch++;
  }

  public void activate() {
    active = true;
  }

  /** A new password (already hashed); sessions signed in with the old one end. */
  public void changePassword(String newHash) {
    passwordHash = newHash;
    sessionEpoch++;
  }

  public int getSessionEpoch() {
    return sessionEpoch;
  }

  public Long getId() {
    return id;
  }

  public String getUsername() {
    return username;
  }

  public String getDisplayName() {
    return displayName;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public Role getRole() {
    return role;
  }

  public boolean isActive() {
    return active;
  }
}
