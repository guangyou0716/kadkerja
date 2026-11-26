package dev.kadkerja.job;

import static dev.kadkerja.job.JobStatus.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class JobStatusTest {
  /** The whole flow written out once more, independently of the enum, so a change shows up here. */
  private static final Map<JobStatus, Set<JobStatus>> ALLOWED =
      Map.of(
          RECEIVED, EnumSet.of(INSPECTING, CANCELLED),
          INSPECTING, EnumSet.of(QUOTED, CANCELLED),
          QUOTED, EnumSet.of(APPROVED, DECLINED, INSPECTING, CANCELLED),
          APPROVED, EnumSet.of(IN_PROGRESS),
          DECLINED, EnumSet.of(READY),
          IN_PROGRESS, EnumSet.of(READY),
          READY, EnumSet.of(COLLECTED),
          COLLECTED, EnumSet.noneOf(JobStatus.class),
          CANCELLED, EnumSet.noneOf(JobStatus.class));

  @Test
  void everyPairIsAllowedOrRefusedAsTheFlowSays() {
    int checked = 0;
    for (JobStatus from : JobStatus.values()) {
      for (JobStatus to : JobStatus.values()) {
        assertThat(from.canMoveTo(to))
            .as("%s -> %s", from, to)
            .isEqualTo(ALLOWED.get(from).contains(to));
        checked++;
      }
    }
    assertThat(checked).isEqualTo(81);
  }

  @Test
  void noStatusMovesToItself() {
    for (JobStatus s : JobStatus.values()) {
      assertThat(s.canMoveTo(s)).as(s.name()).isFalse();
    }
  }

  @Test
  void onlyCollectedAndCancelledAreFinished() {
    assertThat(EnumSet.allOf(JobStatus.class).stream().filter(JobStatus::finished))
        .containsExactlyInAnyOrder(COLLECTED, CANCELLED);
  }

  @Test
  void everyStatusCanBeReachedFromReceivedAndEveryPathEnds() {
    Set<JobStatus> seen = EnumSet.of(RECEIVED);
    var todo = new java.util.ArrayDeque<>(seen);
    while (!todo.isEmpty()) {
      for (JobStatus n : todo.pop().next()) {
        if (seen.add(n)) todo.add(n);
      }
    }
    assertThat(seen).isEqualTo(EnumSet.allOf(JobStatus.class));
    // From every status a finished one can still be reached (no dead end).
    for (JobStatus s : JobStatus.values()) {
      Set<JobStatus> reach = EnumSet.of(s);
      var q = new java.util.ArrayDeque<>(reach);
      while (!q.isEmpty()) {
        for (JobStatus n : q.pop().next()) {
          if (reach.add(n)) q.add(n);
        }
      }
      assertThat(reach.stream().anyMatch(JobStatus::finished)).as(s.name()).isTrue();
    }
  }

  @Test
  void theQuoteIsEditableOnlyBeforeItIsSent() {
    assertThat(EnumSet.allOf(JobStatus.class).stream().filter(JobStatus::quoteEditable))
        .containsExactlyInAnyOrder(RECEIVED, INSPECTING);
  }
}
