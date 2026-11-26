package dev.kadkerja.photo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface JobPhotoRepository extends JpaRepository<JobPhoto, Long> {
  /** The job's photos, oldest first, without loading the image bytes. */
  @Query(
      "select new dev.kadkerja.photo.PhotoInfo(p.id, p.publicKey, p.stage, p.width, p.height, p.sizeBytes,"
          + " p.caption, p.createdAt, p.byName) from JobPhoto p where p.jobCard.id = :jobId order by p.id")
  List<PhotoInfo> infos(long jobId);

  long countByJobCardId(long jobId);

  /** A photo only through its own job (photo 5 of job 2 is not found under job 3). */
  Optional<JobPhoto> findByIdAndJobCardId(long id, long jobId);

  Optional<JobPhoto> findByPublicKeyAndJobCardId(String publicKey, long jobId);
}
