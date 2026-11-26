package dev.kadkerja.job;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobCardRepository extends JpaRepository<JobCard, Long> {
  @EntityGraph(attributePaths = {"vehicle", "customer", "assignedTo"})
  List<JobCard> findAllByOrderByIdDesc();

  @EntityGraph(attributePaths = {"vehicle", "customer", "assignedTo"})
  List<JobCard> findByStatusOrderByIdDesc(JobStatus status);

  /** A technician's "my jobs" list. */
  @EntityGraph(attributePaths = {"vehicle", "customer", "assignedTo"})
  List<JobCard> findByAssignedToIdOrderByIdDesc(Long staffId);

  @EntityGraph(attributePaths = {"vehicle"})
  Optional<JobCard> findByPublicToken(String publicToken);

  boolean existsByVehicleIdAndStatusNotIn(Long vehicleId, Collection<JobStatus> statuses);
}
