package dev.kadkerja.staff;

/**
 * The signed-in person making a change: their staff id (null only for test users that are not in
 * the database) and role.
 */
public record Who(Long id, Role role) {
  /** The front desk itself (demo data, tests). */
  public static final Who FRONT_DESK = new Who(null, Role.ADVISOR);

  public boolean technician() {
    return role == Role.TECHNICIAN;
  }
}
