package dev.kadkerja.web;

import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import dev.kadkerja.stock.MovementView;
import dev.kadkerja.stock.PartView;
import dev.kadkerja.stock.StockService;
import dev.kadkerja.web.Requests.CountRequest;
import dev.kadkerja.web.Requests.PartRequest;
import dev.kadkerja.web.Requests.ReceiveRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The parts shelf. Reading is for all staff; changes are advisor-only (see SecurityConfig). */
@RestController
@RequestMapping("/api/parts")
public class PartController {
  private final StockService stock;
  private final StaffUserRepository users;

  public PartController(StockService stock, StaffUserRepository users) {
    this.stock = stock;
    this.users = users;
  }

  @GetMapping
  public List<PartView> list() {
    return stock.list();
  }

  @PostMapping
  public ResponseEntity<PartView> create(@Valid @RequestBody PartRequest r, Authentication who) {
    PartView part =
        stock.create(r.sku(), r.name().trim(), r.unitPriceSen(), r.onHand(), r.reorderLevel(), name(who));
    return ResponseEntity.created(URI.create("/api/parts/" + part.id())).body(part);
  }

  @PostMapping("/{id}/receive")
  public PartView receive(@PathVariable long id, @Valid @RequestBody ReceiveRequest r, Authentication who) {
    return stock.receive(id, r.quantity(), name(who));
  }

  @PostMapping("/{id}/count")
  public PartView count(@PathVariable long id, @Valid @RequestBody CountRequest r, Authentication who) {
    return stock.count(id, r.onHand(), name(who));
  }

  @GetMapping("/{id}/movements")
  public List<MovementView> history(@PathVariable long id) {
    return stock.history(id);
  }

  private String name(Authentication who) {
    return users.findByUsername(who.getName()).map(StaffUser::getDisplayName).orElse(who.getName());
  }
}
