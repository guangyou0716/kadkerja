package dev.kadkerja.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Random;
import org.junit.jupiter.api.Test;

class MoneyAndQuoteTest {
  private static final Instant NOW = Instant.parse("2026-11-26T02:00:00Z");

  private static JobCard job() {
    Customer c = new Customer("Test Customer", "012-0000000");
    return new JobCard(new Vehicle("abc123", "Perodua", "Axia", 2020, c), "Noise", 1000, NOW);
  }

  @Test
  void taxRoundsHalfUpToTheSen() {
    assertThat(Money.tax(0, 8)).isZero();
    assertThat(Money.tax(100, 8)).isEqualTo(8);
    assertThat(Money.tax(6, 8)).isZero(); // 0.48 sen
    assertThat(Money.tax(7, 8)).isEqualTo(1); // 0.56 sen
    assertThat(Money.tax(625, 8)).isEqualTo(50); // exactly 50.00
    assertThat(Money.tax(1_250, 6)).isEqualTo(75);
    assertThat(Money.tax(12_345, 0)).isZero();
    assertThatThrownBy(() -> Money.tax(-1, 8)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Money.tax(Long.MAX_VALUE, 8)).isInstanceOf(ArithmeticException.class);
  }

  @Test
  void formatsRinggit() {
    assertThat(Money.format(0)).isEqualTo("RM 0.00");
    assertThat(Money.format(5)).isEqualTo("RM 0.05");
    assertThat(Money.format(123_450)).isEqualTo("RM 1,234.50");
    assertThat(Money.format(-250)).isEqualTo("-RM 2.50");
  }

  @Test
  void randomQuotesAlwaysAddUp() {
    Random r = new Random(26_11_2026);
    for (int round = 0; round < 2_000; round++) {
      JobCard j = job();
      int rate = r.nextInt(11);
      long expectSub = 0;
      long expectTax = 0;
      int n = 1 + r.nextInt(8);
      for (int i = 0; i < n; i++) {
        int qty = 1 + r.nextInt(10);
        long price = r.nextInt(100_000);
        boolean taxable = r.nextBoolean();
        j.addLine(r.nextBoolean() ? LineKind.PART : LineKind.LABOUR, "x", qty, price, taxable);
        expectSub += qty * price;
        // Tax per line, half up: never more than half a sen off the exact amount per line.
        long exactTimes100 = qty * price * rate;
        long lineTax = taxable ? Money.tax(qty * price, rate) : 0;
        if (taxable) {
          assertThat(Math.abs(lineTax * 100 - exactTimes100)).isLessThanOrEqualTo(50);
        }
        expectTax += lineTax;
      }
      assertThat(j.subtotalSen()).isEqualTo(expectSub);
      assertThat(j.taxSen(rate)).isEqualTo(expectTax);
      assertThat(j.totalSen(rate)).isEqualTo(expectSub + expectTax);
      assertThat(j.getLines().stream().mapToLong(l -> l.subtotalSen() + l.taxSen(rate)).sum())
          .isEqualTo(j.totalSen(rate));
    }
  }

  @Test
  void quoteRulesFollowTheStatus() {
    JobCard j = job();
    assertThatThrownBy(() -> j.moveTo(JobStatus.QUOTED, null, NOW))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("cannot move");
    j.moveTo(JobStatus.INSPECTING, null, NOW);
    assertThatThrownBy(() -> j.moveTo(JobStatus.QUOTED, null, NOW))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("at least one quote line");
    j.addLine(LineKind.LABOUR, "Inspection", 1, 5_000, true);
    j.moveTo(JobStatus.QUOTED, null, NOW);
    assertThat(j.getQuoteVersion()).isEqualTo(1);
    assertThatThrownBy(() -> j.addLine(LineKind.PART, "Late", 1, 100, true))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("INSPECTING");
    // Redo the quote: back to inspecting, edit, send again -> version 2.
    j.moveTo(JobStatus.INSPECTING, "Customer asked for cheaper pads", NOW);
    j.addLine(LineKind.PART, "Pads (economy)", 1, 8_000, true);
    j.moveTo(JobStatus.QUOTED, null, NOW);
    assertThat(j.getQuoteVersion()).isEqualTo(2);
    assertThat(j.getEvents()).extracting(StatusEvent::getTo)
        .containsExactly(
            JobStatus.RECEIVED, JobStatus.INSPECTING, JobStatus.QUOTED,
            JobStatus.INSPECTING, JobStatus.QUOTED);
    assertThat(j.getEvents().get(3).getNote()).isEqualTo("Customer asked for cheaper pads");
  }

  @Test
  void platesAreNormalisedHoweverTheyAreTyped() {
    assertThat(Vehicle.normalizePlate(" pkr1234 ")).isEqualTo("PKR 1234");
    assertThat(Vehicle.normalizePlate("PKR   1234")).isEqualTo("PKR 1234");
    assertThat(Vehicle.normalizePlate("wxy1234a")).isEqualTo("WXY 1234 A");
    assertThat(Vehicle.normalizePlate("V 1")).isEqualTo("V 1");
  }

  @Test
  void tokensAreLongAndDifferent() {
    JobCard a = job();
    JobCard b = job();
    assertThat(a.getPublicToken()).hasSize(24).matches("[A-Za-z0-9_-]+");
    assertThat(a.getPublicToken()).isNotEqualTo(b.getPublicToken());
  }
}
