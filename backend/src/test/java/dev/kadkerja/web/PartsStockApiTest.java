package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** The parts shelf and the stock taken when a quote is approved, with real sign-ins. */
@SpringBootTest
@AutoConfigureMockMvc
class PartsStockApiTest {
  private static final String PASSWORD = "correct horse battery";
  private static int address = 1;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;

  private String ip;
  private MockHttpSession advisor;

  @BeforeEach
  void setUp() throws Exception {
    for (String table :
        new String[] {
          "stock_movement", "status_event", "quote_line", "job_card", "vehicle", "customer", "part", "staff_user"
        }) {
      jdbc.update("delete from " + table);
    }
    users.save(new StaffUser("advisor", "Test Advisor", encoder.encode(PASSWORD), Role.ADVISOR));
    users.save(new StaffUser("tech", "Test Tech", encoder.encode(PASSWORD), Role.TECHNICIAN));
    ip = "10.3.0." + (address++);
    advisor = session("advisor");
  }

  private MockHttpSession session(String user) throws Exception {
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(r -> {
                      r.setRemoteAddr(ip);
                      return r;
                    })
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"" + user + "\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
  }

  private ResultActions send(MockHttpServletRequestBuilder b, MockHttpSession s, String body) throws Exception {
    return mvc.perform(b.session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private static long id(ResultActions r, String path) throws Exception {
    return ((Number) JsonPath.read(r.andReturn().getResponse().getContentAsString(), path)).longValue();
  }

  private long part(String sku, int onHand) throws Exception {
    return id(
        send(
                post("/api/parts"),
                advisor,
                """
                {"sku":"%s","name":"Part %s","unitPriceSen":12800,"onHand":%d,"reorderLevel":2}
                """
                    .formatted(sku, sku, onHand))
            .andExpect(status().isCreated()),
        "$.id");
  }

  private int onHand(long part) {
    return jdbc.queryForObject("select on_hand from part where id = ?", Integer.class, part);
  }

  private long checkIn(String plate) throws Exception {
    return id(
        send(
                post("/api/jobs"),
                advisor,
                """
                {"customerName":"Test Owner","phone":"012-0000009","plate":"%s","make":"Perodua",
                 "model":"Bezza","complaint":"Brakes squeak"}
                """
                    .formatted(plate))
            .andExpect(status().isCreated()),
        "$.id");
  }

  private ResultActions line(MockHttpSession s, long job, String kind, int quantity, Long partId) throws Exception {
    return send(
        post("/api/jobs/" + job + "/lines"),
        s,
        """
        {"kind":"%s","description":"Brake pads","quantity":%d,"unitPriceSen":12800,"taxable":true,"partId":%s}
        """
            .formatted(kind, quantity, partId));
  }

  private ResultActions move(long job, String to) throws Exception {
    return send(post("/api/jobs/" + job + "/moves"), advisor, "{\"to\":\"" + to + "\"}");
  }

  /** A job with the given part lines, quote sent; returns the job id. */
  private long quoted(String plate, long part, int... quantities) throws Exception {
    long job = checkIn(plate);
    for (int q : quantities) {
      line(advisor, job, "PART", q, part).andExpect(status().isOk());
    }
    line(advisor, job, "LABOUR", 1, null).andExpect(status().isOk());
    move(job, "INSPECTING").andExpect(status().isOk());
    move(job, "QUOTED").andExpect(status().isOk());
    return job;
  }

  private ResultActions customerAnswers(long job, String decision) throws Exception {
    String token = jdbc.queryForObject("select public_token from job_card where id = ?", String.class, job);
    int version = jdbc.queryForObject("select quote_version from job_card where id = ?", Integer.class, job);
    return mvc.perform(
        post("/api/public/jobs/" + token + "/answer")
            .with(r -> {
              r.setRemoteAddr(ip);
              return r;
            })
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"decision\":\"" + decision + "\",\"quoteVersion\":" + version + "}"));
  }

  @Test
  void theAdvisorAddsAPartAndEveryoneCanSeeTheShelf() throws Exception {
    send(
            post("/api/parts"),
            advisor,
            "{\"sku\":\"bp-001\",\"name\":\"  Front brake pads  \",\"unitPriceSen\":12800,\"onHand\":5,\"reorderLevel\":2}")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.sku").value("BP-001"))
        .andExpect(jsonPath("$.name").value("Front brake pads"))
        .andExpect(jsonPath("$.onHand").value(5))
        .andExpect(jsonPath("$.low").value(false));
    part("AA-1", 0);

    MockHttpSession tech = session("tech");
    mvc.perform(get("/api/parts").session(tech))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].sku").value("AA-1"))
        .andExpect(jsonPath("$[0].low").value(true))
        .andExpect(jsonPath("$[1].sku").value("BP-001"));
    // The first count is in the history; a part made with none has no history line.
    long bp = jdbc.queryForObject("select id from part where sku = 'BP-001'", Long.class);
    mvc.perform(get("/api/parts/" + bp + "/movements").session(tech))
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].change").value(5))
        .andExpect(jsonPath("$[0].reason").value("COUNTED"))
        .andExpect(jsonPath("$[0].by").value("Test Advisor"));
  }

  @Test
  void onlyTheAdvisorChangesTheShelfAndBadInputIsRefused() throws Exception {
    long bp = part("BP-1", 3);
    MockHttpSession tech = session("tech");
    String body = "{\"sku\":\"X-1\",\"name\":\"X\",\"unitPriceSen\":1,\"onHand\":1,\"reorderLevel\":0}";
    send(post("/api/parts"), tech, body).andExpect(status().isForbidden());
    send(post("/api/parts/" + bp + "/receive"), tech, "{\"quantity\":5}").andExpect(status().isForbidden());
    send(post("/api/parts/" + bp + "/count"), tech, "{\"onHand\":0}").andExpect(status().isForbidden());
    assertThat(onHand(bp)).isEqualTo(3);

    // Same part number in other letters = taken.
    send(post("/api/parts"), advisor, body.replace("X-1", "bp-1"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.fields.sku").value("this part number is already in stock"));
    for (String bad :
        new String[] {
          body.replace("X-1", "../etc"),
          body.replace("X-1", ""),
          body.replace("\"onHand\":1", "\"onHand\":-1"),
          body.replace("\"unitPriceSen\":1", "\"unitPriceSen\":-5"),
          body.replace("\"reorderLevel\":0", "\"reorderLevel\":-1"),
          body.replace("\"name\":\"X\"", "\"name\":\" \""),
        }) {
      send(post("/api/parts"), advisor, bad).andExpect(status().isBadRequest());
    }
    send(post("/api/parts/" + bp + "/receive"), advisor, "{\"quantity\":0}").andExpect(status().isBadRequest());
    send(post("/api/parts/" + bp + "/count"), advisor, "{\"onHand\":-1}").andExpect(status().isBadRequest());
    send(post("/api/parts/999999/receive"), advisor, "{\"quantity\":1}").andExpect(status().isNotFound());
    mvc.perform(get("/api/parts")).andExpect(status().isUnauthorized());
    assertThat(onHand(bp)).isEqualTo(3);
  }

  @Test
  void receivingAndStocktakeChangeTheCountAndAreWrittenDown() throws Exception {
    long bp = part("BP-1", 3);
    send(post("/api/parts/" + bp + "/receive"), advisor, "{\"quantity\":10}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.onHand").value(13));
    send(post("/api/parts/" + bp + "/count"), advisor, "{\"onHand\":11}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.onHand").value(11));
    // Counting what is already there changes nothing and adds no line.
    send(post("/api/parts/" + bp + "/count"), advisor, "{\"onHand\":11}").andExpect(status().isOk());
    mvc.perform(get("/api/parts/" + bp + "/movements").session(advisor))
        .andExpect(jsonPath("$", hasSize(3)))
        .andExpect(jsonPath("$[0].change").value(-2))
        .andExpect(jsonPath("$[0].reason").value("COUNTED"))
        .andExpect(jsonPath("$[1].change").value(10))
        .andExpect(jsonPath("$[1].reason").value("RECEIVED"))
        .andExpect(jsonPath("$[2].change").value(3));
  }

  @Test
  void aQuoteLineCanTakeAPartFromStockButOnlyAPartLine() throws Exception {
    long bp = part("BP-1", 3);
    long job = checkIn("STK 1");
    line(advisor, job, "PART", 2, bp)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.lines[0].partId").value(bp))
        .andExpect(jsonPath("$.lines[0].partSku").value("BP-1"));
    line(advisor, job, "LABOUR", 1, bp)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Only a part line can take a part from stock."));
    line(advisor, job, "PART", 1, 999_999L).andExpect(status().isNotFound());
    line(advisor, job, "PART", 1, 0L).andExpect(status().isBadRequest());
    // A plain line (no part) still works; adding lines does not touch the shelf.
    line(advisor, job, "PART", 1, null).andExpect(status().isOk()).andExpect(jsonPath("$.lines[1].partId").value(nullValue()));
    mvc.perform(get("/api/jobs/" + job).session(advisor)).andExpect(jsonPath("$.lines", hasSize(2)));
    assertThat(onHand(bp)).isEqualTo(3);
  }

  @Test
  void theCustomersApprovalTakesThePartsOnceAndOnlyThen() throws Exception {
    long bp = part("BP-1", 5);
    long oil = part("OIL-4L", 1);
    long job = checkIn("STK 2");
    line(advisor, job, "PART", 1, bp).andExpect(status().isOk());
    line(advisor, job, "PART", 2, bp).andExpect(status().isOk());
    line(advisor, job, "PART", 1, oil).andExpect(status().isOk());
    move(job, "INSPECTING").andExpect(status().isOk());
    move(job, "QUOTED").andExpect(status().isOk());
    // Sending the quote takes nothing.
    assertThat(onHand(bp)).isEqualTo(5);

    customerAnswers(job, "APPROVE").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(2);
    assertThat(onHand(oil)).isZero();
    // Answering again is refused and takes nothing more.
    customerAnswers(job, "APPROVE").andExpect(status().isConflict());
    move(job, "IN_PROGRESS").andExpect(status().isOk());
    move(job, "READY").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(2);

    mvc.perform(get("/api/parts/" + bp + "/movements").session(advisor))
        .andExpect(jsonPath("$[0].change").value(-3))
        .andExpect(jsonPath("$[0].reason").value("TAKEN"))
        .andExpect(jsonPath("$[0].jobId").value(job))
        .andExpect(jsonPath("$[0].jobNumber").value(org.hamcrest.Matchers.startsWith("KK-")))
        .andExpect(jsonPath("$[0].by").value(nullValue()));
    mvc.perform(get("/api/parts").session(advisor))
        .andExpect(jsonPath("$[?(@.sku == 'OIL-4L')].low").value(true));
  }

  @Test
  void anApprovalByTheAdvisorTakesThePartsAndNamesThem() throws Exception {
    long bp = part("BP-1", 5);
    long job = quoted("STK 3", bp, 2);
    move(job, "APPROVED").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(3);
    mvc.perform(get("/api/parts/" + bp + "/movements").session(advisor))
        .andExpect(jsonPath("$[0].by").value("Test Advisor"));
  }

  @Test
  void declinedCancelledOrRedoneQuotesTakeNothing() throws Exception {
    long bp = part("BP-1", 5);
    long declined = quoted("STK 4", bp, 1);
    customerAnswers(declined, "DECLINE").andExpect(status().isOk());
    long cancelled = quoted("STK 5", bp, 1);
    move(cancelled, "CANCELLED").andExpect(status().isOk());
    long redone = quoted("STK 6", bp, 4);
    move(redone, "INSPECTING").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(5);

    // The redone quote: the 4 come out, 1 goes in; only the sent version is taken.
    String body = mvc.perform(get("/api/jobs/" + redone).session(advisor)).andReturn().getResponse().getContentAsString();
    long lineId = ((Number) JsonPath.read(body, "$.lines[0].id")).longValue();
    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                    "/api/jobs/" + redone + "/lines/" + lineId)
                .session(advisor)
                .with(csrf()))
        .andExpect(status().isOk());
    line(advisor, redone, "PART", 1, bp).andExpect(status().isOk());
    move(redone, "QUOTED").andExpect(status().isOk());
    customerAnswers(redone, "APPROVE").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(4);
  }

  @Test
  void anApprovalIsNeverRefusedForWantOfStockTheShortfallShowsBelowZero() throws Exception {
    long bp = part("BP-1", 1);
    long job = quoted("STK 7", bp, 3);
    customerAnswers(job, "APPROVE").andExpect(status().isOk());
    assertThat(onHand(bp)).isEqualTo(-2);
    mvc.perform(get("/api/parts").session(advisor))
        .andExpect(jsonPath("$[0].onHand").value(-2))
        .andExpect(jsonPath("$[0].low").value(true));
    // Receiving 5 brings it back to 3 on the shelf.
    send(post("/api/parts/" + bp + "/receive"), advisor, "{\"quantity\":5}").andExpect(jsonPath("$.onHand").value(3));
  }

  @Test
  void theCustomerViewDoesNotShowPartIds() throws Exception {
    long bp = part("BP-1", 5);
    long job = quoted("STK 8", bp, 1);
    String token = jdbc.queryForObject("select public_token from job_card where id = ?", String.class, job);
    String body = mvc.perform(get("/api/public/jobs/" + token)).andReturn().getResponse().getContentAsString();
    assertThat(body).doesNotContain("partId").doesNotContain("partSku").doesNotContain("BP-1");
  }

  @Test
  void approvalsAtTheSameMomentLoseNoCount() throws Exception {
    long bp = part("BP-1", 50);
    int jobs = 6;
    long[] ids = new long[jobs];
    for (int i = 0; i < jobs; i++) {
      ids[i] = quoted("RACE " + i, bp, 2);
    }
    var pool = java.util.concurrent.Executors.newFixedThreadPool(jobs);
    var start = new java.util.concurrent.CountDownLatch(1);
    var results = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
    for (long job : ids) {
      results.add(
          pool.submit(
              () -> {
                start.await();
                return customerAnswers(job, "APPROVE").andReturn().getResponse().getStatus();
              }));
    }
    start.countDown();
    for (var r : results) {
      assertThat(r.get()).isEqualTo(200);
    }
    pool.shutdown();
    assertThat(onHand(bp)).isEqualTo(50 - 2 * jobs);
    assertThat(jdbc.queryForObject("select count(*) from stock_movement where reason = 'TAKEN'", Integer.class))
        .isEqualTo(jobs);
  }
}
