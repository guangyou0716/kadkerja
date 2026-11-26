package dev.kadkerja.stock;

import java.time.Instant;

/** One line of a part's stock history. jobId/jobNumber only for parts taken for a job. */
public record MovementView(
    long id,
    Instant at,
    int change,
    StockMovement.Reason reason,
    Long jobId,
    String jobNumber,
    String by) {
  static MovementView of(StockMovement m) {
    var job = m.getJobCard();
    return new MovementView(
        m.getId(),
        m.getAt(),
        m.getQuantityChange(),
        m.getReason(),
        job == null ? null : job.getId(),
        job == null ? null : job.number(),
        m.getByName());
  }
}
