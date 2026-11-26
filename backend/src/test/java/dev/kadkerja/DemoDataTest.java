package dev.kadkerja;

import static org.assertj.core.api.Assertions.assertThat;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.stock.PartView;
import dev.kadkerja.stock.StockService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("demo")
class DemoDataTest {
  @Autowired JobCardService service;
  @Autowired DemoData demo;
  @Autowired StockService stock;

  @Test
  void seedsFourJobsInDifferentStatusesOnlyOnce() {
    assertThat(service.list(null)).hasSize(4);
    assertThat(service.list(null)).extracting(j -> j.status())
        .containsExactlyInAnyOrder(
            JobStatus.QUOTED, JobStatus.INSPECTING, JobStatus.IN_PROGRESS, JobStatus.RECEIVED);
    // The approved job took its ignition coil off the shelf (1 -> 0, now low).
    assertThat(stock.list()).extracting(PartView::sku, PartView::onHand)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("BAT-NS40ZL", 4),
            org.assertj.core.groups.Tuple.tuple("BP-MYV-F", 6),
            org.assertj.core.groups.Tuple.tuple("IGN-SAGA", 0),
            org.assertj.core.groups.Tuple.tuple("OIL-5W30-4", 3));
    demo.run();
    assertThat(service.list(null)).hasSize(4);
    assertThat(stock.list()).hasSize(4);
  }
}
