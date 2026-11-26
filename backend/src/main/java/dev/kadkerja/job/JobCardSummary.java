package dev.kadkerja.job;

import dev.kadkerja.staff.StaffUser;
import java.time.Instant;

/** One row of the job board. */
public record JobCardSummary(
    long id,
    String number,
    JobStatus status,
    String plate,
    String vehicle,
    String customer,
    String complaint,
    Instant createdAt,
    Assignee assignedTo) {

  /** A member of staff as shown next to a job (no username or role details). */
  public record Assignee(long id, String name) {
    static Assignee of(StaffUser u) {
      return u == null ? null : new Assignee(u.getId(), u.getDisplayName());
    }
  }

  public static JobCardSummary of(JobCard j) {
    var v = j.getVehicle();
    return new JobCardSummary(
        j.getId(),
        j.number(),
        j.getStatus(),
        v.getPlate(),
        v.getMake() + " " + v.getModel(),
        j.getCustomer().getName(),
        j.getComplaint(),
        j.getCreatedAt(),
        Assignee.of(j.getAssignedTo()));
  }
}
