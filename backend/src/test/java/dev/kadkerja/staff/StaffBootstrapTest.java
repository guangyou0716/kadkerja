package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

class StaffBootstrapTest {
  private final PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();

  @Test
  void createsTheFirstAdvisorOnlyOnAnEmptyDatabaseWithALongEnoughPassword() {
    StaffUserRepository users = mock(StaffUserRepository.class);
    when(users.count()).thenReturn(0L);
    new StaffBootstrap(users, encoder, "a long enough secret").run();
    ArgumentCaptor<StaffUser> saved = ArgumentCaptor.forClass(StaffUser.class);
    verify(users).save(saved.capture());
    assertThat(saved.getValue().getUsername()).isEqualTo("admin");
    assertThat(saved.getValue().getRole()).isEqualTo(Role.ADVISOR);
    assertThat(saved.getValue().getPasswordHash()).startsWith("{bcrypt}").doesNotContain("a long enough secret");
    assertThat(encoder.matches("a long enough secret", saved.getValue().getPasswordHash())).isTrue();
  }

  @Test
  void doesNothingWithoutAPasswordOrWhenStaffExistAndRefusesAShortOne() {
    StaffUserRepository empty = mock(StaffUserRepository.class);
    when(empty.count()).thenReturn(0L);
    new StaffBootstrap(empty, encoder, "").run();
    verify(empty, never()).save(any());
    assertThatThrownBy(() -> new StaffBootstrap(empty, encoder, "short").run())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("12");

    StaffUserRepository existing = mock(StaffUserRepository.class);
    when(existing.count()).thenReturn(2L);
    new StaffBootstrap(existing, encoder, "a long enough secret").run();
    verify(existing, never()).save(any());
  }
}
