package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;

import dev.kadkerja.job.JobStatus;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RoleTest {
  @Test
  void advisorMayMakeEveryMoveTechnicianOnlyTheThreeWorkshopOnes() {
    Set<List<JobStatus>> tech = new HashSet<>();
    for (JobStatus from : JobStatus.values()) {
      for (JobStatus to : JobStatus.values()) {
        assertThat(Role.ADVISOR.mayMove(from, to)).isTrue();
        if (Role.TECHNICIAN.mayMove(from, to)) {
          tech.add(List.of(from, to));
        }
      }
    }
    assertThat(tech)
        .containsExactlyInAnyOrder(
            List.of(JobStatus.RECEIVED, JobStatus.INSPECTING),
            List.of(JobStatus.APPROVED, JobStatus.IN_PROGRESS),
            List.of(JobStatus.IN_PROGRESS, JobStatus.READY));
  }
}
