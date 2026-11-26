package dev.kadkerja.staff;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffUserRepository extends JpaRepository<StaffUser, Long> {
  Optional<StaffUser> findByUsername(String username);
}
