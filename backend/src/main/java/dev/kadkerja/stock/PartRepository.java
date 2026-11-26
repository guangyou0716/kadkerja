package dev.kadkerja.stock;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface PartRepository extends JpaRepository<Part, Long> {
  List<Part> findAllByOrderBySkuAsc();

  boolean existsBySku(String sku);

  /**
   * The parts to change, locked until the transaction ends, always in id order (two approvals
   * that share parts then wait for each other instead of deadlocking, and no count is lost).
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from Part p where p.id in :ids order by p.id")
  List<Part> lockAll(Collection<Long> ids);

  default Optional<Part> lock(long id) {
    return lockAll(List.of(id)).stream().findFirst();
  }
}
