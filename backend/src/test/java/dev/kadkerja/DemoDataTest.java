package dev.kadkerja;

import static org.assertj.core.api.Assertions.assertThat;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("demo")
class DemoDataTest {
  @Autowired JobCardService service;
  @Autowired DemoData demo;

  @Test
  void seedsFourJobsInDifferentStatusesOnlyOnce() {
    assertThat(service.list(null)).hasSize(4);
    assertThat(service.list(null)).extracting(j -> j.status())
        .containsExactlyInAnyOrder(
            JobStatus.QUOTED, JobStatus.INSPECTING, JobStatus.IN_PROGRESS, JobStatus.RECEIVED);
    demo.run();
    assertThat(service.list(null)).hasSize(4);
  }
}
