package dev.kadkerja.staff;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface StaffUserRepository extends JpaRepository<StaffUser, Long> {
  Optional<StaffUser> findByUsername(String username);

  boolean existsByUsername(String username);

  /**
   * The active people with one role, locked until the transaction ends, so two advisors
   * deactivating each other at the same moment cannot leave the workshop with none.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  List<StaffUser> findByRoleAndActiveTrueOrderById(Role role);
}
