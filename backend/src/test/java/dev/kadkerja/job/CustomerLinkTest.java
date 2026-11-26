package dev.kadkerja.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CustomerLinkTest {
  private static final Instant NOW = Instant.parse("2026-11-26T02:00:00Z");

  private static JobCard quoted() {
    Customer c = new Customer("Test Customer", "012-0000000");
    JobCard j = new JobCard(new Vehicle("abc123", "Perodua", "Axia", 2020, c), "Noise", 1000, NOW);
    j.addLine(LineKind.LABOUR, "Check", 1, 5_000, true);
    j.moveTo(JobStatus.INSPECTING, null, NOW);
    j.moveTo(JobStatus.QUOTED, null, NOW);
    return j;
  }

  @Test
  void tokensAre24UrlSafeCharactersAndDoNotRepeat() {
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < 5_000; i++) {
      String t = JobCard.newToken();
      assertThat(t).matches("[A-Za-z0-9_-]{24}");
      assertThat(seen.add(t)).isTrue();
    }
  }

  @Test
  void resettingTheLinkGivesANewToken() {
    JobCard j = quoted();
    String old = j.getPublicToken();
    j.resetPublicToken();
    assertThat(j.getPublicToken()).isNotEqualTo(old).matches("[A-Za-z0-9_-]{24}");
  }

  @Test
  void customerApprovesTheQuoteTheySaw() {
    JobCard j = quoted();
    j.answerQuote(Decision.APPROVE, 1, " ok ", NOW.plusSeconds(60));
    assertThat(j.getStatus()).isEqualTo(JobStatus.APPROVED);
    StatusEvent last = j.getEvents().getLast();
    assertThat(last.getActor()).isEqualTo(Actor.CUSTOMER);
    assertThat(last.getFrom()).isEqualTo(JobStatus.QUOTED);
    assertThat(j.getEvents().getFirst().getActor()).isEqualTo(Actor.STAFF);
  }

  @Test
  void customerDeclines() {
    JobCard j = quoted();
    j.answerQuote(Decision.DECLINE, 1, "Too expensive", NOW);
    assertThat(j.getStatus()).isEqualTo(JobStatus.DECLINED);
    assertThat(j.getEvents().getLast().getNote()).isEqualTo("Too expensive");
  }

  @Test
  void anAnswerToAnOlderQuoteIsRefused() {
    JobCard j = quoted();
    // The workshop redoes the quote (version 2) while the customer still has version 1 open.
    j.moveTo(JobStatus.INSPECTING, "Found more", NOW);
    j.addLine(LineKind.PART, "Extra part", 1, 9_000, true);
    j.moveTo(JobStatus.QUOTED, null, NOW);
    assertThat(j.getQuoteVersion()).isEqualTo(2);
    assertThatThrownBy(() -> j.answerQuote(Decision.APPROVE, 1, null, NOW))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("changed the quote");
    assertThat(j.getStatus()).isEqualTo(JobStatus.QUOTED);
    j.answerQuote(Decision.APPROVE, 2, null, NOW);
    assertThat(j.getStatus()).isEqualTo(JobStatus.APPROVED);
  }

  @Test
  void answersWhileTheQuoteIsBeingRedoneOrAfterAnsweringAreRefused() {
    JobCard j = quoted();
    j.moveTo(JobStatus.INSPECTING, null, NOW);
    // Same version number as the page, but the quote is being changed right now.
    assertThatThrownBy(() -> j.answerQuote(Decision.APPROVE, 1, null, NOW))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("not waiting");
    assertThat(j.quoteVisibleToCustomer()).isFalse();

    JobCard k = quoted();
    k.answerQuote(Decision.DECLINE, 1, null, NOW);
    assertThatThrownBy(() -> k.answerQuote(Decision.APPROVE, 1, null, NOW))
        .isInstanceOf(RuleException.class)
        .hasMessageContaining("already been answered");
    assertThat(k.getStatus()).isEqualTo(JobStatus.DECLINED);
    assertThat(k.getEvents()).hasSize(4);
  }

  @Test
  void draftQuotesAreHiddenFromTheCustomer() {
    Customer c = new Customer("Test Customer", "012-0000000");
    JobCard j = new JobCard(new Vehicle("abc123", "Perodua", "Axia", 2020, c), "Noise", 1000, NOW);
    j.addLine(LineKind.LABOUR, "Draft", 1, 5_000, true);
    assertThat(j.quoteVisibleToCustomer()).isFalse();
    j.moveTo(JobStatus.INSPECTING, null, NOW);
    j.moveTo(JobStatus.QUOTED, null, NOW);
    assertThat(j.quoteVisibleToCustomer()).isTrue();
  }

  @Test
  void linkStopsWorking30DaysAfterTheJobIsFinished() {
    JobCard j = quoted();
    assertThat(j.linkOpen(NOW.plus(Duration.ofDays(400)))).isTrue(); // still open job
    j.answerQuote(Decision.DECLINE, 1, null, NOW);
    j.moveTo(JobStatus.READY, null, NOW);
    Instant handedBack = NOW.plus(Duration.ofDays(2));
    j.moveTo(JobStatus.COLLECTED, null, handedBack);
    assertThat(j.linkOpen(handedBack.plus(Duration.ofDays(29)))).isTrue();
    assertThat(j.linkOpen(handedBack.plus(Duration.ofDays(30)))).isFalse();

    JobCard cancelled = quoted();
    cancelled.moveTo(JobStatus.CANCELLED, null, NOW);
    assertThat(cancelled.linkOpen(NOW.plus(Duration.ofDays(31)))).isFalse();
  }
}
