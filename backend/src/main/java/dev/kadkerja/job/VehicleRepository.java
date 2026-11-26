package dev.kadkerja.job;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleRepository extends JpaRepository<Vehicle, Long> {
  Optional<Vehicle> findByPlate(String plate);
}
