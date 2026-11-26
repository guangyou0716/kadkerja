package dev.kadkerja.job;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobCardRepository extends JpaRepository<JobCard, Long> {
  @EntityGraph(attributePaths = {"vehicle", "customer"})
  List<JobCard> findAllByOrderByIdDesc();

  @EntityGraph(attributePaths = {"vehicle", "customer"})
  List<JobCard> findByStatusOrderByIdDesc(JobStatus status);

  boolean existsByVehicleIdAndStatusNotIn(Long vehicleId, Collection<JobStatus> statuses);
}
