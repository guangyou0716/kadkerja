package dev.kadkerja.job;

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
    Instant createdAt) {

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
        j.getCreatedAt());
  }
}
