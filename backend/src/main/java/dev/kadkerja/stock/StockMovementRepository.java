package dev.kadkerja.stock;

import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {
  @EntityGraph(attributePaths = {"jobCard"})
  List<StockMovement> findByPartIdOrderByIdDesc(Long partId, Limit limit);

  boolean existsByJobCardIdAndReason(Long jobCardId, StockMovement.Reason reason);
}
