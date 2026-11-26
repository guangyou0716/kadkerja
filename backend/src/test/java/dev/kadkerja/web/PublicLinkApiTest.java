package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The customer's progress link, end to end through the HTTP API. */
@SpringBootTest(
    properties = {"kadkerja.public.reads-per-minute=10000", "kadkerja.public.answers-per-minute=10000"})
@AutoConfigureMockMvc
class PublicLinkApiTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void empty() {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer"}) {
      jdbc.update("delete from " + table);
    }
  }

  private ResultActions postJson(String url, String body) throws Exception {
    return mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private record Job(long id, String token) {}

  private Job checkIn(String plate, String name, String phone) throws Exception {
    String body =
        postJson(
                "/api/jobs",
                """
                {"customerName":"%s","phone":"%s","plate":"%s","make":"Proton",
                 "model":"Saga","year":2016,"mileageKm":1000,"complaint":"Engine light"}
                """
                    .formatted(name, phone, plate))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return new Job(
        ((Number) JsonPath.read(body, "$.id")).longValue(), JsonPath.read(body, "$.publicToken"));
  }

  private Job quoted(String plate) throws Exception {
    Job j = checkIn(plate, "Test Owner", "012-0000009");
    postJson(
            "/api/jobs/" + j.id() + "/lines",
            "{\"kind\":\"PART\",\"description\":\"Ignition coil\",\"quantity\":1,\"unitPriceSen\":18000,\"taxable\":true}")
        .andExpect(status().isOk());
    postJson("/api/jobs/" + j.id() + "/moves", "{\"to\":\"INSPECTING\"}").andExpect(status().isOk());
    postJson("/api/jobs/" + j.id() + "/moves", "{\"to\":\"QUOTED\",\"note\":\"internal: coil 3 weak\"}")
        .andExpect(status().isOk());
    return j;
  }

  private ResultActions answer(String token, String decision, int version) throws Exception {
    return postJson(
        "/api/public/jobs/" + token + "/answer",
        "{\"decision\":\"%s\",\"quoteVersion\":%d}".formatted(decision, version));
  }

  @Test
  void linkShowsProgressAndQuoteWithoutPersonalDetailsOrStaffNotes() throws Exception {
    Job j = quoted("BKE 5021");
    String body =
        mvc.perform(get("/api/public/jobs/" + j.token()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().string("Referrer-Policy", "no-referrer"))
            .andExpect(header().string("X-Robots-Tag", "noindex"))
            .andExpect(jsonPath("$.workshop").value("Demo Auto Workshop"))
            .andExpect(jsonPath("$.plate").value("BKE 5021"))
            .andExpect(jsonPath("$.vehicle").value("Proton Saga"))
            .andExpect(jsonPath("$.status").value("QUOTED"))
            .andExpect(jsonPath("$.canAnswer").value(true))
            .andExpect(jsonPath("$.quoteVisible").value(true))
            .andExpect(jsonPath("$.quoteVersion").value(1))
            .andExpect(jsonPath("$.lines", hasSize(1)))
            .andExpect(jsonPath("$.totalSen").value(19440))
            .andExpect(jsonPath("$.timeline", hasSize(3)))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(body)
        .doesNotContain("Test Owner")
        .doesNotContain("012-0000009")
        .doesNotContain("internal")
        .doesNotContain(j.token())
        .doesNotContain("\"id\"");
  }

  @Test
  void draftQuoteIsNotShownBeforeItIsSent() throws Exception {
    Job j = checkIn("PKR 1", "Test Owner", "012-0000009");
    postJson(
            "/api/jobs/" + j.id() + "/lines",
            "{\"kind\":\"LABOUR\",\"description\":\"Draft line\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":false}")
        .andExpect(status().isOk());
    mvc.perform(get("/api/public/jobs/" + j.token()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.quoteVisible").value(false))
        .andExpect(jsonPath("$.lines", hasSize(0)))
        .andExpect(jsonPath("$.totalSen").value(0))
        .andExpect(jsonPath("$.canAnswer").value(false));
  }

  @Test
  void customerApprovesAndTheStaffTimelineShowsItWasTheCustomer() throws Exception {
    Job j = quoted("BKE 5021");
    answer(j.token(), "APPROVE", 1)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("APPROVED"))
        .andExpect(jsonPath("$.canAnswer").value(false))
        .andExpect(jsonPath("$.timeline[3].by").value("CUSTOMER"));
    mvc.perform(get("/api/jobs/" + j.id()))
        .andExpect(jsonPath("$.status").value("APPROVED"))
        .andExpect(jsonPath("$.events[3].by").value("CUSTOMER"))
        .andExpect(jsonPath("$.events[2].by").value("STAFF"));
    // A second click (or a replay) does not move the job again.
    answer(j.token(), "DECLINE", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail", containsString("already been answered")));
  }

  @Test
  void approvingAnOutOfDateQuoteIsRefused() throws Exception {
    Job j = quoted("BKE 5021");
    // Staff redo the quote: version 2 with a higher price.
    postJson("/api/jobs/" + j.id() + "/moves", "{\"to\":\"INSPECTING\"}").andExpect(status().isOk());
    postJson(
            "/api/jobs/" + j.id() + "/lines",
            "{\"kind\":\"PART\",\"description\":\"Spark plugs\",\"quantity\":4,\"unitPriceSen\":2500,\"taxable\":true}")
        .andExpect(status().isOk());
    // While the quote is being redone nothing can be answered.
    answer(j.token(), "APPROVE", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail", containsString("not waiting")));
    postJson("/api/jobs/" + j.id() + "/moves", "{\"to\":\"QUOTED\"}").andExpect(status().isOk());
    // The customer's open page still shows version 1.
    answer(j.token(), "APPROVE", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail", containsString("changed the quote")));
    mvc.perform(get("/api/jobs/" + j.id())).andExpect(jsonPath("$.status").value("QUOTED"));
    answer(j.token(), "APPROVE", 2).andExpect(status().isOk());
  }

  @Test
  void oneJobsTokenCannotReadOrAnswerAnotherJob() throws Exception {
    Job a = quoted("AAA 1");
    Job b = quoted("BBB 2");
    mvc.perform(get("/api/public/jobs/" + a.token())).andExpect(jsonPath("$.plate").value("AAA 1"));
    answer(a.token(), "DECLINE", 1).andExpect(status().isOk());
    mvc.perform(get("/api/jobs/" + b.id())).andExpect(jsonPath("$.status").value("QUOTED"));
  }

  @Test
  void unknownMalformedAndResetTokensAreNotFound() throws Exception {
    Job j = quoted("BKE 5021");
    mvc.perform(get("/api/public/jobs/AAAAAAAAAAAAAAAAAAAAAAAA"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("This link is not valid or has expired."));
    mvc.perform(get("/api/public/jobs/short")).andExpect(status().isNotFound());
    mvc.perform(get("/api/public/jobs/" + j.token() + "x")).andExpect(status().isNotFound());
    mvc.perform(get("/api/public/jobs/" + j.token().substring(0, 23) + "%27"))
        .andExpect(status().isNotFound());

    String reset =
        mvc.perform(post("/api/jobs/" + j.id() + "/link"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String fresh = JsonPath.read(reset, "$.publicToken");
    assertThat(fresh).isNotEqualTo(j.token());
    mvc.perform(get("/api/public/jobs/" + j.token())).andExpect(status().isNotFound());
    answer(j.token(), "APPROVE", 1).andExpect(status().isNotFound());
    mvc.perform(get("/api/public/jobs/" + fresh)).andExpect(status().isOk());
  }

  @Test
  void answerIsValidated() throws Exception {
    Job j = quoted("BKE 5021");
    postJson("/api/public/jobs/" + j.token() + "/answer", "{\"decision\":\"MAYBE\",\"quoteVersion\":1}")
        .andExpect(status().isBadRequest());
    postJson("/api/public/jobs/" + j.token() + "/answer", "{\"decision\":\"APPROVE\",\"quoteVersion\":0}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.quoteVersion").exists());
    postJson(
            "/api/public/jobs/" + j.token() + "/answer",
            "{\"decision\":\"DECLINE\",\"quoteVersion\":1,\"note\":\"" + "x".repeat(301) + "\"}")
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/jobs/" + j.id())).andExpect(jsonPath("$.status").value("QUOTED"));
  }
}
