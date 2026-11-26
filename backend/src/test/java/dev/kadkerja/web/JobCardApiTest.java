package dev.kadkerja.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(roles = "ADVISOR")
class JobCardApiTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  /** Each test starts from an empty database (H2 locally, PostgreSQL in CI). */
  @BeforeEach
  void empty() {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer"}) {
      jdbc.update("delete from " + table);
    }
  }

  private static final String CHECK_IN =
      """
      {"customerName":"Test Owner","phone":"012-0000009","plate":"%s","make":"Perodua",
       "model":"Bezza","year":2020,"mileageKm":55000,"complaint":"Brakes squeak"}
      """;

  private ResultActions postJson(String url, String body) throws Exception {
    return mvc.perform(post(url).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private long checkIn(String plate) throws Exception {
    String body =
        postJson("/api/jobs", CHECK_IN.formatted(plate))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return ((Number) JsonPath.read(body, "$.id")).longValue();
  }

  private ResultActions move(long id, String to) throws Exception {
    return postJson("/api/jobs/" + id + "/moves", "{\"to\":\"" + to + "\"}");
  }

  @Test
  void checkInCreatesAJobCardWithNumberTimelineAndNextSteps() throws Exception {
    postJson("/api/jobs", CHECK_IN.formatted(" pkr1234 "))
        .andExpect(status().isCreated())
        .andExpect(header().string("Location", containsString("/api/jobs/")))
        .andExpect(jsonPath("$.number").value(org.hamcrest.Matchers.matchesPattern("KK-\\d{4}-\\d{4,}")))
        .andExpect(jsonPath("$.status").value("RECEIVED"))
        .andExpect(jsonPath("$.vehicle.plate").value("PKR 1234"))
        .andExpect(jsonPath("$.customer.name").value("Test Owner"))
        .andExpect(jsonPath("$.next", hasSize(2)))
        .andExpect(jsonPath("$.events", hasSize(1)))
        .andExpect(jsonPath("$.totalSen").value(0));
    mvc.perform(get("/api/jobs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].plate").value("PKR 1234"))
        .andExpect(jsonPath("$[0].vehicle").value("Perodua Bezza"));
  }

  @Test
  void theWholeFlowFromQuoteToCollection() throws Exception {
    long id = checkIn("PNG 1");
    move(id, "INSPECTING").andExpect(status().isOk());
    postJson(
            "/api/jobs/" + id + "/lines",
            "{\"kind\":\"LABOUR\",\"description\":\" Brake service \",\"quantity\":1,\"unitPriceSen\":6000,\"taxable\":true}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.lines[0].description").value("Brake service"));
    postJson(
            "/api/jobs/" + id + "/lines",
            "{\"kind\":\"PART\",\"description\":\"Brake pads\",\"quantity\":2,\"unitPriceSen\":6425,\"taxable\":true}")
        .andExpect(jsonPath("$.subtotalSen").value(18_850))
        // 6000 * 8% = 480; 12850 * 8% = 1028
        .andExpect(jsonPath("$.taxSen").value(1_508))
        .andExpect(jsonPath("$.totalSen").value(20_358))
        .andExpect(jsonPath("$.sstRatePercent").value(8));
    move(id, "QUOTED").andExpect(jsonPath("$.quoteVersion").value(1));
    move(id, "APPROVED").andExpect(status().isOk());
    move(id, "IN_PROGRESS").andExpect(status().isOk());
    move(id, "READY").andExpect(status().isOk());
    move(id, "COLLECTED")
        .andExpect(jsonPath("$.status").value("COLLECTED"))
        .andExpect(jsonPath("$.next", hasSize(0)))
        .andExpect(jsonPath("$.events", hasSize(7)));
    mvc.perform(get("/api/jobs?status=COLLECTED")).andExpect(jsonPath("$", hasSize(1)));
    mvc.perform(get("/api/jobs?status=RECEIVED")).andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void refusedMovesAndEditsSayWhyAndChangeNothing() throws Exception {
    long id = checkIn("PNG 2");
    move(id, "COLLECTED")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.title").value("Not allowed"))
        .andExpect(jsonPath("$.detail").value("A job that is RECEIVED cannot move to COLLECTED."));
    move(id, "INSPECTING");
    move(id, "QUOTED")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail", containsString("at least one quote line")));
    postJson(
        "/api/jobs/" + id + "/lines",
        "{\"kind\":\"PART\",\"description\":\"Pads\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":false}");
    move(id, "QUOTED");
    postJson(
            "/api/jobs/" + id + "/lines",
            "{\"kind\":\"PART\",\"description\":\"Late\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":false}")
        .andExpect(status().isConflict());
    String quoted = mvc.perform(get("/api/jobs/" + id)).andReturn().getResponse().getContentAsString();
    long lineId = ((Number) JsonPath.read(quoted, "$.lines[0].id")).longValue();
    mvc.perform(delete("/api/jobs/" + id + "/lines/" + lineId).with(csrf())).andExpect(status().isConflict());
    mvc.perform(get("/api/jobs/" + id))
        .andExpect(jsonPath("$.status").value("QUOTED"))
        .andExpect(jsonPath("$.lines", hasSize(1)))
        .andExpect(jsonPath("$.events", hasSize(3)));
  }

  @Test
  void removingALineAndRedoingTheQuoteBumpsTheVersion() throws Exception {
    long id = checkIn("PNG 3");
    move(id, "INSPECTING");
    String body =
        postJson(
                "/api/jobs/" + id + "/lines",
                "{\"kind\":\"PART\",\"description\":\"A\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}")
            .andReturn()
            .getResponse()
            .getContentAsString();
    long lineId = ((Number) JsonPath.read(body, "$.lines[0].id")).longValue();
    postJson(
        "/api/jobs/" + id + "/lines",
        "{\"kind\":\"PART\",\"description\":\"B\",\"quantity\":1,\"unitPriceSen\":200,\"taxable\":true}");
    mvc.perform(delete("/api/jobs/" + id + "/lines/" + lineId).with(csrf()))
        .andExpect(jsonPath("$.lines", hasSize(1)))
        .andExpect(jsonPath("$.lines[0].description").value("B"));
    mvc.perform(delete("/api/jobs/" + id + "/lines/999999").with(csrf())).andExpect(status().isNotFound());
    move(id, "QUOTED").andExpect(jsonPath("$.quoteVersion").value(1));
    postJson("/api/jobs/" + id + "/moves", "{\"to\":\"INSPECTING\",\"note\":\"  cheaper option  \"}")
        .andExpect(jsonPath("$.events[3].note").value("cheaper option"));
    move(id, "QUOTED").andExpect(jsonPath("$.quoteVersion").value(2));
  }

  @Test
  void aKnownPlateReusesTheCarAndOneOpenJobPerCar() throws Exception {
    long first = checkIn("PKR 9");
    postJson("/api/jobs", CHECK_IN.formatted("pkr9"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("PKR 9 already has an open job card; finish or cancel it first."));
    move(first, "CANCELLED").andExpect(status().isOk());
    // Same car, new owner (different phone).
    String body =
        postJson(
                "/api/jobs",
                """
                {"customerName":"New Owner","phone":"013-0000008","plate":"PKR 9","make":"Perodua",
                 "model":"Bezza","year":2020,"complaint":"Service"}
                """)
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long vehicleId = ((Number) JsonPath.read(body, "$.vehicle.id")).longValue();
    mvc.perform(get("/api/jobs/" + first))
        .andExpect(jsonPath("$.vehicle.id").value(vehicleId))
        .andExpect(jsonPath("$.customer.name").value("Test Owner"));
    org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$.customer.name"))
        .isEqualTo("New Owner");
  }

  private static long id(String json, String path) {
    return ((Number) JsonPath.read(json, path)).longValue();
  }

  private String body(ResultActions r) throws Exception {
    return r.andReturn().getResponse().getContentAsString();
  }

  @Test
  void theSamePhoneTypedDifferentlyIsTheSameOwner() throws Exception {
    long first = checkIn("PKR 10");
    long owner = id(body(mvc.perform(get("/api/jobs/" + first))), "$.customer.id");
    move(first, "CANCELLED");
    String second =
        body(
            postJson(
                    "/api/jobs",
                    """
                    {"customerName":"Test Owner Renamed","phone":"0120000009","plate":"PKR10",
                     "make":"Perodua","model":"Bezza","complaint":"Service"}
                    """)
                .andExpect(status().isCreated()));
    org.assertj.core.api.Assertions.assertThat(id(second, "$.customer.id")).isEqualTo(owner);
    org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(second, "$.customer.name"))
        .isEqualTo("Test Owner Renamed");
  }

  @Test
  void anOldJobCardKeepsTheCustomerWhoBroughtTheCar() throws Exception {
    long first = checkIn("PKR 11");
    move(first, "CANCELLED");
    String second =
        body(
            postJson(
                "/api/jobs",
                """
                {"customerName":"Next Owner","phone":"019-0000007","plate":"PKR 11",
                 "make":"Perodua","model":"Bezza","complaint":"Service"}
                """));
    String old = body(mvc.perform(get("/api/jobs/" + first)));
    org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(old, "$.customer.name"))
        .isEqualTo("Test Owner");
    org.assertj.core.api.Assertions.assertThat(id(second, "$.vehicle.id"))
        .isEqualTo(id(old, "$.vehicle.id"));
    org.assertj.core.api.Assertions.assertThat(id(second, "$.customer.id"))
        .isNotEqualTo(id(old, "$.customer.id"));
    mvc.perform(get("/api/jobs?status=CANCELLED")).andExpect(jsonPath("$[0].customer").value("Test Owner"));
  }

  @Test
  void invalidInputIsRefusedFieldByField() throws Exception {
    postJson(
            "/api/jobs",
            """
            {"customerName":" ","phone":"12345","plate":"PKR-1!","make":"Perodua","model":"Myvi",
             "year":1800,"mileageKm":-1,"complaint":""}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.title").value("Check the form"))
        .andExpect(jsonPath("$.fields.customerName").exists())
        .andExpect(jsonPath("$.fields.phone").value("use a Malaysian phone number like 012-3456789"))
        .andExpect(jsonPath("$.fields.plate").exists())
        .andExpect(jsonPath("$.fields.year").exists())
        .andExpect(jsonPath("$.fields.mileageKm").exists())
        .andExpect(jsonPath("$.fields.complaint").exists());
    long id = checkIn("PNG 4");
    move(id, "INSPECTING");
    postJson(
            "/api/jobs/" + id + "/lines",
            "{\"kind\":\"PART\",\"description\":\"X\",\"quantity\":0,\"unitPriceSen\":-5,\"taxable\":true}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.quantity").exists())
        .andExpect(jsonPath("$.fields.unitPriceSen").exists());
    postJson("/api/jobs/" + id + "/moves", "{\"to\":\"FLYING\"}").andExpect(status().isBadRequest());
    postJson("/api/jobs", "{not json").andExpect(status().isBadRequest());
    mvc.perform(get("/api/jobs")).andExpect(jsonPath("$", hasSize(1)));
  }

  @Test
  void unknownJobIs404() throws Exception {
    mvc.perform(get("/api/jobs/424242"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("There is no job card 424242."));
  }

  @Test
  void thePublicTokenIsInTheJobCardForSendingButNeverInTheBoardList() throws Exception {
    long id = checkIn("PNG 5");
    String token =
        jdbc.queryForObject("select public_token from job_card where id = ?", String.class, id);
    String list = mvc.perform(get("/api/jobs")).andReturn().getResponse().getContentAsString();
    String one = mvc.perform(get("/api/jobs/" + id)).andReturn().getResponse().getContentAsString();
    // Case-insensitive on the field name and exact on the value, so neither form slips through.
    org.assertj.core.api.Assertions.assertThat(list).doesNotContainIgnoringCase("token").doesNotContain(token);
    org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(one, "$.publicToken")).isEqualTo(token);
  }
}
