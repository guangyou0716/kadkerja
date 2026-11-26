package dev.kadkerja.stock;

import dev.kadkerja.job.JobCard;
import dev.kadkerja.job.NotFoundException;
import dev.kadkerja.job.QuoteLine;
import dev.kadkerja.staff.FieldException;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** The parts shelf: what is in stock, and every change to it. */
@Service
@Transactional
public class StockService {
  /** How much history one request returns. */
  static final int HISTORY_LIMIT = 50;

  private final PartRepository parts;
  private final StockMovementRepository movements;
  private final Clock clock;

  public StockService(PartRepository parts, StockMovementRepository movements, Clock clock) {
    this.parts = parts;
    this.movements = movements;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<PartView> list() {
    return parts.findAllByOrderBySkuAsc().stream().map(PartView::of).toList();
  }

  /** A part used in a quote line. Unknown ids are refused before anything is changed. */
  @Transactional(readOnly = true)
  public Part find(long id) {
    return parts.findById(id).orElseThrow(() -> new NotFoundException("There is no stock part " + id + "."));
  }

  public PartView create(String sku, String name, long unitPriceSen, int onHand, int reorderLevel, String by) {
    String normalized = Part.normalizeSku(sku);
    if (parts.existsBySku(normalized)) {
      throw new FieldException(HttpStatus.CONFLICT, "sku", "this part number is already in stock");
    }
    Part part = parts.saveAndFlush(new Part(normalized, name, unitPriceSen, onHand, reorderLevel));
    if (onHand != 0) {
      movements.save(new StockMovement(part, null, onHand, StockMovement.Reason.COUNTED, clock.instant(), by));
    }
    return PartView.of(part);
  }

  public PartView receive(long id, int quantity, String by) {
    Part part = locked(id);
    part.receive(quantity);
    movements.save(new StockMovement(part, null, quantity, StockMovement.Reason.RECEIVED, clock.instant(), by));
    return PartView.of(parts.saveAndFlush(part));
  }

  public PartView count(long id, int counted, String by) {
    Part part = locked(id);
    int change = part.count(counted);
    if (change != 0) {
      movements.save(new StockMovement(part, null, change, StockMovement.Reason.COUNTED, clock.instant(), by));
    }
    return PartView.of(parts.saveAndFlush(part));
  }

  @Transactional(readOnly = true)
  public List<MovementView> history(long id) {
    find(id);
    return movements.findByPartIdOrderByIdDesc(id, Limit.of(HISTORY_LIMIT)).stream()
        .map(MovementView::of)
        .toList();
  }

  /**
   * The quote has just been approved: take its stock parts off the shelf, in the same
   * transaction as the approval (both happen or neither). Runs at most once per job: a job
   * that already has parts taken is left alone. by = staff name, or null for the customer.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void takeForApprovedQuote(JobCard job, String by) {
    if (movements.existsByJobCardIdAndReason(job.getId(), StockMovement.Reason.TAKEN)) {
      return;
    }
    Map<Long, Integer> wanted = new TreeMap<>();
    for (QuoteLine line : job.getLines()) {
      if (line.getPart() != null) {
        wanted.merge(line.getPart().getId(), line.getQuantity(), Math::addExact);
      }
    }
    if (wanted.isEmpty()) {
      return;
    }
    var now = clock.instant();
    for (Part part : parts.lockAll(wanted.keySet())) {
      int quantity = wanted.get(part.getId());
      part.take(quantity);
      movements.save(new StockMovement(part, job, -quantity, StockMovement.Reason.TAKEN, now, by));
    }
  }

  private Part locked(long id) {
    return parts.lock(id).orElseThrow(() -> new NotFoundException("There is no stock part " + id + "."));
  }
}
