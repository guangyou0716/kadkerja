package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class LoginThrottleTest {
  static final class TestClock extends Clock {
    final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-26T02:00:00Z"));

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now.get();
    }
  }

  @Test
  void fiveFailuresBlockThatUserFromThatAddressFor15Minutes() {
    TestClock clock = new TestClock();
    LoginThrottle t = new LoginThrottle(clock);
    for (int i = 0; i < 4; i++) {
      t.failed("advisor", "10.0.0.1");
    }
    assertThat(t.blocked("advisor", "10.0.0.1")).isFalse();
    t.failed("advisor", "10.0.0.1");
    assertThat(t.blocked("advisor", "10.0.0.1")).isTrue();
    assertThat(t.blocked("advisor", "10.0.0.2")).isFalse();
    assertThat(t.blocked("tech", "10.0.0.1")).isFalse();
    clock.now.set(clock.now.get().plusSeconds(15 * 60 - 1));
    assertThat(t.blocked("advisor", "10.0.0.1")).isTrue();
    clock.now.set(clock.now.get().plusSeconds(1));
    assertThat(t.blocked("advisor", "10.0.0.1")).isFalse();
  }

  @Test
  void manyUsernamesFromOneAddressAreBlockedToo() {
    LoginThrottle t = new LoginThrottle(new TestClock());
    for (int i = 0; i < 20; i++) {
      t.failed("user" + i, "10.0.0.9");
    }
    assertThat(t.blocked("someone-new", "10.0.0.9")).isTrue();
    assertThat(t.blocked("someone-new", "10.0.0.8")).isFalse();
  }

  @Test
  void aGoodSignInClearsThatUsersCount() {
    LoginThrottle t = new LoginThrottle(new TestClock());
    for (int i = 0; i < 4; i++) {
      t.failed("advisor", "10.0.0.1");
    }
    t.succeeded("advisor", "10.0.0.1");
    t.failed("advisor", "10.0.0.1");
    assertThat(t.blocked("advisor", "10.0.0.1")).isFalse();
  }
}
