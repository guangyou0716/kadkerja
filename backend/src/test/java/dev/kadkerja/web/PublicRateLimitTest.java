package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PublicRateLimitTest {
  /** A clock the test can move. */
  static final class TestClock extends Clock {
    final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-26T02:00:10Z"));

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now.get();
    }
  }

  @Test
  void countsPerClientAndPerKindAndStartsAgainNextMinute() {
    TestClock clock = new TestClock();
    PublicRateLimit limit = new PublicRateLimit(clock, 3, 1);
    for (int i = 0; i < 3; i++) {
      assertThat(limit.allow("r:10.0.0.1", 3)).isTrue();
    }
    assertThat(limit.allow("r:10.0.0.1", 3)).isFalse();
    assertThat(limit.allow("r:10.0.0.2", 3)).isTrue();
    assertThat(limit.allow("w:10.0.0.1", 1)).isTrue();
    assertThat(limit.allow("w:10.0.0.1", 1)).isFalse();
    clock.now.set(Instant.parse("2026-11-26T02:01:00Z"));
    assertThat(limit.allow("r:10.0.0.1", 3)).isTrue();
    assertThat(limit.allow("w:10.0.0.1", 1)).isTrue();
  }

  @SpringBootTest(
      properties = {"kadkerja.public.reads-per-minute=3", "kadkerja.public.answers-per-minute=2"})
  @AutoConfigureMockMvc
  @WithMockUser(roles = "ADVISOR")
  @org.junit.jupiter.api.Nested
  class OverHttp {
    @Autowired MockMvc mvc;

    @Test
    void tooManyRequestsGet429WithRetryAfterAndStaffApiIsNotLimited() throws Exception {
      String unknown = "/api/public/jobs/ZZZZZZZZZZZZZZZZZZZZZZZZ";
      for (int i = 0; i < 3; i++) {
        mvc.perform(get(unknown).with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
            .andExpect(status().isNotFound());
      }
      mvc.perform(get(unknown).with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
          .andExpect(status().isTooManyRequests())
          .andExpect(header().exists("Retry-After"))
          .andExpect(jsonPath("$.title").value("Too many requests"));
      // Another client is not affected.
      mvc.perform(get(unknown).with(r -> { r.setRemoteAddr("10.9.9.8"); return r; }))
          .andExpect(status().isNotFound());
      // Answers have their own, smaller allowance.
      for (int i = 0; i < 2; i++) {
        mvc.perform(
                post(unknown + "/answer")
                    .with(r -> { r.setRemoteAddr("10.9.9.9"); return r; })
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"decision\":\"APPROVE\",\"quoteVersion\":1}"))
            .andExpect(status().isNotFound());
      }
      mvc.perform(
              post(unknown + "/answer")
                  .with(r -> { r.setRemoteAddr("10.9.9.9"); return r; })
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"decision\":\"APPROVE\",\"quoteVersion\":1}"))
          .andExpect(status().isTooManyRequests());
      for (int i = 0; i < 10; i++) {
        mvc.perform(get("/api/jobs").with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
            .andExpect(status().isOk());
      }
    }
  }
}
