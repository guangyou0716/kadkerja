package dev.kadkerja.stock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.kadkerja.job.RuleException;
import org.junit.jupiter.api.Test;

class PartTest {
  @Test
  void partNumbersAreTrimmedAndUpperCase() {
    assertThat(new Part("  bp-001 ", "Pads", 100, 0, 0).getSku()).isEqualTo("BP-001");
  }

  @Test
  void takingMayGoBelowZeroAndLowMeansAtOrBelowTheReorderLevel() {
    Part p = new Part("BP", "Pads", 100, 3, 2);
    assertThat(p.low()).isFalse();
    p.take(1);
    assertThat(p.getOnHand()).isEqualTo(2);
    assertThat(p.low()).isTrue();
    p.take(4);
    assertThat(p.getOnHand()).isEqualTo(-2);
    assertThatThrownBy(() -> p.take(0)).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void receiveAddsAndACountSetsAndReportsTheDifference() {
    Part p = new Part("BP", "Pads", 100, -2, 0);
    p.receive(5);
    assertThat(p.getOnHand()).isEqualTo(3);
    assertThat(p.count(10)).isEqualTo(7);
    assertThat(p.count(10)).isZero();
    assertThatThrownBy(() -> p.receive(0)).isInstanceOf(RuleException.class);
    assertThatThrownBy(() -> p.count(-1)).isInstanceOf(RuleException.class);
    assertThat(p.getOnHand()).isEqualTo(10);
  }
}
