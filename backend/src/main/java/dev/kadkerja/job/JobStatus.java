package dev.kadkerja.job;

import java.util.EnumSet;
import java.util.Set;

/**
 * Where a car is in the workshop. The allowed moves are the only source of truth for what the
 * server accepts; every other move is refused.
 */
public enum JobStatus {
  RECEIVED,
  INSPECTING,
  QUOTED,
  APPROVED,
  DECLINED,
  IN_PROGRESS,
  READY,
  COLLECTED,
  CANCELLED;

  /** The statuses this one may move to. */
  public Set<JobStatus> next() {
    return switch (this) {
      case RECEIVED -> EnumSet.of(INSPECTING, CANCELLED);
      // Back from QUOTED to INSPECTING = the quote is being redone.
      case INSPECTING -> EnumSet.of(QUOTED, CANCELLED);
      case QUOTED -> EnumSet.of(APPROVED, DECLINED, INSPECTING, CANCELLED);
      case APPROVED -> EnumSet.of(IN_PROGRESS);
      case IN_PROGRESS -> EnumSet.of(READY);
      // Declined: the car goes back unrepaired.
      case DECLINED -> EnumSet.of(READY);
      case READY -> EnumSet.of(COLLECTED);
      case COLLECTED, CANCELLED -> EnumSet.noneOf(JobStatus.class);
    };
  }

  public boolean canMoveTo(JobStatus to) {
    return next().contains(to);
  }

  /** The quote can only be edited before the customer has answered it. */
  public boolean quoteEditable() {
    return this == RECEIVED || this == INSPECTING;
  }

  public boolean finished() {
    return next().isEmpty();
  }
}
