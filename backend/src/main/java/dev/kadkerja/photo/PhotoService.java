package dev.kadkerja.photo;

import dev.kadkerja.job.JobCard;
import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.job.NotFoundException;
import dev.kadkerja.job.RuleException;
import dev.kadkerja.staff.Who;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Before/after photos of a job card. */
@Service
@Transactional
public class PhotoService {
  /** Per job card: enough for a repair, small enough for one page. */
  public static final int MAX_PER_JOB = 12;

  /** "After" photos show work done, so only once the repair has started. */
  static final Set<JobStatus> AFTER_ALLOWED = EnumSet.of(JobStatus.IN_PROGRESS, JobStatus.READY);

  private final JobPhotoRepository photos;
  private final JobCardService jobs;
  private final EntityManager em;
  private final Clock clock;

  public PhotoService(JobPhotoRepository photos, JobCardService jobs, EntityManager em, Clock clock) {
    this.photos = photos;
    this.jobs = jobs;
    this.em = em;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<PhotoInfo> list(long jobId) {
    jobs.get(jobId);
    return photos.infos(jobId);
  }

  public PhotoInfo add(long jobId, PhotoStage stage, byte[] upload, String caption, Who who, String byName) {
    JobCard job = jobs.jobToChange(jobId, who);
    requireOpen(job);
    if (stage == PhotoStage.AFTER && !AFTER_ALLOWED.contains(job.getStatus())) {
      throw new RuleException("After photos can be added once the repair has started (now " + job.getStatus() + ").");
    }
    // Two uploads at the same moment cannot both squeeze under the limit: the job's version goes up,
    // so the second one fails its version check (409) instead.
    em.lock(job, LockModeType.OPTIMISTIC_FORCE_INCREMENT);
    if (photos.countByJobCardId(jobId) >= MAX_PER_JOB) {
      throw new RuleException("A job card can have at most " + MAX_PER_JOB + " photos. Remove one first.");
    }
    PhotoImages.Jpeg jpeg = PhotoImages.toStoredJpeg(upload);
    String text = caption == null || caption.isBlank() ? null : caption.trim();
    JobPhoto saved = photos.saveAndFlush(new JobPhoto(job, stage, jpeg, text, clock.instant(), byName));
    return photos.infos(jobId).stream().filter(p -> p.id() == saved.getId()).findFirst().orElseThrow();
  }

  public void remove(long jobId, long photoId, Who who) {
    JobCard job = jobs.jobToChange(jobId, who);
    requireOpen(job);
    photos.delete(photo(jobId, photoId));
  }

  @Transactional(readOnly = true)
  public byte[] image(long jobId, long photoId) {
    return photo(jobId, photoId).getData();
  }

  /** For the customer's link: only a photo of the job behind that link. */
  @Transactional(readOnly = true)
  public byte[] publicImage(String token, String key) {
    JobCard job = jobs.jobForLink(token);
    return photos
        .findByPublicKeyAndJobCardId(key, job.getId())
        .orElseThrow(() -> new NotFoundException("There is no such photo."))
        .getData();
  }

  private JobPhoto photo(long jobId, long photoId) {
    return photos
        .findByIdAndJobCardId(photoId, jobId)
        .orElseThrow(() -> new NotFoundException("This job card has no photo " + photoId + "."));
  }

  private static void requireOpen(JobCard job) {
    if (job.getStatus().finished()) {
      throw new RuleException("The photos of a " + job.getStatus() + " job can no longer be changed.");
    }
  }
}
