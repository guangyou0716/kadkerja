package dev.kadkerja.job;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobCardRepository extends JpaRepository<JobCard, Long> {
  @EntityGraph(attributePaths = {"vehicle", "customer"})
  List<JobCard> findAllByOrderByIdDesc();

  @EntityGraph(attributePaths = {"vehicle", "customer"})
  List<JobCard> findByStatusOrderByIdDesc(JobStatus status);

  @EntityGraph(attributePaths = {"vehicle"})
  Optional<JobCard> findByPublicToken(String publicToken);

  boolean existsByVehicleIdAndStatusNotIn(Long vehicleId, Collection<JobStatus> statuses);
}
