package dev.kadkerja.staff;

import dev.kadkerja.job.JobStatus;

/**
 * What a signed-in person may do. The service advisor (front desk) runs the whole job; a
 * technician works on the car: inspection, quote lines, repair, ready.
 */
public enum Role {
  ADVISOR,
  TECHNICIAN;

  /**
   * Moves this role may make (the job's own rules still apply on top). A technician starts the
   * inspection, starts the approved repair and marks it ready; sending, redoing or answering a
   * quote, cancelling and handing the car back are the advisor's.
   */
  public boolean mayMove(JobStatus from, JobStatus to) {
    return this == ADVISOR
        || (from == JobStatus.RECEIVED && to == JobStatus.INSPECTING)
        || (from == JobStatus.APPROVED && to == JobStatus.IN_PROGRESS)
        || (from == JobStatus.IN_PROGRESS && to == JobStatus.READY);
  }
}
